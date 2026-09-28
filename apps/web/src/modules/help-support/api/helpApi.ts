// Help & Support + account security API calls (apps/api/src/modules/help).
import { apiGet, apiPost } from "@/lib/apiClient";

export type StatusCheck = { id: string; label: string; state: "operational" | "degraded" | "down" | "not_configured"; evidence: string };
export type SystemStatus = {
  checked_at: string;
  checks: StatusCheck[];
  jobs_24h: { engine_id: string; completed: number; failed: number; cancelled: number; running: number; queued: number; oldest_queued_seconds: number | null }[];
  providers: { id: string; name: string; state: "configured" | "not_configured"; capabilities: string[]; note?: string }[];
  not_connected: { id: string; name: string; note: string }[];
};
export type Guide = { id: string; module: string; title: string; summary: string; steps: string[]; keywords?: string[] };
export type Trouble = { code: string; title: string; meaning: string; fix: string; module: string };
export type Finding = { severity: "info" | "warning" | "problem"; module: string; message: string; evidence: string };
export type AssistantAnswer = { mode: "guides"; note: string; guides: Guide[]; troubleshooting: Trouble[]; findings: Finding[] };
export type Ticket = {
  id: string; user_email: string; project_id: string | null; module: string | null; subject: string; status: "open" | "answered" | "closed";
  consent_diagnostics: boolean; diagnostics: { findings?: Finding[] } | null; created_at: string; updated_at: string;
  messages: { id: string; from_staff: boolean; body: string; created_at: string }[];
};
export type Session = { id: string; created_at: string; last_active_at: string; user_agent: string | null; ip: string | null; current: boolean };

export const helpApi = {
  status: () => apiGet<SystemStatus>("/api/help/status"),
  guides: () => apiGet<{ guides: Guide[]; troubleshooting: Trouble[] }>("/api/help/guides"),
  ask: (question: string, project_id: string | null, module: string | null) => apiPost<AssistantAnswer>("/api/help/assistant", { question, project_id, module }),
  diagnostics: (projectId: string) => apiGet<{ findings: Finding[] }>(`/api/projects/${projectId}/diagnostics`),
  tickets: (all = false) => apiGet<{ staff: boolean; tickets: Ticket[] }>(`/api/help/tickets${all ? "?all=1" : ""}`),
  createTicket: (t: { subject: string; body: string; project_id: string | null; module: string | null; include_diagnostics: boolean }) => apiPost<{ id: string }>("/api/help/tickets", t),
  reply: (id: string, body: string) => apiPost<{ ok: true }>(`/api/help/tickets/${id}/reply`, { body }),
  close: (id: string) => apiPost<{ ok: true }>(`/api/help/tickets/${id}/close`, {}),
  sessions: () => apiGet<{ sessions: Session[] }>("/api/account/sessions"),
  revoke: (session_id: string | null) => apiPost<{ signed_out: number }>("/api/account/sessions/revoke", { session_id }),
};
