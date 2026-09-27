// apps/api/src/modules/characters/characters.validator.ts
// Business invariants / input validation.
// Domain: Casting & Characters

import {
  AddAliasInputSchema,
  CreateCharacterInputSchema,
  SaveWardrobeLookInputSchema,
  SetRelationshipInputSchema,
  MergeCharactersInputSchema,
  SyncCharactersInputSchema,
  UpdateCharacterInputSchema,
} from "@aurastage/contracts";
import type { z } from "zod";

export class CharacterValidationError extends Error {
  code = "AURA-CHR-002";
  constructor(public issues: unknown, message = "Invalid character input") {
    super(message);
  }
}
export class CharacterConflictError extends Error {
  code = "AURA-CHR-409";
}
export class CharacterNotFoundError extends Error {
  code = "AURA-CHR-404";
}
export class ScriptNotApprovedError extends Error {
  code = "AURA-CHR-412";
  constructor() {
    super("Approve the script in Scriptwriter first — characters are built from the approved script.");
  }
}

function parse<T extends z.ZodTypeAny>(schema: T, payload: unknown): z.infer<T> {
  const r = schema.safeParse(payload ?? {});
  if (!r.success) throw new CharacterValidationError(r.error.issues);
  return r.data;
}

export const validateSyncInput = (p: unknown) => parse(SyncCharactersInputSchema, p);
export const validateMergeInput = (p: unknown) => parse(MergeCharactersInputSchema, p);
export const validateAliasInput = (p: unknown) => parse(AddAliasInputSchema, p);
export function validateUpdateInput(p: unknown) {
  const data = parse(UpdateCharacterInputSchema, p);
  if (Object.keys(data).length === 0) throw new CharacterValidationError([], "Nothing to update");
  return data;
}
export const validateCreateInput = (p: unknown) => parse(CreateCharacterInputSchema, p);
export const validateRelationshipInput = (p: unknown) => parse(SetRelationshipInputSchema, p);
export const validateLookInput = (p: unknown) => parse(SaveWardrobeLookInputSchema, p);
