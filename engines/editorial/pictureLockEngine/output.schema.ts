import { z } from "zod";
import { PictureImpactSchema } from "@aurastage/contracts";

export const PictureLockOutputSchema = z.object({ changed: z.boolean(), impact: z.array(PictureImpactSchema), engine_version: z.string() });
export type PictureLockOutput = z.infer<typeof PictureLockOutputSchema>;
