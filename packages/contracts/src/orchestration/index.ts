import { z } from "zod";

// Canonical owner: MOS (Module Orchestration System) — see SRS §14 and
// engines/orchestration. Coordinator, not source of truth: dependency/
// readiness evaluation, jobs, retries, idempotency, invalidation.

export const JobStatusSchema = z.enum([
  "queued",
  "running",
  "waiting",
  "completed",
  "failed",
  "cancelled",
]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const JobSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  project_id: z.string().uuid().nullable(),
  engine_id: z.string(),
  engine_version: z.string(),
  idempotency_key: z.string().nullable().optional(),
  status: JobStatusSchema,
  input_snapshot: z.record(z.unknown()),
  output_refs: z.record(z.unknown()),
  error: z.record(z.unknown()).nullable().optional(),
  attempt: z.number().int().nonnegative(),
  provider_request_id: z.string().nullable().optional(),
  cost_estimated: z.number().nullable().optional(),
  cost_actual: z.number().nullable().optional(),
  created_at: z.string(),
  started_at: z.string().nullable().optional(),
  completed_at: z.string().nullable().optional(),
});
export type Job = z.infer<typeof JobSchema>;
