import { EdlExportInputSchema } from "./input.schema";

export class EdlExportValidationError extends Error {
  code = "AURA-EDT-011";
  constructor(public issues: unknown) {
    super("Invalid EDL input");
  }
}
export function validateEdlExportInput(input: unknown) {
  const r = EdlExportInputSchema.safeParse(input);
  if (!r.success) throw new EdlExportValidationError(r.error.issues);
  return r.data;
}
