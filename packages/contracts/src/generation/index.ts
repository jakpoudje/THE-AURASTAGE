import { z } from "zod";

// Canonical owner: Visual Generation (docs/architecture/DATA_AUTHORITY.md, SRS §10).
// A GenerationPackage is a structured, provider-neutral request compiled from
// approved upstream versions (never prose alone). Each generation creates a
// Take that records provider, model, parameters, seed, cost and source versions.

export const ProviderCapabilitySchema = z.enum(["image", "video"]);
export type ProviderCapability = z.infer<typeof ProviderCapabilitySchema>;

export const ProviderIdSchema = z.enum(["aurastage-sketch", "runway", "openai", "stability", "bfl", "google", "luma", "kling", "minimax"]);
export type ProviderId = z.infer<typeof ProviderIdSchema>;

/** Provider status is evidence, never decoration (CLAUDE.md rule 12). */
export const ProviderStatusSchema = z.object({
  id: ProviderIdSchema,
  name: z.string(),
  capabilities: z.array(ProviderCapabilitySchema),
  /** configured = credentials present on the server; not_configured = nothing to call. */
  state: z.enum(["configured", "not_configured"]),
  /** Last real result from this provider in this project, if any. */
  last_result: z
    .object({ status: z.enum(["succeeded", "failed"]), at: z.string(), message: z.string().nullable() })
    .nullable(),
  note: z.string(),
  models: z.array(z.object({ id: z.string(), capability: ProviderCapabilitySchema, label: z.string() })),
  /** Video only starts from a finished image take (Runway); the others can also work from the prompt alone. */
  video_needs_frame: z.boolean().default(false),
});
export type ProviderStatus = z.infer<typeof ProviderStatusSchema>;

export const AspectRatioSchema = z.enum(["16:9", "9:16", "1:1", "2.39:1", "4:3"]);
export type AspectRatio = z.infer<typeof AspectRatioSchema>;

/** SRS §10 GenerationPackage blocks. Every block cites where it came from. */
export const GenerationPackageContentSchema = z.object({
  project: z.object({
    title: z.string(), genre: z.string().nullable(), tone: z.string().nullable(), setting: z.string().nullable(), time_period: z.string().nullable(),
    /** Project Settings look (promptCompilerEngine ≥ 1.1.0). */
    look: z.string().nullable().optional(),
  }),
  scene: z.object({
    number: z.number().int(),
    heading: z.string(),
    location: z.string(),
    int_ext: z.string(),
    time_of_day: z.string().nullable(),
    purpose: z.string().nullable(),
    mood: z.array(z.string()),
    weather: z.string().nullable(),
    atmosphere: z.string().nullable(),
  }),
  camera: z.object({
    size: z.string(),
    size_label: z.string(),
    angle: z.string(),
    movement: z.string(),
    lens_mm: z.number().nullable(),
    focus: z.string(),
    composition: z.string().nullable(),
    duration_seconds: z.number(),
  }),
  characters: z.array(
    z.object({
      id: z.string(), name: z.string(), description: z.string().nullable(), age: z.string().nullable(), wardrobe: z.string().nullable(),
      gender: z.string().optional(),
      /** The character's age state in this scene (Casting, chosen in Scene DNA; promptCompilerEngine ≥ 1.3.0). */
      age_state: z.object({ id: z.string(), label: z.string(), description: z.string().nullable() }).optional(),
    })
  ),
  performance: z.object({ action: z.string(), dialogue: z.array(z.object({ speaker: z.string(), text: z.string(), emotion: z.string().nullable() })) }),
  lighting: z.string().nullable(),
  technical: z.object({ aspect_ratio: AspectRatioSchema }),
  negative: z.array(z.string()),
  /** Provider-neutral prompt text assembled from the blocks above. */
  prompt: z.string(),
  /** Every exact source version this package was compiled from (CLAUDE.md rule 10). */
  provenance: z.object({
    shot_id: z.string().uuid(),
    shot_plan_version_id: z.string().uuid(),
    scene_dna_version_id: z.string().uuid(),
    script_version_id: z.string().uuid().nullable(),
    character_ids: z.array(z.string().uuid()),
    dialogue_line_ids: z.array(z.string().uuid()),
    /** Project Settings version the look came from (≥ 1.1.0; null when no settings were saved). */
    settings_version: z.number().int().nullable().optional(),
    /** Locations & Props records used, with the revision each was read at (≥ 1.2.0; a later edit flags the package). */
    world_revisions: z.record(z.number().int()).optional(),
  }),
  /** The scene's canonical location and the props it contains (Locations & Props, promptCompilerEngine ≥ 1.2.0). */
  world: z.object({
    location: z.object({ id: z.string().uuid(), name: z.string(), description: z.string(), revision: z.number().int() }).nullable(),
    props: z.array(z.object({ id: z.string().uuid(), name: z.string(), description: z.string(), category: z.string(), revision: z.number().int() })),
  }).optional(),
  /**
   * Reference images a provider can condition on (identity and continuity from the first frame to the last): the
   * characters' approved looks, the location's view for this time of day, the props' hero views (≥ 1.2.0).
   */
  references: z.array(z.object({
    kind: z.enum(["character", "location", "prop"]), object_id: z.string().uuid(), name: z.string(), view: z.string(), asset_id: z.string().uuid(),
  })).optional(),
  /** Boolean checks with evidence shown as badges (never a score). */
  checks: z.array(z.object({ id: z.string(), label: z.string(), ok: z.boolean(), evidence: z.string() })),
});
export type GenerationPackageContent = z.infer<typeof GenerationPackageContentSchema>;

export const TakeStatusSchema = z.enum(["queued", "running", "succeeded", "failed", "cancelled"]);
export const TakeApprovalSchema = z.enum(["pending", "approved", "rejected", "superseded"]);

/** How many variations of a frame can be made at once (owner request 2026-10-01: 2, 4, 6, 8 or 13 to choose from). */
export const TAKE_VARIATION_OPTIONS = [1, 2, 4, 6, 8, 13] as const;

export const RequestTakeInputSchema = z
  .object({
    provider: ProviderIdSchema,
    model: z.string().min(1).max(80),
    capability: ProviderCapabilitySchema.default("image"),
    aspect_ratio: AspectRatioSchema.default("16:9"),
    duration_seconds: z.number().int().min(2).max(10).nullable().default(null),
    variations: z.number().int().refine((n) => (TAKE_VARIATION_OPTIONS as readonly number[]).includes(n), "Choose 1, 2, 4, 6, 8 or 13 variations").default(1),
    seed: z.number().int().min(0).max(4294967295).nullable().default(null),
    /** Optional: the approved image take a video should start from. */
    source_take_id: z.string().uuid().nullable().default(null),
  })
  .strict();
export type RequestTakeInput = z.infer<typeof RequestTakeInputSchema>;

export const TakeSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  shot_id: z.string().uuid(),
  package_id: z.string().uuid(),
  take_number: z.number().int(),
  provider: ProviderIdSchema,
  model: z.string(),
  capability: ProviderCapabilitySchema,
  params: z.record(z.unknown()),
  seed: z.number().nullable(),
  status: TakeStatusSchema,
  approval: TakeApprovalSchema,
  media_type: z.string().nullable(),
  media_url: z.string().nullable(),
  error: z.string().nullable(),
  cost_actual: z.number().nullable(),
  provider_request_id: z.string().nullable(),
  /** The reference images this take sent to the provider (asset + version) and why any were not sent (migration 0034). */
  references_used: z.array(z.object({
    kind: z.enum(["character", "location", "prop"]), object_id: z.string(), name: z.string(), view: z.string(), asset_id: z.string(),
    asset_version: z.number().int().nullable(), sent: z.boolean(), reason: z.string().nullable(),
  })).nullable().optional(),
  created_at: z.string(),
  completed_at: z.string().nullable(),
});
export type Take = z.infer<typeof TakeSchema>;
