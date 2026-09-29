// apps/api/src/modules/characters/characters.mapper.ts
import {
  CharacterAliasSchema,
  CharacterAppearanceSchema,
  CharacterRelationshipSchema,
  CharacterSchema,
  WardrobeLookSchema,
  CharacterAgeStateSchema,
} from "@aurastage/contracts";

export const toCharacterDTO = (row: unknown) => CharacterSchema.parse(row);
export const toAliasDTO = (row: unknown) => CharacterAliasSchema.parse(row);
export const toAppearanceDTO = (row: Record<string, unknown>) =>
  CharacterAppearanceSchema.parse({ ...row, confidence: Number(row.confidence) });
export const toRelationshipDTO = (row: unknown) => CharacterRelationshipSchema.parse(row);
export const toLookDTO = (row: unknown) => WardrobeLookSchema.parse(row);
export const toAgeStateDTO = (row: unknown) => CharacterAgeStateSchema.parse(row);
