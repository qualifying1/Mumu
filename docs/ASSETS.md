# ASSETS: what to make, where to get it, exact specs

**Your job (the human's) during the first ~2 hours while the lanes build.** The code uses placeholders until the real files land. Replacing an asset = dropping in a PNG with the same name and updating its frame count in `client/src/mumu/sprites.ts`.

Keep everything in one folder outside the repo (`~/fallhacks-assets/`). Lane C copies Mumu files in; MAIN copies the rest. Record every source and license in `CREDITS.md`.

## 1. Mumu sprite specs (the contract with Lane C)
- **Frame size:** one size for every animation. **32×32** recommended (most packs use it); write the final size in DECISIONS.
- **Format:** transparent PNG, **one horizontal strip per animation**, frames left to right, no padding, no spacing.
- **Facing:** draw **right-facing only**; the code mirrors for left. Feet on the same baseline in every animation, so Mumu doesn't jump when switching animations.
- **Palette:** orange tabby (3–4 oranges + cream belly/muzzle + dark outline), taken from the app palette.

| File | Frames | fps | Loop | Pose |
|---|---|---|---|---|
| `walk.png` | 6–8 | 10 | yes | Walking right |
| `sit.png` | 2–4 | 4 | yes | Sitting, blinking or breathing |
| `tailwag.png` | 4–6 | 8 | yes | Sitting, tail swishing (also used for petting) |
| `loaf.png` | 2–4 | 3 | yes | Paws tucked "loaf", slow breathing |
| `yarn.png` | 6–8 | 8 | yes | Batting a yarn ball (the ball is drawn in the frames) |
| `climb.png` | 4–6 | 8 | yes | Clinging to a wall on its right, climbing up |
| `hang.png` | 2–4 | 4 | yes | Front paws on a ledge above, back legs dangling |
| `held.png` | 2 | 4 | yes | Picked up by the scruff, body stretched, legs dangling. **Swinging is a CSS rotation of this.** |
| `meow.png` | 3–4 | 6 | yes | Sitting, mouth open (break alarm, tap reply) |

**Emotes:** 16×16, single frame, in `emotes/`: `heart`, `exclaim`, `question`, `tear`, `sparkle`, `zzz`, `note`. Plus a speech-bubble 9-slice (`bubble.png`, 24×24, 8 px corners).

**Priority if time is short:** walk, sit, held, loaf, tailwag (core) → meow → hang → yarn → climb. Any missing animation keeps its placeholder until it's replaced.

## 2. Where to get Mumu: pick ONE path and time-box it to 90 minutes

**Path A: base pack + hand edits (fastest, consistent style).** Recommended.
1. Get one cat pack with the most animations, in **orange** if possible:
   - itch.io **"Cat Pack" by Octopusinkus (Glem)**: the free pack has idle, bouncing yarn ball, walk, paw tap, sleep, sit to stand, run and **climb edge**; the paid version (≈$4 CAD) adds 6 colours.
   - **"Cat 2D Pixel Art" by xzany**: free/paid; includes walk, idle, sleep, wall slide and **climb**, 32×32.
   - **"Cat Animation Pack" by Delinear** (≈$1): 32×32, includes an **orange** cat with idle, run, sit, lay down and sleep.
   - ⚠️ Read each pack's license on its page before using it, and credit the author.
2. Open it in **Piskel** (piskelapp.com, free, browser) or **Aseprite** (paid; LibreSprite and Pixelorama are free alternatives).
3. Recolor it to orange if needed (replace-color tool).
4. Draw the missing poses by editing existing frames:
   - `held`: stretch the idle frame vertically and dangle the legs
   - `hang`: start from the climb frame, raise the paws, dangle the legs
   - `tailwag`: copy sit and move only the tail
   - `meow`: copy sit and open the mouth
   - `loaf`: start from sleep or lay-down
5. Export each animation as a horizontal PNG strip.

**Path B: AI-generate a custom Mumu** (more unique; costs money; less predictable).
- **PixelLab** (pixellab.ai): a pixel-art-specific AI that animates characters (text prompts, skeleton poses); free trial, then from about $12/mo. Also available as an Aseprite extension.
- **Retro Diffusion** (retrodiffusion.ai): grid-aligned pixel art with an animation model that outputs sprite sheets. Tip: describe the subject only and don't write "pixel art" in the prompt; the style setting handles that. It also has an MCP server and plugin for Claude Code, but it needs a paid API key.
- Prompt to start from: *"chubby orange tabby cat with cream belly and muzzle, big round eyes, short tail, cute, side view facing right, 32x32"*. Then animate the same character for each row of the table, using the first image as the reference so it stays consistent.
- Always clean up in Piskel/Aseprite: snap to the 32×32 grid, remove stray semi-transparent pixels, and make sure the feet sit on the same baseline.

**If you have a teammate who can draw,** give them this file and Path A. It's the best use of a non-coder's time today.

## 3. Room and UI
| Need | Get it from |
|---|---|
| UI panels, buttons, 9-slice frames | **Kenney** "UI Pack: Pixel Adventure" and "Pixel UI Pack" (kenney.nl, **CC0**) |
| Shelf planks, desk, props (mug, lamp, plant) | Draw them: wood planks are a 32×16 tile with 3 shades plus a highlight (10 min in Piskel); props can come from free cozy-interior packs on itch.io (check the license and that they're **side view**, not top-down) or be generated with PixelLab/Retro Diffusion |
| Icons (search, plus, mic, person, play, back) | **pixelarticons** (MIT), or draw them at 16×16 |
| Fonts | Google Fonts: **Pixelify Sans**, **Press Start 2P** (download the woff2 files) |
| Palette | lospec.com Palette List |
| App icon | Mumu's face at 32×32, scaled to 192 and 512 (nearest-neighbour), plus a maskable version with padding |

## 4. Mumu sounds (`client/public/audio/mumu/`)
`meow1.mp3`, `meow2.mp3`, `meow3.mp3` (short and varied), `purr.mp3` (a 2–3 s loop), `mrrp.mp3` (a happy chirp). Get them from **Pixabay sound effects** (search "cat meow", "cat purr"). Trim them in Audacity, export mono MP3, each under 100 KB.

## 5. Checklist (tick as files land)
- [ ] palette chosen → DESIGN tokens filled in
- [ ] fonts (2 woff2)
- [ ] walk · sit · held · loaf · tailwag
- [ ] meow · hang · yarn · climb
- [ ] emotes (7) + bubble
- [ ] shelf plank tile, desk, 3 props
- [ ] nav icons (4) + UI frame
- [ ] app icons 192/512/maskable
- [ ] Mumu sounds (5)
- [ ] CREDITS.md updated

## 6. Mumu reference photos (`docs/asset_references/`)
Photos of the real cat, used as **drawing reference only**. They are not sprite strips and must never go in `client/public/` (2160×2880 JPGs would bloat the precache). They are already committed in `docs/asset_references/` (identical to the source folder), so they are not copied a second time.

| File | Useful for |
|---|---|
| `alert.jpg` | `exclaim` emote, alert/startled pose |
| `shock.jpg` | `exclaim` emote, big-eyed surprise (`surprised` reactions) |
| `loaf.jpg`, `loaf2.jpg` | `loaf` animation (paws tucked, body rounded) |
| `sleepy.jpg` | `loaf` with the `zzz` emote, calm reactions |
| `dead.jpg` | `loaf` / flopped-over pose, `zzz`, "sad" reactions |
| `resting_lean.jpg` | `sit` and the resting lean against the shelf |
| `rawr.jpg` | `meow` (mouth open), alarm meows |
| `smile.jpg` | happy face, `tailwag`, petting reaction |
| `ui_draft.jpg` | not a cat: the UI mood and layout target (see DESIGN.md) |

## 7. Demo music (`client/public/audio/music/<mood>/1.mp3`)
All 8 moods have a track. `battle`, `tense`, `climax` (one licensed track, copied three times) and `sad` are licensed (see `CREDITS.md`); `calm`, `romance`, `mystery` and `comedic` are synthesized by `scripts/make-assets.mjs`. SFX (all 10 tags), the `zzz`/`note` emotes and the PWA icons come from the same script. The engine still never substitutes a track: a missing file is a visible reader error.
