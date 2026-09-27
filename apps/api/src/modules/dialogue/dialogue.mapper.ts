// apps/api/src/modules/dialogue/dialogue.mapper.ts
import { DialogueLineSchema } from "@aurastage/contracts";

export const toLineDTO = (row: Record<string, unknown>) =>
  DialogueLineSchema.parse({ ...row, estimated_seconds: Number(row.estimated_seconds) });
