import { GenerationPackageContentSchema } from "@aurastage/contracts";
import { z } from "zod";

export const PromptCompilerOutputSchema = z.object({ package: GenerationPackageContentSchema, engine_version: z.string() });
export type PromptCompilerOutput = z.infer<typeof PromptCompilerOutputSchema>;
