import { z } from "zod";
import { CharacterKindSchema, CharacterRoleSchema, PresenceEvidenceSchema } from "@aurastage/contracts";

export const SceneAppearanceSchema = z.object({
  scene_number: z.number().int().positive(),
  speaking: z.boolean(),
  /** Only heard (V.O./O.S./O.C.), never cued or mentioned on screen in this scene. */
  voice_only: z.boolean(),
  line_count: z.number().int().nonnegative(),
  confidence: z.number().min(0).max(1),
  evidence: z.array(PresenceEvidenceSchema),
});
export type SceneAppearance = z.infer<typeof SceneAppearanceSchema>;

export const CharacterCandidateSchema = z.object({
  /** Normalised identity key (normalizeCharacterName of display_name). */
  key: z.string(),
  display_name: z.string(),
  /** Other names the script uses for this candidate (e.g. cue "TUNDE" for intro "TUNDE OKAFOR"). */
  aliases: z.array(z.string()),
  kind: CharacterKindSchema,
  suggested_role: CharacterRoleSchema,
  age: z.string().nullable(),
  introduction: z.string().nullable(),
  total_lines: z.number().int().nonnegative(),
  appearances: z.array(SceneAppearanceSchema),
  /** P(real character) = σ(w0 + Σ wᵢxᵢ); cues force inclusion. */
  confidence: z.number().min(0).max(1),
  /** Below the automatic threshold or ambiguous: surface to a person, never insert silently. */
  needs_confirmation: z.boolean(),
  reason: z.string(),
});
export type CharacterCandidate = z.infer<typeof CharacterCandidateSchema>;

export const CharacterExtractionOutputSchema = z.object({
  candidates: z.array(CharacterCandidateSchema),
  engine_version: z.string(),
});
export type CharacterExtractionOutput = z.infer<typeof CharacterExtractionOutputSchema>;
