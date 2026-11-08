# PROMPTS: Gemini prompt texts (draft; refine in AI Studio tonight)

How to test tonight: in AI Studio, pick the vision model, turn on **structured output**, and paste a response schema matching CONTRACT §2/§5. Run each prompt on 3 slices: a two-person argument, a crowd scene, and narration plus SFX. Paste the final wording back here. **Bump the version number whenever you change a prompt**, so the server's cache ignores results from the old wording.

---

## 1. Vision prompt (per segment). Version: `vision-v3` (v2 added the credits/promotional-page sentence; v3 dropped "skip text you cannot read confidently", added the "list every one" push for dense pages, and the spell-tail rule)

Inputs sent with this prompt: the segment image, the KNOWN CAST list (id, name, description), and the segment's position ("segment 4 of 19").

> You are reading one horizontal slice of a comic. Find every piece of text a reader would read: speech bubbles, thought bubbles, narration boxes/captions, and sound-effect lettering. Be exhaustive: a dense page has 8-15 items in total, so even one slice of it can hold several. Black jagged bubbles with white text are speech or spells. List every one.
>
> For each item return:
> - `kind`: speech, thought, narration, or sfx.
> - `text`: exactly as lettered. Join line breaks with spaces. Keep punctuation. Do not translate, correct, or summarize.
> - `box`: [ymin, xmin, ymax, xmax] normalized 0–1000 relative to THIS slice.
> - `emotion`: one of neutral, happy, angry, sad, scared, surprised, determined, tender, smug. Judge from the wording, the lettering, and the speaker's face.
> - `delivery`: shout (bold, large, or jagged lettering, or a spiky bubble), whisper (small or dotted lettering, or a dashed bubble), otherwise normal.
> - `speakerHint`: a short visual description of the character the bubble's tail points to (hair, clothing, distinctive features), or null if no tail or speaker is visible. A spell is spoken by the character casting it, so its tail points to that character's hand or mouth.
> - `speakerCastId`: the id from KNOWN CAST only if you are confident it is that character; otherwise null. Never guess.
> - `sfxTag` (sfx only): the closest of punch, sword_clash, explosion, whoosh, footsteps, door, heartbeat, gasp, crowd, magic, or null if none fits.
>
> Also return for the whole slice: `mood` (calm, tense, battle, climax, romance, sad, comedic, mystery) and `intensity` (1–3), judged from the art (action lines, colors, expressions) as well as the text.
>
> List items in reading order: top to bottom, and left to right within the same row. Ignore watermarks, credits, page numbers, logos, and signs that are part of the background unless a character reads them aloud. Ignore all text on credits, donation, patron, sponsor, license or promotional pages (thank-you lists, "support the author" notes, website addresses), even when it is lettered like narration; return an empty items list for such a slice. If the slice contains no text, return an empty list.

## 2. Reasoning prompt (per chapter, text only; **no recap**). Version: `reason-v4` (v2: narration is not a character. v3: match a character across coloured lighting on outfit, hat and companions, preferring a known cast id. v4: the recap is removed: item 4 and the `recap` output field are gone)

Inputs: KNOWN CAST (id, name, description), and the chapter transcript as numbered lines: `order | kind | text | speakerHint | speakerCastId | segment mood/intensity`.

> You are the casting director for a voiced comic. Using the transcript and the known cast:
>
> 1. **Speakers.** For every speech or thought line, choose a speaker: a known cast id, or a new character key like `new_1`. Use the same key every time that new character speaks. Use `speakerCastId` and `speakerHint` as evidence, along with the conversation flow: replies alternate, and a character addressed by name is usually the *listener*, not the speaker. The same character looks different in different coloured lighting (hair and clothes can read as brown, purple or green), so match on outfit, hat and companions, and prefer a known cast id over a new character. If you cannot tell, use null.
> 2. **New characters.** For each new key give: `name` (a real name if the dialogue reveals it, otherwise a short descriptive label), `description` (visual, from the hints, for recognizing them in later chapters), and `voiceSlot` (one of narrator, male_young, male_adult, male_deep, male_elder, female_young, female_adult, female_cold, female_elder, child). Use male_deep for villains and gruff fighters, and female_cold for cold or aloof women.
> 3. **Music regions.** Split the chapter into contiguous regions covering every line from first to last. Give each region `startOrder`, `endOrder`, `mood`, and `intensity`. Avoid flicker: do not change mood more often than every ~6 lines unless the scene clearly shifts (a fight starts, a reveal, a death). Use `climax` for at most one peak per chapter.
>
> Narration and caption lines belong to the story's unseen narrator. The narrator is not a character: never create a character for it and never give it a speaker.

Code, not the model, converts `startOrder`/`endOrder` into `{pageIndex, y}` using the cue anchors.

## 3. TTS style string (deterministic; built by code, no prompt to tune)

style string = `<character.style>, <emotion phrase>, <delivery phrase>`

The style goes in `speech_metadata.style`; the text stays verbatim. (Confirm the exact SDK shape with docs-researcher at A3.) Speed and pitch are **not** part of the TTS request: they are applied in the ffmpeg encode step (CONTRACT §9).

| Emotion | Phrase | | Delivery | Phrase |
|---|---|---|---|---|
| neutral | "natural" | | normal | "" (omit) |
| happy | "cheerful" | | shout | "shouting loudly" |
| angry | "angry, intense" | | whisper | "whispering quietly" |
| sad | "sad, subdued" | | | |
| scared | "frightened, shaky" | | | |
| surprised | "surprised" | | | |
| determined | "determined, resolute" | | | |
| tender | "soft, tender" | | | |
| smug | "smug, teasing" | | | |

`thought` cues add "inner monologue, intimate". `narration` cues and unknown speakers use the `narrator_1` profile (the **narrator voice**, not Mumu) with "calm, cinematic narration". `POST /preview` uses the profile's own style with the sample line "Hi! I'm ready for my big scene." ("Once upon a time…" for the narrator). Lines with a character use that character's `voice` snapshot, with the style string built from the snapshot's `style` plus the emotion and delivery above.

**Check tonight in AI Studio:** how your TTS model takes the style. Some models take it as a separate style field; others need it in the prompt, like `Say <style>: <text>`. If it's in the prompt, make sure the model **doesn't read the style words aloud.** Write down the format that works here, because A3 depends on it:

> TTS request format that works: ______________________
