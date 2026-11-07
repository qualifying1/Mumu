// The reader's audio engine: the ONLY place Howl instances are created (client rule).
// It executes scheduler actions (voice, music crossfade, ducking, SFX). Errors are reported loudly, never swallowed,
// and a failed clip still releases the scheduler's voice/SFX slot so the queue can never get stuck.
import { Howl, Howler } from "howler";
import type { Mood, SfxTag } from "@mumu/shared";
import { effectiveVolumes, musicTarget, type AudioSettings, type ChannelVolumes } from "./volumes.ts";

export const MUSIC_CROSSFADE_MS = 1200;
export const DUCK_RAMP_MS = 200;

const musicUrl = (mood: Mood): string => `${import.meta.env.BASE_URL}audio/music/${mood}/1.mp3`;
const sfxUrl = (tag: SfxTag): string => `${import.meta.env.BASE_URL}audio/sfx/${tag}.mp3`;

export interface EngineEvents {
  /** The current voice clip ended, was faded out, or failed. */
  voiceEnded(): void;
  /** One SFX one-shot finished (or failed). */
  sfxEnded(): void;
  /** A clip could not be loaded or played. Already logged with console.error. */
  error(message: string): void;
}

interface VoicePlayback {
  howl: Howl;
  finish: () => void;
  fadingOut: boolean;
}

/** Fade a Howl's volume. Howler's fade misbehaves for a zero-length change, so set it directly then. */
function fadeTo(howl: Howl, from: number, to: number, ms: number, onDone?: () => void): void {
  if (Math.abs(from - to) < 0.01) {
    howl.volume(to);
    onDone?.();
    return;
  }
  if (onDone) howl.once("fade", onDone);
  howl.fade(from, to, ms);
}

export class AudioEngine {
  private readonly events: EngineEvents;
  private readonly clipUrls = new Map<string, string>();
  private voice: VoicePlayback | null = null;
  private music: { mood: Mood; howl: Howl } | null = null;
  private readonly sfxHowls = new Map<SfxTag, Howl>();
  private readonly sfxPending = new Map<SfxTag, number>();
  private readonly brokenSfx = new Set<SfxTag>();
  private readonly brokenMusic = new Set<Mood>();
  private volumes: ChannelVolumes = { voices: 1, music: 1, sfx: 1 };
  private ducked = false;
  private disposed = false;

  constructor(events: EngineEvents) {
    this.events = events;
  }

  /** Browsers block audio until a tap. Call this from the tap handler. Creates and resumes the audio context. */
  async unlock(): Promise<void> {
    Howler.autoSuspend = false; // an idle-suspended context would need another tap on iOS
    Howler.volume(1); // creates Howler's AudioContext inside the user gesture
    const ctx = Howler.ctx;
    if (ctx && ctx.state !== "running") await ctx.resume();
  }

  isUnlocked(): boolean {
    return Howler.ctx?.state === "running";
  }

  /** Voice clips of the open chapter. Object URLs are revoked on dispose. */
  setClips(clips: ReadonlyMap<string, Blob>): void {
    this.revokeClips();
    for (const [id, blob] of clips) this.clipUrls.set(id, URL.createObjectURL(blob));
  }

  applySettings(audio: AudioSettings): void {
    this.volumes = effectiveVolumes(audio);
    if (this.voice && !this.voice.fadingOut) this.voice.howl.volume(this.volumes.voices);
    for (const howl of this.sfxHowls.values()) howl.volume(this.volumes.sfx);
    if (this.volumes.voices === 0) this.ducked = false;
    if (this.music) this.music.howl.volume(musicTarget(this.volumes, this.ducked));
  }

  playVoice(audioId: string): void {
    const url = this.clipUrls.get(audioId);
    if (!url) {
      this.fail(`Voice clip ${audioId} is missing from this chapter's audio.`);
      this.later(() => this.events.voiceEnded());
      return;
    }
    if (this.volumes.voices === 0) {
      this.later(() => this.events.voiceEnded());
      return;
    }

    let finished = false;
    const finish = (): void => {
      if (finished) return;
      finished = true;
      if (this.voice?.howl === howl) this.voice = null;
      howl.unload();
      if (!this.disposed) this.events.voiceEnded();
    };
    const howl: Howl = new Howl({
      src: [url],
      format: ["mp3"], // blob URLs carry no extension, so Howler can't infer the format
      volume: this.volumes.voices,
      onend: finish,
      onloaderror: (_id, err) => {
        this.fail(`Could not load voice clip ${audioId}: ${String(err)}`);
        finish();
      },
      onplayerror: (_id, err) => {
        this.fail(`Could not play voice clip ${audioId}: ${String(err)}`);
        finish();
      },
    });
    this.voice = { howl, finish, fadingOut: false };
    howl.play();
  }

  fadeOutVoice(ms: number): void {
    const voice = this.voice;
    if (!voice || voice.fadingOut) return;
    voice.fadingOut = true;
    fadeTo(voice.howl, voice.howl.volume(), 0, ms, voice.finish);
  }

  setDucked(on: boolean): void {
    this.ducked = on && this.volumes.voices > 0;
    const music = this.music;
    if (music) fadeTo(music.howl, music.howl.volume(), musicTarget(this.volumes, this.ducked), DUCK_RAMP_MS);
  }

  /** Crossfade to `mood`'s loop (null fades the music out). A mood that is already playing is left alone. */
  setMusic(mood: Mood | null): void {
    if ((this.music?.mood ?? null) === mood) return;

    const old = this.music;
    this.music = null;
    if (old) fadeTo(old.howl, old.howl.volume(), 0, MUSIC_CROSSFADE_MS, () => old.howl.unload());
    if (mood === null || this.brokenMusic.has(mood)) return;

    const howl: Howl = new Howl({
      src: [musicUrl(mood)],
      format: ["mp3"],
      loop: true,
      volume: 0,
      onloaderror: (_id, err) => {
        this.brokenMusic.add(mood);
        if (this.music?.howl === howl) this.music = null;
        howl.unload();
        this.fail(`Could not load music for mood "${mood}" (${musicUrl(mood)}): ${String(err)}`);
      },
      onplayerror: (_id, err) => this.fail(`Could not play music for mood "${mood}": ${String(err)}`),
    });
    this.music = { mood, howl };
    howl.play();
    fadeTo(howl, 0, musicTarget(this.volumes, this.ducked), MUSIC_CROSSFADE_MS);
  }

  playSfx(tag: SfxTag): void {
    if (this.volumes.sfx === 0 || this.brokenSfx.has(tag)) {
      this.later(() => this.events.sfxEnded());
      return;
    }
    let howl = this.sfxHowls.get(tag);
    if (!howl) {
      const created: Howl = new Howl({
        src: [sfxUrl(tag)],
        format: ["mp3"],
        volume: this.volumes.sfx,
        onloaderror: (_id, err) => {
          this.brokenSfx.add(tag);
          this.sfxHowls.delete(tag);
          created.unload();
          this.fail(`Could not load SFX "${tag}" (${sfxUrl(tag)}): ${String(err)}`);
          // release every slot that was waiting on this clip
          const waiting = this.sfxPending.get(tag) ?? 0;
          this.sfxPending.set(tag, 0);
          for (let i = 0; i < waiting; i++) this.events.sfxEnded();
        },
        onplayerror: (_id, err) => this.fail(`Could not play SFX "${tag}": ${String(err)}`),
      });
      this.sfxHowls.set(tag, created);
      howl = created;
    }
    this.sfxPending.set(tag, (this.sfxPending.get(tag) ?? 0) + 1);
    const id = howl.play();
    howl.once(
      "end",
      () => {
        this.sfxPending.set(tag, Math.max(0, (this.sfxPending.get(tag) ?? 1) - 1));
        if (!this.disposed) this.events.sfxEnded();
      },
      id,
    );
  }

  dispose(): void {
    this.disposed = true;
    this.voice?.howl.unload();
    this.voice = null;
    this.music?.howl.unload();
    this.music = null;
    for (const howl of this.sfxHowls.values()) howl.unload();
    this.sfxHowls.clear();
    this.revokeClips();
  }

  private revokeClips(): void {
    for (const url of this.clipUrls.values()) URL.revokeObjectURL(url);
    this.clipUrls.clear();
  }

  private fail(message: string): void {
    console.error(`[audio] ${message}`);
    if (!this.disposed) this.events.error(message);
  }

  private later(fn: () => void): void {
    queueMicrotask(() => {
      if (!this.disposed) fn();
    });
  }
}
