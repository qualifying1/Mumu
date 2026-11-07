// Reader (SPEC F3 + F4): one continuous strip of pages, a pure scheduler fed by scroll position, and the audio engine.
// Components never create Howl instances; everything audible goes through AudioEngine.
import type { Mood } from "@mumu/shared";
import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { AudioEngine } from "../audio/engine.ts";
import { db, DEFAULT_SETTINGS, getSetting, setSetting, type CueRow, type RegionRow } from "../db/db.ts";
import * as bridge from "../mumu/bridge.ts";
import { computeLayout, pageUnitsToStripY, stripYToPageUnits, type StripLayout } from "../reader/coords.ts";
import { DebugStripLayer, DebugViewportLayer } from "../reader/DebugOverlay.tsx";
import MiniBar from "../reader/MiniBar.tsx";
import { prepareReader } from "../reader/prepare.ts";
import {
  READ_LINE_RATIO,
  startSession,
  step,
  type SchedAction,
  type SchedConfig,
  type SchedInput,
  type SchedState,
} from "../reader/scheduler.ts";

/** Pages fill the viewport width up to this; wider screens get a centred strip. */
const MAX_STRIP_WIDTH = 900;
const SAVE_POSITION_DEBOUNCE_MS = 400;
const LOG_LINES = 12;
/** The strip ends this far (in viewport heights) below the last page so the last cues can cross the read line. */
const END_SPACER_VIEWPORTS = 0.5;

/** Everything the scroll/audio plumbing needs that must NOT trigger renders. */
interface Controller {
  engine: AudioEngine | null;
  config: SchedConfig | null;
  state: SchedState | null;
  layout: StripLayout | null;
  cuesById: Map<string, CueRow>;
  debug: boolean;
  lastUnits: number | null;
  lastScrollY: number;
  saveTimer: number | undefined;
}

function describeAction(a: SchedAction, cue: CueRow | undefined): string {
  const who = cue ? `#${cue.order} ${cue.kind} "${cue.text.slice(0, 18)}"` : "";
  switch (a.type) {
    case "playVoice":
      return `play ${who}`;
    case "playSfx":
      return `sfx ${a.tag} ${who}`;
    case "fadeOutVoice":
      return `fade out voice ${a.ms}ms`;
    case "duck":
      return a.on ? "duck music" : "un-duck music";
    case "regionChange":
      return `region → ${a.mood}`;
    case "skipped":
      return `skip (${a.reason}) ${who}`;
    case "queued":
      return `queue ${who}`;
    case "dropped":
      return `drop ${who}`;
  }
}

export default function Reader() {
  const { chapterId } = useParams();
  if (!chapterId) return <p role="alert" className="p-6 font-bold">No chapter in the address.</p>;
  return <ReaderInner key={chapterId} chapterId={chapterId} />;
}

function ReaderInner({ chapterId }: { chapterId: string }) {
  const navigate = useNavigate();

  // ---- data (Dexie is the source of truth) ----
  const chapter = useLiveQuery(async () => (await db.chapters.get(chapterId)) ?? null, [chapterId]);
  const content = useLiveQuery(async () => {
    const [pages, cues, regions, audio] = await Promise.all([
      db.pages.where("chapterId").equals(chapterId).sortBy("index"),
      db.cues.where("chapterId").equals(chapterId).sortBy("order"),
      db.regions.where("chapterId").equals(chapterId).toArray(),
      db.audio.where("chapterId").equals(chapterId).toArray(),
    ]);
    return { pages, cues, regions: sortRegions(regions), audio };
  }, [chapterId]);
  const audioSetting = useLiveQuery(() => getSetting("audio"), []);
  const debugSetting = useLiveQuery(() => getSetting("debugOverlay"), []);
  const audio = audioSetting ?? DEFAULT_SETTINGS.audio;
  const debug = debugSetting ?? DEFAULT_SETTINGS.debugOverlay;

  // ---- transient UI state ----
  const [unlocked, setUnlocked] = useState(false);
  const [barVisible, setBarVisible] = useState(true);
  const [mood, setMoodChip] = useState<Mood | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [skim, setSkim] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [stripWidth, setStripWidth] = useState(0);
  const [viewportH, setViewportH] = useState(() => window.innerHeight);
  const [restored, setRestored] = useState(false);
  const [pageUrls, setPageUrls] = useState<string[]>([]);

  const wrapRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const startUnits = useRef<number | null | undefined>(undefined);
  const ctlRef = useRef<Controller>({
    engine: null,
    config: null,
    state: null,
    layout: null,
    cuesById: new Map(),
    debug: false,
    lastUnits: null,
    lastScrollY: 0,
    saveTimer: undefined,
  });
  const ctl = ctlRef.current;
  ctl.debug = debug;

  const reportError = useCallback((message: string) => {
    console.error(`[reader] ${message}`);
    setErrors((prev) => (prev.includes(message) ? prev : [...prev, message].slice(-3)));
  }, []);

  /** Read-line position in strip px, or null before the pages are mounted. */
  const readY = useCallback((): number | null => {
    const pages = pagesRef.current;
    if (!pages) return null;
    return READ_LINE_RATIO * window.innerHeight - pages.getBoundingClientRect().top;
  }, []);

  // ---- layout ----
  const layoutResult = useMemo(() => {
    if (!content || stripWidth <= 0) return null;
    try {
      return { layout: computeLayout(content.pages, stripWidth) } as const;
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) } as const;
    }
  }, [content, stripWidth]);
  const layout = layoutResult && "layout" in layoutResult ? layoutResult.layout : null;

  const prepared = useMemo(
    () => (content && layout ? prepareReader(layout, content.cues, content.regions, viewportH) : null),
    [content, layout, viewportH],
  );
  const fatal = layoutResult && "error" in layoutResult ? layoutResult.error : prepared && !prepared.ok ? prepared.error : null;

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    setStripWidth(wrap.clientWidth);
    const observer = new ResizeObserver(() => {
      setStripWidth(wrap.clientWidth);
      setViewportH(window.innerHeight);
    });
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  // Page images from the stored blobs; revoked when the chapter closes.
  useEffect(() => {
    if (!content) return;
    const urls = content.pages.map((p) => URL.createObjectURL(p.blob));
    setPageUrls(urls);
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [content]);

  // ---- scheduler plumbing ----
  const note = useCallback(
    (line: string) => {
      if (!ctl.debug) return;
      setLog((prev) => [...prev.slice(-(LOG_LINES - 1)), line]);
    },
    [ctl],
  );

  const runActions = useCallback(
    (actions: readonly SchedAction[]) => {
      const engine = ctl.engine;
      for (const a of actions) {
        switch (a.type) {
          case "playVoice":
            engine?.playVoice(a.audioId);
            break;
          case "fadeOutVoice":
            engine?.fadeOutVoice(a.ms);
            break;
          case "playSfx":
            engine?.playSfx(a.tag);
            break;
          case "duck":
            engine?.setDucked(a.on);
            break;
          case "regionChange":
            engine?.setMusic(a.mood);
            bridge.setMood(a.mood);
            setMoodChip(a.mood);
            break;
          case "skipped":
          case "queued":
          case "dropped":
            break;
        }
        note(describeAction(a, "cueId" in a ? ctl.cuesById.get(a.cueId) : undefined));
      }
    },
    [ctl, note],
  );

  const dispatch = useCallback(
    (input: SchedInput) => {
      if (!ctl.config || !ctl.state) return;
      const result = step(ctl.config, ctl.state, input);
      ctl.state = result.state;
      runActions(result.actions);
      if (ctl.debug) setSkim(result.state.skim);
    },
    [ctl, runActions],
  );

  /** Start the reading session at the current read line (after the unlock tap). */
  const begin = useCallback(() => {
    const y = readY();
    if (ctl.state || !ctl.config || y === null) return;
    const result = startSession(ctl.config, y, performance.now());
    ctl.state = result.state;
    runActions(result.actions);
  }, [ctl, readY, runActions]);

  // Engine + Mumu bridge lifetime = the reader's lifetime.
  useEffect(() => {
    const engine = new AudioEngine({
      voiceEnded: () => dispatch({ type: "voiceEnded" }),
      sfxEnded: () => dispatch({ type: "sfxEnded" }),
      error: reportError,
    });
    ctl.engine = engine;
    setUnlocked(engine.isUnlocked());
    bridge.setScreen("reader");
    const stopBreak = bridge.onBreakRequested(() => navigate("/"));
    return () => {
      stopBreak();
      engine.dispose();
      ctl.engine = null;
      ctl.state = null;
      bridge.setMood(null);
      bridge.setScreen("other");
    };
  }, [ctl, dispatch, navigate, reportError]);

  useEffect(() => {
    if (!content) return;
    ctl.engine?.setClips(new Map(content.audio.map((a) => [a.id, a.blob])));
  }, [ctl, content]);

  useEffect(() => {
    if (audioSetting) ctl.engine?.applySettings(audioSetting);
  }, [ctl, audioSetting]);

  // New layout/config (first load or a resize): rebase the running session on the new pixel positions.
  useEffect(() => {
    if (!prepared?.ok || !layout || !content) return;
    ctl.config = prepared.prepared.config;
    ctl.layout = layout;
    ctl.cuesById = new Map(content.cues.map((c) => [c.id, c]));
    const y = readY();
    if (ctl.state && y !== null) {
      ctl.state = { ...ctl.state, lastY: y, lastT: performance.now(), lastFastT: null, skim: false };
    }
    if (unlocked && audioSetting && restored) begin();
  }, [ctl, prepared, layout, content, unlocked, audioSetting, restored, readY, begin]);

  // Remember the scroll position per chapter, as pageIndex + fraction (coords.ts).
  const savePosition = useCallback(() => {
    window.clearTimeout(ctl.saveTimer);
    ctl.saveTimer = undefined;
    if (ctl.lastUnits === null) return;
    db.chapters.update(chapterId, { lastReadY: ctl.lastUnits }).catch((e: unknown) => {
      console.error("Could not save the reading position", e);
    });
  }, [ctl, chapterId]);

  useEffect(() => {
    const onScroll = () => {
      const y = readY();
      if (y === null) return;
      bridge.notifyActivity();
      dispatch({ type: "scroll", t: performance.now(), y });

      if (ctl.layout) {
        ctl.lastUnits = stripYToPageUnits(ctl.layout, y);
        window.clearTimeout(ctl.saveTimer);
        ctl.saveTimer = window.setTimeout(savePosition, SAVE_POSITION_DEBOUNCE_MS);
      }
      const dy = window.scrollY - ctl.lastScrollY;
      if (Math.abs(dy) > 6) {
        setBarVisible(dy < 0 || window.scrollY < 50);
        ctl.lastScrollY = window.scrollY;
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      savePosition();
    };
  }, [ctl, dispatch, readY, savePosition]);

  // Restore the saved position once the strip has its (aspect-ratio based) height.
  useLayoutEffect(() => {
    if (restored || !layout || chapter === undefined || chapter === null) return;
    startUnits.current = chapter.lastReadY ?? null;
    const pages = pagesRef.current;
    if (pages && chapter.lastReadY !== undefined) {
      const docTop = pages.getBoundingClientRect().top + window.scrollY;
      const target = docTop + pageUnitsToStripY(layout, chapter.lastReadY) - READ_LINE_RATIO * window.innerHeight;
      window.scrollTo(0, Math.max(0, target));
      ctl.lastScrollY = window.scrollY;
    }
    setRestored(true);
  }, [ctl, restored, layout, chapter]);

  // Chapter N > 1 opens with Mumu presenting the previous chapter's recap (after the tap, so audio may play).
  const chapterNumber = chapter?.number;
  const chapterSeries = chapter?.seriesId;
  useEffect(() => {
    if (!unlocked || !restored || chapterNumber === undefined || chapterSeries === undefined) return;
    if (chapterNumber <= 1 || startUnits.current !== null) return; // only on a fresh open
    let cancelled = false;
    let url: string | null = null;
    (async () => {
      const siblings = await db.chapters.where("seriesId").equals(chapterSeries).toArray();
      const prev = siblings
        .filter((c) => c.number < chapterNumber && c.recapAudioId !== undefined && c.recapText !== undefined)
        .sort((a, b) => b.number - a.number)[0];
      if (!prev) return;
      const clip = await db.audio.get(prev.recapAudioId!);
      if (!clip) throw new Error(`The recap audio of chapter ${prev.number} is missing from the library.`);
      if (cancelled) return;
      url = URL.createObjectURL(clip.blob);
      bridge.showRecap({ text: prev.recapText!, audioUrl: url });
    })().catch((e: unknown) => reportError(`Could not show the recap: ${e instanceof Error ? e.message : String(e)}`));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [unlocked, restored, chapterNumber, chapterSeries, reportError]);

  // ---- handlers ----
  async function onUnlock() {
    const engine = ctl.engine;
    if (!engine) return;
    try {
      await engine.unlock();
    } catch (e) {
      reportError(`Could not start audio: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    setUnlocked(true);
    begin();
  }

  function onBack() {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate("/add");
  }

  // ---- render ----
  if (chapter === null || (content && content.pages.length === 0)) {
    return (
      <main className="p-6">
        <p role="alert" className="font-bold">
          {chapter === null ? "This chapter is not in your library." : "This chapter has no pages."}
        </p>
        <button type="button" onClick={onBack} className="mt-4 min-h-[44px] border-2 border-current px-4 font-bold">
          Back
        </button>
      </main>
    );
  }

  const topSpacer = Math.round(READ_LINE_RATIO * viewportH);
  const bottomSpacer = Math.round(END_SPACER_VIEWPORTS * viewportH);
  const preparedOk = prepared?.ok ? prepared.prepared : null;

  return (
    <div className="min-h-screen bg-black text-white">
      <MiniBar
        visible={barVisible}
        audio={audio}
        mood={mood}
        debug={debug}
        onBack={onBack}
        onChangeChannel={(key, value) => void setSetting("audio", { ...audio, [key]: value })}
        onToggleDebug={() => void setSetting("debugOverlay", !debug)}
      />

      {errors.length > 0 && (
        <div role="alert" data-testid="audio-errors" className="fixed right-0 bottom-16 left-0 z-50 border-t-4 border-current bg-black p-2 text-xs">
          {errors.map((e) => (
            <p key={e}>⚠ {e}</p>
          ))}
          <button type="button" onClick={() => setErrors([])} className="mt-1 min-h-[44px] border-2 border-current px-3 font-bold">
            Dismiss
          </button>
        </div>
      )}

      <div ref={wrapRef} className="relative mx-auto" style={{ width: `min(100%, ${MAX_STRIP_WIDTH}px)` }}>
        <div style={{ height: topSpacer }} className="flex flex-col items-center justify-end gap-1 pb-8 text-center text-sm opacity-70">
          <p className="font-bold">{chapter ? chapter.title : "Loading…"}</p>
          <p>Scroll to begin ↓</p>
        </div>

        <div
          ref={pagesRef}
          data-testid="strip"
          className="relative"
          onClick={() => {
            bridge.notifyActivity();
            setBarVisible((v) => !v);
          }}
        >
          {layout &&
            content?.pages.map((page, i) => (
              <img
                key={page.id}
                src={pageUrls[i]}
                alt={`Page ${i + 1}`}
                draggable={false}
                // Comic pages are never pixelated; heights come from the layout so boxes line up before images decode.
                style={{ display: "block", width: layout.width, height: layout.heights[i] }}
              />
            ))}
          {debug && preparedOk && <DebugStripLayer prepared={preparedOk} />}
        </div>

        <div style={{ height: bottomSpacer }} className="flex items-start justify-center pt-8 text-sm opacity-70">
          <p>End of chapter</p>
        </div>
      </div>

      {fatal && (
        <p role="alert" className="fixed top-16 right-2 left-2 z-50 border-2 border-current bg-black p-2 text-sm font-bold">
          Can't read this chapter: {fatal}
        </p>
      )}

      {debug && <DebugViewportLayer log={log} skim={skim} />}

      {!unlocked && (
        <button
          type="button"
          data-testid="unlock"
          onClick={() => void onUnlock()}
          className="fixed right-0 bottom-0 left-0 z-50 min-h-14 border-t-4 border-current bg-white px-4 text-base font-bold text-black"
        >
          Tap to read with Mumu 🐾
        </button>
      )}
    </div>
  );
}

function sortRegions(regions: RegionRow[]): RegionRow[] {
  return [...regions].sort((a, b) => a.start.pageIndex - b.start.pageIndex || a.start.y - b.start.y);
}
