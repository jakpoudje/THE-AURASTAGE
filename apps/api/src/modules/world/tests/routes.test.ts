import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerWorldRoutes } from "../world.controller";

type Row = Record<string, any>;
const P = "11111111-1111-4111-8111-111111111111", V = "44444444-4444-4444-8444-444444444444", L = "22222222-2222-4222-8222-222222222222", PR = "33333333-3333-4333-8333-333333333333";
const el = (index: number, type: string, text: string, extra: Row = {}) => ({ index, type, text, line: index + 1, ...extra });
const elements = [
  el(0, "scene_heading", "INT. TUNDE'S FLAT - NIGHT"),
  el(1, "action", "TUNDE OKAFOR paces. He grabs a battered NOTEBOOK and his phone."),
  el(2, "character", "TUNDE", { speaker: "TUNDE" }),
  el(3, "dialogue", "They buried it."),
  el(4, "scene_heading", "EXT. LAGOS HARBOUR - DAWN"),
  el(5, "action", "A yellow danfo idles by the gate."),
];
function fakeDb(rows: Record<string, Row[]>, rpcResult: (fn: string, args: Row) => unknown = () => ({ id: "r1", status: "queued" })) {
  const calls: { fn: string; args: Row }[] = [];
  const from = (t: string) => {
    const f: [string, unknown][] = [];
    const res = () => (rows[t] ?? []).filter((r) => f.every(([k, v]) => r[k] === v));
    const q: any = { select: () => q, eq: (k: string, v: unknown) => (f.push([k, v]), q), order: () => q, limit: () => q, in: () => q, not: () => q,
      maybeSingle: async () => ({ data: res()[0] ?? null, error: null }), then: (ok: any) => ok({ data: res(), error: null }) };
    return q;
  };
  const rpc = async (fn: string, args: Row) => (calls.push({ fn, args }), { data: rpcResult(fn, args), error: null });
  return { calls, db: { from, rpc } };
}
const base = (extra: Record<string, Row[]> = {}) => ({
  projects: [{ id: P }], scripts: [{ id: "s", project_id: P, approved_version_id: V }], script_versions: [{ id: V, version_number: 3, elements }],
  characters: [{ project_id: P, name: "Tunde Okafor" }], character_aliases: [], project_settings: [], jobs: [],
  locations: [{ id: L, project_id: P, key: "LAGOS HARBOUR", name: "Lagos Harbour", description: "", int_ext: ["EXT"], times_of_day: ["DAWN", "NIGHT"], areas: [], status: "detected", source: "script", revision: 2, archived_at: null, missing_since_version_id: null }],
  props: [{ id: PR, project_id: P, key: "danfo", name: "Danfo", description: "Yellow minibus", category: "vehicle", descriptors: ["yellow"], confidence: "medium", reason: "", status: "detected", source: "script", revision: 1, archived_at: null, missing_since_version_id: V }],
  world_appearances: [{ project_id: P, object_type: "location", object_id: L, scene_id: "sc2", scene_number: 2, line: 5, evidence: "EXT. LAGOS HARBOUR - DAWN", source: "script" }],
  world_reference_images: [], ...extra,
});
async function app(fake: ReturnType<typeof fakeDb>) {
  const a = Fastify();
  a.addHook("onRequest", async (req) => void ((req as any).db = fake.db));
  await registerWorldRoutes(a);
  return a;
}

describe("Locations & Props API", () => {
  it("sync reads the approved script and sends the engine's findings, with the version it read", async () => {
    const f = fakeDb(base(), () => ({ new_locations: 2, new_props: 3, flagged: 0 }));
    const r = await (await app(f)).inject({ method: "POST", url: `/api/projects/${P}/world/sync` });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ new_locations: 2, script_version_number: 3 });
    const call = f.calls[0];
    expect(call.fn).toBe("sync_world");
    expect(call.args.p_version).toBe(V);
    expect(call.args.p_locations.map((l: Row) => l.name)).toEqual(["Tunde's Flat", "Lagos Harbour"]);
    expect(call.args.p_props.map((p: Row) => p.key)).toEqual(expect.arrayContaining(["notebook", "phone", "danfo"]));
    expect(call.args.p_props.map((p: Row) => p.key)).not.toContain("tunde");
  });
  it("sync without an approved script is a plain 412", async () => {
    const f = fakeDb(base({ scripts: [{ id: "s", project_id: P, approved_version_id: null }] }));
    const r = await (await app(f)).inject({ method: "POST", url: `/api/projects/${P}/world/sync` });
    expect(r.statusCode).toBe(412);
    expect(r.json().error.message).toMatch(/Approve the script/);
  });
  it("the workspace shows evidence, flags and sync state; an item gone from the script is flagged, not removed", async () => {
    const r = (await (await app(fakeDb(base()))).inject({ method: "GET", url: `/api/projects/${P}/world` })).json();
    expect(r.locations[0]).toMatchObject({ name: "Lagos Harbour", scenes: [{ scene_number: 2, evidence: "EXT. LAGOS HARBOUR - DAWN" }], missing_from_script: false });
    expect(r.props[0]).toMatchObject({ name: "Danfo", category: "vehicle", missing_from_script: true });
    expect(r.sync.state).toBe("never");
  });
  it("item 12: set dressing and prop continuity — a crashed danfo stays crashed in later scenes, with a warning (free)", async () => {
    const r = (await (await app(fakeDb(base({ world_appearances: [
      { project_id: P, object_type: "prop", object_id: PR, scene_id: "sc1", scene_number: 1, line: 3, evidence: "A DANFO crashes into the gate and is crushed.", source: "script" },
      { project_id: P, object_type: "prop", object_id: PR, scene_id: "sc4", scene_number: 4, line: 20, evidence: "The DANFO waits by the road.", source: "script" },
    ] })))).inject({ method: "GET", url: `/api/projects/${P}/world` })).json();
    expect(r.continuity.props[0].states.map((x: Row) => x.state)).toEqual(["broken", "broken"]);
    expect(r.continuity.warnings[0]).toMatchObject({ prop_id: PR, scene_number: 4, message: expect.stringContaining("Danfo was broken in scene 1") });
    expect(r.continuity.set_dressing).toEqual([{ scene_number: 1, items: [{ prop_id: PR, name: "Danfo", state: "broken" }] }, { scene_number: 4, items: [{ prop_id: PR, name: "Danfo", state: "broken" }] }]);
  });
  it("location look: views for each time of day; generate asks for the recommended set with the built-in sketch", async () => {
    const f = fakeDb(base());
    const a = await app(f);
    const look = (await a.inject({ method: "GET", url: `/api/world/location/${L}/look` })).json();
    expect(look.views).toHaveLength(8);
    expect(look.missing).toEqual(["description"]);
    expect(look.backends.map((b: Row) => b.id)).toEqual(["aurastage-sketch"]);
    const g = (await a.inject({ method: "POST", url: `/api/world/location/${L}/look/generate`, payload: {} })).json();
    expect(g.requested.map((x: Row) => x.key)).toEqual(["establishing:DAWN", "wide:DAWN", "detail:DAWN", "establishing:NIGHT", "wide:NIGHT"]);
    expect(f.calls[0].args).toMatchObject({ p_type: "location", p_aspect: "16:9", p_provider: "aurastage-sketch", p_sketch: { kind: "location", time: "DAWN" } });
    expect(new Set(f.calls.map((c) => c.args.p_identity_hash)).size).toBe(1);
  });
  it("regression (owner 2026-10-02, 'views.0: Invalid'): one click makes pictures for a place whose script times include SAME TIME / MAGIC HOUR / MOMENTS LATER", async () => {
    const loc = { ...base().locations[0], times_of_day: ["MORNING", "SAME TIME", "MAGIC HOUR", "MOMENTS LATER", "CONTINUOUS"] };
    const f = fakeDb(base({ locations: [loc] }));
    const a = await app(f);
    const r = await a.inject({ method: "POST", url: `/api/projects/${P}/world/looks/generate-all`, payload: {} });
    expect(r.statusCode, r.body).toBe(200);
    const keys = f.calls.filter((c) => c.fn === "request_world_reference" && c.args.p_type === "location").map((c) => c.args.p_view);
    // Story-timing words get no pictures of their own; real light conditions (incl. two-word ones) do.
    expect(keys).toEqual(["establishing:MORNING", "wide:MORNING", "detail:MORNING", "establishing:MAGIC HOUR", "wide:MAGIC HOUR"]);
    // The single-view button accepts such a key too.
    expect((await a.inject({ method: "POST", url: `/api/world/location/${L}/look/generate`, payload: { views: ["wide:MAGIC HOUR"] } })).statusCode).toBe(200);
    expect((await a.inject({ method: "POST", url: `/api/world/location/${L}/look/generate`, payload: { views: ["wide:<script>"] } })).statusCode).toBe(400);
  });
  it("regression (owner report 2026-10-03, 'that's a lot of images in a minute'): the one-click stops calmly at the per-minute limit and says how many are waiting", async () => {
    const PR2 = "77777777-7777-4777-8777-777777777772";
    const f = fakeDb(base({ props: [base().props[0], { ...base().props[0], id: PR2, key: "phone", name: "Phone", category: "prop" }] }));
    // The database allows two pictures, then refuses with its per-minute limit (as request_world_reference does).
    let n = 0;
    const real = f.db.rpc;
    f.db.rpc = async (fn: string, args: Row) => (fn === "request_world_reference" && ++n > 2
      ? (f.calls.push({ fn, args }), { data: null, error: { message: "AURA-WLD-429: that's a lot of sketches in a minute — give it a moment" } })
      : real(fn, args)) as never;
    const r = await (await app(f)).inject({ method: "POST", url: `/api/projects/${P}/world/looks/generate-all`, payload: {} });
    expect(r.statusCode, r.body).toBe(200);
    const body = r.json();
    expect(body.requested).toBe(2);
    expect(body.waiting).toBeGreaterThanOrEqual(1);
    expect(body.retry_after_seconds).toBe(60);
  });
  it("a paid provider that isn't connected is refused plainly; unknown kinds are 404; edits need the revision", async () => {
    const a = await app(fakeDb(base()));
    expect((await a.inject({ method: "POST", url: `/api/world/prop/${PR}/look/generate`, payload: { provider: "openai" } })).json().error.message).toBe("openai isn't connected on the server.");
    expect((await a.inject({ method: "GET", url: `/api/world/vehicle/${PR}/look` })).statusCode).toBe(404);
    expect((await a.inject({ method: "PATCH", url: `/api/world/prop/${PR}`, payload: { name: "Danfo bus" } })).statusCode).toBe(400);
    const ok = await a.inject({ method: "PATCH", url: `/api/world/prop/${PR}`, payload: { revision: 1, name: "Danfo bus", status: "confirmed" } });
    expect(ok.statusCode).toBe(200);
  });
  it("database refusals keep their meaning (409 stale, 403 role)", async () => {
    const stale = fakeDb(base());
    (stale.db as any).rpc = async () => ({ data: null, error: { message: "AURA-WLD-409: someone changed this prop since you opened it — reload to see their changes" } });
    const r = await (await app(stale)).inject({ method: "PATCH", url: `/api/world/prop/${PR}`, payload: { revision: 1, name: "X" } });
    expect(r.statusCode).toBe(409);
    const role = fakeDb(base());
    (role.db as any).rpc = async () => ({ data: null, error: { message: "AURA-COL-403: your role (Writer) can't edit in Scene DNA. Ask the project's producer for access." } });
    const r2 = await (await app(role)).inject({ method: "POST", url: `/api/projects/${P}/world/prop`, payload: { name: "Pen" } });
    expect(r2.statusCode).toBe(403);
    expect(r2.json().error.message).toMatch(/Writer/);
  });
});
