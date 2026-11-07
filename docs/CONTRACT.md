# CONTRACT: client ↔ server API, shared data, and the Mumu bridge

This is the single source of truth. M1 turns it into `shared/` (types + zod) plus the Mumu bridge stub. If this file and the code disagree, that's a bug. Fix both in one `contract:` commit from the main checkout.

`contractVersion`: **1**

---

## 1. Conventions
- **Coordinates:** a position on a page is `pageIndex` (0-based) plus fractions (0–1) of *that page's* width and height. Never use pixels.
- **Box:** `{ x0, y0, x1, y1 }`, page fractions, with `x0 < x1` and `y0 < y1`. The **anchor** is the box's vertical centre; a cue fires when its anchor crosses the read line.
- **IDs:** strings. The server generates IDs for cues, regions, audio and new characters (`chr_…`). The client generates IDs for series and chapters. Voice profile IDs are fixed: `<slot>_<1|2|3>`.
- **Errors:** every non-2xx response has the body `{ error: string, detail?: string }`.

## 2. Enums (the prompts must use exactly these)
| Enum | Values |
|---|---|
| `CueKind` | `speech`, `thought`, `narration`, `sfx` |
| `Emotion` | `neutral`, `happy`, `angry`, `sad`, `scared`, `surprised`, `determined`, `tender`, `smug` |
| `Delivery` | `normal`, `shout`, `whisper` |
| `Mood` | `calm`, `tense`, `battle`, `climax`, `romance`, `sad`, `comedic`, `mystery` |
| `Intensity` | `1`, `2`, `3` |
| `SfxTag` | `punch`, `sword_clash`, `explosion`, `whoosh`, `footsteps`, `door`, `heartbeat`, `gasp`, `crowd`, `magic` |
| `VoiceSlot` | `narrator`, `male_young`, `male_adult`, `male_deep`, `male_elder`, `female_young`, `female_adult`, `female_cold`, `female_elder`, `child` |
| `JobState` | `queued`, `slicing`, `analyzing`, `reasoning`, `casting`, `voicing`, `packaging`, `done`, `failed` |

## 3. Voice profiles and characters
**VoiceProfile** (30 premade profiles: 10 slots × 3. The defaults come from the roster in `docs/DECISIONS.md`. The user tunes them in the Voices tab.)
| Field | Type | Notes |
|---|---|---|
| `id` | string | `<slot>_1`, `<slot>_2` or `<slot>_3` |
| `slot` | VoiceSlot | |
| `label` | string | e.g. "Young Hero A". `narrator_1` is labelled "Narrator" and is the narrator voice. **It is not Mumu**: Mumu only presents the recap bubble. |
| `voice` | string | Provider voice name |
| `style` | string | Default delivery style |
| `speed` | number | 0.8–1.2. Applied in the ffmpeg encode step (§9), not by the TTS model. |
| `pitch` | number | Semitones, integer −6..+6, default 0. Applied in the ffmpeg encode step (§9), not by the TTS model. |

**Character**
| Field | Type | Notes |
|---|---|---|
| `id` | string | Server-generated |
| `seriesId` | string | |
| `name` | string | Real name if the dialogue reveals it, otherwise a descriptive label |
| `description` | string | Visual description, used to recognize them in later chapters |
| `voiceSlot` | VoiceSlot | |
| `profileId` | string | **Label only**: which VoiceProfile `voice` was copied from. Nothing reads it for TTS. |
| `voice` | `{ voice, style, speed, pitch }` | **Snapshot** of that profile's `voice`, `style`, `speed` and `pitch`, copied once when the character is created (`snapshotVoice` in `shared/`). The character keeps it for life. |
| `firstSeenChapterId` | string | |

- **Casting rule** (code, not an LLM): for a new character, take the first of `<slot>_1`, `<slot>_2`, `<slot>_3` that this series' cast isn't already using; if all three are used, take `<slot>_1`. Set `profileId` to that profile and `voice` to its snapshot (`snapshotVoice`). **The server never modifies existing characters.**
- **Voice resolution for TTS:** `speech`/`thought` lines with a character use that character's **`voice` snapshot**, never the live profile table. Lines with an unknown speaker, `narration`, and the chapter recap use the `narrator_1` profile from `meta.profiles` (the narrator voice).
- **A chapter is voiced exactly once, at processing time, and a character keeps its voice forever through its id.** Editing a profile affects only characters created afterwards. Editing one character's voice affects future chapters only. Already-generated audio is never regenerated.

## 4. HTTP API (server, port 8787)
| Method & path | Request | Response |
|---|---|---|
| `GET /health` | — | `{ ok, contractVersion, models: { vision, reasoning, tts } }` |
| `POST /jobs` | multipart: `pages` = images **in reading order** (client downscales to ≤ 800 px wide, JPEG q≈0.85); `meta` = JSON `{ seriesId, chapterId, cast: Character[], profiles: VoiceProfile[] }` | `202 { jobId }` |
| `GET /jobs/:id` | — | `{ state: JobState, progress: 0..1, message, error? }` |
| `GET /jobs/:id/package` | — | `200 ChapterPackage` once done · `409` if not done · `404` if unknown or expired |
| `POST /preview` | JSON `{ profile: VoiceProfile, text }` (text ≤ 200 chars) | `200 audio/mpeg` (the raw TTS clip is cached like any other; the profile's speed and pitch are applied at encode, §9) |

- Jobs are in memory only, and a package is kept for 30 min after `done`. The client polls every 1.5 s and offers Retry after a 404.
- CORS allows the origins listed in `CORS_ORIGIN` (comma-separated). The dev default is `:5173`, `:5174`, and `:4173` (the production preview).
- There is no re-voicing. A failed job's Retry is just a new `POST /jobs` (nothing was stored). `meta.cast` carries each existing character's `voice`, and the server uses it as sent.

## 5. ChapterPackage
| Field | Type | Notes |
|---|---|---|
| `contractVersion` | 1 | The client rejects any other version |
| `seriesId`, `chapterId` | string | |
| `models` | `{ vision, reasoning, tts }` | |
| `newCharacters` | Character[] | Only characters created by this job. The client adds them to the cast. |
| `cues` | Cue[] | Sorted by `order` |
| `regions` | Region[] | Contiguous, covering the chapter from the first cue to the last |
| `recap` | `{ text, audioId }` | 2–3 sentences about **this** chapter, voiced by the narrator voice. Played when the next chapter opens, while Mumu presents the "Previously…" bubble. |
| `audio` | AudioClip[] | One per voiced cue, plus one for the recap |

**Cue:** `id`, `order` (int), `kind`, `pageIndex`, `box`, `text`, `characterId` (string or null), `emotion`, `delivery`, `audioId` (string or null; null for `sfx` and for text with no letters or digits), `sfxTag` (`sfx` only; null means no matching sound).
**Region:** `{ id, start: { pageIndex, y }, end: { pageIndex, y }, mood, intensity }`
**AudioClip:** `{ id, mime: "audio/mpeg", durationMs, dataBase64 }`. Mono MP3, about 64 kbps.

## 6. Client storage (Dexie / IndexedDB)
The schema lives in `client/src/db/db.ts`. It's part of the contract, so only MAIN changes it.

| Table | Key | Fields |
|---|---|---|
| `series` | `id` | `title`, `coverPageId`, `createdAt` |
| `characters` | `id` | Character fields; index `seriesId` |
| `profiles` | `id` | VoiceProfile fields. Seeded from the roster on first run. |
| `chapters` | `id` | `seriesId`, `number`, `title`, `pageCount`, `status` (`imported`/`processing`/`ready`/`failed`), `jobId?`, `error?`, `lastReadY?`, `processedAt?`, `recapText?`, `recapAudioId?` |
| `pages` | `id` | `chapterId`, `index`, `blob`, `width`, `height` |
| `cues` / `regions` | `id` | the fields above + `chapterId` |
| `audio` | `id` | `chapterId`, `blob`, `durationMs` |
| `readingLog` | `date` (`YYYY-MM-DD`) | `seconds` |
| `settings` | `key` | `theme` (`day`/`night`/`system`); `audio` (`master`/`voices`/`music`/`sfx`, each `{on, volume}`); `profile` (`{ name, avatarBlob? }`); `wellbeing` (`{ limitMinutes: 45, snoozeMinutes: 10 }`, where `limitMinutes: 0` means off); `mumu` (`{ visible: true, sounds: true }`); `debugOverlay` (bool) |

Storing a package is **one transaction**: replace the chapter's cues, regions and audio; add `newCharacters`; save the recap; set the status to `ready`. The import flow and the `/dev` loader use the same function.

## 7. Bundled assets (client, no API)
- Music: `client/public/audio/music/<mood>/1.mp3` · SFX: `client/public/audio/sfx/<sfxTag>.mp3`
- Mumu sounds: `client/public/audio/mumu/meow1.mp3`, `meow2.mp3`, `meow3.mp3`, `purr.mp3`, `mrrp.mp3`
- Mumu sprites: `client/public/mumu/<anim>.png` (horizontal strips) and `client/public/mumu/emotes/<emote>.png`. The frame size and frame counts live in **one** manifest: `client/src/mumu/sprites.ts` (see `docs/ASSETS.md`).

## 8. Environment
Server (`server/.env.example`):
- `GEMINI_API_KEY`
- `VISION_MODEL`, `REASONING_MODEL`, `TTS_MODEL`
- `PORT=8787`
- `CORS_ORIGIN=http://localhost:5173,http://localhost:5174,http://localhost:4173`
- `CACHE_DIR=<absolute path outside the repo>`. Shared by every checkout. Write the full path, because dotenv doesn't expand `~`. On Render, use `.cache`.
- `VISION_CONCURRENCY=4`, `TTS_CONCURRENCY=3`

Client (`client/.env.example`): `VITE_API_URL=http://localhost:8787`

## 9. Server disk cache
| What | Key = hash of |
|---|---|
| Vision result per segment | model + prompt version + segment bytes + cast names/descriptions |
| Reasoning result per chapter | model + prompt version + transcript + cast ids/names/descriptions (**not** voices) |
| TTS clip (raw WAV) | model + voice + style string + text. **Not** speed or pitch. |

Writes are atomic (temp file, then rename). Bump the prompt version whenever a prompt changes.

**Speed and pitch are applied at the ffmpeg encode step** (raw WAV → mono MP3), never by the TTS call. With `r = 2^(pitch/12)` and the TTS PCM sample rate (24000 Hz), the filter chain is `asetrate=24000*r, aresample=24000, atempo=speed/r`. Changing a profile's pitch or speed therefore re-encodes the cached WAV and makes **no new TTS calls**. (With speed 0.8–1.2 and pitch ±6, `speed/r` stays within 0.57–1.70, inside `atempo`'s 0.5–2.0 range.)

## 10. Mumu bridge (client-internal interface between Lane B and Lane C)
`client/src/mumu/bridge.ts`. MAIN creates it in M1; Lane C owns it after that, but **the API below doesn't change** without a contract commit.

| Called by | Function | Meaning |
|---|---|---|
| B (screens) | `setScreen(screen)` | `'home' \| 'reader' \| 'other'` |
| B (audio engine) | `setMood(mood \| null)` | The region mood at the read line; `null` outside the reader |
| B (reader) | `notifyActivity()` | Call on each scroll or tap in the reader. Feeds the reading timer's idle detection. |
| B (reader open) | `showRecap({ text, audioUrl })` | Mumu presents the previous chapter's recap |
| B (reader) | `onBreakRequested(cb)` | Mumu's "Take a break" button asks the app to leave the reader |
| C | `subscribe(listener)` | MumuLayer listens to everything above |

**Layout hooks (DOM data attributes that B renders and C reads):**
- `data-mumu-floor`: the element whose **top edge** Mumu walks on (the desk top on Home)
- `data-mumu-ledge`: elements whose **bottom edge** Mumu can hang from (shelf planks)
- `data-mumu-avoid`: areas Mumu shouldn't park over (e.g. the nav bar)

`<MumuLayer />` is mounted **once** in the app root by M1. It's a full-screen overlay with `pointer-events: none`; only Mumu's own element receives pointer events.
