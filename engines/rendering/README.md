# engines/rendering

Implemented (deterministic, versioned, typed):
- `deliveryProfileEngine` v1.0.0 — the delivery profile catalogue (available formats and why others aren't).
- `renderManifestEngine` v1.0.0 — immutable RenderManifest from a Picture Lock version (SRS §12).
- `subtitleTimelineEngine` v1.0.0 — SRT/WebVTT from approved dialogue where it is heard in the cut; readability warnings.
- `timelineAudioMixEngine` v2.0.0 — chunked PCM mix of the cut's scene mixes; each scene renders through `engines/audio/studioMixRenderEngine` (channel strips, buses, reverb/delay, master limiter) exactly as approved; the timeline's volume automation (Editorial) then shapes the whole cut, every stem alike.
- `finalQCEngine` v1.0.0 — delivery QC and profile compliance from measured file facts.

Planned (SRS §15): `renderChunkPlannerEngine`, `renderStitchEngine`, `localizationEngine`, `dubbingAdaptationEngine`,
`alternateLanguageVoiceEngine`, `archivePackageEngine`.
