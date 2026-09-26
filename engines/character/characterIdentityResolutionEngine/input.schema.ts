import { z } from "zod";
import { CharacterCandidateSchema } from "../characterCandidateExtractionEngine/output.schema";

export const ExistingCharacterSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  merged_into: z.string().uuid().nullable(),
  /** Normalised aliases (including the name itself). */
  aliases: z.array(z.string()),
});

export const IdentityResolutionInputSchema = z.object({
  candidates: z.array(CharacterCandidateSchema),
  existing: z.array(ExistingCharacterSchema),
  /** Candidate keys a person explicitly confirmed. */
  confirmed_keys: z.array(z.string()).default([]),
});
export type IdentityResolutionInput = z.input<typeof IdentityResolutionInputSchema>;
