# DEPLOY: Vercel (client) + Render (server)

Both services build from the **repo root** so the `shared/` workspace resolves. Config lives in `vercel.json` and `render.yaml`.

## Order matters: each side needs the other's URL
1. **Render first** (gives the API URL), with a placeholder `CORS_ORIGIN`.
2. **Vercel** with `VITE_API_URL` = the Render URL.
3. Back to Render: set `CORS_ORIGIN` = the Vercel URL, redeploy.

## Render (server)
- New → Blueprint → pick this repo (reads `render.yaml`), or New → Web Service with: root = repo root, build `npm install`, start `npm run start -w server`, health check `/health`.
- Env (names are in `server/.env.example`): `GEMINI_API_KEY`, `VISION_MODEL`, `REASONING_MODEL`, `TTS_MODEL`, `CORS_ORIGIN`, `CACHE_DIR=.cache`, `VISION_CONCURRENCY`, `TTS_CONCURRENCY`. Do **not** set `PORT`: Render injects it.
- `CORS_ORIGIN` is a comma-separated list. Include the Vercel production URL, and any preview URL you demo from.
- Free instances sleep when idle and `.cache` is wiped on redeploy. Wake it ~5 min before a demo.

## Vercel (client)
- Import this repo. Root directory = repo root (leave empty). `vercel.json` sets install, build `npm run build -w client`, output `client/dist`, and the SPA rewrite so `/read/...` deep links work.
- Env: `VITE_API_URL` = the Render URL, no trailing slash. It is baked in at **build** time, so changing it needs a redeploy.

## Check (D0)
- `https://<render-url>/health` returns `{"ok":true}`.
- The Vercel page shows `/health: ok` under the title. If it shows an error:
  - "VITE_API_URL is not set": add the env var and redeploy.
  - CORS error in the console: the Vercel origin is missing from `CORS_ORIGIN` (exact scheme + host, no trailing slash).
  - Slow or 502: the free Render instance is waking up; wait 60 s.
