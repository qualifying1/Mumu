# DESIGN: a cozy pixel-art reading room

The whole app is a pixel-art reading room: a bookshelf on the wall, a coffee desk, and Mumu. **Comic pages are never pixelated**, so the content stays readable. Art sources and specs are in `ASSETS.md`.

Visual target: docs/asset_references/ui_example (layout and mood; use our palette tokens).

## Pixel rules (follow these everywhere)
- **One palette.** Pick it on lospec.com (Palette List); suggestion: a warm 16–32 color palette. All UI colors come from it. Fill in the tokens below.
- **Integer scaling only.** Each sprite is drawn at 2× or 3× with `image-rendering: pixelated`. Never use fractional scales, smoothing, or CSS transitions on size.
- **Pixel borders:** use a 9-slice `border-image` from the UI pack, or the stepped `box-shadow` technique. No `border-radius` on framed UI.
- **Covers become pixel art:** draw each series cover to a small canvas (64 px wide), then display it scaled up with `pixelated`. Any cover then matches the art style.
- **Motion:** sprite frames step (no tweening of sprite art). UI transitions ≤ 150 ms. Respect `prefers-reduced-motion`.

## Tokens (fill in from your palette)
| Token | Day | Night |
|---|---|---|
| wall (background) | | |
| wood-light / wood-dark (shelf, desk) | | |
| paper (panels, bubbles) | | |
| ink (text) | | |
| ink-muted | | |
| accent (primary buttons, audio-ready badge) | | |
| mood chips: calm / tense / battle / climax / romance / sad / comedic / mystery | | |

- **Fonts** (Google Fonts, self-hosted in `client/public/fonts`): **Pixelify Sans** for UI and body (16 px minimum), and **Press Start 2P** for big titles only, used sparingly. Write the final choice in DECISIONS.
- Night theme: same room with the lamp on (darker wall, warm lamp glow on the desk).
- Tap targets ≥ 44 px. Text contrast ≥ 4.5:1 in both themes.

## Bottom nav (every screen except the reader)
A pixel wood/paper bar with 4 icons + labels: **🔍 Search** (Home) · **＋ Add** · **🎙 Voices** · **👤 Profile**. The active tab gets the accent color and a 1 px bounce. The bar carries `data-mumu-avoid`.

## Screens
| Screen | Layout | Key states |
|---|---|---|
| **Search / Home** | Search field (pixel input) at the top. **Bookshelf** (~45%): 1–2 wooden planks, books = pixelated covers standing on the planks, scrolls horizontally, planks are `data-mumu-ledge`. **Coffee desk** (~55%): the desk top edge is `data-mumu-floor`; props (mug, lamp, plant) sit on the desk; a swipeable carousel of preview cards (pixel paper card: big cover, title, progress, audio badge, **Read** button) sits in front of the desk. | Empty: no books; Mumu's bubble says "Add your first story!" Search with no match: Mumu with a ❓ emote. |
| **Add** | Pixel file drop zone → series picker / new name → chapter number → **Process** → progress steps (pixel checkboxes, Mumu-voiced messages, a small Mumu walking along a progress bar) | Error + Retry |
| **Reader** | Full-bleed pages (not pixelated). A floating pixel mini-bar auto-hides on scroll: back, master toggle, layer toggles, mood chip. Mumu sits small in a corner. | First open: "Tap to read with Mumu 🐾" |
| **Voices** | Segmented control: **Profiles \| Cast**. Profiles: grouped by slot, pixel cards with voice dropdown, style, speed slider, pitch slider (−6..+6), ▶ Preview. "Mumu" (narrator_1) pinned at the top with Mumu's face. Cast: series picker → character cards (initial avatar, name, description, profile dropdown, ▶) → **Re-voice chapter**. | No cast: "Process a chapter so Mumu can meet the cast" |
| **Profile** | Avatar frame (uploaded photo shown pixelated, or Mumu's face), name, **reading time today / total**, reading limit + snooze, ⚙ settings list (theme, audio, Mumu visible, Mumu sounds, debug overlay, storage, clear data) | |

## Mumu's voice in copy
Short, playful, cat-flavoured, never cutesy to the point of confusion: "Mumu is reading the panels…", "Casting 4 characters…", "Mrrow! Break time?", "You've read 23 min today!"
