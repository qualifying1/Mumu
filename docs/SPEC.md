# SPEC: what we're building and how we know it works

Data shapes and the Mumu bridge are in `CONTRACT.md`. The look of the app is in `DESIGN.md`, and the art requirements are in `ASSETS.md`. Rationale is in `PLAN.md`. This file holds **behaviour and acceptance criteria only.**

**Theme:** *digital sidekick*. **Mumu**, a pixel-art orange cat, lives in the app, reads along with you, voices the story's narration, reacts to scenes, and makes you take breaks.

**Core features:**
1. Offline reading of downloaded (imported and processed) chapters
2. Audio: character voices, music and SFX
3. Mumu interactions

## Demo story (everything below serves this)
1. Home: Mumu walks on the coffee desk below the bookshelf. Drag Mumu (it swings), drop it on a shelf (it hangs), then pet it (hearts and a purr).
2. **Add** tab: import chapter 1 → processing ("Mumu is reading the panels…").
3. Read: distinct voices, the music shifts, SFX hit. Mumu reacts in the corner (sweating in tense scenes, hyped in fights).
4. **Voices** tab: tune a voice profile, preview it, re-voice the chapter.
5. Open chapter 2: Mumu presents a "Previously…" recap in its own voice, and the characters keep their voices.
6. With the reading limit set to 1 min in Profile, Mumu won't stop meowing until you take a break.
7. Airplane mode: everything above still works.

## F1 Add (import)
- Accepts `.cbz`, `.zip`, or several images. Ignores files that aren't images. Sorts pages naturally (`2` before `10`).
- Pick an existing series or name a new one. The chapter number defaults to the highest + 1.
- ✅ A 30-page CBZ appears on the shelf within 5 s and survives a reload.

## F2 Processing
- Downscale pages to ≤ 800 px wide, POST them with the cast and all profiles, poll the job, then store the package in one transaction (CONTRACT §6).
- Progress screen: one pixel-styled step per JobState with a check mark and the server's message, written in Mumu's voice (e.g. "Mumu is reading the panels…").
- A failure shows the error text and a Retry button.
- ✅ Chapter 1 goes from imported to ready; its cues, regions, audio, recap and new characters are stored.

## F3 Reader visuals
- One continuous vertical strip at the viewport width. **Pages are not pixelated.** Remembers your scroll position per chapter.
- Debug overlay (setting): cue boxes with order numbers, region boundaries with mood labels, and the read line.
- ✅ With the overlay on, boxes sit on the bubbles at 390 px and 1280 px widths.

## F4 Reader audio engine
| Rule | Value |
|---|---|
| Read line | 60% down the viewport |
| A cue fires when | its anchor crosses the read line **moving down**, once per reading session |
| Skim mode | on when scroll speed > 1.5 viewport heights per second; off after 400 ms below that |
| In skim mode | crossed cues are skipped (never played later); music continues |
| Voice channel | one voice at a time. Cues queue in `order`, at most 3; beyond that the oldest is dropped. When full, the current clip fades out over 150 ms. |
| Scrolling up | nothing replays |
| Music | the region at the read line chooses `music/<mood>/1.mp3`, looped; crossfade 1200 ms on a mood change |
| Ducking | music at 35% while a voice plays, with a 200 ms ramp |
| SFX | one-shot on crossing; at most 2 at once |
| Audio unlock | a full-width "Tap to read with Mumu 🐾" button the first time the reader opens in a session |
| Toggles | master / voices / music / SFX, each with on/off and volume, saved in settings |
| Mumu bridge | call `setMood` on each region change, `notifyActivity` on scroll and tap, and `setScreen('reader')` on enter |
- The scheduler is a pure module with unit tests: crossing, skim, queue overflow, region change.
- ✅ Tests pass. With the sample fixture, a slow scroll plays every cue in order, and a fast flick skips without leaving a backlog.

## F5 Home (Search tab)
- **Top ~45%: bookshelf.** Wooden pixel planks; series appear as books (pixelated covers, see DESIGN). Scrolls horizontally. Plank elements carry `data-mumu-ledge`.
- **Bottom ~55%: coffee desk.** A swipeable carousel of preview cards, one per series: big pixelated cover, title, "Ch. N · 12 min left", audio-ready badge, and a **Read** button. Tapping a book on the shelf scrolls the carousel to it. The desk top carries `data-mumu-floor`.
- **Search field** at the top filters the shelf and the desk by title as you type.
- Empty state: Mumu sits on the empty desk and the speech bubble says "Add your first story!"
- ✅ Swiping the desk and tapping books stay in sync, search filters live, and the layout works at 390 px and 1280 px.

## F6 Voices tab
- **Voice profiles:** 30 premade profiles (3 per slot) grouped by slot. Each has a voice (dropdown of provider voices from DECISIONS), style (text), speed (0.8–1.2), pitch (slider, −6..+6 semitones, step 1, next to speed), and **Preview**, which calls `POST /preview` with a fixed sample line and uses the current speed and pitch. Edits save immediately. Speed and pitch changes re-encode only (CONTRACT §9). `narrator_1` is shown as "Mumu".
- **Cast:** a series picker, then each character's name, description, profile dropdown, and a Preview that plays their first stored line.
- **Re-voice chapter** re-runs F2 for the selected chapter.
- ✅ Retune a profile → preview sounds different → re-voice → that profile's characters change and nobody else does. Chapter 2 reuses existing profiles.

## F7 Profile tab
- Avatar: upload an image (stored as a blob and shown pixelated) or the default Mumu face. Editable name.
- **Reading time:** today and all-time, from `readingLog`.
- **Reading limit:** minutes (0 = off) and snooze minutes.
- Settings: theme (day / night / system), audio defaults, Mumu visible, Mumu sounds, debug overlay, storage used, "Clear all data" with confirmation.
- ✅ Every setting persists across reloads, and the limit takes effect without restarting.

## F8 Mumu, the digital sidekick
Mumu is rendered at an **integer scale** of the sprite (×3 at ≥ 768 px wide, ×2 below) with `image-rendering: pixelated`. Left/right versions are made by **mirroring**. Swinging is a CSS rotation of the `held` frames, not separate art.

| Behaviour | Trigger | What happens |
|---|---|---|
| Idle life (Home) | every 4–10 s while idle | Choose by weight: walk along the floor 30%, sit 20%, loaf 20%, tail wag 15%, yarn ball 15% (yarn only after 20 s idle) |
| Climb | walking into the screen's left or right edge | Climb up the edge to the nearest ledge, then hang |
| Hang | dropped within 24 px below a ledge, or after a climb | Hang 3–6 s, then drop to the floor |
| Drag (pick up) | press and move > 8 px on Mumu | `held` animation follows the pointer. Rotation = clamp(horizontal velocity × k, −25°, +25°) with a spring back: this is the swing. |
| Drop | release | Falls with gravity to the floor below (desk top, or the screen bottom in the reader). If released just under a ledge: hang. If released against a side edge: climb. |
| Pet | 2+ taps within 1.5 s, or (on desktop) stroking the cursor across Mumu | Tail wag, heart emotes, purr (if Mumu sounds are on) |
| Read time | single tap | Speech bubble "You've read 23 min today!" plus `mrrp` |
| Scene reactions (Reader) | `setMood` changes (debounced 4 s) | calm → loaf · tense → sit + ❗ · mystery → sit + ❓ · battle → fast tail wag + ❗ · climax → tail wag + ✨ · romance → sit + 💗 · sad → loaf + 💧 · comedic → yarn |
| Other tabs (Add, Voices, Profile) | screen is `other` | Floor = just above the bottom nav (`data-mumu-avoid`). Calmer idle life: walk, sit and loaf only. Mumu joins you everywhere. |
| Reader parking | in the reader | Sits small in a corner (default bottom-right, outside the pages' bubbles). Drag to another corner and it remembers. No wandering. |
| Recap | `showRecap` when opening chapter N > 1 | Mumu's bubble shows "Previously…" and plays the recap (Mumu's voice). Dismissible. |
| Long-reading alarm | continuous reading session ≥ `limitMinutes` | Mumu walks to bottom-centre and meows every 2.5 s (rotating meow1–3) with the bubble "Mrrow! Break time? (45 min)" and buttons **Take a break** (→ `onBreakRequested`, home, session reset) and **Snooze N min**. With master audio or Mumu sounds off: bubbles only. |
| Hidden | Mumu visible = off | Nothing rendered; the timer still runs |
| Reduced motion | `prefers-reduced-motion` | No wandering or climbing; sit/loaf only; drag still works |

- **Reading timer:** counts while the reader is open, the page is visible, and there's been activity in the last 120 s. Writes to `readingLog` every 15 s. The continuous session resets after 5 min outside the reader.
- The behaviour engine is a **pure state machine** (state + inputs + dt → state + effects) with unit tests: idle choice, drop → hang/climb/floor, alarm start/snooze/break, mood debounce.
- ✅ Every row in the table can be shown on the device. Engine tests pass. Mumu never blocks scrolling: only its own element takes pointer events, with `touch-action: none` on it.

## F9 Offline / PWA
- Installable (manifest, icons 192/512/maskable with Mumu's face). The service worker precaches the app shell, fonts, all music, SFX, Mumu sprites and sounds. Precache limit is 5 MB per file; music tracks ≤ 2 min, mono 96 kbps.
- Request persistent storage on the first import.
- ✅ Production preview: process a chapter, then airplane mode → reload → read with audio and Mumu.

## Non-goals
Accounts, social features, scraping, Mihon extensions, overlay mode, generated music, right-to-left manga, a second TTS provider, a chat assistant.

## Stretch (only after I2 passes)
- **S1:** Tap a bubble to replay it; long-press to reassign the speaker (then re-voice).
- **S2:** "New face!" Mumu bubble when a character speaks for the first time.
- **S3:** Credits plus a Stripe test checkout.
