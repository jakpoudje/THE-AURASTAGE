# Prompt field map — every field, where it goes (realism programme R1)

Owner request 2026-10-01: review every page, nav and field and decide which ones reach the generation prompts, staying
inside each provider's limit. This is the single list; `promptCompilerEngine` (2.0.0) implements it and its tests
check it. "Image" = still frames; "Video" = moving takes; "Voice/Sound" = Audio Studio and the voice/SFX providers.

## How the limit is respected

The compiler no longer builds one long sentence that providers cut off at the end. It builds **ranked blocks**
(rank 1 is never dropped); each provider asks for a prompt sized to its own limit and the lowest-ranked blocks are
shortened at a sentence boundary, then dropped, first. The package stores every block with its rank, so the
shortened prompt any provider received can be rebuilt exactly (`promptFor` in `apps/api/src/providers/promptFor.ts`).

| Provider | Limit used (characters) |
|---|---|
| Runway (image & video) | 1,000 |
| MiniMax video | 2,000 |
| Kling video | 2,500 |
| Luma | 5,000 |
| Google Imagen / Veo, Black Forest Labs | 8,000 |
| Stability | 10,000 |
| OpenAI images | 32,000 |

Rank order: **1** camera + shot type, action, who is in frame (identity), dialogue being spoken (video) ·
**2** place + time of day, wardrobe, lighting, screen direction & eyelines, physicality (video) ·
**3** mood, atmosphere, weather, props and their state, the script's own action lines, physicality (image) ·
**4** composition, style (genre, setting, period), project look · **5** continuity notes, previous/next shot, purpose & stakes.

## Every page and field

| Page → field | Image | Video | Voice / Sound | Notes |
|---|---|---|---|---|
| **Project** title | — | — | — | Not visual; on title cards only |
| genre, subgenre, tone | ✔ style | ✔ style | music style | |
| setting, time period | ✔ | ✔ | music instruments | |
| logline, synopsis, audience, opening/ending style | — | — | — | Story steering; used by the story engines, not pictures |
| **Project Settings** look, palette | ✔ look | ✔ look | — | Palette as named colours in the look |
| aspect ratio, fps, loudness | ✔ technical | ✔ technical | loudness target | |
| **Scriptwriter** scene heading, INT/EXT, time of day | ✔ | ✔ | ambience | |
| scene **action lines** | ✔ (rank 3) | ✔ (rank 3) | Foley/FX spotting | New in 2.0: the lines next to the shot's dialogue, or the scene's opening/closing action for establishing/action shots |
| dialogue parenthetical ("whispering") | — | ✔ with the line | ✔ delivery | New in 2.0 |
| **Casting** name, gender, age (scene age) | ✔ | ✔ | ✔ voice | Gender/age only as written — never inferred |
| nationality, ethnicity (as written in description) | ✔ | ✔ | ✔ accent | Never inferred from a name |
| description (appearance) | ✔ rank 1 | ✔ rank 1 | — | |
| **physicality & mannerisms** (new field) | ✔ rank 3 | ✔ rank 2 | — | Posture, gait, gestures, habits |
| personality | — | ✔ manner (one sentence) | ✔ delivery | Body language in video |
| accent, languages, pronunciation | — | ✔ for speaking shots (lip shapes) | ✔ voice, names | |
| occupation | ✔ only through the description/wardrobe | same | — | |
| backstory, motivation, fears, strengths, weaknesses, arc | — | — | — | Story depth; feeds Dialogue/Scene DNA engines, not pixels |
| wardrobe look (chosen in Scene DNA) | ✔ rank 2 | ✔ rank 2 | — | |
| age states (flashbacks) | ✔ | ✔ | ✔ voice age | Reference views at that age |
| reference views / actor photos | ✔ images | ✔ images | — | Sent to providers that accept them |
| relationships | — | eyelines (who looks at whom) | — | Through screen direction |
| **Locations & Props** location name, description | ✔ | ✔ | ambience | |
| location areas (e.g. "kitchen", "balcony") | ✔ when the scene heading names one | ✔ | — | New in 2.0 |
| props: name, description, descriptors, state in scene | ✔ rank 3 | ✔ rank 3 | Foley | descriptors new in 2.0 |
| location/prop reference views | ✔ images | ✔ images | — | Time-of-day view preferred |
| **Dialogue** text, speaker | — (stills don't speak) | ✔ rank 1 + lip-sync wording | ✔ | |
| emotion, intensity | ✔ face (rank 3) | ✔ rank 1 | ✔ | |
| intention, subtext | — | ✔ (performance, rank 3) | ✔ delivery | New in 2.0 |
| estimated seconds | — | ✔ timing inside the shot | ✔ | |
| notes | — | — | — | Writer's notes, not instructions to a camera |
| **Scene DNA** purpose, stakes | — | ✔ rank 5 | — | New: stakes |
| story time ("three days later") | ✔ | ✔ | — | New in 2.0 |
| mood, atmosphere, weather | ✔ | ✔ | ✔ ambience/music | |
| lighting intent | ✔ | ✔ | — | When the shot has none |
| sound intent | — | — | ✔ | Sound only |
| camera energy | via shot plan | via shot plan | — | |
| silent scene | — | ✔ "no one speaks" | ✔ | |
| wardrobe per character, ages | ✔ | ✔ | — | |
| continuity notes | ✔ rank 5 | ✔ rank 5 | — | New in 2.0 |
| on-screen text | — | — | — | Burned in at render, never generated |
| **Storyboard & Shots** size, angle, movement, lens, focus | ✔ rank 1 | ✔ rank 1 | — | |
| support (dolly, gimbal…) | — | ✔ | — | New in 2.0 |
| duration, story start/end | — | ✔ "a 1.5-second shot" + timing | ✔ cue timing | New in 2.0; take length follows it |
| description | ✔ rank 1 | ✔ rank 1 (timed) | — | |
| composition | ✔ rank 4 | ✔ rank 4 | — | |
| lighting | ✔ | ✔ | — | |
| transition in | — | ✔ (how the shot starts) | — | New in 2.0 |
| characters in frame, lines covered | ✔ | ✔ | ✔ | |
| notes (incl. camera reasons) | — | — | — | Reasons for people, not the model |
| neighbouring shots | — | ✔ rank 5 "after: …" | — | New in 2.0 |
| **screen direction** (computed) | ✔ rank 2 | ✔ rank 2 | — | New in 2.0: kept from the master shot |
| **Visual Generation** variations, seed, starting frame | — | starting frame | — | Request parameters, not prompt |
| **Audio Studio / Editorial / Export** | — | — | ✔ | Downstream of the pictures |
