import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerCharactersRoutes } from "../characters.controller";

type Row = Record<string, any>;
const P = "11111111-1111-4111-8111-111111111111", C = "22222222-2222-4222-8222-222222222222", K = "55555555-5555-4555-8555-555555555555", A = "66666666-6666-4666-8666-666666666666";
function fakeDb(rows: Record<string, Row[]>, rpcError: Row | null = null) {
  const calls: { fn: string; args: Row }[] = [];
  const from = (t: string) => {
    const f: [string, unknown][] = [];
    const res = () => (rows[t] ?? []).filter((r) => f.every(([k, v]) => r[k] === v));
    const q: any = { select: () => q, eq: (k: string, v: unknown) => (f.push([k, v]), q), order: () => q, limit: () => q, is: () => q,
      maybeSingle: async () => ({ data: res()[0] ?? null, error: null }), then: (ok: any) => ok({ data: res(), error: null }) };
    return q;
  };
  const rpc = async (fn: string, args: Row) => (calls.push({ fn, args }), rpcError ? { data: null, error: rpcError } : { data: { id: "new", fn }, error: null });
  return { calls, db: { from, rpc } };
}
const base = (extra: Record<string, Row[]> = {}) => ({
  characters: [{ id: C, project_id: P, name: "Amara Bello", age: "32", gender: "Woman", description: "Scar over the left eyebrow", merged_into: null }],
  wardrobe_looks: [], character_age_states: [], project_settings: [], character_reference_images: [], performer_consents: [], ...extra,
});
async function app(fake: ReturnType<typeof fakeDb>) {
  const a = Fastify();
  a.addHook("onRequest", async (req) => void ((req as any).db = fake.db));
  await registerCharactersRoutes(a);
  return a;
}

describe("actor photos with consent (BUILD_PLAN item 14)", () => {
  it("records consent only with the performer's name, a real statement and the confirmation box", async () => {
    const fake = fakeDb(base());
    const a = await app(fake);
    const no = await a.inject({ method: "POST", url: `/api/characters/${C}/consents`, payload: { performer_name: "Ada Obi", statement: "Agreed to photos used as Amara's reference." } });
    expect(no.statusCode).toBe(400);
    expect(no.json().error.message).toContain("Tick the box");
    expect((await a.inject({ method: "POST", url: `/api/characters/${C}/consents`, payload: { performer_name: "Ada Obi", statement: "ok", confirm: true } })).statusCode).toBe(400);
    const ok = await a.inject({ method: "POST", url: `/api/characters/${C}/consents`, payload: { performer_name: " Ada Obi ", statement: "Agreed to photos used as Amara's reference.", confirm: true } });
    expect(ok.statusCode).toBe(201);
    expect(fake.calls).toEqual([{ fn: "record_performer_consent", args: { p_character: C, p_performer: "Ada Obi", p_statement: "Agreed to photos used as Amara's reference." } }]);
  });
  it("links a library image as one view with the character's current identity hash", async () => {
    const fake = fakeDb(base());
    const a = await app(fake);
    const look = (await a.inject({ method: "GET", url: `/api/characters/${C}/look` })).json();
    const r = await a.inject({ method: "POST", url: `/api/characters/${C}/actor-photos`, payload: { consent_id: K, asset_id: A, view: "front:CU" } });
    expect(r.statusCode).toBe(201);
    expect(fake.calls[0]).toMatchObject({ fn: "add_actor_photo", args: { p_character: C, p_consent: K, p_asset: A, p_angle: "front", p_size: "CU", p_look: null, p_age_state: null, p_identity_hash: look.identity_hash } });
    expect((await a.inject({ method: "POST", url: `/api/characters/${C}/actor-photos`, payload: { consent_id: K, asset_id: A, view: "sideways:CU" } })).statusCode).toBe(400);
  });
  it("a withdrawn consent is refused with a clear message (409)", async () => {
    const a = await app(fakeDb(base(), { message: "AURA-CHR-409: that consent was withdrawn — photos can't be used under it" }));
    const r = await a.inject({ method: "POST", url: `/api/characters/${C}/actor-photos`, payload: { consent_id: K, asset_id: A, view: "front:CU" } });
    expect(r.statusCode).toBe(409);
    expect(r.json().error.message).toBe("that consent was withdrawn — photos can't be used under it");
  });
  it("lists consents with their photos; the look panel names the performer and never shows a withdrawn photo as the image", async () => {
    const consents = [{ id: K, character_id: C, performer_name: "Ada Obi", statement: "Agreed to photos used as Amara's reference.", recorded_at: "2026-10-01", revoked_at: null }];
    // Newest first, as the query orders them.
    const refs = (status: string) => [
      { id: "p", character_id: C, look_id: null, age_state_id: null, angle: "front", size: "CU", status, asset_id: A, identity_hash: "h", provider: "performer", execution: "upload", created_at: "2026-10-01", completed_at: "2026-10-01", consent_id: K },
      { id: "g", character_id: C, look_id: null, age_state_id: null, angle: "front", size: "CU", status: "succeeded", asset_id: "gen", identity_hash: "h", provider: "aurastage-sketch", execution: "native", created_at: "2026-09-01", completed_at: "2026-09-01", consent_id: null },
    ];
    const live = await app(fakeDb(base({ performer_consents: consents, character_reference_images: refs("succeeded") })));
    const list = (await live.inject({ method: "GET", url: `/api/characters/${C}/consents` })).json();
    expect(list.consents[0]).toMatchObject({ id: K, active: true, photos: [{ id: "p", view: "front:CU", in_use: true }] });
    const view = (await live.inject({ method: "GET", url: `/api/characters/${C}/look` })).json().views.find((v: Row) => v.key === "front:CU");
    expect(view.image).toMatchObject({ asset_id: A, execution: "upload", performer: "Ada Obi" });
    const gone = await app(fakeDb(base({ performer_consents: [{ ...consents[0], revoked_at: "2026-10-02" }], character_reference_images: refs("withdrawn") })));
    const v2 = (await gone.inject({ method: "GET", url: `/api/characters/${C}/look` })).json().views.find((v: Row) => v.key === "front:CU");
    expect(v2.image).toMatchObject({ asset_id: "gen", performer: null });
    expect(v2.latest.status).toBe("withdrawn");
  });
  it("the whole-cast button never replaces an actor's photo, even when remaking everything", async () => {
    const fake0 = fakeDb(base());
    const hash = (await (await app(fake0)).inject({ method: "GET", url: `/api/characters/${C}/look` })).json().identity_hash;
    const photo = { id: "p", character_id: C, look_id: null, age_state_id: null, angle: "front", size: "CU", status: "succeeded", asset_id: A, identity_hash: hash, provider: "performer", execution: "upload", created_at: "2026-10-01", completed_at: "2026-10-01", consent_id: K };
    const fake = fakeDb(base({ character_reference_images: [photo] }));
    const r = (await (await app(fake)).inject({ method: "POST", url: `/api/projects/${P}/characters/looks/generate`, payload: { redo: true } })).json();
    expect(r.requested).toBe(7);
    expect(fake.calls.some((c) => c.args.p_angle === "front" && c.args.p_size === "CU")).toBe(false);
  });
  it("withdraws a consent through the database function", async () => {
    const fake = fakeDb(base());
    expect((await (await app(fake)).inject({ method: "POST", url: `/api/consents/${K}/withdraw` })).statusCode).toBe(200);
    expect(fake.calls).toEqual([{ fn: "revoke_performer_consent", args: { p_consent: K } }]);
  });
});
