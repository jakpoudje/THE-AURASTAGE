// Help & Support: real system status, the knowledge base, the AuraStage Assistant (answers from the
// written guides plus this project's own permission-safe diagnostics — no AI model), support tickets,
// and account sessions.
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { GUIDES, TROUBLESHOOTING, knowledgeRetrievalEngine, supportDiagnosticEngine } from "@aurastage/engines";
import { PERMISSION_MODULES } from "@aurastage/contracts";
import { providerStatuses } from "../../providers";
import { mediaConfigured } from "../../storage/media";
import * as repo from "./help.repository";
import { HelpNotFoundError, parse } from "./help.validator";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STARTED = Date.now();
/** A worker that hasn't called in for this long is reported as not responding. */
export const WORKER_STALE_SECONDS = 120;

type Env = Record<string, string | undefined>;
type Check = { id: string; label: string; state: "operational" | "degraded" | "down" | "not_configured"; evidence: string };

export async function systemStatus(db: SupabaseClient, env: Env = process.env, now = Date.now()) {
  const [ping, platform] = await Promise.all([repo.pingDatabase(db), repo.platformStatus(db).catch(() => null)]);
  const checks: Check[] = [
    { id: "api", label: "AuraStage API", state: "operational", evidence: `answered this request · up ${Math.round((now - STARTED) / 60000)} min` },
    { id: "database", label: "Database", state: ping.ok ? "operational" : "down", evidence: ping.ok ? `query answered in ${ping.ms} ms` : `query failed: ${ping.error}` },
    { id: "media", label: "Media storage", state: mediaConfigured(env) ? "operational" : "not_configured",
      evidence: mediaConfigured(env) ? "bucket credentials present on the server" : "no media bucket configured on the server" },
  ];
  const workerLabels: Record<string, string> = { "generation-worker": "Visual generation worker", "render-worker": "Render worker" };
  for (const w of (platform?.workers ?? []) as { name: string; last_seen_at: string | null }[]) {
    const age = w.last_seen_at ? Math.round((now - Date.parse(w.last_seen_at)) / 1000) : null;
    checks.push({ id: `worker:${w.name}`, label: workerLabels[w.name] ?? w.name,
      state: age === null ? "down" : age <= WORKER_STALE_SECONDS ? "operational" : "down",
      evidence: age === null ? "has never checked in" : `last checked in ${age < 60 ? `${age} s` : `${Math.round(age / 60)} min`} ago` });
  }
  const jobs = ((platform?.jobs_24h ?? []) as Record<string, number | string | null>[]).map((j) => ({
    engine_id: String(j.engine_id), completed: Number(j.completed), failed: Number(j.failed), cancelled: Number(j.cancelled),
    running: Number(j.running), queued: Number(j.queued), oldest_queued_seconds: j.oldest_queued_seconds === null ? null : Number(j.oldest_queued_seconds),
  }));
  for (const j of jobs) {
    const finished = j.completed + j.failed;
    if (finished >= 3 && j.failed / finished > 0.5) {
      const c = checks.find((x) => x.id === (j.engine_id.startsWith("rendering") ? "worker:render-worker" : "worker:generation-worker"));
      if (c && c.state === "operational") Object.assign(c, { state: "degraded", evidence: `${c.evidence} · ${j.failed} of ${finished} jobs failed in 24 h` });
    }
  }
  const notBuilt = [
    { id: "voice", name: "Studio-quality voices", note: "Not connected yet — needs a voice provider account (the built-in neural voice works meanwhile)" },
    { id: "music", name: "Studio-quality music", note: "Not connected yet — needs a music provider account (the built-in synthesised score works meanwhile)" },
    { id: "lipsync", name: "Lip-sync", note: "Not connected yet — needs a lip-sync provider account" },
  ];
  return {
    checked_at: new Date(now).toISOString(),
    checks,
    jobs_24h: jobs,
    providers: providerStatuses(env).map((p) => ({ id: p.id, name: p.name, state: p.state, capabilities: p.capabilities, note: p.note })),
    not_connected: notBuilt,
  };
}

export const guides = () => ({ guides: GUIDES, troubleshooting: TROUBLESHOOTING });

/** Permission-safe facts about one project: counts and codes the caller can already see. */
export async function projectDiagnostics(db: SupabaseClient, projectId: string, now = Date.now()) {
  if (!UUID.test(projectId) || !(await repo.getProject(db, projectId))) throw new HelpNotFoundError("Project not found");
  const since = new Date(now - 7 * 864e5).toISOString();
  const tables = ["scenes", "scene_dna", "shot_plans", "generation_packages", "audio_sessions", "timelines", "renders"];
  const [failed, queued, counts, script, timeline] = await Promise.all([
    repo.failedJobs(db, projectId, since),
    repo.queuedJobs(db, projectId),
    Promise.all(tables.map((t) => repo.reviewCount(db, t, projectId).catch(() => 0))),
    repo.script(db, projectId),
    repo.timeline(db, projectId),
  ]);
  const facts = {
    failed_jobs: failed.map((j) => ({ engine_id: j.engine_id, code: (String(j.error?.message ?? "").match(/AURA-[A-Z]+-\d{3}/) ?? [null])[0], at: j.completed_at ?? j.created_at })),
    stuck_jobs: queued.map((j) => ({ engine_id: j.engine_id, minutes: (now - Date.parse(j.created_at)) / 60000 })).filter((j) => j.minutes > 10),
    review_required: Object.fromEntries(tables.map((t, i) => [t, counts[i]])),
    script_approved: script ? !!script.approved_version_id : false,
    picture_locked: timeline ? timeline.status === "locked" : null,
  };
  return { facts, ...supportDiagnosticEngine(facts) };
}

const AskSchema = z.object({
  question: z.string().trim().min(2, "Ask a question first").max(500),
  project_id: z.string().uuid().nullable().optional(),
  module: z.enum(PERMISSION_MODULES).nullable().optional(),
}).strict();

/**
 * The AuraStage Assistant. It explains and navigates from the written guides and, for a project the
 * person can see, that project's diagnostics. It never changes anything and never reads content
 * the person couldn't already open (all reads use their own access).
 */
export async function ask(db: SupabaseClient, payload: unknown) {
  const q = parse(AskSchema, payload);
  const found = knowledgeRetrievalEngine({ query: q.question, module: q.module ?? null, limit: 3 });
  const diagnostics = q.project_id ? await projectDiagnostics(db, q.project_id).catch(() => null) : null;
  const relevant = diagnostics?.findings.filter((f) => !q.module || f.module === q.module || f.severity === "problem") ?? [];
  return {
    mode: "guides" as const,
    note: "Answers come from the AuraStage guides and your project's own status. No AI model is connected to the assistant yet.",
    guides: found.guides.map(({ id, title, summary, steps, module }) => ({ id, title, summary, steps, module })),
    troubleshooting: found.troubles,
    findings: relevant,
    engine_versions: { knowledge: found.engine_version, diagnostics: diagnostics?.engine_version ?? null },
  };
}

const TicketSchema = z.object({
  subject: z.string().trim().min(3, "Give the ticket a short subject").max(200),
  body: z.string().trim().min(1, "Describe what happened").max(8000),
  project_id: z.string().uuid().nullable().optional(),
  module: z.enum(PERMISSION_MODULES).nullable().optional(),
  include_diagnostics: z.boolean().default(false),
}).strict();

export async function listTickets(db: SupabaseClient, all: boolean) {
  const [staff, tickets] = await Promise.all([repo.isStaff(db), repo.listTickets(db, all)]);
  return { staff, tickets };
}

export async function createTicket(db: SupabaseClient, payload: unknown) {
  const t = parse(TicketSchema, payload);
  // Diagnostics are recomputed on the server (never taken from the browser) and only with consent.
  const diagnostics = t.include_diagnostics && t.project_id ? await projectDiagnostics(db, t.project_id) : null;
  const row = await repo.createTicket(db, {
    project_id: t.project_id ?? null, module: t.module ?? null, subject: t.subject, body: t.body, consent: t.include_diagnostics,
    diagnostics: diagnostics ? { findings: diagnostics.findings, facts: diagnostics.facts, engine_version: diagnostics.engine_version } : null,
  });
  return { id: row.id as string };
}

export async function replyTicket(db: SupabaseClient, id: string, payload: unknown) {
  const { body } = parse(z.object({ body: z.string().trim().min(1, "Write a reply first").max(8000) }).strict(), payload);
  if (!UUID.test(id)) throw new HelpNotFoundError("ticket not found");
  await repo.replyTicket(db, id, body);
  return { ok: true };
}

export async function closeTicket(db: SupabaseClient, id: string) {
  if (!UUID.test(id)) throw new HelpNotFoundError("ticket not found");
  await repo.closeTicket(db, id);
  return { ok: true };
}

export const sessions = async (db: SupabaseClient) => ({ sessions: await repo.mySessions(db) });

export async function revokeSessions(db: SupabaseClient, payload: unknown) {
  const { session_id } = parse(z.object({ session_id: z.string().uuid().nullable().default(null) }).strict(), payload);
  return { signed_out: await repo.revokeSessions(db, session_id) };
}
