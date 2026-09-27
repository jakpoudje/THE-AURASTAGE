// apps/api/src/modules/scene-dna/sceneDna.mapper.ts
// Maps persistence <-> contract DTOs.
import { SceneDnaEditableSchema, SceneDnaRecordSchema } from "@aurastage/contracts";
import type { SceneDnaEditable, SceneDnaRecord } from "@aurastage/contracts";

type Row = Record<string, unknown>;

export const toRecordDTO = (row: Row, approvedVersionNumber: number | null): SceneDnaRecord =>
  SceneDnaRecordSchema.parse({ ...row, approved_version_number: approvedVersionNumber });

/** The editable part of a record, or the empty defaults for a scene nobody has touched yet. */
export const toEditable = (row: Row | undefined): SceneDnaEditable =>
  SceneDnaEditableSchema.parse(
    row
      ? Object.fromEntries(Object.keys(SceneDnaEditableSchema.shape).map((k) => [k, row[k] ?? undefined]))
      : {}
  );
