---
name: milestone
description: Implement one milestone from docs/TASKS.md end to end, from plan to verified commit.
disable-model-invocation: true
argument-hint: "[milestone-id e.g. A1]"
---

Implement milestone **$ARGUMENTS**.

1. **Load context.** Read the `$ARGUMENTS` row in `docs/TASKS.md` and confirm its dependencies are `done` (if not, stop and tell me). Read only the SPEC, CONTRACT, PROMPTS and DECISIONS sections that this milestone touches.
2. **Check the lane.** Run `git branch --show-current`. MAIN milestones run on `main`, lane A on `worktree-server`, lane B on `worktree-client`, lane C on `worktree-mumu`. If the branch doesn't match, stop and tell me.
3. **Short plan.** Give at most 8 bullets: the files you'll create or change, and how you'll meet each acceptance criterion. If the milestone needs a change to `shared/` or a new dependency, **stop and ask**. Contract changes only happen from MAIN. Otherwise continue without waiting.
4. **Check unfamiliar APIs.** For any external API you aren't certain about (Gemini, TTS, howler, dexie, vite-plugin-pwa), use the docs-researcher agent before writing that code.
5. **Implement in small steps.** Run `npm run check` after each meaningful step and fix failures before moving on. Keep pure logic (scheduler, coordinate mapping, dedupe, casting) in separate modules with unit tests.
6. **Run the acceptance check** from the TASKS row. Show the evidence: the command output, or say exactly what I should look at in the browser.
7. **Commit.** Set the milestone's status to `done` in `docs/TASKS.md` and commit everything with the message `$ARGUMENTS: <one-line summary>`.
8. **Finish** with three lines: what's done, anything deferred or risky, and "Ready for /clear."

Constraints: follow `CLAUDE.md` and the `.claude/rules/` file for this area. Don't touch files owned by the other lane. If you hit the same failure twice, stop and explain the blocker. Don't try a third workaround.
