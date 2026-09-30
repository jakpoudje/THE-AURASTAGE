# engines/character

Named engines specified in the SRS for this domain (subset — see docs/SRS for full contracts):

- `characterCandidateExtractionEngine`
- `characterIdentityResolutionEngine`
- `characterStateEngine`
- `characterDNAEngine`
- `relationshipGraphEngine`
- `wardrobeLookEngine`
- `voiceProfileEngine`

Each engine gets its own folder here (see `_template/`) with: `index.ts`, `engine.ts`,
`input.schema.ts`, `output.schema.ts`, `rules.ts`, `prompt.ts` (only if LLM-backed),
`validator.ts`, `version.ts`, `tests/`.

- `characterLookEngine` 1.0.0 — one identity description per character (profile + wardrobe look + project look) repeated in every reference view's prompt (4 angles × 4 shot sizes; default set of 8), an identity hash that changes only when the look-defining inputs change, and the list of missing profile fields. Deterministic; runs in the browser and on the server.
- `characterDuplicateEngine` v1.0.0 — likely duplicates ("AMARA" / "AMARA BELLO" when no one else is an Amara, titles and script notes like "DET." or "(V.O.)", one-letter typos), with why and which record to keep; never merges, never guesses from anything but names; pairs marked "not the same" are skipped.
- `storyAccentEngine` v1.0.0 — suggests an accent and languages from the story (nationality, backstory, scene places, setting; 65 places worldwide), with evidence; never from a name.
- `characterProfileEngine` v1.0.0 — built-in story intelligence (free): proposes every profile field from the script — age, occupation and description from the introduction and action, gender only from the script's own words, nationality/accent/languages from the story's accent, personality/strengths/weaknesses/fears/motivation from their lines and how they speak them, backstory assembled from the script's facts, arc from their first to last scene — each with evidence. Callers fill only empty fields.
- `wardrobeSuggestionEngine` v1.0.0 — a first wardrobe look: what the script says they wear, else what their work implies, else everyday clothes for the setting and period. Never from a name.
