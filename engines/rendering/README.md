# engines/rendering

Implemented (deterministic, versioned, typed):
- `deliveryProfileEngine` v1.0.0 — the delivery profile catalogue (available formats and why others aren't).
- `renderManifestEngine` v1.0.0 — immutable RenderManifest from a Picture Lock version (SRS §12).
- `subtitleTimelineEngine` v1.0.0 — SRT/WebVTT from approved dialogue where it is heard in the cut; readability warnings.
- `timelineAudioMixEngine` v2.0.0 — chunked PCM mix of the cut's scene mixes; each scene renders through `engines/audio/studioMixRenderEngine` (channel strips, buses, reverb/delay, master limiter) exactly as approved; the timeline's volume automation (Editorial) then shapes the whole cut, every stem alike.
- `renderManifestEngine` 1.10.0 — lip sync: each sketch take carries `lipsync` changes ({frame, key = character id,
  viseme}) timed from the speaker's voice clip in the approved scene mix (record = A1 record_in + scene frame − source_in;
  a clip trimmed at its head starts part-way into the line; the mouth closes when the line ends).
- `finalQCEngine` v1.0.0 — delivery QC and profile compliance from measured file facts.

Planned (SRS §15): `renderChunkPlannerEngine`, `renderStitchEngine`, `localizationEngine`, `dubbingAdaptationEngine`,
`alternateLanguageVoiceEngine`, `archivePackageEngine`.

- `titleSequenceEngine` v1.0.0 — the opening title card ("X presents", title, optional line) and the end-credits roll
  (director, writer, producer, music, cast from Casting leads first, what made the pictures, thanks, company · country ·
  year, copyright) as SVG. Only credits that are set are shown. `renderManifestEngine` 1.4.0 puts them first and last
  on video deliverables (the cut, its sound, automation and captions move later together); audio and text deliverables
  never get them. The render worker holds the card with fades and scrolls the roll.
