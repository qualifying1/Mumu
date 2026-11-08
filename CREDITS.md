# Credits

Every third-party asset used in this repo, with its source and license. Add a row when you add an asset.

## Demo chapters (`fixtures/ch1`, `fixtures/ch2`)

| Files | Work | Author | License | Source |
|---|---|---|---|---|
| `fixtures/ch1/001.jpg`–`008.jpg` | *Pepper&Carrot*, episode 31 (8 pages) | David Revoy | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | https://www.peppercarrot.com |
| `fixtures/ch2/001.jpg`–`008.jpg` | *Pepper&Carrot*, episode 32 (8 pages) | David Revoy | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | https://www.peppercarrot.com |

Pages are used unmodified (the English version). The bubble boxes, voices and music built on top of them in this project are our own work and are not part of the original comic.

`fixtures/sample.json` is hand-written by us for ch1 pages 1–3 (cue text is transcribed from the pages). Its audio is generated sine beeps, not speech.

## Music (`client/public/audio/music/`)

| Files | Track | Author | License | Notes |
|---|---|---|---|---|
| `battle/1.mp3`, `tense/1.mp3`, `climax/1.mp3` | "Dark and Grim Epic Trailer (short)" | alex_besss | [Pixabay Content License](https://pixabay.com/service/license-summary/) (no attribution required, credited anyway) | One track, copied to three moods. Converted to mono 96 kbps, −5 dB. |
| `sad/1.mp3` | "Sad Story" | alexgrohl | [Pixabay Content License](https://pixabay.com/service/license-summary/) (no attribution required, credited anyway) | Converted to mono 96 kbps, −5 dB, trimmed to 2:00 with a 3 s fade-out. |

The moods `calm`, `romance`, `comedic` and `mystery` have no track for the demo (see docs/ASSETS.md).

## Generated in this repo (no third-party files)

`scripts/make-assets.mjs` synthesizes, in code: the SFX in `client/public/audio/sfx/` (10 tags), the music for the moods without a licensed track (`calm`, `romance`, `mystery`, `comedic`), the `zzz` and `note` emotes, and the PWA icons in `client/public/icons/` (made from Mumu's own sit sprite). `scripts/build-demo.mjs` builds `client/public/demo/` (the two voiced demo chapters and importable CBZs) from `fixtures/`. The demo voices are Gemini TTS output.

## Still to add

Audio, fonts, icons and Mumu art are placeholders for now. Record their sources and licenses here when they land.
