# DECISIONS: fill this in tonight; it's fixed for the event

Claude reads this file. Blanks here become blanks in the build, so fill everything before you sleep.

## Gates (see PLAN.md §11)
| Gate | Decision | Evidence / notes |
|---|---|---|
| A: TTS provider | Gemini TTS / ElevenLabs (**pick one**) | Free-tier limits seen in AI Studio: RPM ___ RPD ___ |
| B: Vision model | `VISION_MODEL=` | Speaker accuracy on 3 test slices: _/_ |
| Reasoning model | `REASONING_MODEL=` (usually the same as vision) | |
| TTS model | `TTS_MODEL=` | Request format: see PROMPTS.md §3 |
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

**Available voice names** (for the Voices tab dropdown; copy the provider's full list): ______________________

## Voice roster = default voice profiles (2 per slot; audition in AI Studio)
These seed the 20 premade profiles (`<slot>_1`, `<slot>_2`). Users retune them in the Voices tab. **`narrator_1` is Mumu's voice**: pick something warm and playful.
| VoiceSlot | Voice 1 | Voice 2 | Default style | Speed |
|---|---|---|---|---|
| narrator | | | calm, cinematic | 1.0 |
| male_young | | | energetic, confident | 1.05 |
| male_adult | | | steady, warm | 1.0 |
| male_deep | | | low, menacing | 0.95 |
| male_elder | | | wise, slow | 0.9 |
| female_young | | | bright, lively | 1.05 |
| female_adult | | | composed, warm | 1.0 |
| female_cold | | | cool, detached | 0.95 |
| female_elder | | | gentle, aged | 0.9 |
| child | | | playful, high | 1.1 |

## Change log (event day)
Add a dated line whenever a decision changes, e.g. "14:10 switched TTS_MODEL to … because …".
