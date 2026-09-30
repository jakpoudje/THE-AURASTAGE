# engines/dialogue

Named engines specified in the SRS for this domain (subset — see docs/SRS for full contracts):

- `dialogueIntentionEngine`
- `subtextEngine`
- `emotionIntensityEngine`
- `voiceDriftDetectionEngine`
- `expositionDensityEngine`
- `reactionBeatEngine`
- `dialogueRewriteEngine`

Each engine gets its own folder here (see `_template/`) with: `index.ts`, `engine.ts`,
`input.schema.ts`, `output.schema.ts`, `rules.ts`, `prompt.ts` (only if LLM-backed),
`validator.ts`, `version.ts`, `tests/`.

Built: `dialoguePerformanceEngine` v1.0.0 — built-in story intelligence (free): every line's emotion, intensity (0–10), intention, subtext and delivery from the words, the parenthetical, punctuation, the line before and the scene's mood, with evidence.
