// Thin client for production runs (migration 0056) and each area's progress endpoint. No logic here.
import type { ProductionRun, RunKind } from "@aurastage/contracts";
import { apiGet, apiPost } from "@/lib/apiClient";

export type Area = "audio" | "visual" | "storyboard";
export interface SceneProgress {
  scene_id: string; number: number; heading: string; stage: string; label: string; pct: number;
  counts: Record<string, number>;
}
export interface AreaProgress {
  scenes: SceneProgress[];
  totals: Record<string, number>;
  generator: { queued: number; running: number; run_queue: number };
  at: string;
}
export const runsApi = {
  list: (projectId: string) => apiGet<{ runs: ProductionRun[]; active: Record<Area, ProductionRun | null> }>(`/api/projects/${projectId}/runs`),
  start: (projectId: string, kind: RunKind, sceneId: string | null = null, style?: string) =>
    apiPost<{ run: ProductionRun; joined: boolean }>(`/api/projects/${projectId}/runs`, { kind, ...(sceneId ? { scene_id: sceneId } : {}), ...(style ? { style } : {}) }),
  step: (runId: string) => apiPost<{ run: ProductionRun; driving: boolean; wait_ms: number }>(`/api/runs/${runId}/step`, {}),
  control: (runId: string, action: "pause" | "resume" | "stop") => apiPost<{ run: ProductionRun }>(`/api/runs/${runId}/control`, { action }),
  progress: (projectId: string, area: Area) => apiGet<AreaProgress>(`/api/projects/${projectId}/${area}/progress`),
};
