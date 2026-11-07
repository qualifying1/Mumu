---
name: integrate
description: Merge the lane branches into main, verify, and prepare a deploy. Run from the main checkout only.
disable-model-invocation: true
argument-hint: "[server|client|mumu|all]"
---

Integrate **$ARGUMENTS** (default: all).

1. Run `git branch --show-current`. It must be `main`, and `git status` must be clean. If not, stop.
2. Run `git worktree list` and show me the last commit on each lane branch (`git log -1 --oneline worktree-server`, `worktree-client`, `worktree-mumu`). Ask me to confirm that each lane has committed what it should.
3. Merge in this order: `git merge worktree-server`, then `git merge worktree-client`, then `git merge worktree-mumu`. Conflict rules:
   - `package-lock.json`: take ours, then run `npm install`.
   - `docs/TASKS.md`: keep both sides' status changes.
   - Anything else: stop and show me the hunks.
4. Run `npm install` if the dependencies changed, then `npm run check`. If it fails, stop and report. Don't fix lane code here unless it's a one-line merge fix.
5. Smoke test: tell me to run `npm run dev` and give me a 3-step manual check for what was just merged (for example: import ch1 → process → read the first 5 cues).
6. When I confirm it works, push. This asks for permission. Then remind me that all three lanes need `/sync`, and that Vercel and Render will redeploy from the push.
