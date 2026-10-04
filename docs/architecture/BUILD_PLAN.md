# The AuraStage — Build Plan to a Fully Functional Studio

Written 2026-09-29 for the owner; kept up to date after every piece of work (last update 2026-09-30). Plain language
first; the technical notes under each item are for whoever builds it. Status marks: ✅ built and verified live ·
🟡 partly built · ⬜ not built yet. Nothing here is marked ✅ unless it has been checked on the live site.

**This file is the one list of what is done and what is left** (section 8 lists every open task). Data ownership — which
stage is the single source of truth for each record — is in `DATA_AUTHORITY.md`; the code map is in `MODULE_REGISTRY.md`.

---

## 1. What "fully functional" means

A person with an idea — a logline, a synopsis, or a finished script — can make a finished short or feature film in one
place:

1. **Write** the story and screenplay with an AI partner, or entirely by hand, or any mix of both.
2. **Cast** every character with a consistent face, body, wardrobe, voice and age across the whole film.
3. **Build the world**: every location and prop, described once, with reference images for every time of day.
4. **Direct** each scene (Scene DNA), plan its shots (Storyboard) and generate the images and video for every shot.
5. **Hear** the film: natural dialogue in each character's voice, lip-synced, with sound effects, ambience, Foley and
   music suggested from the script and placed where they belong — then mixed in a real studio.
6. **Edit** the cut on a timeline, balance the sound, lock the picture.
7. **Deliver** a finished film file (and stems, subtitles, EDL) that passes technical checks.

At every stage an AI assistant proposes; the person decides. Anything a person edits flows to every later stage, and
anything that changes upstream is flagged downstream (never silently overwritten).

---

## 2. The one rule that makes the film consistent

Every stage reads the **same canonical records** — never a copy:

| Record | Owned by | Used by |
|---|---|---|
| Story (logline, synopsis, characters, beats) | Scriptwriter | Outline, Script, Casting names |
| Scenes | Scriptwriter (approved script) | every later stage |
| Characters (profile, looks, voice, age) | Casting | Dialogue, Scene DNA, prompts, voice, lip sync |
| Locations & props (+ reference views) | Locations & Props | Scene DNA, prompts, video |
| Scene DNA (mood, weather, light, wardrobe per scene) | Scene DNA | Storyboard, prompts, sound |
| Shot plan | Storyboard | Visual Generation, Audio spotting, Editorial |
| Approved takes and mixes | Visual Generation / Audio Studio | Editorial, Export |

Each generated image or video is compiled from these records with the exact versions recorded, and uses the
**reference images** of the characters in frame, the location at that time of day, and the props. When any of them
changes, the shots that used it are flagged "needs review".

---

## 3. The production pipeline — what users can do at each stage

### Stage 1 — Scriptwriter
- ✅ Project Setup: title, format, logline, synopsis, genre, tone, setting, period, runtime; scope plan (scenes, pages).
- ✅ Story Development with Claude: title options, logline, synopsis, themes, characters (with why each name fits),
  beats across the acts; apply fields one by one; checks with evidence.
- ✅ Names stay the same everywhere: one "current story" used by the outline, script and rewrites; names already
  decided are passed back to Claude and kept; a warning if an outline came from an older story.
- ✅ Write or edit the story yourself; build or edit the outline yourself; write the script yourself.
- ✅ Outline & Structure: editable scene list sized to the runtime.
- ✅ Generate Script: the whole screenplay written in the background (6 batches at a time, a pool so no batch waits for
  a slow one), live progress and the real current step on screen; a worker restart resumes from the scenes already
  written; opens as a draft version you approve.
- ✅ Names in the logline are kept by Develop Story (asked again by name if one is dropped); with no names given, the
  writer picks names that fit the story's world and says why.
- ✅ Edit & Refine: editor with preview, versions, import (Final Draft / Fountain), AI scene tools (improve, expand,
  rephrase, condense, sharpen dialogue, new scene) with before → after, continuity check.
- ✅ Scene Breakdown and Character Extraction: interactive (jump to a scene, rework it, rename a character everywhere,
  open in Casting / Scene DNA); they always follow the current saved script (older unsaved typing is kept aside, never
  shown as the script).
- ⬜ PDF import. ⬜ Side-by-side version compare. ⬜ Beat board (cards you drag between acts).

### Stage 2 — Casting & Characters
- ✅ Characters created from the approved script; profiles (age, look, personality, background); approval.
- ✅ Wardrobe looks per character; 16 reference views per character (angle × framing) from one identity description.
- ✅ "Generate all character looks": the standard views for the whole cast in one click (only missing or outdated ones;
  free sketches up to 400 a minute, paid images still capped at 40 a minute).
- 🟡 **AuraSketch 2** (built 2026-09-29; live check pending): the free built-in sketcher draws each character as a real
  illustrated figure from their description and wardrobe — build, age, hair (12 styles), face, facial hair, glasses,
  headwear (gele, hijab, turban, caps, hats), layered clothes in the described colours — from four angles and every shot
  size, in Casting and in every storyboard frame. It only draws what's written (skin tone never guessed) and says what
  isn't described yet.
- ✅ Voice DNA: each character's voice type, pitch, pace and accent, matched to a natural neural voice.
- ✅ AI develops every profile field (accent and languages from the story, never from a name) as a proposal you apply.
  ⬜ Relationship map.
- ✅ **Story-driven aging** (verified live 2026-09-29): each character's other ages (Casting → Ages), reference
  views per age, the age chosen per scene in Scene DNA (with the script's own time clues pointed out), and prompts and
  reference images that follow it; a changed age flags the scenes that use it.
- ⬜ Upload an actor's photos as the reference (with consent record) instead of generated views.

### Stage 3 — Locations & Props
- ✅ Every place and prop found in the approved script with the line it comes from; describe, confirm, add by hand;
  "Describe with AI" (Ask AuraStage writes the look from the script and story; apply, undo).
- ✅ Reference views: establishing / wide / medium / detail per time of day; props hero / ¾ / detail / in hand.
- ✅ Used by every shot's prompt (described location, props, reference images); edits flag those prompts.
- ⬜ Set dressing per scene (what's on the table in scene 12) and continuity of props between scenes.
- ⬜ **Location Intelligence** (owner specification 2026-09-29, full plan in `LOCATION_INTELLIGENCE.md`): real vs
  fictional places understood from the whole story (not just headings), real places grounded in real geography with
  verified reference packs and licences, one Location DNA per place with a state per scene (the same apartment clean,
  at night, smashed), spatial layout and shot geography, shot-aware reference choice, continuity checks, ambience from
  the place, and "move this sequence from Paris to Rome" with impact analysis. Phases L1–L6; contracts are in place.

### Stage 4 — Dialogue Intelligence
- ✅ Lines from the approved script; intent, emotion, intensity, subtext per line; review when the script changes.
- ✅ AI performance notes for every line of a scene in one pass (with the scene's Scene DNA). ⬜ Pronunciation guide for
  names and non-English words.

### Stage 5 — Scene DNA
- ✅ Per scene: purpose, mood, weather, atmosphere, lighting intent, wardrobe per character; lock.
- ✅ AI fills Scene DNA as a proposal (one pass with the dialogue).
- ✅ **On-screen text** per scene ("LAGOS — 1995", "Three years later"), lower third / top / centre, burned into video
  deliverables over the start of the scene; changing only the text keeps a locked scene locked.
- ⬜ Colour palette and reference mood images per scene.

### Stage 6 — Storyboard & Shots
- ✅ Shot plan per scene (size, angle, movement, lens, focus, composition, timing), approval, sketches.
- ✅ One-click shot lists: "Plan every locked scene" and per-scene planning with a coverage style (standard, simple,
  intimate, energetic); existing plans are never replaced without asking.

### Stage 7 — Visual Generation
- ✅ Prompt compiled for every shot from all the canonical records; built-in sketch; Runway and OpenAI images when keys
  are added; takes, compare, approve.
- ✅ Reference images are chosen per shot, shown, and **sent** to providers that accept them (Runway: 3, OpenAI: 6 —
  characters first, then the place, then props); each take lists what it sent and why anything was left out. Verified
  live with the built-in generator (which takes none and says so); Runway/OpenAI receive them once their keys are added.
- ⬜ More video providers (Luma, Google Veo); ⬜ image-to-video from the approved still; ⬜ in-painting fixes.

### Stage 8 — Audio Studio
- ✅ Spotting from the shot plan; dialogue, effects, ambience, Foley and music cues; your own tracks.
- ✅ Built-in sound generator (procedural) and natural built-in voice (neural, per character).
- ✅ Studio mixing: channel strip (EQ, compressor, reverb/delay sends, volume automation), buses, master limiter,
  loudness measurement and "match loudness target"; the export sounds exactly as approved.
- 🟡 **Lip sync**: built in and free for sketch takes (2026-10-03: each speaking character's mouth opens and closes with their line in the film — auraSketchFigureEngine 3.1.0, renderManifest 1.10.0, render worker). Photographic/video takes need a lip-sync provider (sync.so / Kling; needs a key).
- ⬜ **Premium voices** (ElevenLabs; needs a key) with the same Voice DNA.
- ⬜ **Music**: suggested cues from the story (mood, tempo, instruments per scene) → generated by a licensed music
  provider (needs a key) or chosen from a built-in library; stems.
- ⬜ **Better built-in SFX and ambience**: a curated, licence-clear library (rain, crowds, traffic, doors, footsteps…)
  alongside the procedural generator; auto-placement from the script's action lines.
- ✅ Built-in **presets**: channel presets (e.g. phone call) and genre mix templates.
- ✅ Ask AuraStage changes a scene's mix (quieter / louder / mute a family of tracks), with undo.
- ✅ Clip editing on the timeline (2026-10-02): split, mute/unmute (a muted clip is left out of playback, the approved
  mix and the film), delete, trim from either edge or to the playhead, fades, ±3 dB, duplicate, keyboard shortcuts and
  Undo (Ctrl+Z, last 30 changes, a deleted clip comes back with its sound). Mixing and presets shape the final sound:
  the browser preview and the render worker use the same chain, and the approved version keeps the exact settings.

### Stage 9 — Editorial & Timeline
- ✅ First assembly from approved takes and mixes; NLE tools (trim, ripple, roll, slip, slide, blade, lift, extract);
  grading; versions; Picture Lock with impact; EDL.
- ✅ Clear assembly overview, scene row, volume automation you draw or set, kept after picture lock.
- ✅ Opening title card, end-credits roll (cast from Casting, credits from Project Settings) and the film's built-in main
  theme under them, on video deliverables.
- ✅ Transitions per shot (dissolve, fade from black, fade to black) set in the Inspector, saved with the cut and
  rendered by the render worker (manifest 1.6.0).
- ✅ Undo on the picture timeline (2026-10-02, migration 0054): ↶ Undo and Ctrl+Z take back the last 30 edits one at a
  time through the same checks and picture-lock rule as any edit.
- ⬜ A second picture track for inserts; music on its own timeline track across scenes.

### Stage 10 — Export & Deliver
- ✅ Streaming master, review copy, ProRes master, audio package (mix, stems, M&E), subtitles, EDL, technical QC.
- ⬜ Social cut-downs (9:16, 1:1) and a trailer assistant.

### Around every stage
- ✅ Team roles and permissions, comments and mentions, tasks, activity, Help & Support, Project Settings, Assets
  Library (edit images/audio in the browser), dashboard from real evidence, AI & Generation readiness page.
- ✅ **Ask AuraStage acts on**: story, characters, wardrobe, dialogue, Scene DNA (incl. on-screen text), shots,
  locations & props, Project Settings (never spending), Audio Studio mixes, Editorial transitions, Assets Library details.
  Every change goes through that stage's own save (same permissions, versions and review flags as a manual edit), shows
  before → after, and can be undone; the page updates at once. In Visual Generation and Export it changes what those
  pages are made from (shots, Scene DNA, Project Settings); starting paid generation or renders stays a person's click.
- ✅ Suggestions respect every field's limits: a too-long value is sent back to the model once to be shortened.
- ⬜ Real-time co-editing presence; ⬜ mobile review app.

---

## 4. How the final video reflects everything (the "consistency spine")

For every shot, the render uses:

- **Story** → the approved script's scene and lines (Scriptwriter).
- **People** → the characters in frame, with their approved look for that scene, age for that scene, and reference
  views made at that age (Casting).
- **Place and things** → the described location at the scene's time of day and its props, with reference views
  (Locations & Props).
- **Mood and light** → Scene DNA; **camera** → the approved shot plan.
- **Sound** → the approved scene mix (dialogue in each character's voice, lip-synced ⬜, effects, ambience, music),
  shaped by the timeline's volume automation.
- **Finish** → the project look (Project Settings), picture lock, delivery profile.

Every one of these is recorded in the render's manifest, so any frame can be traced back to exactly what made it.

---

## 5. Build order from here

| # | Work | Why first | Needs from the owner |
|---|---|---|---|
| 1 | ✅ Send reference images to image providers that accept them (done 2026-09-29) | Same faces and places in every shot | — |
| 2 | ✅ Story-driven aging (age per scene, reference sets per age) (done 2026-09-29) | Time jumps and flashbacks look right | — |
| 3 | Built-in SFX/ambience library + auto-placement + mix presets | Better sound without paid services | — |
| 4 | Music suggestions per scene + built-in library; music provider | Background music in every film | Music provider key |
| 5 | Premium voices (ElevenLabs) with Voice DNA | Natural performances | ElevenLabs key |
| 6 | Lip sync on dialogue shots | Believable speaking characters | Lip-sync provider key |
| 7 | More video providers (Luma, Veo), image-to-video | Motion for every shot | Luma / Google keys |
| 8 | 🟡 Titles, credits, theme, on-screen text done; transitions, music track remain | A finished-looking film | — |
| 9 | 🟡 AI in every field: done for 9 stages; Visual/Editorial/Export/Assets remain | Speed | — |
| 10 | Location Intelligence L1–L2 (Location DNA, entity resolution, real/fictional, scene states, World Library, packs) | Same places, right geography, before expensive generation | Claude credit |
| 11 | Location Intelligence L3–L5 (shot geography, reference selection, continuity QC, ambience, assistant commands) | Continuity across a feature | — |
| 12 | Social cut-downs, trailer assistant, PDF import, beat board | Reach and comfort | — |
| 13 | Location Intelligence L6 (external geographic providers, 3D/scans, virtual scouting, period reconstruction) | The long-term edge | Provider accounts |

Each item follows the working agreement: build → tests → full build → push → deploy → live check with a throwaway
account → clean up → short update to the owner.

---

## 6. How work is tracked (so nothing goes round in circles)

Every item is a task with a written finish line ("done when …"), and it is closed only when it passes offline tests
and a live check. The old umbrella "AI Phase 2–3" was closed on 2026-09-29: AuraScript, the assistant in every
workspace, character and location reference views and reference-aware prompts are done; what was left is now four
separate tasks — character aging, sending references to providers, one-pass AI for Dialogue and Scene DNA, and
Location Intelligence.

## 7. What only the owner can provide

- **Claude credit** (console.anthropic.com → Plans & Billing) — required for every AI writing and assistant step
  (working again since 2026-09-30).
- **Kling keys** (`KLING_ACCESS_KEY`, `KLING_SECRET_KEY`) on both the THE-AURASTAGE and generation-worker services — none
  are set yet (checked 2026-09-30).
- **ElevenLabs key** (`ELEVENLABS_API_KEY`) on both the THE-AURASTAGE and generation-worker services — one key turns on
  voices with accents (African accents included), sound effects and music (built 2026-10-02; waiting only for the key).
- Keys for other paid generators when you want them: a lip-sync provider, Runway /
  Luma / Google Veo (video), OpenAI (images). Each is added as a variable on the API and generation worker in Railway.
- Supabase dashboard → Authentication → "Leaked password protection" (one switch).

## 7b. Realism programme (owner request 2026-10-01) — the order the remaining work is done in

The owner's standard: the most realistic film possible — every field on every page used, perfect lip sync, proper
sound, African accents, the interface in many languages. Each step below is built, tested, deployed and checked live
before the next. Steps that need a paid key are built and tested against the provider's real API shape, switch on the
moment the owner adds the key, and say plainly "needs <key>" until then.

| Step | What | Plan item |
|---|---|---|
| R1 | **Prompt compiler 2.0 — every field reaches the shot.** Character: name, gender, age (scene age), nationality/ethnicity only as written in Casting (never inferred from a name), full physical description, a new **Physicality & mannerisms** field (posture, gestures, habits, how they move), personality → body language, the scene's wardrobe; the accent and language for speaking shots. Scene DNA: purpose, stakes, story time, atmosphere, weather, sound intent (for sound), continuity notes. Shot: support, transition, camera reasons. **Video mode**: the prompt says "video", the shot's exact length and its **timed action** ("over 1.5 s: …"); the take length follows the shot automatically (rounded up to the provider's shortest clip) and Editorial keeps the action. **Shot-to-shot continuity**: screen direction (who is frame-left/right) and eyelines kept from the master; "continue from the previous shot's last frame" with providers that take a start image. Speaking shots ask for visible mouth movement matched to the line, for lip sync. | 35 |
| R2 | **ElevenLabs** (one key: voices, sound effects, music). Voices from Voice DNA with the character's accent — **African accents first**: Nigerian (Yoruba, Igbo, Hausa regions), Ghanaian, Kenyan, South African, Ugandan, Tanzanian, Ethiopian, Cameroonian, Senegalese/Francophone West African, Zimbabwean — chosen from ElevenLabs' voice library by accent, gender and age; emotion and pace per line; pronunciation guide applied. Sound effects from each cue's description and length; music and the theme tune from the music suggestion. Built-in free voices stay the fallback. | 6, 1, 5, 36 |
| R3 | 🟡 (sketch takes done 2026-10-03, built in) **Lip sync** on every speaking shot: the approved take + the line's final voice → a lip-synced take (sync.so lipsync-2, or Kling lip sync with its existing key), checked by a mouth-movement QC; never replaces the take silently. | 7 |
| R4 | **Sound realism**: Foley and effects timed to the action of each shot (footsteps on the shot's movement, door on the cut), room tone matched to the location, dialogue processed for the space (small room vs street), loudness to delivery spec. | 1, 33 |
| R5 | **Music, theme tune, titles, texts, credits** completed: theme across main titles and end credits, score cues per scene from the music suggestion (built-in or ElevenLabs Music), title cards, lower-thirds, end credits from Project Settings and the cast list. | 8 |
| R6 | **Global platform**: the whole interface in English, French, Portuguese, Spanish, Arabic (right-to-left), Swahili, Hausa, Yoruba, Igbo, Amharic, Zulu, plus more; a language switcher remembered per person; scripts and dialogue in any language through every stage. | 11 |
| R7 | **Location Intelligence L1–L6** (see `LOCATION_INTELLIGENCE.md`). | 10 |

## 8. Open tasks — the one list

Everything not yet done, in build order. When an item is finished it moves up into the stage lists above as ✅.

| # | Task | Done when |
|---|---|---|
| 1 | 🟡 Better built-in sound effects and ambience (curated, licence-clear library beside the procedural generator). LIVE 2026-10-02 (checked on Railway: a typing cue, crowd and birds came from recordings, credited; room tone synthesised underneath): recordedSoundEngine 1.0.0 + `aurastage-recorded-sound` — public-domain / CC0 recordings from Wikimedia Commons fetched and screened at image build (29 categories: rain, thunder, wind, sea, river, traffic, market, crowd, birds, insects, fire, footsteps, doors, knocks, gunshots, glass, phones, cars, typing, paper, impacts, explosions, dogs, sirens, bells, clocks, water, applause, keys); backgrounds looped and layered, events in cue order; anything missing synthesised and labelled; each recording credited (title, author, licence) | Rain, crowd, traffic, doors, footsteps… play from real recordings, placed from the script |
| 2 | AuraSketch drawings reviewed by the owner (characters and locations) | The owner is happy the sketches read as the described people and places |
| 5 | 🟡 Music suggestions per scene + built-in library ✅ (musicSuggestionEngine 1.0.0, audioSpottingEngine 1.2.0, 2026-09-30: Audio Studio shows each scene's suggested music — style from the built-in library, key, tempo, level, where it sits, instruments for a composer — with why; spotting names the Score cue after it, so the free built-in generator plays exactly that style; dialogue-heavy scenes with no strong mood are left without score, and say so). Remaining: a music provider, once its key is added | Every scene has a suggested cue; a provider generates it when its key is added |
| 6 | Premium voices (ElevenLabs) with Voice DNA | Lines are spoken by ElevenLabs when its key is added |
| 7 | 🟡 Lip sync on dialogue shots. Built-in for sketch takes, free (2026-10-03): sketch shots draw each named character's mouth in all seven shapes, labelled with their id (auraSketchFigureEngine 3.1.0); the render manifest (1.10.0) times each speaker's shapes from their voice clip's place in the approved scene mix (trims and the clip's head offset included); the render worker shows the right mouths frame by frame. Remaining: photographic/video takes via a lip-sync provider once its key is added | Mouths match the lines: in sketch shots now; in generated video when a lip-sync key is added |
| 8 | More video providers verified with keys (Luma, Veo, Kling), image-to-video | A shot's approved still becomes a moving take |
| 9 | ✅ Editorial insert track (V2) and music track (A2) — migration 0045, editDecisionEngine 1.2.0, renderManifest 1.7.0, 2026-09-30: an approved shot laid over the picture ("Over picture" in the bin) and music from the Assets Library placed across scenes with its own level; both ride along with every ripple edit, are in versions, Picture Lock, the EDL and the render (music in the mix, MX and M&E stems); an asset on the music track can't be deleted until it is removed from the cut | Inserts sit above the main picture; music runs across scenes |
| 10 | Location Intelligence L1–L6 (see `LOCATION_INTELLIGENCE.md`) | Per phase, as written there |
| 11 | Global platform: interface in many languages; scripts and dialogue in any language | The interface switches language; a script in another language flows through every stage |
| 12 | ✅ Set dressing and prop continuity per scene; relationship map; pronunciation guide — 2026-10-01, all built in and free. Casting: **Relationship map** (relationshipMapEngine 1.0.0) — who shares scenes, saved relationships, and relationships the dialogue states ("Tunde, my brother") suggested with the line, added in one click. **Pronunciation** per character (migration 0046, pronunciationEngine 1.0.0) — a sound-it-out spelling suggested from the name and languages, filled by the whole-cast fill, editable; the voices speak names this way (sayNames in voice generation). Locations & Props: **Set dressing & prop continuity** (propContinuityEngine 1.0.0) — each prop's state scene by scene from its script lines (broken, bloodied, burnt, torn, missing…), carried forward until the script restores it, with warnings where a later scene may forget it; image prompts carry the state (promptCompilerEngine 1.5.0) | Each works in its stage and is used downstream |
| 13 | ✅ PDF import, version compare, beat board, social cut-downs, trailer assistant — 2026-10-01. pdfScreenplayEngine (PDF page layout → screenplay); scriptCompareEngine (two versions, scene by scene and line by line); Beat board in Story Development (beats by act; edit, reorder, move between acts; saves as your story); cutdownEngine 1.0.0 + delivery profiles "Social Cut-down (9:16)" (15–60 s, centre-cropped vertical, strongest moment first, ends on the title) and "Trailer" (60–180 s: setup, escalation montage, climax tease, text cards from the logline, the title), cut from the Picture Lock with picture and sound in sync; renderManifestEngine 1.8.0 (text cards), render worker fills/centre-crops for vertical | Each works end to end |
| 14 | ✅ Actor photos with consent — migration 0048, 2026-10-01. Casting → Look & References → **Actor photos (with consent)**: record a performer's consent (name, what they agreed to, a confirmation box; who recorded it and when is kept), then upload their photo for any reference view (and wardrobe/age); it goes to the Assets Library under Characters and replaces the generated view everywhere prompts and providers use references, marked "Actor". **Withdraw consent** stops every photo under it at once (status `withdrawn`, the files stay in the library for the record). The whole-cast generate button never overwrites an actor's photo; actor photos aren't counted as generation evidence | Photos replace generated views for that character |
| 28 | ✅ Shot planning stays "in progress" (owner report 2026-10-01). Cause: on the owner's 69-scene film 62 plans were finished but each waited for its own approval click (the label said "In progress"), and "Plan every locked scene" planned one scene after another. Fix: **Approve every ready plan** (POST /storyboard/approve-all — same checks as one scene; the rest listed with what to fix), the label now reads "Planned · approve", and plan-all / approve-all run 6 scenes at a time. Regression tests in shots routes + storyboard e2e | Planning a scene's shots finishes and shows the shots |
| 29 | ✅ Storyboard variations: choose 1, 2, 4, 6, 8 or 13 variations per frame and approve the one you want (owner request 2026-10-01; migration 0049, contracts TAKE_VARIATION_OPTIONS; the monthly paid-take limit counts every variation) | The chosen number of variations is made; the picked one becomes the frame |
| 30 | ✅ Camera intelligence by genre and by scene (owner request 2026-10-01) — shotPlanningEngine 1.3.0 `cameraGrammar.ts`: the project's genre (thriller, horror, romance, comedy, action, war, epic, realist, drama) and the kind of moment the scene is (chase, fight, suspense, intimate, grief, reveal, comic, celebration — read from Scene DNA mood/purpose/atmosphere and the dialogue) choose angle, lens, focus and movement; coverage is never changed; each shot's notes say why; a person's own choice (coverage style, calm/frenetic camera energy) keeps its movement | Shot plans differ for a thriller chase vs a romance dialogue, with why |
| 31 | 🟡 Built-in natural voices with accents by country (owner request 2026-10-01). Done: the free neural voice now picks a speaker by the character's Casting accent/nationality from licence-clear corpora with PUBLISHED speaker lists — Scottish, Canadian, Indian (CMU ARCTIC, male voices), Northern English (OpenSLR 83, male), American (LibriTTS-R + ARCTIC), British Isles (VCTK); never a voice of the wrong gender to keep an accent; every line says which accent was used or why it fell back; credits per model. Not possible free yet: West African, East African, Caribbean, Arabic, Chinese and other accents — no commercially licensed free voice model exists (L2-ARCTIC is non-commercial, so it is not used); these need a paid voice provider (ElevenLabs) | A character from e.g. Scotland, Canada or India speaks with that accent for free; the rest say plainly that a paid voice can match it |
| 32 | ✅ Built-in ambient music (owner request 2026-10-01) — musicSuggestionEngine 1.1.0 suggests an ambient bed for every scene (even talky ones with no score) in the scene's mood, very low under dialogue; proceduralAudioEngine 1.2.0 plays "ambient" score cues as a slow swelling pad with a low drone and airy shimmer, no pulse. Audio Studio → Suggested music → **Add an ambient bed (free)** puts a planned clip across the scene on the Score track and makes it with the built-in generator; the person chooses "Use this" | Each scene can have an ambient bed without a paid provider |
| 33 | ✅ Intelligent, timed sound effects marked on both timelines (owner request 2026-10-01). Audio Studio spots each scene's effects, Foley, ambience and crowd from the script and shot plan as cues at their moment and length (dashed = planned, no sound yet), each with **choose from the library**, **generate (free)** or **upload**. New: Editorial's picture timeline shows the same cues in a **Sound cues** lane at the exact frame in the cut (following the A1 mix's trims; sounds trimmed out of the cut are left out), coloured by type, with timecode and length; a planned one opens Audio Studio to choose, generate or upload it | Every sound cue sits where the action happens on the audio and the video timeline |
| 34 | ✅ Trimming and editing tools (owner request 2026-10-01). Already there: images (crop, rotate, flip, brightness/contrast/saturation, resize — as new versions), sound files (trim, gain, fades, normalise — as new versions), Audio Studio clips (position, length, offset, gain, fades, automation), Editorial (trim, roll, slip, slide, blade, lift/extract, transitions, grade, gain). Added 2026-10-01: **Split selected clip at playhead** in Audio Studio. Added 2026-10-01: **video files** in the Assets Library — Edit… → trim start/end on a preview, remove the sound, speed 0.5×–2× → the render worker cuts it with ffmpeg and saves a new version (migration 0050; earlier versions kept) | A clip, sound or image can be trimmed/edited and saved as a new version |
| 35 | ✅ Realism R1: prompt compiler 2.0 — every field reaches the shot (characters incl. physicality & mannerisms, accent, scene DNA, video timing, continuity). Ranked blocks: each provider gets a prompt inside its own limit (Runway 1,000 characters … OpenAI 32,000) with the camera, action, people and dialogue kept first; separate timed video prompt; field-by-field list in `PROMPT_FIELD_MAP.md`. Verified live 2026-10-02 (smoke 124/124) | Each shot's package shows every source used and a check for anything missing |
| 36 | 🟡 ElevenLabs voices with African and other accents, sound effects and music (one key). Built 2026-10-02 (`providers/audio/elevenlabs`): Casting accent → ElevenLabs library accent (Nigerian incl. Yoruba/Igbo/Hausa, Ghanaian, Kenyan, South African, Ugandan, Tanzanian, Ethiopian, Cameroonian, Senegalese, Zimbabwean, Rwandan, Sierra Leonean, Jamaican, British Isles, Indian, North American, Australian, French) + gender + age band; a voice already in the account is reused, otherwise the library's best match is added once; says plainly when no voice with that accent exists; each line's emotion and intensity set the delivery; sound effects up to 30 s per cue; music for score. Chosen per clip in Audio Studio ("Generator: Built-in (free) / ElevenLabs (paid)") with the cost note; never the default. Waiting for the key to verify live | Lines, effects and music are made by ElevenLabs when its key is added |
| 37 | ✅ One click for every page, in workflow order, with every item still editable by hand (owner request 2026-10-02). Done: Casting's whole-cast fill also saves the relationships the dialogue states, plus **Add all suggested relationships**; Locations & Props **Make reference pictures for every place and prop (free)**; Visual Generation **1 Compile every shot's prompt · 2 Sketch every shot (free) · 3 Approve a take for every shot** — so the whole film can be assembled in Editorial from sketches before any paid provider has credit; Audio Studio **1 Spot all scenes · 2 Generate all planned sounds · 3 Place all generated sounds on their marked spots** (and per scene); mixer fader, pan, mute and solo now act on what is playing; Editorial **Make a watchable film from everything approved (one click)** (assembly if none → Picture Lock → Review Copy render); Visual Generation shows the **1,000-character version** of each prompt that fits every provider. Dialogue (fill every line, approve every scene), Scene DNA (fill every scene, lock every ready scene) and Audio Studio (measure and approve every scene's mix) done since. 2026-10-03: every page's whole-film buttons are numbered in workflow order — Casting 1 Find characters · 2 Profiles · 3 Looks; Locations & Props 1 Find · 2 Describe · 3 Reference pictures; Dialogue 1 Fill · 2 Approve; Scene DNA 1 Fill · 2 Lock; Storyboard ▶ 1–2; Visual ▶ 1–3; Audio ▶ 1–4 | Each page has its whole-film buttons; nothing approved is overwritten |
| 38 | ✅ Timeline editing on both timelines (owner request 2026-10-02: "no means of deleting or editing audio further … removing or reinstating the parts I didn't want … must be considered even for video timelines"). Audio Studio: Clip tools bar (split, mute/unmute, trim start/end to playhead, edge-drag trims, fades, ±3 dB, duplicate, delete), keyboard shortcuts and Undo (last 30, a delete included); muted clips are kept but left out of playback, the approved mix and the render (migration 0053, renderManifest 1.9.0). Editorial: ↶ Undo / Ctrl+Z for every edit, one at a time (migration 0054) | Unwanted sound can be removed or muted and brought back; any picture edit can be undone |
| 39 | ✅ Whole-film work in batches with live progress, and team hand-offs (owner request 2026-10-02: "generate all planned sounds says: that's a lot of generations in a minute … do it in batches whilst showing … what stage and % completion for each scene … teams … notification on completed stage"). **Batches** (migration 0055): whole-film runs are bounded by queue size (48 sounds / 96 takes per project) instead of the per-minute click cap, and workers always take a person's own request first. **Production runs** (migration 0056, `apps/api/src/modules/runs`): "▶ Do 1–3 for the whole film, scene by scene" in Audio Studio (spot → generate → place) and Visual Generation (compile → sketch → approve), plus each step on its own; worked in ~25 s rounds by whichever open page holds the lease, shared with the team, pause / resume / stop, log. **Background activity panel**: who started it, the step, what it just did, overall % and every scene's stage and % with segmented, animated bars — all counted from the records. **Hand-offs** (migration 0057): stage owners on the Team page; when a scene clears a stage the next stage's owners are notified with a link, grouped ("Scenes 3, 4 and 7 are ready for Visual Generation"); never about your own work. Also: audio reads page past 1,000 rows; a cue whose sound failed twice is left for the person | A whole film is generated without errors while every scene's progress is visible; the next department hears when its scenes are ready |
| 40 | ✅ Incident 2026-10-02 (pages not loading, sign-in hanging): Supabase Auth took 10–60 s because the small database instance it shares was starved — ~10 worker lanes polled for work every 1–3 s around the clock and queued on one heartbeat row's lock, every API call re-verified its token with Auth, progress panels refreshed every 3 s, on top of the day's whole-film runs. Fixed: workers back off when idle (3 s → 10–30 s, back to full speed on work), the heartbeat never waits on a lock (migration 0058), the API reuses a verified session for 30 s (cleared at once when other devices are signed out), progress panels refresh every 5 s and not in background tabs. If it recurs under heavy use, the Supabase compute size is the next lever (owner's plan). Update 15:20 UTC: still slow at rest — a count over 85 in-memory pages took 4.8–16.5 s, so the free Nano instance (shared CPU, 0.5 GB, also running Auth and the data API) is starved, not the queries (RLS already uses initplans; the performance advisor has no blocking findings). Owner choices: restart the project (free, temporary relief) or a larger compute size (lasting) | Sign-in answers in about a second again; no statement timeouts at rest |
| 41 | ✅ Delete many assets at once (owner request 2026-10-02: "make sure all assets can be deleted … delete a lot of the downloaded audio"). Assets Library → **Select to delete…** → tick cards or **Select all shown** (use the filters, e.g. type Audio) → the dialog says exactly what will happen: how many are placed in Audio Studio and in which scenes (tick **Take them off those clips too** — those mixes go back to draft to be measured and approved again, rule 11), how many are used elsewhere, and which are on the Editorial cut (skipped until removed there). Deleted in batches of 25 with a short pause and a live progress bar; can be stopped between batches; every skipped asset is listed with why. `POST /api/projects/:id/library/delete` (contracts `BulkDeleteAssetsSchema`, max 25); clips come off through Audio's own gated `delete_audio_clip`, then `delete_asset` and the stored files. No migration. Note: files live in the Railway media bucket, not in Supabase — the database is 72 MB of the free plan's 500 MB, so deleting audio frees bucket space and lightens the Audio pages, but it is not what made the site slow (item 40) | Hundreds of sounds can be cleared from the library, including ones placed in Audio Studio, with progress shown |
| 42 | 🟡 AuraSketch 3 — characters (owner request 2026-10-02: "all character sketches just look the same … animate their speech … different movie genres"). Done: every character gets their own face — face shape, eyes (shape, size, spacing, tilt, colour), brows, nose (length, width, bridge), lips, cheekbones, jaw, chin, freckles, dimples, age lines, a mole — from the Casting description, and where it says nothing, varied from the character's identity so no two look alike and each looks the same in every view (skin only ever from written words); soft volume shading, iris/pupil/catchlight, lids and lashes, hair strands and sheen. The film's genre sets the look (13 styles: drama, thriller, noir, horror, romance, comedy, family, action, war, epic, fantasy, sci-fi, documentary) on Casting sheets and storyboard frames. Casting → Look & References → **See them speak**: any line drawn speaking (timed mouth shapes) with blinks, timed to the line's voice from Audio Studio and played with it. Remaining (next): realistic places, rooms and props (item 43); a photographic built-in image generator (item 44) | Characters are recognisably different people, drawn in the film's genre, and can be seen speaking their lines |
| 43 | 🟡 AuraSketch for locations, environments and props — placeSketchEngine 1.0.0 BUILT 2026-10-02: a small 3D camera (true perspective, near-plane clipping, painter's order, faces shaded by the light) and an object library (desks, office and dining chairs, monitors, laptops, papers, lamps, bookshelves with books, cabinets, sofas, beds incl. hospital beds, wardrobes, tables, TVs, frames, windows with curtains and light shafts, doors, ceiling fans, strip lights, boards, counters, bottles, fridges, crates, cell bars; cars, buildings with windows and gable/zinc/flat roofs, trees and palms, streetlights, containers, cranes, boats, market stalls with produce, motorbikes, generators, power lines, signs, walls with gates, people). 30+ kinds of place read from the name and description (office, newsroom, boardroom, classroom, hospital, church, mosque, bar, restaurant, shop, cell, interrogation room, warehouse, hotel room, corridor, courtroom, studio, hall, kitchen, bedroom, living room, car/bus interior; street, alley, market, harbour, beach, forest, field, village, highway, rooftop, compound, building, park), with size, materials (brick, wood panelling, tiles, concrete, metal, marble, carpet), colours, condition (stains, peeling, cracks), wealth, objects named, weather (rain, fog, dust, storm), time of day and the genre grade. Used for Locations & Props views AND behind the characters in every storyboard frame. Remaining: props drawn individually by category (item 43b), and the owner's review. Original ask (owner request 2026-10-02: "locations and environments are the worst … must reflect real homes, offices, environments"). A scene engine that reads the location's description and the script (type of place — home, office, market, street, harbour, hospital, church, classroom, police station, bar, car interior…; size, era, wealth, condition, materials, time of day, weather) and lays out a believable space in perspective with the right furniture, fixtures and props, lit for the time of day and the genre | A location sketch looks like the described place |
| 44 | 🟡 Photographic built-in images and natural built-in voices (owner request 2026-10-02: "most realistic … voices still sound robotic"). Run open-licence models on our own worker so they cost no third-party fees: a fast image model for realistic stills from the compiled prompts and reference views, and a natural neural voice model with distinct male/female/child/elder voices (replacing the current robotic-sounding fallback), plus a licence-clear library of real recorded sound effects. Note: these run on Railway and raise its monthly usage (CPU/RAM); the paid providers (ElevenLabs etc.) stay optional **Voices live 2026-10-02 (checked on Railway: 28 voices measured at build; a line spoken by “Emma”, British female; Scottish characters keep the Piper Scottish voice):** Kokoro-82M (Apache-2.0) is the default free voice ahead of Piper — installed and measured at image build (`kokoro-install.sh`), each character cast by gender, age band (elders slower and lower, the young quicker and higher), American/British accent and register; same voice for a character in every line. Honest limits, shown in each line's reason: no child voices, no African/Caribbean/Asian accents (ElevenLabs when its key is added); accents only the Piper corpora have (Scottish, Northern English, Canadian, Indian) keep Piper. Remaining: photographic stills, recorded sound-effects library. | Stills look like photographs; voices sound human and match each character |
| 45 | ✅ Audio Studio voices reaching Editorial (owner question 2026-10-02: "are all audio suite voice not transferred to editorial and timeline?"). Findings on the live film (The Last Ballot): none of its 69 scene mixes was approved (Editorial only ever takes APPROVED, measured scene mixes — rule 11), 252 of its dialogue lines were planned cues without a voice after the bulk clear-out, and the Sound track was empty. Two real defects fixed: (1) a mix approved after the cut was assembled never reached the timeline without a full re-assembly — Conform now lays every approved scene mix that isn't on the cut onto Sound (A1) in sync with its picture, free space only (editDecisionEngine 1.3.0, `sound_to_add` on the workspace; the one-click "watchable film" conforms before locking); (2) deleting a voice in the Assets Library removed the whole dialogue cue — it now goes back to "planned" and keeps its place so Generate all can voice it again (hand-added clips are still removed). | Generate + place all → Measure & approve all in Audio Studio → Conform in Editorial puts every scene's sound on the cut |
| 46 | ✅ A clear workflow on every page — do everything at once, or one item at a time (owner request 2026-10-02: "a clear workflow for users in every page … bulk request and also individual hands on click … scene by scene, character by character, clips by clips … in the background in batches … conform clips isn't clear … I want to just test one scene in the editorial and timeline"). Editorial done: "One scene at a time" panel (readiness from the records with links to fix, Build a test cut of this scene only, Bring this scene up to date = Conform in plain words, Play this scene), the whole-cut Conform renamed "Bring the whole cut up to date (Conform)" with an explanation. Bulk work already runs in rounds/batches (production runs, migration 0055 queue). Every stage page now has a workflow strip under its header (`components/NextStepBar.tsx` + `stageWorkflow.ts`): the stage's own steps ticked from the production overview's checks, plus “All at once:” (the page's do-everything buttons, run in rounds/batches) and “One at a time:” (scene by scene, character by character, shot by shot, clip by clip); it can be folded away. | Every page shows its steps, a do-all button and per-item buttons |
| 47 | ✅ Storyboard & Shots for the whole film in one click, in the background (owner request 2026-10-03: "too repetitive and boring to plan or replan every single shot … a single click should … plan every single shot sequentially in the background … the user workflow in storyboard and shots should be numbered logically"). Migration 0059 adds Storyboard to production runs: `storyboard.film` plans every locked scene with no shots one after another in story order, then approves every plan that passes its checks; `storyboard.replan` also re-plans scenes a Scene DNA change flagged (asked first; approved versions kept in history). The run is shared with the team, can be paused/resumed/stopped, and shows every scene's stage from the records. The page is numbered: whole film “▶ Do 1–2”, “1 · Plan every locked scene”, “2 · Approve every ready plan”, “↻ Re-plan flagged scenes”; each scene “1 · Coverage style → 2 · Plan → 3 · Check and edit → 4 · Approve”. | One click plans and approves the whole film's shots while the page stays usable |
| 48 | ✅ Character Extraction mismatches (owner report 2026-10-03, The Last Ballot: 70 of 81 speaking characters flagged "not in your story"). Causes: cues were matched by first name only (NWOSU, ADAMU, WABARA, ADEKUNLE, BELLO are surnames of story characters, so they showed as missing and the story people as "no lines yet"); every role (REPORTER, PRESIDING OFFICER, YOUNG MAN) and ALL/VOICES was flagged; the story itself listed a party and a region as characters. Fixed with scriptCastMatchEngine 1.0.0: surname and titled-name matching (a shared surname only when one story person is unclaimed), walk-on parts and group lines in their own sections, groups/places listed apart; named people only in the script are still flagged | The panel lists only real differences |
| 49 | ✅ Locations & Props cleaned up (owner report 2026-10-03, The Last Ballot): 101 props, many of them people, signs or headlines in capitals (STEWARD, CHEER, RETRY, "North Has Decided", #THEPROOF); "Glass" mixing spectacles, window glass and a glass table; 36 continuity warnings from one Tomiwa phone "in a cracked case" marking every phone in 38 scenes broken and a "cup of tea gone cold" as missing; and "that's a lot of images in a minute" on the one-click pictures. Fixed: worldExtractionEngine 1.1.0, propContinuityEngine 1.1.0 (state next to the prop, everyday items' states stay in their place, one warning per state with its scenes), migration 0060 (built-in sketches 400 a minute, paid 40), and the one-click makes pictures in batches — stops calmly at the limit, says how many wait, and carries on by itself a minute later; props the script no longer has get no new pictures. Press "1 · Find locations & props in the script" once to re-read the script with the new rules (old junk props are flagged as no longer in the script, never deleted) | Props are objects; warnings are real; one click makes every picture |
| 50 | Database slowdowns under heavy use (seen 2026-10-03/04 after ~10 live test runs and a 588-picture batch in one day): the free Supabase instance hits "canceling statement due to statement timeout" across every area — uploads, picture saves by the worker, renders — then recovers. Heaviest queries (pg_stat_statements): worker check-ins (~220k calls each), whole-project reads of audio clips, shot plans, shots and generation packages. Next: lighter project reads (only the columns and scenes a page needs), fewer worker check-ins when idle, retry a worker's save once on a timeout; the owner may choose a larger database (paid) | Live checks pass on a busy day; a picture or save never fails because the database was briefly busy |
| 16 | ✅ Casting whole-cast buttons and "Save & next" (2026-09-30); remaining: the same "save & continue + what's next" on every other stage (item 17) | Owner request 2026-09-30 |
| 17 | ✅ "What's next" on every stage: the stage's next step and progress from the production overview (never a made-up percentage), updated after every save; "Continue to …" once the stage is done, "Skip ahead" otherwise — 2026-09-30 | Owner request 2026-09-30 |
| 18 | ✅ Delete any asset, with a warning that lists exactly where it is used (migration 0043, 2026-09-30) | Owner request 2026-09-30 |
| 19 | ✅ Characters named twice: pointed out, merged in one click or kept apart (migration 0042, 2026-09-30) | Owner request 2026-09-30 |
| 21 | ✅ Scene DNA in four sections (Scene Overview, Visual & Sound, Performance, Continuity) each with "Fill … from the script" (free, item 22); Continuity notes (migration 0044) — 2026-09-30 | Owner request 2026-09-30 |
| 22 | ✅ Built-in story intelligence fills every field for free — only generation through a third party costs money (owner, 2026-09-30). Engines: characterProfile, wardrobeSuggestion, dialoguePerformance, sceneDnaFill, worldDescribe; the Ask AuraStage planner defaults to them (`planner: "builtin"`, provider `aurastage`), with preview, apply and undo as before; Claude is an optional "Refine with Claude", priced first. Buttons: Casting "Develop the rest (free)" + whole cast, Dialogue "Fill every line's performance (free)", Scene DNA "Fill … from the script" per section, Locations & Props "Describe from the script (free)". Downstream (same day): whole-film one-click fills — Scene DNA "Fill every scene's Scene DNA (free)" and "Lock every ready scene", Dialogue "Fill every line in the film (free)" and "Approve every scene's dialogue" (batches of up to 250 changes); Storyboard shots now come with their composition (shotPlanningEngine 1.2.0). Every other page: Scriptwriter story setup "Fill from the script (free)" and Project Settings "Fill from the story (free)" (storySetupEngine: genre, tone, setting, period, logline; look, palette, country, year, title-card line — never credit names), Locations & Props "Describe every place and prop (free)", and Scene DNA picks the wardrobe look each on-screen character wears (new tool assignSceneWardrobe). Downstream engines read what these fill: audio spotting (weather, atmosphere, mood, sound intent), prompts (lighting, composition, the look worn); the production graph flags downstream work on every change. Also fixed: the whole-cast request broke the 4000-character limit; Storyboard "That value isn't allowed" when a Scene DNA lighting intent was over 500 characters (shotPlanningEngine 1.1.1). Scriptwriter (2026-10-01, migration 0047): Story Development and the Scene Outline are made by the built-in story engine by default — storyScaffoldEngine 1.0.0 reads the brief (people, relations, goal, obstacle, stakes, deadline, who is at stake, places, themes), builds the character web (want, need, flaw, the lie they believe, arc), a genre structure with A-story, B-story and the antagonist's counter-plan, a plant paid off in act three, and an outline sized exactly to the runtime with every beat and main character covered; the AI writer is the optional paid take, and screenplay pages stay with the AI writer | Owner request 2026-09-30 |
| 20 | 🟡 Cost shown before every paid action: Visual Generation, Casting looks, Locations & Props views, AuraScript, and "Refine with Claude" in Ask AuraStage (filling fields is free — item 22) — done 2026-09-30. Remaining: confirm the prices marked "not confirmed" (Gemini, Imagen, Kling, MiniMax, Luma Photon, Runway images, some Stability models) and add voice/music when those providers arrive | Owner request 2026-09-30 |
| 15 | Verify every page live after each change (the live checks grow with every feature) | `live-smoke` and `live-browser` both pass |


## 9. Version 2 — where next (owner question 2026-10-02)

Version 1 is the whole studio working end to end with free built-in tools, and every paid provider wired in but
switched off until its key is added. Version 2 makes the result a cinema-grade film. Three principles:
**every timing comes from one clock**, **every provider is a plug-in behind the gateway**, and **nothing is ever
silently replaced**.

**V2.1 — One timing spine (frame-accurate sync).** Today shots, lines, cues and the cut each have their own
lengths. V2 gives every scene one master timeline in frames (24 fps), owned by Editorial: each shot's in/out, each
line's start and end (from the recorded or generated voice, not an estimate), each sound cue anchored to an action
or a frame, and each music cue anchored to a beat. When anything changes length (a new take, a longer voice line),
the spine re-times everything after it and flags what moved, instead of drifting. Lip sync, Foley and music all
read the same spine, so they land on the same frame.

**V2.2 — Providers that slot in.** One adapter per provider behind the Provider Gateway, each declaring what it can
do (lengths, sizes, reference images, start/end frames, voices, accents, languages) and its price. Script (Claude),
images (OpenAI, Imagen, Flux), video (Runway, Kling, Luma, Veo — image-to-video from the approved still, with a
last-frame hand-off for continuous shots), voices and sound (ElevenLabs), music (ElevenLabs Music or a score
provider), lip sync (sync.so or Kling). Each one is tested against the real API shape and turns on when its key is
added. Best-provider routing per shot (close-up dialogue → the best lip-sync-ready model; wide establishing shot →
the best landscape model), always with the price first.

**V2.3 — Performance and lip sync.** Each line: the final voice (with accent and emotion) → the approved take →
lip-sync pass → a mouth-movement check → a new take marked "lip-synced", never overwriting the original.

**V2.4 — Surround sound and cinema delivery.** Version 1 mixes in stereo. V2 adds a **5.1 mix** (dialogue anchored in
the centre, music and ambience spread wide, effects panned to where they are in the frame, LFE for impacts), then
**7.1**, and **Dolby Atmos-ready stems** (dialogue, music, effects and object tracks) for a mixing stage to finish.
Loudness to each delivery target (cinema, streaming −27 LKFS / −24 LUFS, broadcast, social), M&E for foreign
versions, and a **DCP-ready** master alongside the streaming files.

**V2.5 — Quality control before delivery.** Automatic checks on the whole film: continuity (faces, wardrobe, props,
time of day) shot to shot, sync drift, loudness and peaks, black frames and flash frames, and missing captions —
each with the frame to fix.

**V2.6 — Scale and team.** A larger database tier and a dedicated worker pool so a feature film (thousands of shots
and sounds) loads in under two seconds; live presence (who is in which scene), review links for clients, and
version history across the whole film.

**V2.7 — Global.** Interface languages (R6), scripts and dialogue in any language, dubbing into other languages with
the same voices and lip sync, and Location Intelligence (R7).

**Order:** finish the open V1 items above (R2–R7) and verify each live → V2.1 timing spine (everything else depends
on it) → V2.3 lip sync → V2.4 surround → V2.5 QC → V2.2 routing → V2.6 → V2.7. Paid keys and a larger database are
the owner's to add when ready; until then everything stays on the free built-in tools.
