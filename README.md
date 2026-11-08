# Mumu

A voiced manhwa reader with Mumu, the pixel-cat sidekick (FallHacks 2026).

## Try the demo (no server needed)

1. `npm install`
2. `npm run build -w client && npm run preview -w client` and open http://localhost:4173
3. **Add** tab -> **Load the demo chapters** (two voiced Pepper&Carrot chapters), then **Search** -> **Read**. Tap "Tap to read with Mumu" to unlock audio.
4. It works offline after the first load (service worker is only active in the preview/production build).

To import your own chapter (.cbz/.zip/images) run `npm run dev` (client :5173, server :8787, needs `server/.env`). `client/public/demo/pepper-carrot-ch1.cbz` is a ready-made file to import.

## Rebuilding the demo and assets

- `npm run fixture -- fixtures/ch1 --cast fixtures/cast/pepper-carrot.json --patch fixtures/patches/ch1.json`, then ch2 with `--cast fixtures/out/ch1.json --patch fixtures/patches/ch2.json` (ch1.json must list the cast in `newCharacters`), then `node scripts/build-demo.mjs`
- `node scripts/make-assets.mjs` regenerates SFX, synthesized music, emotes and icons

See `CREDITS.md` for sources and licenses, and `docs/` for the spec.
