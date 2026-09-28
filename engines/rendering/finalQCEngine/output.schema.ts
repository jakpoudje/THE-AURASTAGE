import { z } from "zod";
import { DeliveryQCCheckSchema } from "@aurastage/contracts";

export const FinalQCOutputSchema = z.object({ checks: z.array(DeliveryQCCheckSchema), passed: z.boolean(), engine_version: z.string() });
export type FinalQCOutput = z.infer<typeof FinalQCOutputSchema>;
