import { z } from "zod";
export const KnowledgeQuerySchema = z.object({
  query: z.string().max(500),
  /** The workspace the person is in; its guides rank first on ties. */
  module: z.string().nullable().default(null),
  limit: z.number().int().min(1).max(10).default(3),
});
export type KnowledgeQuery = z.input<typeof KnowledgeQuerySchema>;
