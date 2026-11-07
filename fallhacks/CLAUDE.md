# Voiced manhwa reader with Mumu, the digital sidekick (FallHacks 2026, one-day build)

This is a pixel-art PWA. The user imports comic chapters (CBZ, ZIP, or images). The server uses Gemini to find bubbles, speakers, scene moods and a recap, then voices every line. The reader plays voices, music and SFX as you scroll, and works offline. **Mumu**, a pixel orange cat, walks around the app, reacts to scenes, can be dragged and petted, tracks reading time, and meows when you've read too long.

## Read before working
- `docs/SPEC.md`: what "done" means for each feature (acceptance criteria)
- `docs/CONTRACT.md`: the API and data shapes. **This is the source of truth for client ↔ server.**
- `docs/TASKS.md`: milestones, which lane owns each one, and how to check it
- `docs/DECISIONS.md`: model IDs, the voice roster, and other fixed choices
- `docs/DESIGN.md`: the pixel-art style, screens and layout
- `docs/ASSETS.md`: sprite specs and art sources (the Mumu animation table)
- `docs/PROMPTS.md`: Gemini prompt texts and TTS style rules
- `docs/PLAN.md`: background and rationale. Read it only if something above is unclear.

## Layout
npm workspaces: `client/` (Vite + React + TS PWA), `server/` (Express + TS, run with tsx), `shared/` (contract types + zod schemas). Test chapters live in `fixtures/`. Mumu lives in `client/src/mumu/` (Lane C). The contract-owned client files are `client/src/db/db.ts` and `client/src/mumu/bridge.ts`.

## Commands
- Install: `npm install`. Run this first in any fresh checkout or worktree.
- Dev (both): `npm run dev`. The client runs on :5173 and the server on :8787.
- One side: `npm run dev -w client` or `npm run dev -w server`
- **Check: `npm run check`** (typecheck all workspaces + unit tests). It must pass before every commit.
- Pipeline on a folder of images: `npm run fixture -- fixtures/ch1`, which writes `fixtures/out/ch1.json`. For the next chapter: `npm run fixture -- fixtures/ch2 --cast fixtures/out/ch1.json`
- Production preview of the client (the service worker is active): `npm run build -w client && npm run preview -w client`

## Rules
- Lanes: A = `server/`, B = `client/` except Mumu, C = Mumu folders (see `docs/TASKS.md`). Never edit another lane's files.
- `shared/`, `db.ts` and the `bridge.ts` API are the contract. Only change it from the **main checkout**: update `docs/CONTRACT.md` and `shared/` in the same commit, using the message `contract: …`. Lanes then run `/sync`.
- All planned dependencies were installed in M0. Only add a dependency if you must, and put `deps: <name>` in the commit message.
- Never read, print, or cat any `.env` file. Variable names are in `server/.env.example` and `client/.env.example`.
- Model IDs, voice names, ports, and concurrency come from env or `shared` config. Never hardcode them.
- Fail loudly: no empty catch blocks and no silent fallbacks. Validate every Gemini response with the `shared` zod schemas.
- One implementation per behaviour. The fixture script and the API call the same pipeline functions.
- Commit after each passing check, with the message `<milestone-id>: <what>`.
- If you're unsure of the current API for `@google/genai`, Gemini TTS, howler, dexie, or vite-plugin-pwa, use the **docs-researcher** agent before writing the code. These APIs change often.
- "Done" means the milestone's acceptance check in `docs/TASKS.md` passed, and you show the evidence (command output or a screenshot).

## Gotchas
- Pixel art: integer scales + `image-rendering: pixelated` only; comic pages are never pixelated.
- Howler can't infer the format from a blob URL. Always pass `format: ['mp3']`.
- The service worker is disabled in dev. Test offline only with the production preview.
- Workbox skips precache files larger than its size limit. Music must stay within the limit set in the client's PWA config (see `docs/SPEC.md`).
- Mobile browsers block audio until a user taps. The reader needs its "Tap to read with audio" button.
- Only one server can hold :8787. Stop any other checkout's server before starting one (otherwise EADDRINUSE).
- IndexedDB is separate per origin: dev (:5173), a second dev (:5174) and the preview (:4173) each have their own library. The demo runs on the preview.
- Gemini bounding boxes: confirm the order and scale with the debug overlay before trusting any coordinates.
