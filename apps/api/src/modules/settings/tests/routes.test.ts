import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerSettingsRoutes } from "../settings.controller";
import { changedPaths } from "../settings.validator";

const P = "11111111-1111-4111-8111-111111111111";
const REV = "22222222-2222-4222-8222-222222222222";
type Row = Record<string, any>;
function fakeDb(tables: Record<string, Row[]>, rpcImpl: (fn: string, a: Row) => { data?: unknown; error?: unknown } = () => ({ data: 0 }), counts: Record<string, number> = {}) {
  const calls: { fn: string; args: Row }[] = [];
  const from = (t: string) => {
    let head = false;
    const q: any = {
      select: (_c: string, o?: { head?: boolean }) => ((head = !!o?.head), q), eq: () => q, order: () => q, limit: () => q,
      maybeSingle: async () => ({ data: (tables[t] ?? [])[0] ?? null, error: null }),
      then: (ok: any) => ok(head ? { count: counts[t] ?? 0, error: null } : { data: tables[t] ?? [], error: null }),
    };
    return q;
  };
  return { calls, db: { from, rpc: async (fn: string, args: Row) => { calls.push({ fn, args }); const r = rpcImpl(fn, args); return { data: r.data ?? null, error: r.error ?? null }; } } };
}
async function app(fake: ReturnType<typeof fakeDb>) {
  const a = Fastify();
  a.addHook("onRequest", async (req) => void Object.assign(req as any, { db: fake.db }));
  await registerSettingsRoutes(a);
  return a;
}
const project = { id: P, title: "Shadows of Lagos", type: "feature_film", genre: "Thriller", logline: "A journalist…", target_runtime_minutes: 110 };

describe("Project Settings", () => {
  it("defaults when nothing is saved; story is read-only from Scriptwriter; fixed pipeline facts are listed", async () => {
    const res = (await (await app(fakeDb({ projects: [project] }))).inject({ method: "GET", url: `/api/projects/${P}/settings` })).json();
    expect(res.revision).toBeNull();
    expect(res.settings.technical).toEqual({ aspect_ratio: "16:9", loudness_standard: "ebu_r128" });
    expect(res.story.title).toBe("Shadows of Lagos");
    expect(res.facts.map((f: Row) => f.id)).toEqual(["timebase", "colour", "resolution", "audio"]);
  });
  it("previews the impact of a change from real counts", async () => {
    const fake = fakeDb({ projects: [project], project_settings: [{ settings: {}, revision: REV, version_number: 1 }] }, () => ({ data: 5 }), { generation_packages: 7, audio_sessions: 2 });
    const res = (await (await app(fake)).inject({ method: "POST", url: `/api/projects/${P}/settings/impact`,
      payload: { settings: { style: { look: "Teal and amber" }, technical: { loudness_standard: "streaming" }, generation: { monthly_paid_take_limit: 5 } } } })).json();
    expect(res.changed).toEqual(["generation.monthly_paid_take_limit", "style.look", "technical.loudness_standard"]);
    expect(res.impact.map((i: Row) => i.effect)).toEqual([
      "7 compiled shot prompts will be marked for review so you can recompile them with the new look. Approved takes are kept.",
      "Audio Studio and deliverable QC will check -14 LUFS ±1. 2 approved scene mixes stay approved — the check is advisory and mixes are never re-levelled automatically.",
      "5 of 5 paid takes used this month. New paid takes will be refused until next month.",
    ]);
  });
  it("saves with the base revision and the changed paths; conflicts are 409", async () => {
    const ok = fakeDb({ projects: [project], project_settings: [{ settings: {}, revision: REV, version_number: 1 }] }, () => ({ data: {} }));
    await (await app(ok)).inject({ method: "PUT", url: `/api/projects/${P}/settings`, payload: { base_revision: REV, settings: { technical: { aspect_ratio: "2.39:1" } } } });
    expect(ok.calls.find((c) => c.fn === "save_project_settings")!.args).toMatchObject({ p_project: P, p_base_revision: REV, p_changed: ["technical.aspect_ratio"] });
    const conflict = fakeDb({ projects: [project] }, (fn) => (fn === "save_project_settings" ? { error: { code: "P0409", message: "AURA-SET-409: someone changed the settings since you opened them — reload to see their version" } } : { data: 0 }));
    const r = await (await app(conflict)).inject({ method: "PUT", url: `/api/projects/${P}/settings`, payload: { base_revision: null, settings: {} } });
    expect(r.statusCode).toBe(409);
  });
  it("refuses bad values with the field name, and a role without settings:edit gets the gate's reason", async () => {
    const bad = await (await app(fakeDb({ projects: [project] }))).inject({ method: "PUT", url: `/api/projects/${P}/settings`, payload: { base_revision: null, settings: { style: { palette: ["red"] } } } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.message).toMatch(/^settings\.style\.palette\.0/);
    const denied = fakeDb({ projects: [project] }, (fn) => (fn === "save_project_settings" ? { error: { code: "42501", message: "AURA-COL-403: your role (Writer) can't edit in Project Settings. Ask the project's producer for access." } } : { data: 0 }));
    const r = await (await app(denied)).inject({ method: "PUT", url: `/api/projects/${P}/settings`, payload: { base_revision: null, settings: {} } });
    expect(r.statusCode).toBe(403);
    expect(r.json().error.message).toMatch(/Writer\) can't edit in Project Settings/);
  });
  it("changedPaths lists only the leaves that differ", () => {
    expect(changedPaths({ a: { b: 1, c: [1] } }, { a: { b: 1, c: [1, 2] }, d: null })).toEqual(["a.c"]);
  });
});
