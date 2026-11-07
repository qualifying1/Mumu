# FallHacks 2026: Voiced Manhwa Reader (Implementation Plan)

> **Pitch:** Import a manhwa chapter, and AI reads it with you. Every character gets their own consistent voice, fights get battle music, sad scenes get strings. Once a chapter is processed, everything works offline.
>
> This is a planning doc with no code. Every decision below has already been made so tomorrow is only building.
> Research date: Nov 7, 2026. Re-check anything marked ⚠️ tonight.


> **Update (event day):** the theme is *digital sidekick*. The app is now pixel art, with **Mumu**, an orange cat sidekick, a bookshelf + coffee-desk home screen, and Search / Add / Voices / Profile tabs. Where this background doc disagrees, **SPEC.md, CONTRACT.md, DESIGN.md, ASSETS.md and TASKS.md win.** In particular, §8 (screens) and the "Cast Studio" are replaced by DESIGN.md and the Voices tab.

---

## 0. Decisions at a glance

| Area | Decision | Why |
|---|---|---|
| Platform | **Installable PWA** (React + TypeScript + Vite) | Works on phone and laptop, installs from a link, works offline, and you can share it via GitHub or a URL with no app store. Easiest to demo on a projector. |
| Backend | **One small Node + TypeScript server** that processes chapters. It is **stateless.** | It keeps your API keys secret, which you can't do in a browser. It runs the slow AI pipeline. It stores no user data. |
| Source of truth | **The client's IndexedDB** owns the library, chapters, cast, and audio | That's what makes offline work. The server takes in pages plus the current cast and returns the audio package plus the updated cast. |
| Content ingest | **Import CBZ / ZIP / image files.** Mihon can export chapters as CBZ. | This is your "connect to Mihon" story, without scraping or extension work. It's also legally neutral (see §2). |
| Vision / understanding | **Gemini Flash** with structured JSON output. Two passes: a parallel per-segment vision pass, then one whole-chapter reasoning pass. | It does OCR, speaker attribution, emotion, and scene mood in one model, so you don't need a separate NLP library. It's also your strongest case for the MLH Gemini prize. |
| Voices (TTS) | **Gemini TTS** is the default. **Decision gate tonight** (§11, Gate A) can switch you to ElevenLabs. | It has a free tier, you control delivery with style prompts ("shouting", "whispering"), and it's the same SDK and key. Only one provider ships. |
| Music | **A curated, mood-tagged track library** that ships with the app. Gemini picks a mood tag; the tag maps to a track. | You don't generate music, so there's no extra cost or latency, and you get predictable quality. |
| SFX | **A curated SFX library** keyed by tag (e.g. "BOOM" → explosion) | Same reasons. |
| Audio engine | **Howler.js**, triggered by scroll position (IntersectionObserver plus a scroll-velocity check) | Handles fades, ducking, and many sounds at once. |
| Offline | **vite-plugin-pwa** (service worker) plus **Dexie** (IndexedDB) | Standard, well documented, quick to set up. |
| Credits / payments | **Covered in the pitch.** Stripe test mode is **Stretch S3**. | Payments plus auth would eat half the day for no demo value. |
| Hosting | Frontend on **Vercel**. Backend on **Render**. The **demo video** is your primary deliverable. | Devpost accepts "demo link *or* video". |

---

## 1. Answers to the questions in your notes

**App or web app?** Build a **PWA**. A native app (Kotlin like Mihon, or React Native/Expo) costs you time on build tooling, APK signing, and device-specific file and audio APIs. A PWA:
- installs to the home screen on Android, iOS, and desktop from a URL
- works offline once the service worker and IndexedDB are populated
- can be cloned from GitHub and run with one command

If you want a real APK after the hackathon, wrap the same PWA with **Capacitor**. You don't need to rewrite anything.

**"Download to app OR an overlay?"** Make it **in-app.** An overlay on top of Mihon would need native Android screen-capture or accessibility-service permissions. That's not feasible in a day, and judges can't easily try it.

**ElevenLabs vs Character.AI?** As far as I know, Character.AI has no public developer TTS API that fits this. Compare **Gemini TTS** with **ElevenLabs** instead (Gate A in §11).

**NLP?** You don't need a separate NLP library. Gemini handles text extraction, speaker attribution, emotion, and scene classification.

**Where do I find free music, SFX, and assets?** See §10.

**Using Mihon and Keiyoushi?** Use Mihon as an **architecture reference only**: library → downloader → reader, plus a "source" concept. Keiyoushi extensions are Kotlin Android APKs that plug into Mihon's own source API, so a web app can't load them, and re-implementing that loader isn't a one-day job. The practical bridge is that **Mihon saves downloaded chapters as CBZ** (Settings → Downloads → "Save as CBZ archive", which is usually on by default). Your app imports those files.

---

## 2. Legal / IP reality check (read before you pitch)

Judges *will* ask "isn't this piracy?" Have the answer ready.

- **MangaFire** is an unlicensed aggregator. Don't build on it, show it, or name it in the demo or README.
- **MangaDex's Acceptable Use Policy** requires you to credit MangaDex and the scanlation groups. It also **forbids running ads or paid services** in apps that use its API. A credit system on top of MangaDex breaks that, so **MangaDex is out for the paid product**. At most it's a later non-commercial "personal mode".
- **Your positioning:** *"We sell AI audio processing for comics you bring. We don't sell comics."* This is the same neutrality Mihon and CBZ readers have. The bigger long-term business is **B2B**: creators and platforms publish an official "audio cast" for their series (see §14).
- **Demo content:** use something you're allowed to show publicly.
  - Best: **Pepper&Carrot** by David Revoy, a high-quality webcomic under **CC BY 4.0** (attribution required). ⚠️ Confirm the license on the site tonight.
  - Or a short comic you or a friend drew.
  - It's fine to test privately on a real manhwa, but keep it out of the video and the public repo.
- **ElevenLabs free tier** requires attribution and has no commercial license. Fine for a demo; mention it if asked.
- **Gemini free tier:** Google may use free-tier requests to improve its products. Fine for demo content. Don't send anything private.

---

## 3. Scope

### MVP (this is what you demo; cut anything else first)
1. **Import** a CBZ, ZIP, or set of images. A series and chapter appear in the library and are stored offline.
2. **Process** the chapter. A progress screen walks through *Analyzing → Casting → Voicing → Packaging*.
3. **Reader:** vertical continuous scroll.
   - Dialogue plays as each bubble crosses the read line.
   - Music crossfades between scene regions.
   - SFX fire on onomatopoeia.
   - There's a master audio toggle plus per-layer toggles (voices / music / SFX).
4. **Cast panel:** characters are auto-detected and each one gets a voice. You can change a character's voice, style, and speed. The cast is **saved per series and reused for the next chapter.**
5. **Offline:** the processed chapter plays in airplane mode. *Do this live in the demo.*
6. **Light and dark mode.**

### Stretch (in priority order)
- **S1:** A cat mascot that reacts to the scene mood with 5 static expressions (calm, hype, sweaty-fight, hearts-romance, crying). Cheap to build, and judges for Best Design will love it.
- **S2:** Tap a bubble to replay it, and long-press a bubble to fix its speaker. Fixing the speaker regenerates only that line.
- **S3:** A credit counter plus Stripe Checkout in **test mode** (test card `4242 4242 4242 4242`) with a webhook that adds credits.
- **S4:** Share "cast packs" (voice settings plus cue track, no images) between users. This needs a hosted database such as Supabase.
- **S5:** Voice design from a character description, if your Gemini TTS model supports it on your key. ⚠️ Check tonight.

### Explicitly cut
Accounts/auth (unless S3 or S4), social feed, overlay mode, Mihon extension support, scraping, generated music, and manga (right-to-left) reading order. **MVP is manhwa top-to-bottom only.**

---

## 4. Architecture

```
┌──────────────────────── CLIENT (PWA, offline-capable) ────────────────────────┐
│  Library ─ Import(CBZ) ─ Reader ─ Cast Studio ─ Profile/Settings              │
│        │                    │                                                 │
│        ▼                    ▼                                                 │
│  IndexedDB (Dexie): series, chapters, page blobs, cast, cues, audio blobs     │
│  Service worker: caches app shell + bundled music/SFX                         │
└────────────┬──────────────────────────────────────────────────▲───────────────┘
             │ upload downscaled pages + current cast           │ package (cues + audio + cast updates)
             ▼                                                  │
┌──────────────────────── PROCESSING SERVER (stateless) ─────────┴──────────────┐
│  POST job → slice → vision pass (parallel) → merge → reasoning pass           │
│           → cast new characters → TTS per line → encode → package             │
│  Job progress kept in memory only; nothing persisted                          │
└────────────┬──────────────────────────────────────────────────────────────────┘
             ▼
     Gemini API (vision + text + TTS)   [ElevenLabs only if Gate A says so]
```

| Component | Owns | Does NOT own |
|---|---|---|
| Client | All persistent data, playback, UI, the offline experience | API keys, AI calls |
| Server | API keys, the processing pipeline, temporary job progress | Any long-lived data |
| Bundled assets | Music and SFX libraries (mood tag / SFX tag → file) | — |

**Upload the analysis copy, not the originals.** The client downscales pages (e.g. to 800 px wide) before uploading. Originals stay local. This makes uploads faster and Gemini cheaper. All coordinates are normalized, so resolution doesn't matter (§7).

---

## 5. Processing pipeline (the core of the project)

| # | Step | Where | Notes |
|---|---|---|---|
| 0 | **Import** | Client | Unzip the CBZ. Sort filenames *naturally* (so `2` comes before `10`). Read each image's dimensions. Build the chapter's page list. |
| 1 | **Segment** | Server | Manhwa pages are very tall strips. Slice them into segments about 1.5–2× as tall as they are wide, with **10–15% overlap** so no bubble is cut in half. Record each segment's offset. |
| 2 | **Vision pass** (parallel) | Server → Gemini Flash | For each segment, get structured JSON listing every text element (kind, text, box, emotion, delivery, speaker hint), plus the segment's mood and intensity. Field details are below the table. |
| 3 | **Merge + dedupe** | Server | Convert boxes to chapter coordinates. Drop duplicates from overlap zones (same text with overlapping boxes). Order everything by reading order. |
| 4 | **Reasoning pass** (1 call) | Server → Gemini Flash (text only) | Input: the whole chapter transcript plus the **existing cast** (names and descriptions). Output: a speaker for every line (an existing cast ID, or a new character), **music regions** (start/end, mood tag, intensity), and climax markers. |
| 5 | **Cast new characters** | Server | For new characters only. The reasoning pass assigns a **voice slot** (e.g. `male_deep`). Code then picks the first unused roster voice for that slot; no LLM call is involved (CONTRACT §3). Existing characters keep their voice. *This is what makes chapter 2 sound like chapter 1.* |
| 6 | **TTS** | Server → Gemini TTS | One request per line: the character's voice plus a style prompt built from emotion and delivery. Limit concurrency to stay under rate limits, and back off on HTTP 429. Gemini TTS returns **raw 24 kHz 16-bit mono PCM**, so encode it to **MP3 (mono, ~64–96 kbps)**. MP3 plays everywhere, including Safari. |
| 7 | **SFX mapping** | Server | Map SFX text to a fixed tag list, then to bundled files. No API call. |
| 8 | **Package** | Server → Client | One JSON `ChapterPackage` (cues, regions, new characters, base64 MP3 audio; see CONTRACT §5). The client stores it in IndexedDB in one transaction. |

**Vision pass fields (step 2).** For each text element:
- **kind:** speech, thought, narration, or sfx
- **text**
- **bounding box**
- **emotion** and **delivery:** normal, shout, or whisper
- **speaker hint:** a visual description of who is speaking, and which visible character the bubble's tail points to

For the whole segment: **mood** and **intensity**.

**Progress reporting:** the client polls the job's status (stage name plus %). Server-sent events are nicer but polling is enough.

### Prompting rules (write these into your AI Studio prompt tonight)
- Give the model the **existing cast list with visual descriptions** so it reuses identities instead of inventing new ones.
- Make it return **null** rather than guess when the speaker is unclear. You'll fall back to a narrator voice or the "unknown" voice.
- Tell it the reading order: manhwa reads top to bottom, and left to right within a row.
- Constrain moods, emotions, delivery, and SFX tags to **fixed enums**, and use **low temperature**.
- Use a **response schema** (structured output) and validate every response on the server with **zod**. Treat model output as untrusted input.
- ⚠️ Check Gemini's bounding-box convention in the docs: historically `[ymin, xmin, ymax, xmax]` normalized to 0–1000.

### Mood taxonomy (fixed; one or two tracks each)
| Tag | Use for | Source suggestion |
|---|---|---|
| `calm` | Dialogue, everyday scenes | Pixabay "lofi / ambient" |
| `tense` | Build-up, confrontation | Pixabay "suspense" |
| `battle` | Fight scenes | OpenGameArt / Pixabay "epic battle" |
| `climax` | Peak moment / power-up | Incompetech "epic" (CC BY) |
| `romance` | Romance (romance is the largest webtoon genre) | Pixabay "romantic piano" |
| `sad` | Loss, flashback | Pixabay "sad strings" |
| `comedic` | Gags | Pixabay "funny / quirky" |
| `mystery` | Horror, mystery | Pixabay "dark ambient" |

### SFX tags (start with ~10)
`punch`, `sword_clash`, `explosion`, `whoosh`, `footsteps`, `door`, `heartbeat`, `gasp`, `crowd`, `magic`

---

## 6. Reader audio engine (behaviour spec)

- **Read line:** an invisible horizontal line at about 60% of the viewport height. A dialogue or SFX cue fires when its anchor crosses the line while you scroll **down**.
- **Cue lifecycle:** pending → played *or* skipped. Never replay automatically. Scrolling back up doesn't retrigger anything; tap a bubble to replay it (S2).
- **Fast scrolling (from your notes):** track scroll velocity. Above a threshold, the reader is skimming, so **skip dialogue and SFX and let music continue.** When you slow down, cues resume from where you are. **Never build a backlog** of queued lines.
- **One voice channel:** if a new line fires while one is still playing, finish the current line if it's nearly done; otherwise fade it out quickly. Queue at most one line.
- **Music:** one active region track. **Crossfade 1–2 s** when the region changes. **Duck music** (lower it by about 40–60%) while a voice plays.
- **Toggles:** master on/off, plus voices / music / SFX and their volumes. Save them in settings.
- **Autoplay gotcha:** browsers (iOS especially) block audio until the user taps. Start each chapter with a **"Tap to read with audio"** button. On iPhone the silent switch can also mute web audio, so mention it in the UI.
- **Resume:** save the scroll position per chapter.

---

## 7. Data model (client-side, IndexedDB)

| Store | Key fields |
|---|---|
| **series** | id, title, cover blob, created at, source label (e.g. "Imported CBZ") |
| **characters** (the cast) | id, series id, display name, visual description, voice id, default style, speed, first seen chapter |
| **chapters** | id, series id, number, title, page count, processing status (imported / processing / ready / failed), last read position |
| **pages** | id, chapter id, index, image blob, width, height |
| **cues** | id, chapter id, type (dialogue / narration / sfx), page index, **y as a fraction of page height**, box, text, character id, emotion, audio blob id (dialogue) or SFX tag |
| **regions** | id, chapter id, start (page index + fraction), end, mood tag, intensity |
| **audio** | id, blob (MP3), duration |
| **settings** | theme, audio toggles and volumes, profile name, avatar, credits (if S3) |

**Coordinates rule:** always store positions as *page index plus a 0–1 fraction*, never as pixels. Convert to pixels at render time, so cues line up at any screen width.

**Storage note:** a chapter is roughly 10–30 MB of images plus 2–5 MB of audio. Ask the browser for **persistent storage** so it doesn't evict the library. Safari can clear data for PWAs it considers unused.

---

## 8. Screens (from your sketch)

How I read your sketch:
- **Screen 1 (Library/Home):**
  - A horizontal shelf of covers at the top. The arrows suggest you swipe the shelf and tapping a cover opens it in the big centre card.
  - The green marks could mean "audio ready"; using them as a badge would be a nice touch.
  - The moon on the left is the dark-mode toggle, the small box on the right is probably a side panel, and the cat in the bottom right is the mascot.
  - Bottom nav: ✏️ edit, ➕ add (emphasised), 🔍 search, 👤 profile.
- **Screen 2 (Profile):** avatar (the cat), name "Alex", ⚙️ settings in the top right, and a **different** bottom nav.

**Fix:** use **one consistent bottom nav** on every screen.

| Tab | Screen | Contents |
|---|---|---|
| 📚 Library | Home | Cover shelf, centre "Continue reading" card, audio-ready badges |
| ➕ Import | Import + processing | File picker, then a processing progress screen with stage names (great demo moment) |
| 🎭 Cast | Cast Studio (your ✏️) | Per-series character cards: auto-cropped face (stretch), voice dropdown, "preview voice" button, style, speed |
| 👤 Profile | Profile | Avatar, name, credits, ⚙️ settings (theme, audio defaults, storage used, clear data) |

**Reader** is full-screen, outside the nav. It has a floating mini audio bar (master toggle, layer toggles, current mood chip) that auto-hides while you scroll. The mascot can sit in the corner here (S1).

Make a quick mockup of these 5 screens in Figma or Excalidraw tonight. Design work is usually allowed before a hackathon; code isn't.

---

## 9. Tech stack and where to get it

### Client
| Need | Pick | Where |
|---|---|---|
| Build tool / framework | Vite + React + TypeScript | vite.dev |
| Styling | Tailwind CSS (class-based dark mode) | tailwindcss.com |
| Components (optional) | shadcn/ui | ui.shadcn.com |
| Icons | Lucide | lucide.dev |
| Routing | React Router | reactrouter.com |
| Local DB | Dexie + its React live-query hooks | dexie.org |
| PWA / offline | vite-plugin-pwa (Workbox) | vite-pwa-org.netlify.app |
| Audio | Howler.js | howlerjs.com |
| Unzip CBZ | JSZip | stuk.github.io/jszip |

Don't add a separate state library. Dexie live queries are your single source of truth.

### Server
| Need | Pick |
|---|---|
| Runtime | Node 22 LTS + TypeScript (run with `tsx` in dev) |
| HTTP | Express (plus CORS for your frontend origin, and multipart uploads via multer) |
| Gemini | Official `@google/genai` SDK |
| Image slicing | sharp |
| Audio encoding | ffmpeg via `ffmpeg-static`, so no system install is needed on the host |
| Concurrency limit | p-limit |
| Output validation | zod |
| (Gate A alt) | ElevenLabs JS SDK |
| (S3) | Stripe Node SDK + Stripe CLI for local webhooks |

### Hosting
- **Frontend:** Vercel (connect your GitHub repo and it auto-deploys). GitHub Pages also works.
- **Backend:** Render web service. Free instances **sleep when idle**, so wake it 5 minutes before the demo. Long jobs are fine there; on Vercel's serverless functions they'd time out.
- Keep the **demo video** as the deliverable that can't fail.

---

## 10. Asset and audio sources

Keep a **`CREDITS.md`** listing every asset, its source, and its license.

**Music**
- **Pixabay Music** (pixabay.com/music): free to use, including commercially, with no attribution required. This should be your main source.
- **Incompetech** (Kevin MacLeod): hundreds of tracks under **CC BY 4.0**. Attribution required. Great epic and battle cues.
- **Free Music Archive**: license varies per track, so check each one.
- **YouTube Audio Library** (in YouTube Studio): downloadable. Check per track whether attribution is required.
- **OpenGameArt.org**: game loops that suit battle and climax. License varies per asset; prefer CC0.

**Sound effects**
- **Pixabay sound effects**: same Pixabay license.
- **Kenney.nl audio packs**: CC0.
- **Freesound.org**: filter by **CC0**.
- **Sonniss GDC bundles**: large royalty-free SFX dumps.
- **Mixkit**: free, but some items carry restricted licenses, so check each one.

**Visual / UI**
- Icons: **Lucide** or **Phosphor**
- Fonts: **Google Fonts** (one display font for headings and one readable sans for UI)
- Illustrations: **unDraw**. UI kits: **Kenney UI**.
- Avatars: **DiceBear**. Check the license of the specific style you use.
- Animations: **LottieFiles**. Check each license.
- Palettes and backgrounds: **Realtime Colors** to test light and dark palettes together, and **Haikei** for SVG blobs and waves.
- **Mascot:** draw your own cat with 5 expressions. It's original, it's on-brand, and it's already in your sketch.
- **PWA icons:** you need 192 px and 512 px app icons, plus a maskable version.

---

## 11. Tonight's prep checklist

### Rules first
- [ ] Read the FallHacks rules on **pre-written code**. Most MLH events allow planning, designs, assets, and accounts, but **not** code written beforehand. Everything below stays within that.
- [ ] Check Discord for **sponsor credits** (MLH often hands out Gemini/Google Cloud credits, and sometimes ElevenLabs codes). They could change Gate A.

### Accounts and keys (keep them in a password manager; never commit them)
- [ ] **Google AI Studio:** create an API key.
- [ ] **AI Studio → rate limits:** write down the free-tier RPM and RPD for your vision model and your TTS model. ⚠️ Google's public rate-limit page now sends you to AI Studio for your actual numbers.
- [ ] **ElevenLabs** account (only needed if Gate A picks it). The free tier is 10,000 credits a month.
- [ ] **GitHub:** create the repo with a README and a license only (MIT or Apache-2.0).
- [ ] **Vercel** and **Render** accounts, linked to GitHub.
- [ ] **Stripe** account in test mode (only if you might do S3).
- [ ] **Devpost** and **MLH** accounts, logged in and joined to the event.

### Decision gates
- [ ] **Gate A: TTS provider.** Estimate demand: ~60 lines per chapter × 2 demo chapters × ~3 reprocesses ≈ **360 TTS requests**.
  - If Gemini TTS's free-tier RPD covers that comfortably, **use Gemini TTS**.
  - If it doesn't, either **enable billing on Gemini** (Tier 1; a few chapters will cost very little) or use **ElevenLabs**. ElevenLabs free gives roughly 3–6 chapters a month, depending on the model's credits per character.
  - Pick one. Don't build both.
- [ ] **Gate B: vision model.** In AI Studio, run your prompt on 3 tricky segments: a 2-person argument, a crowd scene, and narration plus SFX. Compare the current Flash model (`gemini-3.5-flash`) with Flash-Lite (`gemini-3.1-flash-lite`) on **speaker accuracy** and latency. Pick one.
  - ⚠️ The model list changes often. Use whatever AI Studio shows as current Flash.
- [ ] **Gate C: hosting.** Decide whether you demo on hosted Render or run locally and rely on the video. Both are fine. Pick one and stick with it.

### Prompt prep (it's plain text, not code)
- [ ] Draft the **vision prompt** and **reasoning prompt** in AI Studio with structured output turned on. Paste the final versions into `docs/prompts.md`, or straight into this file.

### Voice roster
Fill in the roster table in `docs/DECISIONS.md` (10 voice slots × 2 voices) after auditioning voices in AI Studio.

### Content
- [ ] **Two consecutive chapters of the same comic** (e.g. Pepper&Carrot episodes), saved as CBZ or image folders. Chapter 2 is how you show **voice consistency.** Pick at least one with a fight or climax.
- [ ] Download music: **1–2 tracks per mood tag** (8 tags) and trim them to loop cleanly. Audacity is free.
- [ ] Download **~10 SFX** matching the SFX tags.
- [ ] Fill in `CREDITS.md`.

### Design
- [ ] Mock up 5 screens: Library, Import/Processing, Reader, Cast Studio, Profile.
- [ ] Choose a palette that works in light and dark (test it in Realtime Colors) and two fonts.
- [ ] Draw the mascot's 5 expressions and the app icon.
- [ ] Pick a name. Ideas: *Echotoon, Panelsound, Inkvoice, Dubtoon, Scrollscore*. Search each quickly for conflicts.

### Machine setup
- [ ] Node 22 LTS, Git, and VS Code (ESLint, Prettier, and Tailwind IntelliSense extensions)
- [ ] Audacity, for trimming loops
- [ ] Stripe CLI (only for S3)
- [ ] A phone on the same Wi-Fi to test the PWA install, plus an airplane-mode test plan
- [ ] Charger, headphones, and a **small speaker** for the judging table

### Pitch prep
- [ ] Draft the Devpost text: name, one-liner, description, "built with", and **tick the MLH Gemini track**.
- [ ] Storyboard the 2-minute video (§13).

---

## 12. Hackathon day schedule

**Superseded.** The run sheet, checkpoints, cut ladder and failure playbook are in `docs/EVENT_PLAN.md`. The milestone board is `docs/TASKS.md`, and how to run the parallel Claude Code sessions is in `docs/WORKFLOW.md`.

---

## 13. Demo script (2-minute video and live demo)

1. **Hook (10 s):** a silent manhwa scroll, then *"Manhwa are made for phones, but they're silent."* Cut to the same scroll with voices and battle music.
2. **Import (15 s):** pick a CBZ (*"exported from any reader, Mihon included"*). The processing screen shows each stage, with *"Gemini is reading the panels…"* on screen.
3. **Read (40 s):** scroll. Distinct voices play, the music shifts calm → tense → battle, and an SFX hits on "BOOM". Then **scroll fast** to show it skips gracefully.
4. **Cast Studio (20 s):** show the auto-detected characters, swap a voice, preview it.
5. **Consistency (15 s):** open chapter 2. The same characters have the same voices automatically.
6. **Offline (10 s):** turn on airplane mode and keep reading with audio.
7. **Close (10 s):** dark mode toggle, the mascot reacting, and the one-line business model.

---

## 14. Pitch material

### Problem and who it's for
- **Readers:** webtoons and manhwa are read on phones in short sessions (commutes, bed). Audio adds immersion without slowing you down.
- **Accessibility:** low-vision and dyslexic readers. This is a strong angle with judges and a real use case.
- **Language learners:** hear the lines while reading them.
- **Offline:** subways, flights, rural areas.

### Market numbers (cite them; don't overclaim)
- **WEBTOON Entertainment:** 156.9M global MAU and 7.5M monthly paying users in Q2 2026. That's one platform.
- **Paying users and spend:** in the rest of the world, about **1.7%** of users pay (paying ratio), and they spend **~$6.80** each (ARPPU). In Japan, ARPPU is about **$22.5**. So readers already pay for premium comic experiences.
- **Genre:** romance holds about **39.4%** of the webtoon market (Persistence, 2025). That's why `romance` is one of your mood tags.
- **Market size estimates vary a lot by firm.** For 2025 they range from about **$3.9B** (LP Information) to **$10.85B** (Persistence) and **$11.7B** (TechSci). IMARC put 2024 at **$9.17B**.
  - Quote one figure, name its source, and be ready to say "estimates vary". Judges respect that more than one big number.

### Business model
- **Credits = processing.** 1 credit = 1 chapter voiced. Credits pay for AI compute, not content.
  - New users get 3 free chapters.
  - Credit packs are available.
  - **Premium** is a monthly subscription for X chapters plus premium voices.
- **Unit economics (rough; state the assumptions):**
  - A chapter has about 60 lines × 8 words ≈ 480 words, which is about **3 minutes of speech**.
  - ElevenLabs Starter is about **$0.20 per minute** ($6 for 30k credits ≈ 30 min). That's about **$0.60 per chapter** on ElevenLabs.
  - Gemini vision calls cost fractions of a cent.
  - So a $0.99-per-chapter credit, or a subscription priced to match, has healthy margin. Gemini TTS at paid rates likely lowers costs further. ⚠️ Check current Gemini TTS pricing before you quote it.
- **B2B (the real upside):** creators and platforms publish an **official audio cast** (curated voices plus a cue track) for their series, and you take a revenue share. This also answers the piracy question.

### Business terms to use correctly
- **TAM / SAM / SOM:** total market (webtoons overall) / the part you can serve (English-speaking mobile readers who read offline or in third-party readers) / what you can realistically capture early.
- **MAU:** monthly active users.
- **Paying ratio:** the share of MAU who pay.
- **ARPU / ARPPU:** average revenue per user / per *paying* user. I think this is the "PAP" in your notes.
- **CAC / LTV:** cost to acquire a user / lifetime value per user. You want LTV well above CAC.
- **Gross margin:** price minus AI cost per chapter.

### Judge Q&A prep
- *"Is this piracy?"* "We process files the user brings, the same as any CBZ reader. The long-term model is official audio casts licensed by creators."
- *"How accurate is speaker detection?"* "Gemini gets most lines right. For the rest you can fix a line with one tap, and only that line is regenerated. The cast memory means accuracy improves as you read more chapters."
- *"Why not generate music?"* "It's cost and latency. Curated mood tracks sound better and cost nothing per chapter. Generated music is on the roadmap."
- *"Latency?"* "Processing happens once, at download time. After that, reading has no latency and works offline."

---

## 15. Prize track fit

| Track | Fit | What to emphasise |
|---|---|---|
| **MLH Best Use of Gemini API** | ⭐ Strong | Gemini does vision, OCR, speaker attribution, emotion, scene moods, *and* voices. Show the structured output on screen. |
| **Best Design / UI / UX** | ⭐ Strong | Mascot, dark mode, the processing screen, the cast cards |
| **Best Overall** | Good | The live offline demo and the consistency moment |
| **Best Use of Theme** | Depends on the theme | Decide at the opening ceremony |
| **SURGE (day-to-day inconvenience)** | Medium | "Silent comics on the commute" and accessibility |
| **Best Solo / Beginner** | If eligible | Tick it on Devpost if it applies |

Tick every eligible sponsor track **on Devpost**, or you won't be judged for it.

---

## 16. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Gemini free-tier rate limits hit mid-day | Gate A tonight, a concurrency limit with backoff, and pre-processing the demo chapters by 4:45 PM |
| Wrong speaker attribution | Cast context in the prompt, null instead of guessing, the narrator fallback, and S2 manual fix |
| Bubbles cut in half by slicing | 10–15% overlap plus dedupe |
| Audio won't play on phone | The "Tap to read with audio" unlock button, plus testing on your actual phone by 13:00 |
| Backend asleep or down during judging | Wake it early. The demo chapters are already processed offline anyway. |
| Out of time | Feature freeze at 16:45, cut from the bottom of the MVP list, and record the video no matter what |
| Upload too large | The client downscales before upload |

---

## 17. Repo layout

npm workspaces: `client/` (PWA), `server/` (pipeline + jobs API), `shared/` (contract types + zod schemas, the single source of truth for both), and `fixtures/` (demo chapters + the sample package). Data shapes are in `docs/CONTRACT.md`. Agent, skill and rule files are in `.claude/` (see `docs/WORKFLOW.md`).

---

## 18. Sources

- Gemini API pricing (models with a free tier, TTS models): https://ai.google.dev/gemini-api/docs/pricing
- Gemini API rate limits (actual numbers are shown in AI Studio): https://ai.google.dev/gemini-api/docs/rate-limits
- Gemini speech generation (TTS): https://ai.google.dev/gemini-api/docs/speech-generation
- Gemini free-tier data use note: https://benchlm.ai/free-tier/google-ai-studio
- ElevenLabs API pricing: https://elevenlabs.io/pricing/api
- ElevenLabs free tier, no commercial license: https://developer.puter.com/tutorials/elevenlabs-api-pricing/
- ElevenLabs sound effects API: https://elevenlabs.io/docs/overview/capabilities/sound-effects
- MangaDex API acceptable use and limits: https://api.mangadex.org/docs/ and https://api.mangadex.org/docs/2-limitations
- Keiyoushi extensions (for Mihon): https://github.com/keiyoushi/extensions
- Mihon: https://github.com/mihonapp/mihon
- Mihon/Tachiyomi "Save as CBZ archive" setting: https://github.com/jobobby04/TachiyomiSY/issues/1373
- Pixabay license FAQ: https://pixabay.com/service/faq/
- Incompetech / free music overview: https://wondera.ai/tools/en/the-best-license-free-music-for-commercial-use
- WEBTOON Q2 2026 metrics: https://www.nasdaq.com/articles/compared-estimates-webtoon-wbtn-q2-earnings-look-key-metrics
- WEBTOON Q1 2026 call (paying ratio, ARPPU): https://www.barchart.com/story/news/1891802/webtoon-entertainment-q1-earnings-call-highlights
- WEBTOON Japan ARPPU: https://www.animenewsnetwork.com/news/2026-05-19/webtoon-ent-narrows-losses-in-1st-quarter-2026/.237477
- Webtoon market size estimates: https://www.imarcgroup.com/webtoons-market-statistics, https://www.persistencemarketresearch.com/market-research/webtoons-market.asp, https://www.techsciresearch.com/report/webtoons-market/29662.html, https://marketresearch.com/LP-Information-Inc-v4134/Global-Webtoons-Growth-Status-Outlook-39433130
