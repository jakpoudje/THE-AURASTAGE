// Route tests for Visual Generation with an in-memory stand-in for the per-request
// Supabase client. Database behaviour: tests/integration/generation_db.sql.
import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../shots/shots.service", () => ({ refreshShotPlanReview: async () => {} }));
vi.mock("../../../storage/media", () => ({
  mediaConfigured: (env: Record<string, string | undefined>) => !!env.MEDIA_BUCKET,
  signedMediaUrl: async (key: string) => `signed://${key}`,
}));

import { registerGenerationRoutes } from "../generation.controller";
import * as service from "../generation.service";

const P = "11111111-1111-4111-8111-111111111111";
const S1 = "88888888-8888-4888-8888-888888888888";
const PLAN = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const PV1 = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const PV2 = "ffffffff-ffff-4fff-8fff-fffffffffff2";
const DV = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SHOT = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";
const T = "55555555-5555-4555-8555-555555555555";
const LOOK = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const L1 = "99999999-9999-4999-8999-999999999991";
const PKG = "abababab-abab-4bab-8bab-abababababab";
const TK = "cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd";
const NOW = "2026-09-28T00:00:00Z";

type Row = Record<string, any>;
function fakeDb(rows: Record<string, Row[]>, rpcImpl: (fn: string, args: Row) => { data?: unknown; error?: unknown } = () => ({})) {
  const calls: { fn: string; args: Row }[] = [];
  const from = (table: string) => {
    const filters: [string, unknown][] = [];
    const res = () => (rows[table] ?? []).filter((x) => filters.every(([k, v]) => x[k] === v));
    const q = {
      select: () => q,
      eq: (k: string, v: unknown) => (filters.push([k, v]), q),
      not: () => q,
      order: () => q,
      maybeSingle: async () => ({ data: res()[0] ?? null, error: null }),
      then: (ok: (v: unknown) => void) => ok({ data: res(), error: null }),
    };
    return q;
  };
  return { calls, db: { from, rpc: async (fn: string, args: Row) => (calls.push({ fn, args }), { data: rpcImpl(fn, args).data ?? null, error: rpcImpl(fn, args).error ?? null }) } };
}

const shotSnap = { id: SHOT, ordinal: 1, purpose: "dialogue", size: "CU", angle: "low", movement: "static", lens_mm: 85, focus: "shallow", duration_seconds: "3", description: "Tunde speaks.", composition: null, lighting: null, character_ids: [T], dialogue_line_ids: [L1] };
const takeRow = (over: Row = {}): Row => ({
  id: TK, project_id: P, shot_id: SHOT, package_id: PKG, take_number: 1, provider: "aurastage-sketch", model: "sketch-v1", capability: "image",
  params: {}, seed: null, status: "succeeded", approval: "pending", media_type: "image/svg+xml", storage_key: "o/p/takes/s/t.svg", error: null,
  cost_actual: "0", provider_request_id: null, created_at: NOW, completed_at: NOW, ...over,
});

let rows: Record<string, Row[]>;
async function app(fake: ReturnType<typeof fakeDb>, env: Record<string, string | undefined>) {
  const a = Fastify();
  a.addHook("onRequest", async (req) => void ((req as any).db = fake.db));
  // Inject env for the service under test.
  const orig = { ...process.env };
  a.addHook("onRequest", async () => void Object.assign(process.env, { RUNWAY_API_KEY: "", OPENAI_API_KEY: "", MEDIA_BUCKET: "" }, env));
  a.addHook("onResponse", async () => void (process.env = orig));
  await registerGenerationRoutes(a);
  return a;
}

describe("Visual Generation routes", () => {
  beforeEach(() => {
    rows = {
      projects: [{ id: P, title: "Shadows of Lagos", genre: "Thriller", tone: "Tense", setting: "Lagos", time_period: null }],
      scenes: [{ id: S1, project_id: P, number: 1, heading: "EXT. HARBOUR - NIGHT", int_ext: "EXT", location: "HARBOUR", time_of_day: "NIGHT", status: "active", source_version_id: "99999999-9999-4999-8999-99999999999a", element_start: 0, element_end: 3 }],
      script_versions: [{ id: "99999999-9999-4999-8999-99999999999a", elements: [{ index: 0, type: "scene_heading", text: "EXT. HARBOUR - NIGHT" }, { index: 1, type: "action", text: "Tunde waits under the lamp, collar up." },
        { index: 2, type: "character", text: "TUNDE" }, { index: 3, type: "dialogue", text: "You came." }] }],
      shot_plans: [{ id: PLAN, project_id: P, scene_id: S1, status: "approved", review_state: "current", review_reason: null, approved_version_id: PV1 }],
      shot_plan_versions: [{ id: PV1, project_id: P, plan_id: PLAN, version_number: 1, scene_dna_version_id: DV, shots: [shotSnap] }],
      scene_dna_versions: [{ id: DV, version_number: 1, content: { editable: { purpose: "Commit", mood: ["tense"], lighting_intent: "Sodium lamp", wardrobe: { [T]: LOOK } } } }],
      scripts: [{ project_id: P, approved_version_id: null }],
      characters: [{ id: T, project_id: P, name: "Tunde Okafor", age: "35", description: "Journalist", accent: "Nigerian English (Igbo)", physicality: "Shoulders hunched; checks his watch" }],
      wardrobe_looks: [{ id: LOOK, project_id: P, character_id: T, name: "Field outfit", description: "Khaki jacket" }],
      dialogue_lines: [{ id: L1, project_id: P, speaker_name: "TUNDE", text: "You came.", emotion: "relief", character_id: T, element_index: 2 }],
      generation_packages: [],
      takes: [],
    };
  });

  it("lists approved shots, honest provider status and signed media links", async () => {
    rows.generation_packages = [{ id: PKG, project_id: P, shot_id: SHOT, shot_plan_version_id: PV1, content: { prompt: "x" }, review_state: "current", review_reason: null, engine_version: "1.0.0", created_at: NOW }];
    rows.takes = [takeRow(), takeRow({ id: "cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdc2", take_number: 2, provider: "runway", status: "failed", error: "quota", storage_key: null, completed_at: "2026-09-28T01:00:00Z" })];
    const ws = (await (await app(fakeDb(rows), { MEDIA_BUCKET: "b", RUNWAY_API_KEY: "k" })).inject({ method: "GET", url: `/api/projects/${P}/visual` })).json();
    expect(ws.providers.map((p: Row) => [p.id, p.state]).slice(0, 3)).toEqual([["aurastage-sketch", "configured"], ["runway", "configured"], ["openai", "not_configured"]]);
    expect(ws.providers.map((p: Row) => p.id)).toEqual(["aurastage-sketch", "runway", "openai", "google", "stability", "bfl", "luma", "kling", "minimax"]);
    expect(ws.providers[1].last_result).toMatchObject({ status: "failed", message: "quota" });
    expect(ws.media_ready).toBe(true);
    const shot = ws.scenes[0].shots[0];
    expect(shot.shot).toMatchObject({ id: SHOT, size: "CU", duration_seconds: 3 });
    expect(shot.takes[0].media_url).toBe("signed://o/p/takes/s/t.svg");
    expect(shot.takes[1].media_url).toBeNull();
    expect(ws.queue).toEqual({ waiting: 0, running: 0 });
  });

  it("marks a package stale when the shot plan was approved again (never deleted)", async () => {
    rows.shot_plan_versions.push({ id: PV2, project_id: P, plan_id: PLAN, version_number: 2, scene_dna_version_id: DV, shots: [shotSnap] });
    rows.shot_plans[0].approved_version_id = PV2;
    rows.generation_packages = [{ id: PKG, project_id: P, shot_id: SHOT, shot_plan_version_id: PV1, content: {}, review_state: "current", review_reason: null, engine_version: "1.0.0", created_at: NOW }];
    const fake = fakeDb(rows, (fn, a) => ({ data: { ...rows.generation_packages[0], review_state: a.p_state, review_reason: a.p_reason } }));
    const ws = (await (await app(fake, {})).inject({ method: "GET", url: `/api/projects/${P}/visual` })).json();
    expect(fake.calls.find((c) => c.fn === "set_package_review")).toMatchObject({ args: { p_state: "stale" } });
    expect(ws.scenes[0].shots[0].package.review_reason).toMatch(/approved again \(now version 2\)/);
  });

  it("a changed Project Settings look flags compiled prompts for review; defaults and the paid-take budget are reported", async () => {
    rows.generation_packages = [{ id: PKG, project_id: P, shot_id: SHOT, shot_plan_version_id: PV1, content: { project: { look: "Old look" } }, review_state: "current", review_reason: null, engine_version: "1.1.0", created_at: NOW }];
    rows.project_settings = [{ project_id: P, revision: "r", version_number: 4, settings: { style: { look: "Teal and amber" }, technical: { aspect_ratio: "2.39:1" }, generation: { monthly_paid_take_limit: 20 } } }];
    const fake = fakeDb(rows, (fn, a) => ({ data: fn === "paid_takes_this_month" ? 3 : { ...rows.generation_packages[0], review_state: a.p_state, review_reason: a.p_reason } }));
    const ws = (await (await app(fake, {})).inject({ method: "GET", url: `/api/projects/${P}/visual` })).json();
    expect(fake.calls.find((c) => c.fn === "set_package_review")).toMatchObject({ args: { p_state: "review_required", p_reason: expect.stringMatching(/visual style changed/) } });
    expect(ws.defaults.aspect_ratio).toBe("2.39:1");
    expect(ws.budget).toEqual({ monthly_paid_take_limit: 20, used_this_month: 3 });
  });

  it("regression: a location used by a compiled prompt is edited in Locations & Props → the prompt needs review (never rewritten)", async () => {
    const LOC = "abab0000-abab-4bab-8bab-abababababab";
    rows.generation_packages = [{ id: PKG, project_id: P, shot_id: SHOT, shot_plan_version_id: PV1, review_state: "current", review_reason: null, engine_version: "1.2.0", created_at: NOW,
      content: { project: { look: null }, world: { location: { id: LOC, name: "Lagos Harbour" }, props: [] }, provenance: { world_revisions: { [LOC]: 2 } } } }];
    rows.locations = [{ id: LOC, project_id: P, name: "Lagos Harbour", description: "Now foggy", revision: 3, archived_at: null }];
    const fake = fakeDb(rows, (fn, a) => ({ data: fn === "paid_takes_this_month" ? 0 : { ...rows.generation_packages[0], review_state: a.p_state, review_reason: a.p_reason } }));
    await (await app(fake, {})).inject({ method: "GET", url: `/api/projects/${P}/visual` });
    expect(fake.calls.find((c) => c.fn === "set_package_review")).toMatchObject({ args: { p_state: "review_required", p_reason: "Lagos Harbour changed in Locations & Props after this prompt was compiled — recompile to apply it." } });
  });

  it("compiles a package from the approved shot, locked Scene DNA, Casting wardrobe, Dialogue and the project look", async () => {
    rows.project_settings = [{ project_id: P, revision: "r", version_number: 2, settings: { style: { look: "Desaturated, handheld" } } }];
    // Locations & Props for the scene, with reference images (prompt compiler 1.2.0).
    const LOC = "abab0000-abab-4bab-8bab-abababababab", PR = "cdcd0000-cdcd-4dcd-8dcd-cdcdcdcdcdcd", AS1 = "efef0000-efef-4fef-8fef-efefefefef01", AS2 = "efef0000-efef-4fef-8fef-efefefefef02";
    rows.locations = [{ id: LOC, project_id: P, name: "Lagos Harbour", description: "Rusted cranes over black water", revision: 2, archived_at: null }];
    rows.props = [{ id: PR, project_id: P, name: "Brass key", description: "Old, green with age", category: "prop", revision: 1, archived_at: null }];
    rows.world_appearances = [{ scene_id: S1, object_type: "location", object_id: LOC }, { scene_id: S1, object_type: "prop", object_id: PR }];
    rows.world_reference_images = [{ project_id: P, status: "succeeded", object_type: "location", object_id: LOC, view_key: "wide:NIGHT", asset_id: AS1, created_at: NOW }];
    rows.character_reference_images = [{ project_id: P, status: "succeeded", character_id: T, look_id: null, angle: "front", size: "MS", asset_id: AS2, created_at: NOW }];
    const fake = fakeDb(rows, () => ({ data: { id: PKG } }));
    const res = await (await app(fake, {})).inject({ method: "POST", url: `/api/projects/${P}/visual/shots/${SHOT}/compile`, payload: { aspect_ratio: "16:9" } });
    expect(res.statusCode).toBe(200);
    const { fn, args } = fake.calls[0];
    expect(fn).toBe("create_generation_package");
    expect(args).toMatchObject({ p_shot_id: SHOT, p_shot_plan_version_id: PV1, p_scene_id: S1 });
    expect(args.p_content.prompt).toContain("Tunde Okafor (35) — Journalist wearing Field outfit: Khaki jacket");
    expect(args.p_content.prompt).toContain("Performance: TUNDE (relief) mid-line, speaking.");
    expect(args.p_content.video_prompt).toContain('TUNDE says "You came." (relief), Nigerian English (Igbo) accent');
    expect(args.p_content.video_prompt).toContain("From the script: Tunde waits under the lamp, collar up.");
    expect(args.p_content.video_prompt).toContain("How they move: Tunde Okafor: Shoulders hunched; checks his watch.");
    expect(args.p_content.video_prompt).toContain("lips, jaw and face move naturally in sync with every word");
    expect(args.p_content.provenance).toMatchObject({ shot_plan_version_id: PV1, scene_dna_version_id: DV, settings_version: 2 });
    expect(args.p_content.prompt).toContain("Look: Desaturated, handheld.");
    expect(args.p_content.prompt).toContain("Exterior: Lagos Harbour, night — Rusted cranes over black water.");
    expect(args.p_content.prompt).toContain("Props in the scene: Brass key (Old, green with age).");
    expect(args.p_content.references).toEqual([
      { kind: "character", object_id: T, name: "Tunde Okafor", view: "front · MS", asset_id: AS2 },
      { kind: "location", object_id: LOC, name: "Lagos Harbour", view: "wide · NIGHT", asset_id: AS1 },
    ]);
    expect(args.p_content.provenance.world_revisions).toEqual({ [LOC]: 2, [PR]: 1 });
    expect(res.json().checks.every((c: Row) => c.ok)).toBe(true);
  });

  it("refuses to compile while the shot plan has unapproved edits (412)", async () => {
    rows.shot_plans[0].status = "draft";
    const res = await (await app(fakeDb(rows), {})).inject({ method: "POST", url: `/api/projects/${P}/visual/shots/${SHOT}/compile`, payload: {} });
    expect(res.statusCode).toBe(412);
  });

  describe("requesting takes", () => {
    beforeEach(() => {
      rows.generation_packages = [{ id: PKG, project_id: P, shot_id: SHOT }];
    });
    const post = async (env: Record<string, string>, payload: Row, fake = fakeDb(rows, () => ({ data: [takeRow({ status: "queued", storage_key: null })] })), headers: Record<string, string> = {}) => {
      const res = await (await app(fake, env)).inject({ method: "POST", url: `/api/visual/packages/${PKG}/takes`, payload, headers });
      return { res, fake };
    };
    it("says plainly when a provider isn't connected (412, nothing queued)", async () => {
      const { res, fake } = await post({ MEDIA_BUCKET: "b" }, { provider: "runway", model: "gen4_image", capability: "image" });
      expect(res.statusCode).toBe(412);
      expect(res.json().error.message).toBe("Runway isn't connected yet — its API key hasn't been added to the server.");
      expect(fake.calls).toHaveLength(0);
    });
    it("needs media storage and a start frame for video", async () => {
      expect((await post({}, { provider: "aurastage-sketch", model: "sketch-v1" })).res.json().error.message).toMatch(/Media storage/);
      expect((await post({ MEDIA_BUCKET: "b", RUNWAY_API_KEY: "k" }, { provider: "runway", model: "gen4_turbo", capability: "video" })).res.json().error.message).toMatch(/finished image take/);
      expect((await post({ MEDIA_BUCKET: "b" }, { provider: "aurastage-sketch", model: "gen4_image" })).res.statusCode).toBe(400);
    });
    it("queues takes with parameters, seed and the idempotency key", async () => {
      const { res, fake } = await post({ MEDIA_BUCKET: "b" }, { provider: "aurastage-sketch", model: "sketch-v1", variations: 2, seed: 7, aspect_ratio: "2.39:1" }, undefined, { "idempotency-key": "abc12345xyz" });
      expect(res.statusCode).toBe(200);
      expect(fake.calls[0]).toMatchObject({
        fn: "request_takes",
        args: { p_provider: "aurastage-sketch", p_variations: 2, p_seed: 7, p_params: { aspect_ratio: "2.39:1", duration_seconds: null }, p_idempotency_key: "abc12345xyz" },
      });
      expect(res.json().takes[0].status).toBe("queued");
    });
    it("owner request 2026-10-01: 2, 4, 6, 8 or 13 variations to choose from; other counts are refused", async () => {
      for (const n of [2, 4, 6, 8, 13]) {
        const { res, fake } = await post({ MEDIA_BUCKET: "b" }, { provider: "aurastage-sketch", model: "sketch-v1", variations: n });
        expect(res.statusCode).toBe(200);
        expect(fake.calls[0].args.p_variations).toBe(n);
      }
      for (const n of [3, 5, 14]) expect((await post({ MEDIA_BUCKET: "b" }, { provider: "aurastage-sketch", model: "sketch-v1", variations: n })).res.statusCode).toBe(400);
    });
  });

  it("approves / rejects takes explicitly; unknown actions are refused", async () => {
    rows.takes = [takeRow()];
    const fake = fakeDb(rows, (_f, a) => ({ data: takeRow({ approval: a.p_approval }) }));
    const a = await app(fake, { MEDIA_BUCKET: "b" });
    expect((await a.inject({ method: "POST", url: `/api/takes/${TK}/approve` })).json().approval).toBe("approved");
    expect((await a.inject({ method: "POST", url: `/api/takes/${TK}/reject` })).json().approval).toBe("rejected");
    expect((await a.inject({ method: "POST", url: `/api/takes/${TK}/explode` })).statusCode).toBe(400);
  });

  it("refuses other projects (403)", async () => {
    rows.projects = [];
    expect((await (await app(fakeDb(rows), {})).inject({ method: "GET", url: `/api/projects/${P}/visual` })).statusCode).toBe(403);
  });

  it("exports the compiler engine version", () => {
    expect(service.COMPILER_ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
