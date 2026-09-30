// Ask AuraStage (INTELLIGENCE_PLAN.md §4): request → intent → context → planning job (worker, rule 8) → validated
// preview (field-level before → after, permission, staleness, impact) → user applies → tools run through each domain's
// own service → results with the before values → undo. Nothing here writes production tables directly (rule 4).
import type { SupabaseClient } from "@supabase/supabase-js";
import { AssistantRequestSchema, PLANNER_SYSTEM, PLANNER_VERSION, PlanSchema, buildPlannerPrompt, classifyIntent, plannerToolSchemas, validatePlan, type ContextBundle } from "@aurastage/aura-intelligence";
import { providerStatuses, reasoningModel, reasoningStatuses } from "../../providers";
import { costEstimateEngine } from "@aurastage/engines";
import { buildContext, currentVersion } from "./assistant.context";
import { toolImpl, toolRegistry, type Snapshot, type ToolCtx, type ToolImpl } from "./tools";
import * as repo from "./assistant.repository";
import { AssistantError, notFound } from "./assistant.errors";

type Row = Record<string, any>;
type Env = Record<string, string | undefined>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The labelled TestProvider plans when no real reasoning key is on the server, unless switched off. */
export const testProviderAllowed = (env: Env) => env.AURA_TEST_PROVIDER !== "off";

function toDTO(r: Row) {
  const snap = (r.snapshot ?? {}) as { context?: ContextBundle };
  return {
    id: r.id, project_id: r.project_id, module: r.module, object: r.object_id ? { type: r.object_type, id: r.object_id } : null,
    request: r.request, mode: r.mode, intent: r.intent, status: r.status,
    provider: r.provider, model: r.model, engine_version: r.engine_version, test_output: r.test_output,
    plan: r.plan, results: r.results, error: r.error,
    // Provenance: exactly which objects (and versions) the answer was based on.
    context_refs: snap.context ? snap.context.items.map((i) => i.ref) : undefined,
    created_at: r.created_at, planned_at: r.planned_at, applied_at: r.applied_at, undone_at: r.undone_at,
  };
}

export async function ask(db: SupabaseClient, projectId: string, body: unknown) {
  if (!UUID.test(projectId)) throw notFound("Project not found");
  let req;
  try {
    req = AssistantRequestSchema.parse({ ...(body as object), project_id: projectId });
  } catch (e) {
    // zod may be a different copy in the intelligence package, so recognise its errors by shape.
    if ((e as Error)?.name === "ZodError") {
      const issues = (e as { issues: { message: string }[] }).issues;
      throw new AssistantError(400, "AURA-AI-400", issues[0]?.message ?? "Invalid request", issues);
    }
    throw e;
  }
  const project = await repo.getProject(db, projectId);
  if (!project) throw notFound("Project not found");
  const intent = classifyIntent(req);
  const context = await buildContext(db, req, intent);
  const tools = toolRegistry.list();
  const snapshot = {
    planner_version: PLANNER_VERSION,
    request: { text: req.text, module: req.module, object: req.object, mode: req.mode },
    intent, context, tools: tools.map((t) => t.name),
    prompt: buildPlannerPrompt(req, intent, context, tools),
    // The same limits as JSON, so the worker can send a plan that breaks one back to the model once (planner 1.1.0).
    tool_schemas: plannerToolSchemas(tools),
  };
  const row = await repo.request(db, { project: projectId, module: req.module, object: req.object, text: req.text, mode: req.mode, intent, snapshot, engineVersion: PLANNER_VERSION });
  return toDTO(row);
}

/**
 * What a request would cost before it is sent (owner request 2026-09-30): builds exactly the prompt the planner would
 * get — the same context and tools as ask() — without queueing anything, and prices it with costEstimateEngine.
 */
export async function estimate(db: SupabaseClient, projectId: string, body: unknown, env: Env = process.env) {
  if (!UUID.test(projectId)) throw notFound("Project not found");
  let req;
  try {
    req = AssistantRequestSchema.parse({ ...(body as object), project_id: projectId });
  } catch (e) {
    if ((e as Error)?.name === "ZodError") throw new AssistantError(400, "AURA-AI-400", (e as { issues: { message: string }[] }).issues[0]?.message ?? "Invalid request");
    throw e;
  }
  const intent = classifyIntent(req);
  const context = await buildContext(db, req, intent);
  const prompt = buildPlannerPrompt(req, intent, context, toolRegistry.list());
  const planner = capabilities(env).planner;
  const provider = planner?.id ?? "aurastage-test";
  const model = planner && "model" in planner ? (planner.model as string | null) : null;
  // The reply is the plan: about 600 characters per change it proposes; a whole-scene or whole-cast pass is larger.
  const items = context.items.filter((i) => ["character", "dialogue_line"].includes(i.ref.type)).length;
  const output_chars = /\b(every|whole|all|in one pass)\b/i.test(req.text) ? Math.max(3000, items * 700) : 3000;
  const input_chars = PLANNER_SYSTEM.length + prompt.length;
  return { provider, model, input_chars, output_chars, estimate: costEstimateEngine({ items: [{ provider, model, input_chars, output_chars }] }) };
}

export async function list(db: SupabaseClient, projectId: string) {
  if (!UUID.test(projectId)) throw notFound("Project not found");
  return { proposals: (await repo.list(db, projectId)).map(toDTO) };
}

async function load(db: SupabaseClient, id: string) {
  if (!UUID.test(id)) throw notFound();
  const row = await repo.get(db, id);
  if (!row) throw notFound();
  return row;
}

interface PreviewCall { tool: string; impl: ToolImpl<any>; input: any; reason: string }
async function preview(db: SupabaseClient, row: Row) {
  const parsed = PlanSchema.safeParse(row.plan);
  if (!parsed.success) return { calls: [] as Row[], issues: [{ index: -1, tool: "", problem: "The plan isn't in the expected shape" }], impact: [] as string[], runnable: [] as PreviewCall[], can_apply: false };
  const access = await repo.access(db, row.project_id);
  const can = (m: string, a: string) => (access.modules?.[m] ?? []).includes(a);
  const { calls, issues, impact } = validatePlan(parsed.data, toolRegistry, can);
  const snap = (row.snapshot ?? {}) as { context?: ContextBundle };
  const seen = new Map<string, string | null>();
  for (const i of snap.context?.items ?? []) seen.set(`${i.ref.type}:${i.ref.id}`, i.ref.version);
  const ctx: ToolCtx = { projectId: row.project_id, orgId: "" };
  const runnable: PreviewCall[] = calls.map((c) => ({ tool: c.tool, impl: toolImpl(c.tool)!, input: c.input, reason: c.reason }));
  const out = await Promise.all(calls.map(async (c, index) => {
    const impl = toolImpl(c.tool)!;
    const t = impl.target(c.input as never);
    const target = { type: t.type, id: t.id || row.project_id };
    let before: Snapshot | null = null;
    let problem: string | null = null;
    try {
      before = await impl.before(db, c.input as never, ctx);
    } catch (e) {
      problem = (e as Error).message;
    }
    const key = `${target.type}:${target.id}`;
    // A planner may only change objects it was shown (canonical ids from the context, never guessed).
    if (!problem && !seen.has(key)) problem = "It refers to something AuraStage didn't read for this request.";
    const now = problem ? null : await currentVersion(db, row.project_id, target);
    const stale = !problem && seen.get(key) !== now;
    return {
      index, tool: c.tool, reason: c.reason, module: c.def.module, action: c.def.action, allowed: c.allowed, impact: c.def.impact,
      object: before?.object ?? { type: target.type, id: target.id, label: "" }, before: before?.fields ?? null, after: impl.after(c.input as never),
      stale, problem,
    };
  }));
  const can_apply = row.status === "proposed" && out.length > 0 && issues.length === 0 && out.every((c) => c.allowed && !c.stale && !c.problem);
  return { calls: out, issues, impact, runnable, can_apply };
}

export async function getProposal(db: SupabaseClient, id: string) {
  const row = await load(db, id);
  const dto = toDTO(row);
  if (row.status !== "proposed") return { ...dto, preview: null };
  const { runnable: _r, ...p } = await preview(db, row);
  return { ...dto, preview: p };
}

export async function reject(db: SupabaseClient, id: string) {
  await load(db, id);
  return toDTO(await repo.outcome(db, id, "rejected"));
}

const readNow = (impl: ToolImpl<any>, db: SupabaseClient, input: unknown, applied: Snapshot, ctx: ToolCtx) =>
  impl.current ? impl.current(db, input, applied, ctx) : impl.before(db, input, ctx);

export async function apply(db: SupabaseClient, id: string) {
  const row = await load(db, id);
  if (row.status !== "proposed") throw new AssistantError(409, "AURA-AI-409", `This request is ${row.status}; only a proposal can be applied.`);
  const p = await preview(db, row);
  const blocked = p.calls.find((c) => !c.allowed);
  if (blocked) throw new AssistantError(403, "AURA-AI-403", `Your role can't ${blocked.action} in this workspace (${blocked.tool}).`, p.calls);
  if (p.issues.length || !p.calls.length) throw new AssistantError(422, "AURA-AI-422", "This plan can't be applied as it stands.", p.issues);
  const problem = p.calls.find((c) => c.problem);
  if (problem) throw new AssistantError(422, "AURA-AI-422", problem.problem!, p.calls);
  const stale = p.calls.filter((c) => c.stale);
  if (stale.length) throw new AssistantError(409, "AURA-AI-409", `${stale.map((c) => c.object.label || c.object.type).join(", ")} changed after AuraStage read it. Ask again so the suggestion uses the latest version.`, stale);

  const project = await repo.getProject(db, row.project_id);
  const ctx: ToolCtx = { projectId: row.project_id, orgId: project?.org_id ?? "" };
  await repo.outcome(db, id, "applying");
  const results: Row[] = [];
  for (const c of p.runnable) {
    try {
      const before = await c.impl.before(db, c.input, ctx);
      const applied = await c.impl.apply(db, c.input, ctx);
      const now = await readNow(c.impl, db, c.input, applied, ctx);
      results.push({ tool: c.tool, input: c.input, reason: c.reason, object: applied.object, before: before.fields, applied: applied.fields, read_back: now.fields, impact: toolRegistry.get(c.tool)?.impact ?? [] });
    } catch (e) {
      // Put back what already changed, newest first, then record the failure (nothing half-applied is left behind).
      const rollback: string[] = [];
      for (const r of [...results].reverse()) {
        const impl = toolImpl(r.tool)!;
        try {
          await impl.undo(db, r.input, { object: r.object, fields: r.before }, { object: r.object, fields: r.applied }, ctx);
        } catch (u) {
          rollback.push(`${r.tool}: ${(u as Error).message}`);
        }
      }
      await repo.outcome(db, id, "failed", { results, rolled_back: rollback.length === 0, rollback_errors: rollback }, `${c.tool}: ${(e as Error).message}`);
      throw e;
    }
  }
  await repo.outcome(db, id, "applied", { results, impact: p.impact });
  return getProposal(db, id);
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export async function undo(db: SupabaseClient, id: string) {
  const row = await load(db, id);
  if (row.status !== "applied") throw new AssistantError(409, "AURA-AI-409", `This request is ${row.status}; only an applied change can be undone.`);
  const results = ((row.results ?? {}).results ?? []) as Row[];
  const project = await repo.getProject(db, row.project_id);
  const ctx: ToolCtx = { projectId: row.project_id, orgId: project?.org_id ?? "" };
  // Never overwrite newer work (rule 11): undo only while every field still reads what this change left.
  for (const r of results) {
    const impl = toolImpl(r.tool)!;
    const now = await readNow(impl, db, r.input, { object: r.object, fields: r.applied }, ctx);
    if (!same(now.fields, r.read_back)) {
      throw new AssistantError(409, "AURA-AI-409", `${r.object?.label || r.tool} was changed again after this was applied, so undoing it would overwrite newer work. Change it by hand instead.`);
    }
  }
  const restored: Row[] = [];
  for (const r of [...results].reverse()) {
    const impl = toolImpl(r.tool)!;
    const s = await impl.undo(db, r.input, { object: r.object, fields: r.before }, { object: r.object, fields: r.applied }, ctx);
    restored.push({ tool: r.tool, object: s.object, fields: s.fields });
  }
  await repo.outcome(db, id, "undone", { ...(row.results ?? {}), restored });
  return getProposal(db, id);
}

/** What the assistant can do on this server, from evidence (configured keys), never guessed (rule 12). */
export function capabilities(env: Env = process.env) {
  const reasoning = reasoningStatuses(env);
  const real = reasoning.find((r) => r.execution !== "test" && r.state === "configured");
  return {
    reasoning,
    planner: real ? { id: real.id, name: real.name, model: reasoningModel(real.id, env), test_output: false } : testProviderAllowed(env) ? { id: "aurastage-test", name: "AuraStage test planner", test_output: true } : null,
    tools: toolRegistry.list().map((t) => ({ name: t.name, module: t.module, action: t.action, description: t.description, impact: t.impact })),
    media: providerStatuses(env).map((p) => ({ id: p.id, name: p.name, capabilities: p.capabilities, state: p.state })),
  };
}
