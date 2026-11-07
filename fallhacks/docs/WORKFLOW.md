# WORKFLOW: how to build fast with Claude Code on the day

## The short answer

- **Yes, use multiple terminals: three builders plus one integrator** (A server, B app, C Mumu). Mumu is a self-contained folder that talks to the app through a tiny bridge, so it parallelizes cleanly. Don't add more sessions than that, because **you** are the bottleneck: every session's output has to be read, tested, and merged by one person. If you fall behind on reviewing, pause Lane C first.
- **Give each builder its own git worktree** (`claude --worktree server`, `claude --worktree client`). Each gets its own copy of the files and its own branch, so two sessions can never edit the same file at the same time.
- **Split the work by folder.** Lane A owns `server/`, Lane B owns `client/` except the Mumu folders, and Lane C owns `client/src/mumu/` plus the Mumu assets. The contract (`shared/`, `client/src/db/db.ts`, the `bridge.ts` API) changes only from the main checkout.
- **Write the contract first, and give each lane a fixture.** Lane B builds the reader against a hand-made sample package, so it doesn't wait for the server. Lane A builds the pipeline against image folders, so it doesn't wait for the client.
- **Agent files: yes, three small ones** (reviewer, verifier, docs-researcher). **Skills: four** (`/milestone`, `/sync`, `/integrate`, `/ship`). Agents give Claude a fresh pair of eyes; skills save you from retyping the same workflow. Neither replaces you reading the evidence.
- **Make every milestone end in something that passes or fails** (a test, a fixture run, a screenshot). Then Claude can loop on its own, and you only check results.

## What each file in the kit does

| File | Loaded when | Purpose |
|---|---|---|
| `CLAUDE.md` | Every session, automatically | Commands, rules, gotchas. Kept short on purpose. |
| `.claude/rules/client.md`, `server.md`, `shared.md` | Only when Claude touches files in that folder | Rules for that area of the code |
| `docs/*.md` | When a skill or Claude reads them | SPEC (behaviour), CONTRACT (data), TASKS (board), DECISIONS (choices), DESIGN, PROMPTS, PLAN (background) |
| `.claude/skills/milestone` | You type `/milestone A1` | Plan → implement → check → evidence → commit, for one milestone |
| `.claude/skills/sync` | You type `/sync` in a lane | Merges main into the lane safely and re-checks |
| `.claude/skills/integrate` | You type `/integrate` in MAIN | Merges the lanes into main, checks, smoke-tests, pushes |
| `.claude/skills/ship` | You type `/ship` at freeze | Pre-demo and pre-submission checklist |
| `.claude/agents/reviewer` | "use the reviewer on B2" | A fresh, read-only review against SPEC/CONTRACT. Reports bugs, not style. |
| `.claude/agents/verifier` | "use the verifier" | Runs the checks and reports the exact output. Never edits. |
| `.claude/agents/docs-researcher` | Automatically, or "use docs-researcher for Gemini TTS" | Looks up the *current* API before Claude writes code from memory |
| `.claude/settings.json` | Always | Pre-approves safe commands, asks before push/reset, blocks reading `.env`; worktrees branch from your local HEAD |
| `.worktreeinclude` | When a worktree is created | Copies your `.env` files into each worktree |

All skills are set so Claude can't trigger them on its own; they only run when **you** type them.

## Window layout

| Window | Where | Command |
|---|---|---|
| T1 **MAIN** | repo root | `claude`. This is the integrator: scaffold, contract, merges, deploys. |
| T2 **Lane A** | (created for you) | `claude --worktree server` |
| T3 **Lane B** | (created for you) | `claude --worktree client` |
| T4 **Lane C** | (created for you) | `claude --worktree mumu` |
| T5 shell | repo root | Dev servers and manual git. `npm run dev` here when integrating. |
| VS Code | repo root | Reading diffs. The worktrees appear under `.claude/worktrees/`. |
| Browser | | localhost:5173, the deployed URL, AI Studio, Devpost |

**Starting a lane:** in the new lane session, first type `! npm install`. The `!` runs a shell command directly, and a worktree starts without node_modules. Then type `/milestone A1` (or `B1`, `C1`).

**Don't exit lane sessions during the day.** If you have to, choose **keep** when asked about the worktree, and use the resume command Claude Code prints.

## The loop (repeat all day)

1. **Lane:** `/milestone <id>`. Claude reads the docs, posts a short plan, builds, checks, shows evidence, and commits.
2. **While it works:** switch to the other lane, or do a human task (list below). Check back every 10–15 minutes. Press **Esc** as soon as you see it drifting.
3. **When it reports done:** read the evidence, not the summary. For the heavy milestones (**A2, A3, B2, B4, C2**), also say `use the reviewer agent on <id>` and have Claude fix only the BLOCKER/BUG items.
4. `/clear`, then the next `/milestone`. Use a fresh context for each milestone; the docs carry the memory between them.
5. **At an integration point** (I0, I1, I2): `/integrate` in MAIN, then `/sync` in **every** lane.

## Prompting habits that save the most time

- **Point at IDs, not prose:** "Skim mode doesn't match SPEC F4: after a fast flick it plays 3 queued lines." That's precise, and Claude can find the rule.
- **Paste screenshots** for any UI or overlay problem (drag them into the terminal).
- **Two-correction rule:** if you've corrected the same thing twice, `/clear` and write one better prompt that includes what you learned. A third correction in the same context rarely works.
- **Ask for evidence, not reassurance:** "show the command output" or "tell me exactly what to click".
- **Effort:** use `/effort high` for A2 (merge/reasoning) and B2 (audio engine), where edge cases matter. Use the default elsewhere, and `/effort low` for copy and CSS tweaks.
- **Check unfamiliar APIs first:** "use docs-researcher to confirm the @google/genai structured-output call and the TTS response format before writing A1/A3." Library APIs (Gemini especially) changed after many models' training data.
- **If a lane needs a contract change,** it stops and tells you. You make the change in MAIN (update `docs/CONTRACT.md` and `shared/` in one commit), then run `/sync` in every lane. Never let a lane change the contract.

## What you do while Claude works

- **Make the art** (`docs/ASSETS.md`), especially in the first 2 hours; it's the biggest human task today
- Test every finished milestone on your **phone** (it catches audio-unlock and layout bugs early)
- Replace placeholder UI with your mascot and icons, and run the Devpost early submission at 13:15
- Write the README outline, collect screenshots as features land, and rehearse the demo script (`PLAN.md` §13)
- Keep an eye on Gemini usage in AI Studio, and add a line to the DECISIONS change log for anything you change

## Usage and cost

- Four sessions (three of them building) use your Claude Code allowance several times faster. **Check your limits now** (`/usage`). If you're tight, run the UI and Mumu milestones (B3, B5, C1–C5) on a cheaper model with `/model`, and keep the strongest model for A2, A3, and B2.
- Gemini quota is **shared** across every session and every run. The server's disk cache is what keeps it in budget (CONTRACT §9). Never delete `server/.cache` in Lane A's worktree.

## If parallel work fights you: single-lane mode

If worktrees cause trouble at checkpoint CP1 (see EVENT_PLAN), stop running lanes. Work in MAIN only, doing milestones in this order: M0 → M1 → A1 → B1 → A2 → B2 → C1 → I0 → A3 → A4 → B3 → C2 → B4 → I1 → C4 → C3 → B5 → C5 → I2. Mumu's climb, hang and yarn become cut candidates. Everything else stays the same. Expect to finish about 1–1.5 hours later, which means less stretch work, not a missing core.

## Team variant (if you have teammates)

Each person runs one lane on their own machine, from their own clone, on a branch named `worktree-server` or `worktree-client` (the skills expect those names). In `.claude/skills/sync/SKILL.md`, replace `git merge main` with `git pull origin main`. The integrator pulls the lane branches from GitHub before running `/integrate`.

## Anti-patterns that waste the day

- Building auth, accounts, or payments before the core loop works
- Tuning prompts for more than 20 minutes at a time. Ship it, and let the Voices tab (cast reassignment) fix the speakers.
- Letting a lane "quickly fix" the other lane's folder (this causes merge conflicts)
- Testing offline in dev mode (the service worker is off there; use the production preview)
- Deleting the cache to "start fresh" (this burns Gemini quota)
- Recording the video at 18:00
