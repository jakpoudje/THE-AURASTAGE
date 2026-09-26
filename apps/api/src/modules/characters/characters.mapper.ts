// apps/api/src/modules/characters/characters.mapper.ts
import { CharacterAliasSchema, CharacterAppearanceSchema, CharacterSchema } from "@aurastage/contracts";

export const toCharacterDTO = (row: unknown) => CharacterSchema.parse(row);
export const toAliasDTO = (row: unknown) => CharacterAliasSchema.parse(row);
export const toAppearanceDTO = (row: Record<string, unknown>) =>
  CharacterAppearanceSchema.parse({ ...row, confidence: Number(row.confidence) });
