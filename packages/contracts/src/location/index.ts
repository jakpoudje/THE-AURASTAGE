import { z } from "zod";

// Location Intelligence (owner specification 2026-09-29; docs/architecture/LOCATION_INTELLIGENCE.md). Forward-compatible
// contracts only: nothing reads or writes these yet. Location DNA EXTENDS the canonical `locations` record (migration
// 0028); Scene Location State is the place at a story moment; media are Assets Library ids, never copies.

/** Is the place real, and how sure are we? Never invented when evidence is ambiguous. */
export const LocationKindSchema = z.enum([
  "REAL_WORLD_VERIFIED", "REAL_WORLD_PROBABLE", "REGIONAL_CONTEXT", "FICTIONAL", "PRODUCTION_SET", "AMBIGUOUS", "REQUIRES_CONFIRMATION",
]);
export type LocationKind = z.infer<typeof LocationKindSchema>;
export const LocationVerificationSchema = z.enum(["VERIFIED", "HIGH_CONFIDENCE", "PROBABLE", "REGIONAL_ONLY", "FICTIONAL", "AMBIGUOUS", "REQUIRES_CONFIRMATION"]);
export type LocationVerification = z.infer<typeof LocationVerificationSchema>;

/** Where a reference came from and what it may be used for (no third-party imagery stored without a permitting licence). */
export const ReferenceProvenanceSchema = z.object({
  source: z.string(), provider: z.string().nullable().default(null), identifier: z.string().nullable().default(null),
  license: z.string().nullable().default(null), permitted_usage: z.array(z.string()).default([]),
  acquired_at: z.string().nullable().default(null), reference_date: z.string().nullable().default(null),
  restrictions: z.array(z.string()).default([]), expires_at: z.string().nullable().default(null),
  ai_generated: z.boolean().default(false), derived_from_asset_ids: z.array(z.string().uuid()).default([]),
});
export type ReferenceProvenance = z.infer<typeof ReferenceProvenanceSchema>;

/** Structured spatial relationship ("sofa opposite tv", "kitchen behind camera-left"); richer forms attach as assets later. */
export const SpatialRelationSchema = z.object({ subject: z.string(), relation: z.string(), object: z.string(), evidence: z.string().default("") });
/** Later representations (depth, floor plan, 3D, photogrammetry, splats, NeRF, scans, camera tracking) — asset ids, typed. */
export const SpatialRepresentationSchema = z.object({
  kind: z.enum(["floor_plan", "depth_map", "mesh_3d", "photogrammetry", "gaussian_splat", "radiance_field", "set_scan", "camera_track"]),
  asset_id: z.string().uuid(), version: z.number().int().default(1),
});

/** What / where the place is. Extends `locations`; versioned and approved. */
export const LocationDnaSchema = z.object({
  location_id: z.string().uuid(),
  project_id: z.string().uuid(),
  version: z.number().int().min(1),
  approval_status: z.enum(["candidate", "approved", "superseded"]),
  canonical_name: z.string(),
  aliases: z.array(z.string()).default([]),
  location_type: LocationKindSchema,
  verification_status: LocationVerificationSchema,
  confidence: z.number().min(0).max(1).nullable().default(null),
  geography: z.object({
    country: z.string().nullable().default(null), region: z.string().nullable().default(null), city: z.string().nullable().default(null),
    district: z.string().nullable().default(null), address: z.string().nullable().default(null),
    coordinates: z.object({ lat: z.number(), lng: z.number() }).nullable().default(null),
  }).default({}),
  parent_location_id: z.string().uuid().nullable().default(null),
  child_location_ids: z.array(z.string().uuid()).default([]),
  /** Free-form but named facets (architecture, materials, skyline, signage, vegetation, water, street furniture…). */
  characteristics: z.record(z.string()).default({}),
  landmark_features: z.array(z.string()).default([]),
  entrances: z.array(z.string()).default([]),
  exits: z.array(z.string()).default([]),
  spatial_relations: z.array(SpatialRelationSchema).default([]),
  spatial_representations: z.array(SpatialRepresentationSchema).default([]),
  camera_zones: z.array(z.string()).default([]),
  screen_direction_anchors: z.array(z.string()).default([]),
  day_characteristics: z.string().nullable().default(null),
  night_characteristics: z.string().nullable().default(null),
  ambient_sound: z.array(z.string()).default([]),
  approved_reference_asset_ids: z.array(z.string().uuid()).default([]),
  spatial_reference_asset_ids: z.array(z.string().uuid()).default([]),
  environment_reference_asset_ids: z.array(z.string().uuid()).default([]),
  provenance: z.array(ReferenceProvenanceSchema).default([]),
});
export type LocationDna = z.infer<typeof LocationDnaSchema>;

/** The same place at a story moment (Scene DNA references it; it never copies location truth). */
export const SceneLocationStateSchema = z.object({
  id: z.string().uuid(),
  location_id: z.string().uuid(),
  location_dna_version: z.number().int().min(1),
  label: z.string(),
  story_time: z.string().nullable().default(null),
  time_of_day: z.string().nullable().default(null),
  weather: z.string().nullable().default(null),
  season: z.string().nullable().default(null),
  lighting: z.string().nullable().default(null),
  condition: z.string().nullable().default(null),
  crowd: z.string().nullable().default(null),
  traffic: z.string().nullable().default(null),
  prop_ids: z.array(z.string().uuid()).default([]),
  continuity_locks: z.array(z.string()).default([]),
  previous_state_id: z.string().uuid().nullable().default(null),
});
export type SceneLocationState = z.infer<typeof SceneLocationStateSchema>;

/** Geography of one shot (extends Shot DNA later). */
export const ShotGeographySchema = z.object({
  location_id: z.string().uuid().nullable().default(null),
  scene_location_state_id: z.string().uuid().nullable().default(null),
  camera_zone: z.string().nullable().default(null),
  camera_position: z.string().nullable().default(null),
  camera_direction: z.string().nullable().default(null),
  subject_positions: z.record(z.string()).default({}),
  landmark_orientation: z.string().nullable().default(null),
  screen_direction: z.enum(["left_to_right", "right_to_left", "toward_camera", "away_from_camera", "static"]).nullable().default(null),
  entry_exit_relationship: z.string().nullable().default(null),
  spatial_anchor_ids: z.array(z.string()).default([]),
  location_reference_ids: z.array(z.string().uuid()).default([]),
});
export type ShotGeography = z.infer<typeof ShotGeographySchema>;

/** A place a provider found (test, the World Library, or an external geographic/reference service). */
export const LocationCandidateSchema = z.object({
  provider: z.string(), provider_ref: z.string(), name: z.string(), kind: LocationKindSchema, confidence: z.number().min(0).max(1),
  hierarchy: z.array(z.string()).default([]), test_data: z.boolean().default(false),
});
export type LocationCandidate = z.infer<typeof LocationCandidateSchema>;
export const LocationReferenceCandidateSchema = z.object({
  provider: z.string(), provider_ref: z.string(), view: z.string(), url: z.string().nullable().default(null), provenance: ReferenceProvenanceSchema,
});
export type LocationReferenceCandidate = z.infer<typeof LocationReferenceCandidateSchema>;

/** Provider-neutral interface (implemented in the Provider Gateway: test / local World Library / external, later). */
export interface LocationDataProvider {
  id: string;
  test_data: boolean;
  searchLocation(query: string, context?: { country?: string; city?: string }): Promise<LocationCandidate[]>;
  resolveLocation(candidate: LocationCandidate): Promise<Partial<LocationDna>>;
  getGeographicMetadata(candidate: LocationCandidate): Promise<LocationDna["geography"]>;
  getReferenceCandidates(candidate: LocationCandidate, views: string[]): Promise<LocationReferenceCandidate[]>;
  getSpatialMetadata(candidate: LocationCandidate): Promise<z.infer<typeof SpatialRelationSchema>[]>;
  getLicenseMetadata(ref: LocationReferenceCandidate): Promise<ReferenceProvenance>;
}
