// apps/api/src/modules/generation/generation.mapper.ts
import { TakeSchema } from "@aurastage/contracts";

type Row = Record<string, any>;
export const toTakeDTO = (row: Row, mediaUrl: string | null) =>
  TakeSchema.parse({
    ...row,
    seed: row.seed === null || row.seed === undefined ? null : Number(row.seed),
    cost_actual: row.cost_actual === null || row.cost_actual === undefined ? null : Number(row.cost_actual),
    media_url: mediaUrl,
  });
