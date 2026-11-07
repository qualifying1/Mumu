import { describe, expect, it } from "vitest";
import {
  MAX_SFX_AT_ONCE,
  MAX_VOICE_QUEUE,
  SKIM_OFF_MS,
  regionAt,
  startSession,
  step,
  type SchedAction,
  type SchedConfig,
  type SchedCue,
  type SchedInput,
  type SchedState,
} from "./scheduler.ts";

const VH = 800;

function voice(id: string, order: number, anchorY: number): SchedCue {
  return { id, order, anchorY, kind: "speech", audioId: `a_${id}`, sfxTag: null };
}
function sfx(id: string, order: number, anchorY: number, tag: SchedCue["sfxTag"] = "punch"): SchedCue {
  return { id, order, anchorY, kind: "sfx", audioId: null, sfxTag: tag };
}

function config(cues: SchedCue[], regions: SchedConfig["regions"] = []): SchedConfig {
  return { cues, regions, viewportHeight: VH };
}

/** Runs inputs in sequence, collecting every action. */
function run(cfg: SchedConfig, start: { y: number; t: number }, inputs: SchedInput[]) {
  let { state, actions } = startSession(cfg, start.y, start.t);
  const all: SchedAction[] = [...actions];
  for (const input of inputs) {
    const r = step(cfg, state, input);
    state = r.state;
    all.push(...r.actions);
  }
  return { state, actions: all };
}

const scroll = (t: number, y: number): SchedInput => ({ type: "scroll", t, y });
const played = (actions: SchedAction[]) => actions.flatMap((a) => (a.type === "playVoice" ? [a.cueId] : []));

describe("crossing", () => {
  const cfg = config([voice("c1", 1, 300), voice("c2", 2, 600)]);

  it("fires a cue when its anchor crosses the read line moving down", () => {
    const { actions } = run(cfg, { y: 0, t: 0 }, [scroll(500, 250), scroll(1000, 320)]);
    expect(played(actions)).toEqual(["c1"]);
  });

  it("fires on equality (anchor == read line)", () => {
    const { actions } = run(cfg, { y: 0, t: 0 }, [scroll(500, 300)]);
    expect(played(actions)).toEqual(["c1"]);
  });

  it("fires each cue only once per session, even after scrolling up and down again", () => {
    const inputs: SchedInput[] = [
      scroll(500, 320),
      { type: "voiceEnded" },
      scroll(1500, 100),
      scroll(2500, 400),
    ];
    const { actions } = run(cfg, { y: 0, t: 0 }, inputs);
    expect(played(actions)).toEqual(["c1"]);
  });

  it("scrolling up fires nothing", () => {
    const { actions } = run(cfg, { y: 700, t: 0 }, [scroll(500, 400), scroll(1000, 100)]);
    expect(played(actions)).toEqual([]);
  });

  it("cues above the starting position never play (restored scroll position)", () => {
    const { actions } = run(cfg, { y: 400, t: 0 }, [scroll(500, 0), scroll(1000, 450), scroll(2000, 650)]);
    expect(played(actions)).toEqual(["c2"]);
  });

  it("plays several crossings from one scroll event in `order`", () => {
    const two = config([voice("late", 2, 100), voice("early", 1, 200)]);
    const { actions } = run(two, { y: 0, t: 0 }, [scroll(2000, 300)]);
    expect(played(actions)).toEqual(["early"]);
    // the other one waits in the queue
    const { state } = run(two, { y: 0, t: 0 }, [scroll(2000, 300)]);
    expect(state.queue.map((q) => q.cueId)).toEqual(["late"]);
  });

  it("skips cues with no audio", () => {
    const silent: SchedCue = { id: "s", order: 1, anchorY: 100, kind: "narration", audioId: null, sfxTag: null };
    const { actions } = run(config([silent]), { y: 0, t: 0 }, [scroll(1000, 200)]);
    expect(actions).toContainEqual({ type: "skipped", cueId: "s", reason: "no-sound" });
    expect(played(actions)).toEqual([]);
  });
});

describe("skim mode", () => {
  const cues = [voice("c1", 1, 300), voice("c2", 2, 900), voice("c3", 3, 1500)];
  const cfg = config(cues);

  it("a fast flick skips every crossed cue and never plays them later", () => {
    // 1600 px in 100 ms = 16000 px/s, far above 1.5 × 800 = 1200 px/s
    const { actions } = run(cfg, { y: 0, t: 0 }, [scroll(100, 1600), scroll(2000, 0), scroll(3000, 1600)]);
    expect(played(actions)).toEqual([]);
    expect(actions.filter((a) => a.type === "skipped")).toHaveLength(3);
  });

  it("stays on until 400 ms below the threshold, then cues play again", () => {
    const slowCfg = config([voice("c1", 1, 300), voice("c2", 2, 900), voice("c3", 3, 1500)]);
    const inputs: SchedInput[] = [
      scroll(100, 400), // fast (4000 px/s): c1 skipped
      scroll(300, 420), // slow, 200 ms after the fast event → still skimming
      scroll(450, 440),
      scroll(450 + SKIM_OFF_MS, 460), // 400 ms after the last fast event → skim off
      scroll(1500, 920), // slow (~460 px/s): c2 plays
    ];
    const { actions, state } = run(slowCfg, { y: 0, t: 0 }, inputs);
    expect(played(actions)).toEqual(["c2"]);
    expect(state.skim).toBe(false);
  });

  it("a cue crossed while still skimming is skipped even if the event itself is slow", () => {
    const inputs: SchedInput[] = [scroll(100, 200), scroll(250, 320)];
    const { actions } = run(config([voice("c1", 1, 300)]), { y: 0, t: 0 }, inputs);
    expect(played(actions)).toEqual([]);
    expect(actions).toContainEqual({ type: "skipped", cueId: "c1", reason: "skim" });
  });

  it("music (region changes) continues while skimming", () => {
    const regions = [
      { id: "r1", startY: 0, endY: 500, mood: "calm" as const },
      { id: "r2", startY: 500, endY: 2000, mood: "battle" as const },
    ];
    const { actions } = run(config([], regions), { y: 0, t: 0 }, [scroll(100, 1600)]);
    expect(actions.filter((a) => a.type === "regionChange")).toEqual([
      { type: "regionChange", regionId: "r1", mood: "calm" },
      { type: "regionChange", regionId: "r2", mood: "battle" },
    ]);
  });

  it("a very short gap between events cannot fake a flick", () => {
    // 20 px in 1 ms would be 20000 px/s; the minimum dt makes it 1250 px/s... still must stay under the limit at 10 px
    const { state } = run(config([]), { y: 0, t: 0 }, [scroll(1000, 0), scroll(1001, 10)]);
    expect(state.skim).toBe(false);
  });
});

describe("voice channel", () => {
  const four = config([voice("c1", 1, 100), voice("c2", 2, 200), voice("c3", 3, 300), voice("c4", 4, 400), voice("c5", 5, 500), voice("c6", 6, 600)]);

  /** Slow steps: 100 px per 1000 ms. */
  const crossAll = (n: number): SchedInput[] => Array.from({ length: n }, (_, i) => scroll((i + 1) * 1000, (i + 1) * 100 + 5));

  it("plays one voice at a time and queues the rest", () => {
    const { state, actions } = run(four, { y: 0, t: 0 }, crossAll(3));
    expect(played(actions)).toEqual(["c1"]);
    expect(state.current?.cueId).toBe("c1");
    expect(state.queue.map((q) => q.cueId)).toEqual(["c2", "c3"]);
  });

  it("advances through the queue as clips end, in order", () => {
    const inputs = [...crossAll(3), { type: "voiceEnded" } as const, { type: "voiceEnded" } as const, { type: "voiceEnded" } as const];
    const { state, actions } = run(four, { y: 0, t: 0 }, inputs);
    expect(played(actions)).toEqual(["c1", "c2", "c3"]);
    expect(state.current).toBeNull();
  });

  it("ducks on the first clip and un-ducks when the queue drains", () => {
    const inputs = [...crossAll(2), { type: "voiceEnded" } as const, { type: "voiceEnded" } as const];
    const { actions } = run(four, { y: 0, t: 0 }, inputs);
    expect(actions.filter((a) => a.type === "duck")).toEqual([
      { type: "duck", on: true },
      { type: "duck", on: false },
    ]);
  });

  it("keeps at most 3 waiting: the oldest is dropped, and the current clip fades out over 150 ms", () => {
    const { state, actions } = run(four, { y: 0, t: 0 }, crossAll(6));
    expect(state.queue).toHaveLength(MAX_VOICE_QUEUE);
    expect(state.queue.map((q) => q.cueId)).toEqual(["c4", "c5", "c6"]);
    expect(actions.filter((a) => a.type === "dropped")).toEqual([{ type: "dropped", cueId: "c2" }, { type: "dropped", cueId: "c3" }]);
    expect(actions.filter((a) => a.type === "fadeOutVoice")).toEqual([{ type: "fadeOutVoice", ms: 150 }]);
  });

  it("after the fade ends, the next queued clip plays", () => {
    const { actions } = run(four, { y: 0, t: 0 }, [...crossAll(5), { type: "voiceEnded" }]);
    expect(played(actions)).toEqual(["c1", "c3"]);
  });

  it("stray voiceEnded with nothing playing is harmless", () => {
    const { state, actions } = run(four, { y: 0, t: 0 }, [{ type: "voiceEnded" }]);
    expect(state.current).toBeNull();
    expect(actions).toEqual([]);
  });
});

describe("sfx", () => {
  it("plays a one-shot on crossing", () => {
    const { actions } = run(config([sfx("x", 1, 100, "explosion")]), { y: 0, t: 0 }, [scroll(1000, 150)]);
    expect(actions).toContainEqual({ type: "playSfx", cueId: "x", tag: "explosion" });
  });

  it("allows at most 2 at once; extras are skipped, and a slot frees on sfxEnded", () => {
    const cfg = config([sfx("x1", 1, 100), sfx("x2", 2, 200), sfx("x3", 3, 300), sfx("x4", 4, 400)]);
    const inputs: SchedInput[] = [scroll(1000, 350), { type: "sfxEnded" }, scroll(2000, 450)];
    const { actions, state } = run(cfg, { y: 0, t: 0 }, inputs);
    const tags = actions.filter((a) => a.type === "playSfx").map((a) => (a as { cueId: string }).cueId);
    expect(tags).toEqual(["x1", "x2", "x4"]);
    expect(actions).toContainEqual({ type: "skipped", cueId: "x3", reason: "sfx-limit" });
    expect(state.sfxActive).toBeLessThanOrEqual(MAX_SFX_AT_ONCE);
  });

  it("sfx with no matching sound is skipped", () => {
    const { actions } = run(config([sfx("x", 1, 100, null)]), { y: 0, t: 0 }, [scroll(1000, 150)]);
    expect(actions).toContainEqual({ type: "skipped", cueId: "x", reason: "no-sound" });
  });

  it("sfx do not touch the voice channel", () => {
    const { state } = run(config([sfx("x", 1, 100)]), { y: 0, t: 0 }, [scroll(1000, 150)]);
    expect(state.current).toBeNull();
  });
});

describe("regions", () => {
  const regions = [
    { id: "r1", startY: 100, endY: 500, mood: "calm" as const },
    { id: "r2", startY: 500, endY: 900, mood: "tense" as const },
  ];

  it("regionAt: start inclusive, end exclusive, last region end inclusive", () => {
    expect(regionAt(regions, 99)).toBeNull();
    expect(regionAt(regions, 100)?.id).toBe("r1");
    expect(regionAt(regions, 500)?.id).toBe("r2");
    expect(regionAt(regions, 900)?.id).toBe("r2");
    expect(regionAt(regions, 901)).toBeNull();
  });

  it("emits a regionChange only when the region at the read line changes", () => {
    const cfg = config([], regions);
    const { actions } = run(cfg, { y: 0, t: 0 }, [scroll(1000, 150), scroll(2000, 300), scroll(3000, 600), scroll(4000, 700)]);
    expect(actions.filter((a) => a.type === "regionChange")).toEqual([
      { type: "regionChange", regionId: "r1", mood: "calm" },
      { type: "regionChange", regionId: "r2", mood: "tense" },
    ]);
  });

  it("also changes when scrolling back up", () => {
    const cfg = config([], regions);
    const { actions } = run(cfg, { y: 600, t: 0 }, [scroll(1000, 300)]);
    expect(actions.map((a) => (a.type === "regionChange" ? a.mood : null)).filter(Boolean)).toEqual(["tense", "calm"]);
  });

  it("keeps the last mood outside every region", () => {
    const cfg = config([], regions);
    const { state } = run(cfg, { y: 600, t: 0 }, [scroll(1000, 50)]);
    expect(state.mood).toBe("tense");
  });

  it("starting inside a region announces it immediately", () => {
    const { actions } = startSession(config([], regions), 200, 0);
    expect(actions).toEqual([{ type: "regionChange", regionId: "r1", mood: "calm" }]);
  });
});

describe("immutability", () => {
  it("never mutates the previous state", () => {
    const cfg = config([voice("c1", 1, 100)]);
    const { state: s0 } = startSession(cfg, 0, 0);
    const snapshot: SchedState = { ...s0, done: new Set(s0.done), queue: [...s0.queue] };
    step(cfg, s0, scroll(1000, 150));
    expect(s0.done.size).toBe(snapshot.done.size);
    expect(s0.current).toBeNull();
  });
});
