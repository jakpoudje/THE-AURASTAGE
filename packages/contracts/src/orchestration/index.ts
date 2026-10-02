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

// ---- Production runs (migration 0056, owner request 2026-10-02) ----
// A whole-film (or one-scene) job in Audio Studio or Visual Generation, worked through in short rounds and shared with
// the team. Progress per scene is read from the records by each area's progress endpoint, never stored as a guess.
export const RUN_KINDS = ["audio.film", "audio.spot", "audio.generate", "audio.place", "visual.film", "visual.compile", "visual.sketch", "visual.approve"] as const;
export const RunKindSchema = z.enum(RUN_KINDS);
export type RunKind = z.infer<typeof RunKindSchema>;
/** The steps each kind goes through, in order (`phase` names one of them). */
export const RUN_PHASES: Record<RunKind, readonly string[]> = {
  "audio.film": ["spot", "generate", "finish"],
  "audio.spot": ["spot"],
  "audio.generate": ["generate"],
  "audio.place": ["place"],
  "visual.film": ["compile", "make", "finish"],
  "visual.compile": ["compile"],
  "visual.sketch": ["sketch"],
  "visual.approve": ["approve"],
};
export const StartRunSchema = z.object({ kind: RunKindSchema, scene_id: z.string().uuid().nullable().optional() }).strict();
export const ControlRunSchema = z.object({ action: z.enum(["pause", "resume", "stop"]) }).strict();
export const RunStatusSchema = z.enum(["running", "paused", "completed", "cancelled", "failed"]);
export const ProductionRunSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  area: z.enum(["audio", "visual"]),
  kind: RunKindSchema,
  scene_id: z.string().uuid().nullable(),
  status: RunStatusSchema,
  phase: z.string(),
  message: z.string().nullable(),
  progress: z.record(z.unknown()),
  log: z.array(z.object({ at: z.string(), text: z.string() })),
  rounds: z.number().int(),
  started_by_label: z.string().nullable(),
  started_at: z.string(),
  updated_at: z.string(),
  finished_at: z.string().nullable(),
  /** Running, but no page has carried it on for a while (everyone closed it): the next page that opens continues it. */
  idle: z.boolean(),
});
export type ProductionRun = z.infer<typeof ProductionRunSchema>;
