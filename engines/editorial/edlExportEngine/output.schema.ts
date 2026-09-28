import { z } from "zod";

export const EdlExportOutputSchema = z.object({ edl: z.string(), events: z.number().int(), engine_version: z.string() });
export type EdlExportOutput = z.infer<typeof EdlExportOutputSchema>;
