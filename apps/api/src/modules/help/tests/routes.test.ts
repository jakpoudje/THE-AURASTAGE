import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerHelpRoutes } from "../help.controller";
import { systemStatus, WORKER_STALE_SECONDS } from "../help.service";
import { createLimiter } from "../../../infrastructure/rateLimit";

const P = "11111111-1111-4111-8111-111111111111";
type Row = Record<string, any>;
function fakeDb(rpcImpl: (fn: string, a: Row) => { data?: unknown; error?: unknown }, tables: Record<string, Row[]> = {}, counts: Record<string, number> = {}) {
  const calls: { fn: string; args: Row }[] = [];
  const from = (t: string) => {
    let head = false;
    const q: any = {
      select: (_c: string, o?: { head?: boolean }) => ((head = !!o?.head), q), eq: () => q, neq: () => q, gte: () => q, order: () => q,
      then: (ok: any) => ok(head ? { count: counts[t] ?? 0, error: null } : { data: tables[t] ?? [], error: null }),
    };
    return q;
  };
  return { calls, db: { from, rpc: async (fn: string, args: Row) => { calls.push({ fn, args }); const r = rpcImpl(fn, args); return { data: r.data ?? null, error: r.error ?? null }; } } };
}
async function app(fake: ReturnType<typeof fakeDb>) {
  const a = Fastify();
  a.addHook("onRequest", async (req) => void Object.assign(req as any, { db: fake.db }));
  await registerHelpRoutes(a);
  return a;
}
const NOW = Date.parse("2026-09-28T12:00:00Z");

describe("Help & Support", () => {
  it("system status comes from evidence: worker check-ins, database ping, job failure rates", async () => {
    const fake = fakeDb(() => ({ data: {
      workers: [
        { name: "generation-worker", last_seen_at: new Date(NOW - 20_000).toISOString() },
        { name: "render-worker", last_seen_at: new Date(NOW - (WORKER_STALE_SECONDS + 60) * 1000).toISOString() },
        { name: "old-worker", last_seen_at: null },
      ],
      jobs_24h: [{ engine_id: "generation.take", completed: 1, failed: 4, cancelled: 0, running: 0, queued: 0, oldest_queued_seconds: null }],
    } }));
    const s = await systemStatus(fake.db as never, { MEDIA_BUCKET: "b", MEDIA_ENDPOINT: "e", MEDIA_ACCESS_KEY_ID: "i", MEDIA_SECRET_ACCESS_KEY: "s" }, NOW);
    const by = Object.fromEntries(s.checks.map((c) => [c.id, c]));
    expect(by.database.state).toBe("operational");
    expect(by.media.state).toBe("operational");
    expect(by["worker:generation-worker"]).toMatchObject({ state: "degraded", evidence: expect.stringMatching(/20 s ago · 4 of 5 jobs failed/) });
    expect(by["worker:render-worker"]).toMatchObject({ state: "down", evidence: "last checked in 3 min ago" });
    expect(by["worker:old-worker"]).toMatchObject({ state: "down", evidence: "has never checked in" });
    expect(s.providers.find((p) => p.id === "runway")?.state).toBe("not_configured");
  });
  it("no media bucket is reported as not configured, not operational", async () => {
    const s = await systemStatus(fakeDb(() => ({ data: { workers: [], jobs_24h: [] } })).db as never, {}, NOW);
    expect(s.checks.find((c) => c.id === "media")?.state).toBe("not_configured");
  });
  it("the assistant answers from the guides and this project's diagnostics, and says it isn't AI", async () => {
    const fake = fakeDb(() => ({ data: null }), {
      projects: [{ id: P, title: "X" }],
      jobs: [{ engine_id: "rendering.render", error: { message: "AURA-EXP-500: boom" }, completed_at: "2026-09-28T10:00:00Z", created_at: "2026-09-28T09:00:00Z" }],
      scripts: [{ approved_version_id: "v" }], timelines: [{ status: "draft" }],
    }, { shot_plans: 1 });
    const res = await (await app(fake)).inject({ method: "POST", url: "/api/help/assistant", payload: { question: "Why did my render fail?", project_id: P, module: "delivery" } });
    const body = res.json();
    expect(body.guides[0].id).toBe("export");
    expect(body.note).toMatch(/No AI model/);
    expect(body.findings[0]).toMatchObject({ severity: "problem", evidence: expect.stringContaining("AURA-EXP-500") });
  });
  it("tickets: diagnostics are only built on the server, and only with consent", async () => {
    const fake = fakeDb((fn) => ({ data: fn === "create_ticket" ? { id: P } : null }), { projects: [{ id: P, title: "X" }] });
    const a = await app(fake);
    await a.inject({ method: "POST", url: "/api/help/tickets", payload: { subject: "Render stuck", body: "It's been an hour", project_id: P, include_diagnostics: false } });
    expect(fake.calls.at(-1)!.args).toMatchObject({ p_consent: false, p_diagnostics: null });
    await a.inject({ method: "POST", url: "/api/help/tickets", payload: { subject: "Render stuck", body: "It's been an hour", project_id: P, include_diagnostics: true } });
    expect(fake.calls.at(-1)!.args).toMatchObject({ p_consent: true, p_diagnostics: { engine_version: "1.0.0" } });
    const bad = await a.inject({ method: "POST", url: "/api/help/tickets", payload: { subject: "x", body: "y", diagnostics: { forged: true } } });
    expect(bad.statusCode).toBe(400);
  });
  it("signing out other devices keeps the current one (the database decides which)", async () => {
    const fake = fakeDb(() => ({ data: 2 }));
    const res = await (await app(fake)).inject({ method: "POST", url: "/api/account/sessions/revoke", payload: {} });
    expect(res.json()).toEqual({ signed_out: 2 });
    expect(fake.calls[0]).toEqual({ fn: "revoke_sessions", args: { p_session: null } });
  });
});

describe("rate limiter", () => {
  it("limits writes and reads separately per person and per minute", () => {
    let t = 0;
    const l = createLimiter({ read: 3, write: 1 }, () => t);
    expect(l.hit("a", "write")).toBe(0);
    expect(l.hit("a", "write")).toBe(60);
    expect(l.hit("a", "read")).toBe(0);
    expect(l.hit("b", "write")).toBe(0);
    t = 30_000;
    expect(l.hit("a", "write")).toBe(30);
    t = 61_000;
    expect(l.hit("a", "write")).toBe(0);
  });
});
