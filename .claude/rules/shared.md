---
paths:
  - "shared/**"
  - "docs/CONTRACT.md"
  - "client/src/db/db.ts"
  - "client/src/mumu/bridge.ts"
---
- This is the contract between the lanes. It includes the Dexie schema (`db.ts`) and the Mumu bridge API (`bridge.ts`). Lane C may change `bridge.ts` internals but not its exported API. Change it only from the main checkout (branch `main`). If you're on a lane branch, stop and describe the change you need instead.
- Every change updates `docs/CONTRACT.md` and `shared/` in the same commit, with the message `contract: <what changed>`. Bump `contractVersion` only for breaking changes.
- After committing, list exactly what each lane must update, and remind the user to run `/sync` in both lanes.
