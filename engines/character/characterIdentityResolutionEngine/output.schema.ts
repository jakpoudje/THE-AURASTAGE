import { z } from "zod";
import { CharacterCandidateSchema } from "../characterCandidateExtractionEngine/output.schema";

export const ResolutionSchema = z.object({
  candidate: CharacterCandidateSchema,
  /** match: same identity as an existing character. create: new canonical character. confirm: needs a person. */
  decision: z.enum(["match", "create", "confirm"]),
  character_id: z.string().uuid().nullable(),
  via: z.enum(["name", "alias", "none"]),
});
export type Resolution = z.infer<typeof ResolutionSchema>;

export const IdentityResolutionOutputSchema = z.object({
  resolutions: z.array(ResolutionSchema),
  engine_version: z.string(),
});
export type IdentityResolutionOutput = z.infer<typeof IdentityResolutionOutputSchema>;
