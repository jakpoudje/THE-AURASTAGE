import { z } from "zod";

// Canonical owner: Casting (see docs/architecture/DATA_AUTHORITY.md).
// Character = enduring identity (SRS §6.3). Story-time state (CharacterState)
// arrives with Scene DNA; Scene DNA selects a state, it never redefines identity.

export const CharacterRoleSchema = z.enum(["lead", "supporting", "minor", "extra"]);
export type CharacterRole = z.infer<typeof CharacterRoleSchema>;

export const CharacterKindSchema = z.enum(["individual", "group"]);
export type CharacterKind = z.infer<typeof CharacterKindSchema>;

export const CharacterStatusSchema = z.enum(["draft", "approved"]);
export type CharacterStatus = z.infer<typeof CharacterStatusSchema>;

/** Free-text profile fields a person edits in Casting (UI_REFERENCE §4 profile + personality tabs). */
export const CharacterProfileFieldsSchema = z.object({
  age: z.string().max(40).nullable().optional(),
  gender: z.string().max(60).nullable().optional(),
  nationality: z.string().max(100).nullable().optional(),
  occupation: z.string().max(150).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  personality: z.string().max(4000).nullable().optional(),
  backstory: z.string().max(8000).nullable().optional(),
  motivation: z.string().max(2000).nullable().optional(),
  fears: z.string().max(2000).nullable().optional(),
  strengths: z.string().max(2000).nullable().optional(),
  weaknesses: z.string().max(2000).nullable().optional(),
  arc: z.string().max(4000).nullable().optional(),
});

export const CharacterSchema = CharacterProfileFieldsSchema.extend({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  project_id: z.string().uuid(),
  name: z.string().min(1),
  role: CharacterRoleSchema,
  kind: CharacterKindSchema,
  status: CharacterStatusSchema,
  merged_into: z.string().uuid().nullable(),
  created_from_version_id: z.string().uuid().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Character = z.infer<typeof CharacterSchema>;

export const CharacterAliasSchema = z.object({
  id: z.string().uuid(),
  character_id: z.string().uuid(),
  alias: z.string(),
  normalized: z.string(),
  source: z.enum(["name", "script", "user", "merge"]),
});
export type CharacterAlias = z.infer<typeof CharacterAliasSchema>;

export const PresenceEvidenceSchema = z.object({
  /** cue = speaks (hard evidence); introduction = CAPS name with age in action; mention = named in action. */
  type: z.enum(["cue", "introduction", "mention"]),
  line: z.number().int().positive(),
  text: z.string(),
});
export type PresenceEvidence = z.infer<typeof PresenceEvidenceSchema>;

export const CharacterAppearanceSchema = z.object({
  id: z.string().uuid(),
  character_id: z.string().uuid(),
  scene_id: z.string().uuid(),
  scene_number: z.number().int().positive(),
  source_version_id: z.string().uuid(),
  speaking: z.boolean(),
  voice_only: z.boolean(),
  line_count: z.number().int().nonnegative(),
  confidence: z.number().min(0).max(1),
  evidence: z.array(PresenceEvidenceSchema),
});
export type CharacterAppearance = z.infer<typeof CharacterAppearanceSchema>;

export const UpdateCharacterInputSchema = CharacterProfileFieldsSchema.extend({
  name: z.string().trim().min(1).max(120).optional(),
  role: CharacterRoleSchema.optional(),
  kind: CharacterKindSchema.optional(),
  status: CharacterStatusSchema.optional(),
});
export type UpdateCharacterInput = z.infer<typeof UpdateCharacterInputSchema>;

export const SyncCharactersInputSchema = z.object({
  /** Candidate keys the user confirmed from the "needs confirmation" list. */
  confirm: z.array(z.string()).max(500).default([]),
});
export type SyncCharactersInput = z.infer<typeof SyncCharactersInputSchema>;

export const MergeCharactersInputSchema = z.object({
  source_id: z.string().uuid(),
  target_id: z.string().uuid(),
});
export type MergeCharactersInput = z.infer<typeof MergeCharactersInputSchema>;

export const AddAliasInputSchema = z.object({
  alias: z.string().trim().min(1).max(120),
});
export type AddAliasInput = z.infer<typeof AddAliasInputSchema>;

/** Normalised form used for identity matching everywhere (engines, DB unique index, API). */
export function normalizeCharacterName(name: string): string {
  return name
    .toUpperCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[.'’"]/g, "")
    .replace(/[^\p{L}\p{N}#&\- ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
