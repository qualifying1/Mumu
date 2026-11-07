// Mumu's own sounds (CONTRACT §10: client/public/audio/mumu/). One-shots plus a looping purr.
// Respects settings.audio.master and settings.mumu.sounds; with either off nothing plays.
// Howler cannot guess the format from every URL, so mp3 is always passed explicitly.
import { Howl } from "howler";

export type MumuSoundFile = "meow1" | "meow2" | "meow3" | "purr" | "mrrp";

export interface MumuSoundSettings {
  /** audio.master.on && mumu.sounds */
  enabled: boolean;
  /** audio.master.volume, 0..1 */
  volume: number;
}

const PURR_VOLUME = 0.6;
const ONE_SHOT_VOLUME = 0.9;

function soundUrl(file: MumuSoundFile): string {
  return `${import.meta.env.BASE_URL}audio/mumu/${file}.mp3`;
}

export interface MumuSounds {
  play(file: Exclude<MumuSoundFile, "purr">): void;
  /** Start or stop the purr loop. Idempotent. */
  setPurring(on: boolean): void;
  configure(settings: MumuSoundSettings): void;
  dispose(): void;
}

export function createMumuSounds(initial: MumuSoundSettings): MumuSounds {
  let settings = initial;
  let wantPurr = false;
  let purrIssued = false;
  const howls = new Map<MumuSoundFile, Howl>();

  function howl(file: MumuSoundFile): Howl {
    let h = howls.get(file);
    if (!h) {
      h = new Howl({
        src: [soundUrl(file)],
        format: ["mp3"],
        loop: file === "purr",
        onloaderror: (_id, err) => console.error(`Mumu sound ${file}.mp3 failed to load`, err),
        onplayerror: (_id, err) => console.error(`Mumu sound ${file}.mp3 failed to play`, err),
      });
      howls.set(file, h);
    }
    return h;
  }

  function syncPurr(): void {
    const purr = howl("purr");
    const shouldPlay = wantPurr && settings.enabled;
    purr.volume(PURR_VOLUME * settings.volume);
    // Track our own play request: playing() is false while the file is still loading, which would queue a second play.
    if (shouldPlay && !purrIssued) {
      purr.play();
      purrIssued = true;
    } else if (!shouldPlay && purrIssued) {
      purr.stop();
      purrIssued = false;
    }
  }

  return {
    play(file) {
      if (!settings.enabled) return;
      const h = howl(file);
      h.volume(ONE_SHOT_VOLUME * settings.volume);
      h.play();
    },
    setPurring(on) {
      if (on === wantPurr) return;
      wantPurr = on;
      syncPurr();
    },
    configure(next) {
      settings = next;
      if (howls.has("purr")) syncPurr();
    },
    dispose() {
      for (const h of howls.values()) h.unload();
      howls.clear();
      purrIssued = false;
    },
  };
}
