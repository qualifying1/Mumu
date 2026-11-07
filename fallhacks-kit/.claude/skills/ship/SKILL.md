---
name: ship
description: Pre-demo and pre-submission checklist (feature freeze). Run from the main checkout.
disable-model-invocation: true
---

Run through this checklist. For each item, report ✅, ❌ (with the fix needed), or 👤 (needs me, with exact instructions).

**Code**
1. `npm run check` passes on `main`, and `git status` is clean.
2. `npm run build -w client` succeeds. List the precached audio files and their sizes, and flag any over the precache limit.
3. `git log --oneline -15`: nothing secret was committed. Grep the repo (excluding node_modules) for `AIza` and `sk_` key prefixes, and for `.env` files that are tracked.

**Deployed**
4. Have me open the deployed client, check that `/health` responds through it, and confirm the model names shown.
5. Remind me to wake the Render server 5 minutes before judging.

**Demo device** (👤, step by step). On a laptop, the demo runs from `npm run build -w client && npm run preview -w client` (:4173). Its library is separate from dev, so chapters must be processed there.
6. Library shows ch1 and ch2 as `ready`.
7. Airplane mode → reload → read ch1 for 30 s: voices, music change, at least one SFX.
8. The Voices tab Cast view shows shared characters across ch1 and ch2; opening ch2 plays Mumu's recap.
8b. Mumu: walks on the desk, drag/swing/drop/hang, pet → hearts and purr, tap → read time, reacts in the reader. Set the reading limit back from the 1-min demo value **only after** the video.
9. All Mumu sprites are real art (no placeholder frames left), and the debug overlay is OFF, theme set for stage lighting, volume checked.

**Submission** (👤)
10. The GitHub repo is **public**.
11. README has: a one-line pitch, a screenshot or GIF, the video link, setup in at most 5 steps, the models used, and credits (CREDITS.md).
12. Devpost: video, repo link, "built with", **MLH Best Use of Gemini track ticked**, and any other eligible tracks.
13. MLH portal submission done by 18:15.
