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
- ⬜ **Lip sync**: mouth movement matched to each line (provider such as Sync Labs / Hedra; needs a key).
- ⬜ **Premium voices** (ElevenLabs; needs a key) with the same Voice DNA.
- ⬜ **Music**: suggested cues from the story (mood, tempo, instruments per scene) → generated by a licensed music
  provider (needs a key) or chosen from a built-in library; stems.
- ⬜ **Better built-in SFX and ambience**: a curated, licence-clear library (rain, crowds, traffic, doors, footsteps…)
  alongside the procedural generator; auto-placement from the script's action lines.
- ✅ Built-in **presets**: channel presets (e.g. phone call) and genre mix templates.
- ✅ Ask AuraStage changes a scene's mix (quieter / louder / mute a family of tracks), with undo.

### Stage 9 — Editorial & Timeline
- ✅ First assembly from approved takes and mixes; NLE tools (trim, ripple, roll, slip, slide, blade, lift, extract);
  grading; versions; Picture Lock with impact; EDL.
- ✅ Clear assembly overview, scene row, volume automation you draw or set, kept after picture lock.
- ✅ Opening title card, end-credits roll (cast from Casting, credits from Project Settings) and the film's built-in main
  theme under them, on video deliverables.
- ✅ Transitions per shot (dissolve, fade from black, fade to black) set in the Inspector, saved with the cut and
  rendered by the render worker (manifest 1.6.0).
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
- Keys for paid generators when you want them: ElevenLabs (voices), a music provider, a lip-sync provider, Runway /
  Luma / Google Veo (video), OpenAI (images). Each is added as a variable on the API and generation worker in Railway.
- Supabase dashboard → Authentication → "Leaked password protection" (one switch).

## 8. Open tasks — the one list

Everything not yet done, in build order. When an item is finished it moves up into the stage lists above as ✅.

| # | Task | Done when |
|---|---|---|
| 1 | Better built-in sound effects and ambience (curated, licence-clear library beside the procedural generator) | Rain, crowd, traffic, doors, footsteps… play from real recordings, placed from the script |
| 2 | AuraSketch drawings reviewed by the owner (characters and locations) | The owner is happy the sketches read as the described people and places |
| 5 | Music suggestions per scene + built-in library; music provider | Every scene has a suggested cue; a provider generates it when its key is added |
| 6 | Premium voices (ElevenLabs) with Voice DNA | Lines are spoken by ElevenLabs when its key is added |
| 7 | Lip sync on dialogue shots | Mouths match the lines when a lip-sync key is added |
| 8 | More video providers verified with keys (Luma, Veo, Kling), image-to-video | A shot's approved still becomes a moving take |
| 9 | Editorial insert track and music track (transitions ✅) | Inserts sit above the main picture; music runs across scenes |
| 10 | Location Intelligence L1–L6 (see `LOCATION_INTELLIGENCE.md`) | Per phase, as written there |
| 11 | Global platform: interface in many languages; scripts and dialogue in any language | The interface switches language; a script in another language flows through every stage |
| 12 | Set dressing and prop continuity per scene; relationship map; pronunciation guide | Each works in its stage and is used downstream |
| 13 | PDF import, version compare, beat board, social cut-downs, trailer assistant | Each works end to end |
| 14 | Upload an actor's photos as the reference (with consent record) | Photos replace generated views for that character |
| 16 | Casting: one click to accept the suggested profile for the whole cast; one click to develop every remaining field for every character; "Save — complete" for a finished character | Owner request 2026-09-30 |
| 17 | Save and continue everywhere: every stage saves what the person typed and points to the next logical step (a guided "what's next") | Owner request 2026-09-30 |
| 18 | Delete any asset, with a warning that lists exactly where it is used in the project | Owner request 2026-09-30 |
| 19 | Characters named twice: find duplicates and merge them into one (keeping both histories) | Owner request 2026-09-30 |
| 20 | Every stage shows what an action will cost before it runs (AI writing, images, video, voice) | Owner request 2026-09-30 |
| 15 | Verify every page live after each change (the live checks grow with every feature) | `live-smoke` and `live-browser` both pass |

