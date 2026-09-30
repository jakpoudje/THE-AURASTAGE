import { z } from "zod";

/** The workspaces the assistant can act in — the same modules the permission gate uses (migration 0019). */
export const ASSISTANT_MODULES = ["script", "casting", "dialogue", "scene_dna", "shots", "generation", "audio", "editorial", "delivery", "assets", "settings"] as const;
export const AssistantModuleSchema = z.enum(ASSISTANT_MODULES);
export type AssistantModule = z.infer<typeof AssistantModuleSchema>;

export const ObjectRefSchema = z.object({
  type: z.enum(["project", "scene", "character", "dialogue_line", "shot", "take", "audio_session", "timeline", "asset", "location", "prop", "settings", "audio_track", "timeline_clip"]),
  id: z.string().uuid(),
  /** The exact version the context was read at (rule 10). */
  version: z.string().max(80).nullable().default(null),
  label: z.string().max(200).default(""),
});
export type ObjectRef = z.infer<typeof ObjectRefSchema>;

/** One-click fills the built-in story intelligence does for free (only EMPTY fields; a suggestion to review, undoable). */
export const BUILTIN_TASKS = [
  "develop_character", "develop_cast", "annotate_scene", "fill_scene_overview", "fill_visual_sound", "fill_continuity", "fill_scene", "describe_world",
  // Whole film (downstream pages): every scene's DNA, every spoken line — in batches of up to 250 changes.
  "fill_all_scene_dna", "annotate_all_lines",
  // Every other page: the story setup (Scriptwriter), Project Settings, every location and prop.
  "fill_story", "fill_settings", "describe_all_world",
] as const;
export type BuiltinTask = (typeof BUILTIN_TASKS)[number];

export const AssistantRequestSchema = z.object({
  project_id: z.string().uuid(),
  module: AssistantModuleSchema,
  object: ObjectRefSchema.nullable().default(null),
  text: z.string().trim().min(3, "Tell AuraStage what you'd like to change").max(4000),
  /** assist = explain/answer, suggest = propose changes (default), generate = also queue generation. */
  mode: z.enum(["assist", "suggest", "generate"]).default("suggest"),
  /**
   * Who plans it (owner, 2026-09-30: "only generation through a third party should cost money"): "builtin" = AuraStage's
   * own story-intelligence engines, free (the default); "writer" = a connected paid model (Claude…), only when asked.
   */
  planner: z.enum(["builtin", "writer"]).default("builtin"),
  /** A page's one-click fill, so the built-in engines know exactly what to fill (no guessing from the words). */
  task: z.enum(BUILTIN_TASKS).nullable().default(null),
}).strict();
export type AssistantRequest = z.infer<typeof AssistantRequestSchema>;

export const OPERATIONS = [
  "UPDATE_STORY", "MODIFY_SCENE", "MODIFY_CHARACTER", "CHANGE_WARDROBE", "MODIFY_DIALOGUE", "MODIFY_SHOT", "MODIFY_WORLD", "UPDATE_SETTINGS", "MIX_AUDIO", "ORGANISE_ASSETS",
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
  // A paid model sees at most CONTEXT_LIMITS.items; the built-in engines read the whole cast or scene.
  items: z.array(ContextItemSchema).max(5000),
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
  /** Up to 40 changes, so a whole scene (every line + its Scene DNA) can be annotated in one pass. */
  // A paid model is asked for up to 40 calls; the built-in engines can fill a whole cast or scene in one plan.
  calls: z.array(PlannedCallSchema).max(250),
  /** Parts of the request no tool can do yet — shown, never silently dropped. */
  not_possible: z.array(z.string().max(300)).max(10),
  /** Questions for the user when the request is ambiguous. */
  questions: z.array(z.string().max(300)).max(5),
}).strict();
export type Plan = z.infer<typeof PlanSchema>;

export const PROPOSAL_STATUSES = ["queued", "planning", "proposed", "applying", "applied", "rejected", "failed", "undone"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];
