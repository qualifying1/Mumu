| child | Autonoe | 3 | Zephyr | 4 | Puck | 5 || female_elder | Vindemiatrix | -1 | Achernar | -2 | Pulcherrima | -3 || female_cold | Erinome | 0 | Schedar | 0 | Despina | -1 || female_adult | Kore | 0 | Aoede | 0 | Callirrhoe | 0 || female_young | Leda | 0 | Laomedeia | 0 | Zephyr | 0 || male_elder | Gacrux | -1 | Umbriel | -2 | Zubenelgenubi | -3 || male_deep | Algenib | 0 | Alnilam | -2 | Rasalgethi | -3 || male_adult | Orus | 0 | Charon | 0 | Iapetus | 0 || male_young | Puck | 0 | Fenrir | 0 | Sadachbia | 0 || narrator | Achird | 0 | Sulafat | 0 | Sadaltager | 0 |# DECISIONS: fill this in tonight; it's fixed for the event

Claude reads this file. Blanks here become blanks in the build, so fill everything before you sleep.

## Gates (see PLAN.md §11)
| Gate | Decision | Evidence / notes |
|---|---|---|
| A: TTS provider | Gemini TTS| Free-tier limits seen in AI Studio: RPM ___ RPD ___ | gemini-3.5-flash-lite
| B: Vision model | `VISION_MODEL=gemini-3.5-flash-lite` | Speaker accuracy on 3 test slices: _/_ |
| Reasoning model | `REASONING_MODEL=gemini-3.5-flash-lite` (usually the same as vision) | |
| TTS model | `TTS_MODEL=gemini-3.5-flash-lite-tts` | Request format: see PROMPTS.md §3 |
| C: Hosting | Render + Vercel / local + video only | |
| Billing enabled on Gemini? | yes / no | Covers Gate A if the free tier is too small |
| Demo device | phone model / laptop | Pre-process the chapters **on this device** |
| Demo comic | title + license | Chapters in `fixtures/ch1`, `fixtures/ch2` |
| App name | | |
| Theme hook | **Mumu**, a pixel-art orange cat: the reader's digital sidekick | |
| Mumu art path | A (pack + edits) / B (AI) · source: | License: |
| Sprite frame size | 32×32 / other: | Must match `sprites.ts` |
| Palette | lospec name: | |
| Fonts | Pixelify Sans + Press Start 2P / other: | |
| Team | solo / names + lanes | |

**Available voice names** (for the Voices tab dropdown): Zephyr, Puck, Charon, Kore, Fenrir, Leda, Orus, Aoede, Callirrhoe, Autonoe, Enceladus, Iapetus, Umbriel, Algieba, Despina, Erinome, Algenib, Rasalgethi, Laomedeia, Achernar, Alnilam, Schedar, Gacrux, Pulcherrima, Achird, Zubenelgenubi, Vindemiatrix, Sadachbia, Sadaltager, Sulafat (Gemini TTS prebuilt voices; the list lives in shared/src/voices.ts)

## Voice roster = default voice profiles (3 per slot; audition in AI Studio)
These seed the 30 premade profiles (`<slot>_1`, `<slot>_2`, `<slot>_3`). Users retune them in the Voices tab. **`narrator_1` is the narrator voice** (narration, unknown speakers, the recap), not Mumu's: pick something warm and storyteller-like. A character copies its profile's voice, style, speed and pitch once, when it is created (CONTRACT §3). Each profile has its own voice and pitch (semitones, −6..+6, default 0); style and speed are shared by the three profiles of a slot. Profiles 2 and 3 can start as the same voice as profile 1 with a different pitch.
| VoiceSlot | Voice 1 | Pitch 1 | Voice 2 | Pitch 2 | Voice 3 | Pitch 3 | Default style | Speed |
|---|---|---|---|---|---|---|---|---|
| narrator | Achird | 0 | Sulafat | 0 | Sadaltager | 0 | calm, cinematic | 1.0 |
| male_young | Puck | 0 | Fenrir | 0 | Sadachbia | 0 | energetic, confident | 1.05 |
| male_adult | Orus | 0 | Charon | 0 | Iapetus | 0 | steady, warm | 1.0 |
| male_deep | Algenib | 0 | Alnilam | -2 | Rasalgethi | -3 | low, menacing | 0.95 |
| male_elder | Gacrux | -1 | Umbriel | -2 | Zubenelgenubi | -3 | wise, slow | 0.9 |
| female_young | Leda | 0 | Laomedeia | 0 | Zephyr | 0 | bright, lively | 1.05 |
| female_adult | Kore | 0 | Aoede | 0 | Callirrhoe | 0 | composed, warm | 1.0 |
| female_cold | Erinome | 0 | Schedar | 0 | Despina | -1 | cool, detached | 0.95 |
| female_elder | Vindemiatrix | -1 | Achernar | -2 | Pulcherrima | -3 | gentle, aged | 0.9 |
| child | Autonoe | 3 | Zephyr | 4 | Puck | 5 | playful, high | 1.1 |

## Change log (event day)
Add a dated line whenever a decision changes, e.g. "14:10 switched TTS_MODEL to … because …".

- 2026-11-07 M1: filled the voice roster with provisional picks from the Gemini TTS voice list (not yet auditioned in AI Studio). The roster is mirrored in `shared/src/voices.ts`; retune both together.
