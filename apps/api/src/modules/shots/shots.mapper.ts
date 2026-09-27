// apps/api/src/modules/shots/shots.mapper.ts
import { ShotPlanSchema, ShotSchema } from "@aurastage/contracts";

type Row = Record<string, any>;
const num = (x: unknown) => (x === null || x === undefined ? x : Number(x));

export const toShotDTO = (row: Row) =>
  ShotSchema.parse({
    ...row,
    duration_seconds: num(row.duration_seconds),
    story_start: num(row.story_start),
    story_end: num(row.story_end),
    character_ids: row.character_ids ?? [],
    dialogue_line_ids: row.dialogue_line_ids ?? [],
  });

export const toPlanDTO = (row: Row, approvedVersionNumber: number | null) =>
  ShotPlanSchema.parse({ ...row, approved_version_number: approvedVersionNumber });
