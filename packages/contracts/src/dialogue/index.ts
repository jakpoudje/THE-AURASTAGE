import { z } from "zod";

// Canonical owner: Dialogue Intelligence (docs/architecture/DATA_AUTHORITY.md).
// SRS §7: each line stores speaker, listeners, text, intention, subtext,
// emotion/intensity, timing estimate and version/approval. Written/performance
// semantics only — Audio Studio realises it sonically but never rewrites it.

/** Emotion vocabulary for annotations (Plutchik's eight + common screen states). */
export const DialogueEmotionSchema = z.enum([
  "neutral",
  "joy",
  "sadness",
  "anger",
  "fear",
  "surprise",
  "disgust",
  "trust",
  "anticipation",
  "tension",
  "love",
  "contempt",
  "resignation",
  "determination",
]);
export type DialogueEmotion = z.infer<typeof DialogueEmotionSchema>;

/** Suggested intentions (free text is allowed; these seed the picker). */
export const DIALOGUE_INTENTION_SUGGESTIONS = [
  "inform",
  "persuade",
  "threaten",
  "comfort",
  "deflect",
  "confess",
  "command",
  "plead",
  "provoke",
  "conceal",
  "reassure",
  "challenge",
] as const;

export const DialogueLineStatusSchema = z.enum(["active", "omitted"]);
export const DialogueApprovalSchema = z.enum(["draft", "approved"]);
export const DialogueReviewStateSchema = z.enum(["current", "review_required"]);

export const DialogueLineSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  scene_id: z.string().uuid(),
  scene_number: z.number().int().positive(),
  /** Position of the line within its scene (1-based) in the source version. */
  ordinal: z.number().int().positive(),
  /** Canonical character when the cue resolves in Casting; null when unresolved. */
  character_id: z.string().uuid().nullable(),
  speaker_name: z.string(),
  /** normalizeCharacterName(speaker_name) — the key Casting aliases resolve. */
  speaker_key: z.string(),
  extensions: z.array(z.string()),
  parenthetical: z.string().nullable(),
  text: z.string(),
  text_hash: z.string(),
  listener_ids: z.array(z.string().uuid()),
  estimated_seconds: z.number().nonnegative(),
  element_index: z.number().int().nonnegative(),
  source_version_id: z.string().uuid(),
  intention: z.string().nullable(),
  subtext: z.string().nullable(),
  emotion: DialogueEmotionSchema.nullable(),
  intensity: z.number().int().min(0).max(10).nullable(),
  notes: z.string().nullable(),
  status: DialogueLineStatusSchema,
  approval: DialogueApprovalSchema,
  review_state: DialogueReviewStateSchema,
  /** Previous text when a script change edited an annotated/approved line (for review). */
  previous_text: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type DialogueLine = z.infer<typeof DialogueLineSchema>;

export const UpdateDialogueLineInputSchema = z
  .object({
    intention: z.string().trim().max(200).nullable().optional(),
    subtext: z.string().trim().max(2000).nullable().optional(),
    emotion: DialogueEmotionSchema.nullable().optional(),
    intensity: z.number().int().min(0).max(10).nullable().optional(),
    notes: z.string().trim().max(4000).nullable().optional(),
    approval: DialogueApprovalSchema.optional(),
    /** Clear a review flag after checking a changed line. */
    acknowledge_review: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");
export type UpdateDialogueLineInput = z.infer<typeof UpdateDialogueLineInputSchema>;
