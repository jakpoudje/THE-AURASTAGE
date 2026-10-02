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
  /** How the character speaks (e.g. "Lagos Nigerian English"), chosen by the writer; suggested from the story, never from a name. */
  accent: z.string().max(120).nullable().optional(),
  /** Languages the character speaks, most used first (e.g. "English, Yoruba, Nigerian Pidgin"). */
  languages: z.string().max(200).nullable().optional(),
  /** How the name is said, as a sound-it-out spelling ("ah-deh-bah-yoh") the voices read instead of the written name. */
  pronunciation: z.string().max(200).nullable().optional(),
  occupation: z.string().max(150).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  /** Physicality & mannerisms (migration 0051): posture, gait, gestures, habits — used in every shot the character is in. */
  physicality: z.string().max(2000).nullable().optional(),
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

// ---- Phase 3 part 2: manual characters, relationships, wardrobe looks ----

export const CreateCharacterInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  role: CharacterRoleSchema.default("minor"),
  kind: CharacterKindSchema.default("individual"),
});
export type CreateCharacterInput = z.infer<typeof CreateCharacterInputSchema>;

/** Undirected: stored with character_a < character_b. */
export const CharacterRelationshipSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  character_a: z.string().uuid(),
  character_b: z.string().uuid(),
  relationship: z.string(),
  description: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type CharacterRelationship = z.infer<typeof CharacterRelationshipSchema>;

export const SetRelationshipInputSchema = z.object({
  character_a: z.string().uuid(),
  character_b: z.string().uuid(),
  relationship: z.string().trim().min(1).max(80),
  description: z.string().trim().max(2000).optional(),
});
export type SetRelationshipInput = z.infer<typeof SetRelationshipInputSchema>;

/** SRS §3: WardrobeLook — named character look, canonical owner Casting. */
export const WardrobeLookSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  character_id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type WardrobeLook = z.infer<typeof WardrobeLookSchema>;

export const SaveWardrobeLookInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(2000).optional(),
});
export type SaveWardrobeLookInput = z.infer<typeof SaveWardrobeLookInputSchema>;

/** A character at another point in the story (flashback, time jump), canonical owner Casting (migration 0035). */
export const CharacterAgeStateSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  character_id: z.string().uuid(),
  label: z.string(),
  age: z.string(),
  description: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type CharacterAgeState = z.infer<typeof CharacterAgeStateSchema>;

export const SaveCharacterAgeStateInputSchema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().trim().min(1).max(80),
  age: z.string().trim().min(1).max(40),
  description: z.string().trim().max(2000).optional(),
}).strict();
export type SaveCharacterAgeStateInput = z.infer<typeof SaveCharacterAgeStateInputSchema>;
