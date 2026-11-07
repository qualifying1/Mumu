# Mumu reactions: emoji-only personality (proposal)

Status: **proposal, not yet in the contract.** Written by Lane B (B3 follow-up). It fills a gap: SPEC F8 covers the reader (scene moods, recap, alarm, read time), but nothing covers Mumu reacting on **Home, Add, Voices or Profile**, or to import and processing events. DESIGN already promises two of them ("Add your first story!" and ❓ on no match).

## Principles
1. **Mumu never speaks in words.** Every bubble is 1–3 emoji. Personality comes from the animation plus the emoji, not text. This replaces the text bubbles in SPEC F8 (read time, alarm, recap, empty state).
2. **Accessible.** Each bubble carries an `aria-label` with a plain-text meaning (e.g. "Mumu: add your first story"). Screen readers get words; sighted users get emoji.
3. **Reactions are cheap and never block.** One reaction at a time, ≤ 3 s unless sticky, never moves Mumu during a drag or pet (pet/drag always win).
4. **Honest.** `failed` looks sad, `ready` looks proud. No fake cheer.
5. **Reduced motion:** the bubble still shows, but the animation is limited to `sit` / `loaf` (same rule as SPEC F8).

## Contract change (MAIN, one commit: `contract: mumu react`)
Add to `client/src/mumu/bridge.ts` and CONTRACT §10; nothing else in the contract changes.

```ts
export type ReactionKind =
  | "homeEmpty" | "noMatch" | "searching" | "pickBook" | "startReading"
  | "imported" | "analyzing" | "casting" | "voicing" | "packaging" | "ready" | "failed"
  | "voiceSaved" | "nightOn" | "dayOn";

// BridgeEvent gains: { type: "react"; kind: ReactionKind | null }
/** Mumu reacts (animation + emoji bubble). `null` clears a sticky reaction. Called by B. */
export function react(kind: ReactionKind | null): void;
```

Rules Lane C applies on receipt: same `kind` within 3 s is ignored (debounce); a new `react` replaces the current one; **sticky** kinds stay until another `react`, `react(null)` or a screen change; one-shot kinds last 3 s then Mumu returns to idle life.

## Vocabulary (Design judgement: change freely before C builds it)
| `kind` | Sticky | When B calls it | Animation | Bubble | Sound |
|---|---|---|---|---|---|
| `homeEmpty` | yes | Home with zero series | sit (on the empty desk) | 📚➕ | none |
| `noMatch` | yes | Search has text but 0 results | sit + ❓ emote | 🔍❓ | none |
| `searching` | no | First result after typing stops (600 ms) | tail wag | 👀 | none |
| `pickBook` | no | Tap a book on the shelf | tail wag | 😺 | mrrp |
| `startReading` | no | Press **Read** | tail wag | 📖✨ | mrrp |
| `imported` | no | Chapter imported on Add | tail wag + sparkle | 📚✨ | mrrp |
| `analyzing` | yes | Job state `slicing`/`analyzing`/`reasoning` | sit, head follows progress | 🔎 | none |
| `casting` | yes | Job state `casting` | sit | 🎭 | none |
| `voicing` | yes | Job state `voicing` | yarn (busy paws) | 🎙️🧶 | none |
| `packaging` | yes | Job state `packaging` | yarn | 📦 | none |
| `ready` | no | Job `done` and stored | tail wag + sparkle | 🎧✨ | meow1 |
| `failed` | yes | Job `failed` | loaf + tear emote | 😿💧 | meow3 |
| `voiceSaved` | no | A profile saved on Voices | tail wag | 🎤👍 | mrrp |
| `nightOn` | no | Theme switched to night | loaf + zzz emote | 🌙💤 | none |
| `dayOn` | no | Theme switched to day | tail wag | ☀️ | none |

Existing F8 speech, converted (Lane C, same milestone):
| Was (text) | Now (emoji) |
|---|---|
| Tap: "You've read 23 min today!" | 📖 + the minutes as keycap digits, e.g. 📖2️⃣3️⃣⏱️ (aria-label keeps the sentence) |
| Alarm: "Mrrow! Break time? (45 min)" | 😿☕❓ with the **Take a break** / **Snooze N min** buttons unchanged (they are controls, not speech) |
| Recap: "Previously…" | ⏪📖🎧 while the narrator plays; the recap text is shown only as the aria-label and via the Recap line in the chapter card |
| Home empty: "Add your first story!" | 📚➕ (this is `homeEmpty`; remove the plain DOM bubble B3 ships on Home) |

Emotes needed beyond ASSETS' seven: none (`question`, `tear`, `sparkle`, `zzz`, `heart`, `exclaim`, `note` already cover the table). The emoji bubble uses the system emoji font inside the existing pixel bubble frame (`bubble.png`); it is the one place text-like glyphs are not pixel art.

## Split of work
| Step | Lane | What | Acceptance |
|---|---|---|---|
| R0 | MAIN | The contract commit above + this doc moved into SPEC F8 | `npm run check` passes; lanes run `/sync` |
| C5 | C | Handle `react` in the engine (pure: debounce, sticky, replace, pet/drag priority), emoji bubble, sounds, reduced motion, convert the four text bubbles | Engine tests for debounce/sticky/replace/priority; in MumuLab a button per `kind` shows the animation + emoji |
| B5 | B | Call sites: `Home.tsx` (`homeEmpty`, `noMatch`, `searching`, `pickBook`, `startReading`), `Add.tsx` (`imported`), processing flow (`analyzing`…`failed`), `Voices.tsx` (`voiceSaved`), theme switch (`nightOn`/`dayOn`); remove Home's DOM "Add your first story!" bubble | Each trigger visible on the device; no `react` call leaves a sticky reaction behind after leaving the screen |

B5 cannot start until R0 is merged and synced (the `react` export does not exist yet). The processing and theme call sites wait for B4 and F7.
