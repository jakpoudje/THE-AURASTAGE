import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerCharactersRoutes } from "../characters.controller";

type Row = Record<string, any>;
const P = "11111111-1111-4111-8111-111111111111", C = "22222222-2222-4222-8222-222222222222", L = "33333333-3333-4333-8333-333333333333";
function fakeDb(rows: Record<string, Row[]>) {
  const calls: { fn: string; args: Row }[] = [];
  const from = (t: string) => {
    const f: [string, unknown][] = [];
    const res = () => (rows[t] ?? []).filter((r) => f.every(([k, v]) => r[k] === v));
    const q: any = { select: () => q, eq: (k: string, v: unknown) => (f.push([k, v]), q), order: () => q, limit: () => q, is: () => q,
      maybeSingle: async () => ({ data: res()[0] ?? null, error: null }), then: (ok: any) => ok({ data: res(), error: null }) };
    return q;
  };
  const rpc = async (fn: string, args: Row) => (calls.push({ fn, args }), { data: { id: `r${calls.length}`, status: "queued" }, error: null });
  return { calls, db: { from, rpc } };
}
const rows = (refs: Row[] = []) => ({
  characters: [{ id: C, project_id: P, name: "Amara Bello", age: "32", gender: "Woman", description: "Scar over the left eyebrow", merged_into: null }],
  wardrobe_looks: [{ id: L, character_id: C, name: "Rain gear", description: "yellow oilskin" }],
  project_settings: [], character_reference_images: refs,
});
async function app(fake: ReturnType<typeof fakeDb>) {
  const a = Fastify();
  a.addHook("onRequest", async (req) => void ((req as any).db = fake.db));
  await registerCharactersRoutes(a);
  return a;
}

describe("character look panel API", () => {
  it("builds all 16 views from the profile; the built-in sketch is the default backend; paid ones need their key", async () => {
    const r = (await (await app(fakeDb(rows()))).inject({ method: "GET", url: `/api/characters/${C}/look` })).json();
    expect(r.identity).toBe("Amara Bello — Woman, aged 32. Scar over the left eyebrow.");
    expect(r.views).toHaveLength(16);
    expect(r.views.filter((v: Row) => v.in_default_set)).toHaveLength(8);
    expect(r.backends.map((b: Row) => b.id)).toEqual(["aurastage-sketch"]);
    expect(r.backend_statuses.find((b: Row) => b.id === "openai").state).toBe("not_configured");
  });
  it("generates the default set with one identity hash; a wardrobe look changes every prompt", async () => {
    const fake = fakeDb(rows());
    await (await app(fake)).inject({ method: "POST", url: `/api/characters/${C}/look/generate`, payload: { look_id: L } });
    const reqs = fake.calls.filter((c) => c.fn === "request_character_reference").map((c) => c.args);
    expect(reqs).toHaveLength(8);
    expect(new Set(reqs.map((a) => a.p_identity_hash)).size).toBe(1);
    expect(reqs.every((a) => a.p_provider === "aurastage-sketch" && a.p_execution === "native" && a.p_look === L && a.p_prompt.includes("Wearing: Rain gear — yellow oilskin."))).toBe(true);
    expect(reqs[0].p_sketch).toMatchObject({ title: "Amara Bello", subtitle: "Front · Close-up", angle: "front", size: "CU" });
  });
  it("marks a view made from an older profile as stale instead of hiding or replacing it", async () => {
    const refs = [{ id: "x", character_id: C, look_id: null, angle: "front", size: "CU", status: "succeeded", asset_id: "a1", identity_hash: "old", provider: "aurastage-sketch", execution: "native", created_at: "2026-09-01", completed_at: "2026-09-01" }];
    const r = (await (await app(fakeDb(rows(refs)))).inject({ method: "GET", url: `/api/characters/${C}/look` })).json();
    expect(r.views.find((v: Row) => v.key === "front:CU").image).toMatchObject({ asset_id: "a1", stale: true });
  });
  it("refuses a paid backend that isn't connected, bad views and another character's look", async () => {
    const a = await app(fakeDb(rows()));
    expect((await a.inject({ method: "POST", url: `/api/characters/${C}/look/generate`, payload: { provider: "openai" } })).json().error.message).toBe("openai isn't connected on the server.");
    expect((await a.inject({ method: "POST", url: `/api/characters/${C}/look/generate`, payload: { views: ["sideways:CU"] } })).statusCode).toBe(400);
    expect((await a.inject({ method: "GET", url: `/api/characters/${C}/look?look_id=44444444-4444-4444-8444-444444444444` })).statusCode).toBe(400);
  });
});
