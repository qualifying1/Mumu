---
name: sync
description: Bring the latest main (contract changes, merged work) into this lane's worktree and re-verify.
disable-model-invocation: true
---

1. Run `git branch --show-current`. If it's `main`, stop: sync is only for lane worktrees.
2. Run `git status`. If there are uncommitted changes, run `npm run check`. If it passes, commit with the message `wip: pre-sync`. If it fails, stop and show me the failure.
3. Run `git merge main`. If there are conflicts:
   - `package-lock.json`: take main's version, then run `npm install`.
   - `shared/` or `docs/CONTRACT.md`: take main's version, because main owns the contract.
   - Anything else: stop and show me the conflicting hunks. Don't guess.
4. If `package.json` or `package-lock.json` changed in the merge, run `npm install`.
5. Run `npm run check` and report the result. If `shared/` changed, list the contract changes and every place in this lane that now needs updating.
