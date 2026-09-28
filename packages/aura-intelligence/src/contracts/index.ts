import { z } from "zod";

/** The workspaces the assistant can act in — the same modules the permission gate uses (migration 0019). */
export const ASSISTANT_MODULES = ["script", "casting", "dialogue", "scene_dna", "shots", "generation", "audio", "editorial", "delivery", "assets", "settings"] as const;
export const AssistantModuleSchema = z.enum(ASSISTANT_MODULES);
export type AssistantModule = z.infer<typeof AssistantModuleSchema>;

export const ObjectRefSchema = z.object({
  type: z.enum(["project", "scene", "character", "dialogue_line", "shot", "take", "audio_session", "timeline", "asset"]),
  id: z.string().uuid(),
  /** The exact version the context was read at (rule 10). */
  version: z.string().max(80).nullable().default(null),
  label: z.string().max(200).default(""),
});
export type ObjectRef = z.infer<typeof ObjectRefSchema>;

export const AssistantRequestSchema = z.object({
  project_id: z.string().uuid(),
  module: AssistantModuleSchema,
  object: ObjectRefSchema.nullable().default(null),
  text: z.string().trim().min(3, "Tell AuraStage what you'd like to change").max(4000),
  /** assist = explain/answer, suggest = propose changes (default), generate = also queue generation. */
  mode: z.enum(["assist", "suggest", "generate"]).default("suggest"),
}).strict();
export type AssistantRequest = z.infer<typeof AssistantRequestSchema>;

export const OPERATIONS = [
  "UPDATE_STORY", "MODIFY_SCENE", "MODIFY_CHARACTER", "CHANGE_WARDROBE", "MODIFY_DIALOGUE", "MODIFY_SHOT",
  "GENERATE_MEDIA", "EDIT_TIMELINE", "EXPORT", "QUESTION", "UNSUPPORTED",
] as const;
export const OperationSchema = z.enum(OPERATIONS);
export type Operation = z.infer<typeof OperationSchema>;

export const IntentSchema = z.object({
  operation: OperationSchema,
  modules: z.array(AssistantModuleSchema).max(8),
  /** Names or references the request mentions (characters, scenes, shots). */
  mentions: z.array(z.string().max(120)).max(20),
  confidence: z.number().min(0).max(1),
}).strict();
export type Intent = z.infer<typeof IntentSchema>;

/** One relevant production object, with its canonical id and the version it was read at. */
export const ContextItemSchema = z.object({
  ref: ObjectRefSchema,
  /** Only the fields that matter for this request. */
  data: z.record(z.unknown()),
});
export type ContextItem = z.infer<typeof ContextItemSchema>;
export const ContextBundleSchema = z.object({
  project: z.object({ id: z.string().uuid(), title: z.string(), genre: z.string().nullable(), tone: z.string().nullable() }),
  module: AssistantModuleSchema,
  focus: ObjectRefSchema.nullable(),
  items: z.array(ContextItemSchema).max(60),
});
export type ContextBundle = z.infer<typeof ContextBundleSchema>;

/**
 * What a reasoning backend must return. Static on purpose (structured outputs need one schema): each call carries its
 * input as a JSON string that is validated against that tool's own schema before anything is shown.
 */
export const PlannedCallSchema = z.object({
  tool: z.string().max(60),
  input_json: z.string().max(20000),
  reason: z.string().max(400),
}).strict();
export const PlanSchema = z.object({
  summary: z.string().max(600),
  operation: OperationSchema,
  calls: z.array(PlannedCallSchema).max(12),
  /** Parts of the request no tool can do yet — shown, never silently dropped. */
  not_possible: z.array(z.string().max(300)).max(10),
  /** Questions for the user when the request is ambiguous. */
  questions: z.array(z.string().max(300)).max(5),
}).strict();
export type Plan = z.infer<typeof PlanSchema>;

export const PROPOSAL_STATUSES = ["queued", "planning", "proposed", "applying", "applied", "rejected", "failed"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];
