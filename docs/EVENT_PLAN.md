# EVENT PLAN: start → submission

Fixed times: **13:30** early Devpost · **16:45** feature freeze (self-imposed) · **18:30** final MLH portal (we aim for 18:15).
Milestones are in `TASKS.md`, session handling is in `WORKFLOW.md`, and art is in `ASSETS.md`. The times below assume M0 starts at 10:00; if you start later, shift every row except the fixed times and apply cut-ladder rungs early (Part 4).

---

## Part 1: The first hour (three tracks at once)

**Track 1, Claude (T1 = MAIN, repo root)**
1. *(5 min, skip if done)* Create the GitHub repo (default branch **`main`**), clone it, unzip the kit into it, commit `docs: plan + tooling`, and push.
2. Run `claude` and accept the trust dialog. Type `/` and check that `milestone`, `sync`, `integrate` and `ship` appear. Run `/agents` and check for 3 agents.
3. `/milestone M0`. While it runs, do Track 2.
4. When M0 finishes, create `server/.env` from `server/.env.example`: key, models, absolute `CACHE_DIR`.
5. `/milestone M1`. Tell it where your assets folder is. Chapters are required now; audio, fonts and icons can come later. Any asset missing at M1 gets copied in at I0 or I1.
6. Start the lanes: T2 `claude --worktree server`, T3 `claude --worktree client`, T4 `claude --worktree mumu`. In each one, type `! npm install`, then `/milestone A1` / `B1` / `C1`. Then `/milestone D0` in MAIN.

**Track 2, you (during M0, ~30 min), filling in `DECISIONS.md`:**
- [ ] AI Studio: create the key, note your free-tier RPM/RPD, pick the vision + TTS models, and run one TTS style test (how does it take the style? See PROMPTS §3).
- [ ] Voice roster: **narrator_1 = the narrator** first, then one voice per slot. Slot voices 2 and 3 can start as a copy of voice 1 with a different pitch; refine them in the Voices tab later.
- [ ] Demo comic: 2 consecutive chapters → `~/fallhacks-assets/ch1/`, `ch2/` (e.g. Pepper&Carrot, CC BY; check the license).
- [ ] Palette (lospec) and fonts (Pixelify Sans + Press Start 2P woff2). Write both in DECISIONS and DESIGN.

**Track 3, you (10:55 → ~13:00, between lane check-ins):** the art from `ASSETS.md`. Spend at most 90 min on Mumu (walk, sit, held, loaf and tailwag first), then 20 min on music, SFX and meows. Hand Mumu files to Lane C ("copy ~/fallhacks-assets/mumu/* in and update sprites.ts"), and the rest to MAIN.

**Gemini quota budget** (first-time calls; the cache makes repeats free):
| Use | Vision | Reasoning | TTS |
|---|---|---|---|
| Lane A development (2 chapters, ~3 prompt revisions) | ~120 | ~10 | ~150 |
| Deployed server (empty cache): ch1 + ch2 + one retry | ~40 | ~3 | ~150 |
| Voice previews in the Voices tab | — | — | ~40 |
| **Total** | **~160** | **~13** | **~340** |

If your free-tier RPD is below this, **enable billing now**. Set the concurrency env vars to about RPM ÷ 5.

**Demo device: the laptop** (recommended). The production preview runs on `localhost`, so offline mode works, and it plugs into the projector. Use a phone only through the deployed HTTPS URL.

---

## Part 2: Run sheet

| Time | MAIN / you | Lane A server (T2) | Lane B app (T3) | Lane C Mumu (T4) | CP |
|---|---|---|---|---|---|
| 10:00 | M0 · you: Track 2 | — | — | — | |
| 10:30 | M1 | — | — | — | |
| 10:55 | Start lanes, D0 · you: Track 3 art | A1 | B1 | C1 | **CP1** |
| 12:00 | Review evidence, phone tests, art | A2 (`/effort high`) | B2 (`/effort high`) | C2 | |
| 12:50 | `/integrate` → **I0** | `/sync` | `/sync` | `/sync` | **CP2** |
| 13:15 | **Devpost early submission** (alarm 13:00) | idle / start A3 | idle / start B3 | idle / start C3 | ⚠️ 13:30 |
| 13:30 | Lunch (lanes may finish a well-defined milestone) | | | | |
| 14:00 | Art leftovers, README outline | A3 | B3 | C3 | |
| 14:40 | Reviewer on A3 / C2 | A4 (by 15:20) | B4 | C4 | |
| 15:30 | `/integrate` → **I1** local, then deployed | `/sync`, A5 | `/sync`, B5 | `/sync`, C5 (real art) | **CP3** |
| 16:15 | `/integrate` → **I2** full demo story on the laptop | `/sync`, fixes | `/sync`, fixes | `/sync`, fixes | |
| **16:45** | **FREEZE** → `/ship`, pre-process the demo chapters in the preview | bug fixes only | bug fixes only | bug fixes only | **CP4** |
| 17:00 | Record the video (PLAN §13 + the Mumu beats in SPEC's demo story). Two takes max. | | | | |
| 17:40 | README, screenshots, CREDITS, Devpost text (mention the theme and Mumu) | | | | |
| **18:00** | **Submit to the MLH portal** (alarm 17:55) | | | | ⚠️ 18:30 |

## Part 3: Checkpoints (go / no-go)
| CP | Must be true | If not |
|---|---|---|
| **CP1** 10:55 | `npm run check` green; 3 worktrees started + installed | Worktree trouble that takes more than 10 minutes → **single-lane mode** (WORKFLOW). If you're overloaded, start Lane C only after I0. |
| **CP2** 12:50 | Valid package with sane speakers + recap; reader plays the fixture; placeholder Mumu walks, drags and hangs; I0 boxes line up | Boxes misaligned → MAIN fixes the coordinate helper (30-min cap). Mumu behind → cut climb + yarn now. Any lane over 45 min late → apply rungs 1–3. |
| **CP3** 15:30 | A4 works locally; B4 + C4 done; at least walk/sit/held/loaf/tailwag are real art | Deploy failing → demo locally. TTS quota → billing. Art missing → keep the placeholders for missing animations and remove those behaviours from the demo script. |
| **CP4** 16:45 | Demo story steps 1–7 (SPEC) work on the laptop | Cut whatever fails from the demo script. **Don't build past 17:00.** |

## Part 4: Cut ladder (cut from the top; never cut the bottom)
1. Stretch S1–S3
2. Mumu **climb**, then **yarn**
3. `/preview` endpoint (the Voices tab still tunes voices; preview the cast's stored lines instead)
4. Profile avatar upload (keep Mumu's face)
5. Recap
6. Deployed backend (demo locally + video)
7. Music crossfade (switch to a hard cut), then SFX
- **Never cut:** offline reading · distinct character voices + one music bed · ch2 voice consistency · Mumu walk/sit/loaf on the desk, drag + swing, pet, scene reactions, read-time bubble, meow alarm.

---

## Part 5: Failure playbook (symptom → action)

| Symptom | Action |
|---|---|
| `claude --worktree` errors with a trust or HEAD message | Run `claude` once in the repo root and accept trust; make sure there's at least one commit |
| Worktree is missing files you committed | The kit sets `worktree.baseRef: "head"`. If someone changed it, re-create the worktree after committing in MAIN |
| A lane can't see the other lane's work | Expected. Lanes only see each other's work after MAIN runs `/integrate` and the lane runs `/sync` |
| `package-lock.json` merge conflict | Take main's version, then `npm install` (handled by `/sync` and `/integrate`) |
| Gemini 429 errors | Lower the concurrency env vars, wait 60 s, rerun (the cache keeps finished work). If it's constant, enable billing. |
| Gemini output fails zod validation repeatedly | Print one raw response, compare it with the schema. Usually an enum mismatch, so fix the prompt and bump its version. |
| Boxes are offset or flipped in the debug overlay | The bbox order or scale is wrong: try `[ymin, xmin, ymax, xmax]` on a 0–1000 scale, divided per segment and then mapped to the page |
| TTS speaks the style words aloud | Use the request format recorded in PROMPTS §3 (a separate style field, or the "Say …:" wrapper) |
| No sound on the phone | The tap-to-start button wasn't used, or the iPhone silent switch is on |
| Howler "No codec support" / silent blob | Missing `format: ['mp3']` |
| Offline reload shows the dinosaur page | You tested in dev, or the service worker didn't install. Use the production preview, load once online, then go offline |
| Music silent offline | The track was over the precache limit or not matched by the precache glob. Check the build output. |
| `EADDRINUSE :8787` | Another checkout's server is running. Stop it (only one server at a time). |
| Demo library is empty on the preview (:4173) | Expected: each origin has its own IndexedDB. Process the demo chapters in the preview; the shared cache makes it quick. |
| CORS error | The current client origin is missing from `CORS_ORIGIN` (Vite may have moved to :5174) |
| Render shows 502 or takes ages | Free instance waking up. Wait 60 s. Wake it before judging. |
| Data loaded in one checkout isn't in another | IndexedDB is per origin (port). Use the same port, or reload the fixture through `/dev` |
| Claude drifts or loops | Esc. After two failed corrections: `/clear` and one better prompt. A lane stuck for more than 20 minutes: you decide whether to cut, simplify, or swap tasks. |
| Claude usage limit reached | Switch lanes to a cheaper model, or go single-lane. Core milestones before polish. |
| Mumu looks blurry | Non-integer scale or missing `image-rendering: pixelated` (check the parent's CSS transforms too) |
| Mumu jumps when switching animations | Feet aren't on the same baseline across strips. Fix the art, or set a per-animation y-offset in `sprites.ts`. |
| Dragging Mumu scrolls the page on a phone | Missing `touch-action: none` on Mumu's element |
| Mumu blocks taps or scrolling on the app | The overlay must be `pointer-events: none`; only Mumu's element takes pointer events |
| Art swap shows garbage frames | Frame count or size in `sprites.ts` doesn't match the PNG strip width ÷ frame width |
| Meow alarm too loud or annoying during judging | Snooze it, or set the limit to 0 (off). Demo it with a 1-min limit, then switch it off. |
| Laptop or Wi-Fi failure | Hotspot. The repo is on GitHub; the video and offline demo don't need the network |

## Part 6: Pre-mortem (how this plan was stress-tested)

We assumed the project failed and asked why. Each cause is prevented somewhere in the kit, or has a recovery in Part 6.

| Possible failure | Prevented by |
|---|---|
| Two sessions edit the same files and break each other | Worktrees, folder ownership per lane, `shared/` changed only from MAIN (`rules/shared.md`) |
| Client and server disagree on data shapes | `CONTRACT.md` → `shared/` zod schemas used by both sides; reviewer checks the contract |
| Client is blocked waiting for the server | Hand-made `fixtures/sample.json` (M1) and the `/dev` loader (B2) |
| Worktrees start from stale code (they branch from the remote by default) | `worktree.baseRef: "head"` in `.claude/settings.json` |
| Worktrees lack `.env` and `node_modules` | `.worktreeinclude` copies the env files; lanes start with `! npm install` |
| Lanes add dependencies and the lockfile conflicts | All dependencies installed in M0; lockfile rule in `/sync` and `/integrate` |
| Gemini quota runs out mid-day | Disk cache (CONTRACT §9), concurrency from env, the quota budget (Part 1), the billing decision |
| Claude writes against an outdated Gemini or TTS API | docs-researcher agent, the CLAUDE.md rule, the TTS format test in Track 2 |
| Wrong bounding-box convention makes every cue fire in the wrong place | Normalized coordinates (CONTRACT §1), the debug overlay (F3), the I0 alignment check at 12:50 |
| Grid-layout comics (like Pepper&Carrot) have several bubbles at the same height | `order`-sorted queue of up to 3 in the scheduler (SPEC F4) |
| Fast scrolling floods the audio | Skim mode with exact thresholds (SPEC F4), unit-tested |
| An edited voice is overwritten by the next chapter's job | The server never modifies existing characters; it only adds `newCharacters` (CONTRACT §3/§5) |
| Each checkout keeps its own cache, so integration re-pays for Lane A's Gemini calls | One absolute `CACHE_DIR` outside the repo, shared by every checkout and copied via `.worktreeinclude` → `server/.env` (CONTRACT §8) |
| Demo chapters processed in dev are missing in the offline preview build | Process in the demo origin at P1 (TASKS P1, `/ship`); `:4173` is in CORS |
| Chapter-2 consistency can't be tested until the very end | Fixture `--cast` flag (A5) tests it in the pipeline at 15:15 |
| A failed job's Retry (a new POST /jobs) re-runs everything and burns quota | Cache keys exclude voices from vision/reasoning; TTS key includes the voice (CONTRACT §9) |
| A half-stored package corrupts a chapter | One-transaction store (CONTRACT §6), a single store function (`rules/client.md`) |
| Lines like "…" break TTS | Text with no letters or digits gets no audio (CONTRACT §5) |
| Offline demo fails on stage | Production-preview airplane test in B5, `/ship` checklist, demo device = laptop, secure-context rule |
| Music missing offline (Workbox drops large files) | Tracks ≤ 2 MB, 5 MB precache limit, `/ship` lists precached sizes |
| Audio blocked on mobile | Tap-to-start button (F4) |
| Scaffolding commands hang waiting for input | Non-interactive scaffolding in M0 |
| Monorepo deploy can't resolve `shared/` | Vercel and Render both build from the repo root (D0) |
| Server restart loses jobs | Jobs are deliberately in memory; client Retry plus cache makes it cheap (CONTRACT §4) |
| API keys leak into Git or transcripts | `.gitignore` in M0, `.env` read-deny rules, `/ship` key scan |
| Silent errors hide broken features | Fail-loud rules (CLAUDE.md, `rules/server.md`), reviewer checks for swallowed errors |
| Claude "says" it's done when it isn't | Every TASKS row has an acceptance check with evidence; verifier agent; the `/milestone` flow |
| Too many sessions and you lose track | 3 builders + MAIN max, a fixed loop, checkpoints, pause-Lane-C rule, single-lane fallback |
| Lanes B and C collide in the client | Strict folder ownership (`rules/client.md`, `rules/mumu.md`); MumuLayer mounted once by MAIN in M1; talk only through `bridge.ts` and `data-mumu-*` attributes |
| Both B and C need the database | The Dexie schema (`db.ts`) is contract-owned and created by MAIN in M1 |
| Mumu blocked waiting for art | Placeholder strips (C1); art swap = PNG + one manifest line |
| Mixed art styles look amateurish | One base pack or one AI character as reference, one palette, one frame size (ASSETS §1–2) |
| Swing needs extra art | Swinging is a CSS rotation of `held` (SPEC F8) |
| Mumu gets in the way of reading | Corner parking and no wandering in the reader; draggable; the Mumu visible setting |
| Meow alarm ruins the demo or annoys users | Respects master/Mumu sound settings; snooze; limit 0 = off |
| Early submission forgotten | 13:00 alarm, a run-sheet row, the TASKS row |
| Video recorded too late or fails | Freeze at 16:45, recording starts at 17:00, storyboard prepared, OBS installed early |
| Piracy question from the judges | Demo uses CC BY content; positioning in PLAN §2/§14 |
| Theme fit unclear to judges | Mumu is the digital sidekick: in the demo story, the copy, the Devpost text, and the recap voice |
| Tooling broken on your machine | Part 1 track 1 step 2 checks the skills and agents before any build |

**Remaining risks** (accepted, with a fallback):
- Speaker attribution quality: the Voices tab cast reassignment and S1 are the fallback.
- Art time: the biggest human risk. Time-boxed, with priorities, and placeholders keep the code unblocked.
- Gemini preview-model instability: model IDs live in env, so you can switch models without code changes.
- Venue network: the demo runs offline, and the video is the backup.
