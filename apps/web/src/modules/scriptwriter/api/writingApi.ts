// AuraScript API (apps/api/src/modules/screenplay/screenplay.writing.ts). No logic here.
import { apiGet, apiPost } from "@/lib/apiClient";

export type WritingKind = "develop_story" | "outline" | "write_script" | "rewrite_scene";
export type RewriteMode = "improve" | "expand" | "rephrase" | "condense" | "dialogue" | "new_scene";
export interface WritingCheck { id: string; ok: boolean; label: string; evidence: string }
export interface OutlineScene { number: number; int_ext: "INT" | "EXT" | "INT/EXT"; location: string; time_of_day: string; purpose: string; beat: string; summary: string; characters: string[]; est_minutes: number }
export interface WritingResult {
  id: string; kind: WritingKind; parent_id: string | null; request: string; source: "model" | "user"; status: "queued" | "running" | "succeeded" | "failed";
  progress: { done?: number; total?: number; batches_done?: number; batches?: number }; output: any; checks: WritingCheck[];
  provider: string | null; model: string | null; test_output: boolean | null; error: string | null;
  base_version_id: string | null; result_version_id: string | null; accepted: { fields?: string[] } | null;
  scene?: { number: number | null; mode: RewriteMode | null; before_text: string };
  created_at: string; completed_at: string | null;
}
export interface ContinuityFinding { id: string; severity: "warning" | "info"; scene_number: number | null; line: number; message: string }

export const writingApi = {
  list: (projectId: string) => apiGet<{ writer: { id: string; name: string; test_output: boolean } | null; results: WritingResult[] }>(`/api/projects/${projectId}/script/writing`),
  request: (projectId: string, body: { kind: WritingKind; request?: string; parent_id?: string | null; scene?: { mode: RewriteMode; number: number; instruction?: string } }) =>
    apiPost<WritingResult>(`/api/projects/${projectId}/script/writing`, body),
  saveOutline: (projectId: string, parentId: string | null, scenes: OutlineScene[]) =>
    apiPost<WritingResult>(`/api/projects/${projectId}/script/writing/outline`, { parent_id: parentId, scenes }),
  applyStory: (id: string, fields: string[], title?: string) => apiPost<{ applied: string[] }>(`/api/script-writing/${id}/apply-story`, { fields, ...(title ? { title } : {}) }),
  openDraft: (id: string, baseVersionId: string | null) => apiPost<{ version: { id: string; version_number: number } }>(`/api/script-writing/${id}/open-draft`, { base_version_id: baseVersionId }),
  continuity: (projectId: string) => apiGet<{ version_number: number; findings: ContinuityFinding[]; summary: { warnings: number; notes: number; scenes: number } }>(`/api/projects/${projectId}/script/continuity`),
};
