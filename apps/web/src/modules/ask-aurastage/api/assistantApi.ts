// Ask AuraStage API (apps/api/src/modules/assistant). The browser never talks to a model directly.
import { apiGet, apiPost } from "@/lib/apiClient";

export type AssistantModule = "script" | "casting" | "dialogue" | "scene_dna" | "shots" | "generation" | "audio" | "editorial" | "delivery" | "assets" | "settings";
export type ProposalStatus = "queued" | "planning" | "proposed" | "applying" | "applied" | "rejected" | "failed" | "undone";
export interface PreviewCall {
  index: number; tool: string; reason: string; module: string; action: string; allowed: boolean; impact: string[];
  object: { type: string; id: string; label: string }; before: Record<string, unknown> | null; after: Record<string, unknown>;
  stale: boolean; problem: string | null;
}
export interface Proposal {
  id: string; module: AssistantModule; request: string; status: ProposalStatus;
  provider: string | null; model: string | null; test_output: boolean; error: string | null;
  plan: { summary: string; operation: string; calls: unknown[]; not_possible: string[]; questions: string[] } | null;
  results: { results?: { tool: string; object: { label: string }; before: Record<string, unknown>; applied: Record<string, unknown> }[]; impact?: string[] } | null;
  created_at: string;
  preview?: { calls: PreviewCall[]; issues: { tool: string; problem: string }[]; impact: string[]; can_apply: boolean } | null;
}

export const assistantApi = {
  /** What asking would cost, from the exact prompt (nothing is sent to the AI). */
  estimate: (projectId: string, body: { module: AssistantModule; text: string }) =>
    apiPost<{ provider: string; model: string | null; input_chars: number; output_chars: number }>(`/api/projects/${projectId}/assistant/estimate`, body),
  ask: (projectId: string, body: { module: AssistantModule; text: string }) => apiPost<Proposal>(`/api/projects/${projectId}/assistant`, body),
  list: (projectId: string) => apiGet<{ proposals: Proposal[] }>(`/api/projects/${projectId}/assistant`),
  get: (id: string) => apiGet<Proposal>(`/api/assistant/proposals/${id}`),
  apply: (id: string) => apiPost<Proposal>(`/api/assistant/proposals/${id}/apply`, {}),
  reject: (id: string) => apiPost<Proposal>(`/api/assistant/proposals/${id}/reject`, {}),
  undo: (id: string) => apiPost<Proposal>(`/api/assistant/proposals/${id}/undo`, {}),
};
