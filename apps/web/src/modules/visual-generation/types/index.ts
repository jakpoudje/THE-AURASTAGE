import type { GenerationPackageContent, ProviderStatus, Take } from "@aurastage/contracts";

export interface VisualShot {
  shot: {
    id: string; ordinal: number; purpose: string; size: string; angle: string; movement: string; lens_mm: number | null; focus: string;
    duration_seconds: number; description: string; composition: string | null; character_ids: string[]; dialogue_line_ids: string[];
  };
  package: { id: string; content: GenerationPackageContent; review_state: "current" | "review_required" | "stale"; review_reason: string | null; engine_version: string; created_at: string } | null;
  takes: Take[];
  approved_take_id: string | null;
}

/** Response of GET /api/projects/:id/visual (apps/api/src/modules/generation). */
export interface VisualWorkspace {
  providers: ProviderStatus[];
  media_ready: boolean;
  queue: { waiting: number; running: number };
  scenes: {
    scene: { id: string; number: number; heading: string };
    plan: { id: string; version_number: number; usable: boolean; status: string; review_state: string; review_reason: string | null };
    shots: VisualShot[];
  }[];
  summary: { scenes: number; shots: number; with_approved_take: number; takes: number };
}
