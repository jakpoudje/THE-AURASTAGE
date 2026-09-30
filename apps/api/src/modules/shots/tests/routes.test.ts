// Route tests for Storyboard & Shots with an in-memory stand-in for the per-request
// Supabase client. Database behaviour is covered by tests/integration/shots_db.sql.
import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Scene DNA's own drift logic is tested in its module; here we check that
// Storyboard asks Scene DNA to refresh before reading it.
const refresh = vi.hoisted(() => ({ fn: async (_db: unknown, _p: string) => {} }));
vi.mock("../../scene-dna/sceneDna.service", () => ({ refreshSceneDnaReview: (db: unknown, p: string) => refresh.fn(db, p) }));

import { registerShotsRoutes } from "../shots.controller";

const P = "11111111-1111-4111-8111-111111111111";
const S1 = "88888888-8888-4888-8888-888888888888";
const TUNDE = "55555555-5555-4555-8555-555555555555";
const AMARA = "66666666-6666-4666-8666-666666666666";
const L1 = "99999999-9999-4999-8999-999999999991";
const L2 = "99999999-9999-4999-8999-999999999992";
const DNA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DV = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const DV2 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";
const PLAN = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const SH1 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";
const SH2 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2";
const PV1 = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const NOW = "2026-09-27T00:00:00Z";

type Row = Record<string, unknown>;
function fakeDb(rows: Record<string, Row[]>, rpcImpl: (fn: string, args: Row) => { data?: unknown; error?: unknown } = () => ({})) {
  const calls: { fn: string; args: Row }[] = [];
  const from = (table: string) => {
    const filters: [string, unknown][] = [];
    const res = () => (rows[table] ?? []).filter((x) => filters.every(([k, v]) => x[k] === v));
    const q = {
      select: () => q,
      eq: (k: string, v: unknown) => (filters.push([k, v]), q),
      order: () => q,
      maybeSingle: async () => ({ data: res()[0] ?? null, error: null }),
      then: (ok: (v: unknown) => void) => ok({ data: res(), error: null }),
    };
    return q;
  };
  return {
    calls,
    db: {
      from,
      rpc: async (fn: string, args: Row) => {
        calls.push({ fn, args });
        const r = rpcImpl(fn, args);
        return { data: r.data ?? null, error: r.error ?? null };
      },
    },
  };
}
async function appWith(fake: ReturnType<typeof fakeDb>) {
  const app = Fastify();
  app.addHook("onRequest", async (req) => {
    (req as unknown as { db: unknown }).db = fake.db;
  });
  await registerShotsRoutes(app);
  return app;
}

const shotRow = (over: Row): Row => ({
  project_id: P, scene_id: S1, plan_id: PLAN, purpose: "dialogue", size: "MCU", angle: "eye", movement: "static", support: "tripod", focus: "deep",
  lens_mm: 50, duration_seconds: "3", description: "x", composition: null, lighting: null, transition_in: "cut", notes: null,
  character_ids: [], dialogue_line_ids: [], story_start: "0", story_end: "3", created_at: NOW, updated_at: NOW, ...over,
});
const planRow = (over: Row = {}): Row => ({
  id: PLAN, project_id: P, scene_id: S1, scene_dna_version_id: DV, status: "draft", review_state: "current", review_reason: null,
  approved_version_id: null, engine_version: "1.0.0", updated_at: NOW, ...over,
});

describe("Storyboard & Shots routes", () => {
  let rows: Record<string, Row[]>;
  beforeEach(() => {
    rows = {
      projects: [{ id: P }],
      scenes: [{ id: S1, project_id: P, number: 1, heading: "EXT. HARBOUR - NIGHT", int_ext: "EXT", location: "HARBOUR", time_of_day: "NIGHT", estimated_seconds: 20, status: "active" }],
      scene_dna: [{ id: DNA, project_id: P, scene_id: S1, status: "approved", review_state: "current", approved_version_id: DV, drift: [] }],
      scene_dna_versions: [
        {
          id: DV, project_id: P, scene_dna_id: DNA, version_number: 1,
          content: {
            editable: { camera_energy: "measured", mood: ["tense"], lighting_intent: "Sodium light" },
            proposal: {
              narrative: { intended_duration_seconds: 20 },
              participants: [
                { character_id: TUNDE, name: "Tunde Okafor", presence: "on_screen" },
                { character_id: AMARA, name: "Amara Bello", presence: "on_screen" },
              ],
              dialogue: { line_ids: [L1, L2] },
            },
          },
        },
      ],
      dialogue_lines: [
        { id: L1, project_id: P, scene_id: S1, speaker_name: "TUNDE", character_id: TUNDE, text: "You came.", estimated_seconds: "1.5", intensity: 4, listener_ids: [AMARA], status: "active" },
        { id: L2, project_id: P, scene_id: S1, speaker_name: "AMARA", character_id: AMARA, text: "They know.", estimated_seconds: "1.5", intensity: 9, listener_ids: [TUNDE], status: "active" },
      ],
      characters: [
        { id: TUNDE, project_id: P, name: "Tunde Okafor", merged_into: null },
        { id: AMARA, project_id: P, name: "Amara Bello", merged_into: null },
      ],
      shot_plans: [],
      shots: [],
      shot_plan_versions: [],
    };
  });

  it("lists scenes with their locked Scene DNA and no plan yet", async () => {
    const ws = (await (await appWith(fakeDb(rows))).inject({ method: "GET", url: `/api/projects/${P}/storyboard` })).json();
    expect(ws.scenes[0]).toMatchObject({ dna: { state: "locked", version_number: 1, duration_seconds: 20 }, plan: null, shots: [], coverage: null });
    expect(ws.scenes[0].lines.map((l: Row) => l.label)).toEqual(["TUNDE: “You came.”", "AMARA: “They know.”"]);
    expect(ws.summary).toMatchObject({ scenes: 1, dna_locked: 1, planned: 0 });
  });

  it("refuses projects the caller cannot see (403)", async () => {
    rows.projects = [];
    expect((await (await appWith(fakeDb(rows))).inject({ method: "GET", url: `/api/projects/${P}/storyboard` })).statusCode).toBe(403);
  });

  it("will not plan shots until Scene DNA is locked (412)", async () => {
    rows.scene_dna[0].status = "draft";
    const fake = fakeDb(rows);
    const res = await (await appWith(fake)).inject({ method: "POST", url: `/api/projects/${P}/storyboard/scenes/${S1}/generate`, payload: {} });
    expect(res.statusCode).toBe(412);
    expect(res.json().error.message).toMatch(/Lock this scene's Scene DNA first/);
    expect(fake.calls).toHaveLength(0);
  });

  it("generates from the locked version, stamping its id and the engine version (rule 10)", async () => {
    const fake = fakeDb(rows, () => ({ data: planRow() }));
    const res = await (await appWith(fake)).inject({ method: "POST", url: `/api/projects/${P}/storyboard/scenes/${S1}/generate`, payload: {} });
    expect(res.statusCode).toBe(200);
    const { fn, args } = fake.calls[0];
    expect(fn).toBe("generate_shot_plan");
    expect(args).toMatchObject({ p_scene_dna_version_id: DV, p_replace: false });
    const shots = args.p_shots as Row[];
    expect(shots[0]).toMatchObject({ purpose: "establishing", size: "EWS", lighting: "Sodium light" });
    expect(shots.flatMap((s) => s.dialogue_line_ids as string[])).toEqual([L1, L2]);
    expect(shots.every((s) => typeof s.notes === "string" && !("rationale" in s))).toBe(true);
  });

  it("asks before replacing existing shots (409 from the database)", async () => {
    const fake = fakeDb(rows, () => ({ error: { message: "AURA-SHOT-409: this scene already has 5 shots — confirm to replace them" } }));
    const res = await (await appWith(fake)).inject({ method: "POST", url: `/api/projects/${P}/storyboard/scenes/${S1}/generate`, payload: {} });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.message).toBe("this scene already has 5 shots — confirm to replace them");
  });

  it("plans with a chosen coverage style; an unknown style is a 400", async () => {
    const fake = fakeDb(rows, () => ({ data: planRow() }));
    const app = await appWith(fake);
    const res = await app.inject({ method: "POST", url: `/api/projects/${P}/storyboard/scenes/${S1}/generate`, payload: { style: "simple" } });
    expect(res.statusCode).toBe(200);
    expect(res.json().style).toBe("simple");
    const shots = fake.calls[0].args.p_shots as Row[];
    expect(shots.some((s) => s.purpose === "reaction")).toBe(false);
    expect(fake.calls[0].args.p_engine_version).toBe("1.1.1");
    expect((await app.inject({ method: "POST", url: `/api/projects/${P}/storyboard/scenes/${S1}/generate`, payload: { style: "wild" } })).statusCode).toBe(400);
  });

  it("plans every locked scene without a plan in one click; existing plans and unlocked scenes are skipped, never replaced", async () => {
    const S2 = "88888888-8888-4888-8888-888888888882";
    const S3 = "88888888-8888-4888-8888-888888888883";
    rows.scenes.push(
      { ...rows.scenes[0], id: S2, number: 2 },
      { ...rows.scenes[0], id: S3, number: 3 },
    );
    rows.scene_dna.push({ ...rows.scene_dna[0], id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2", scene_id: S2, status: "draft", approved_version_id: null });
    rows.shot_plans = [planRow({ scene_id: S3 })];
    const fake = fakeDb(rows, () => ({ data: planRow() }));
    const res = await (await appWith(fake)).inject({ method: "POST", url: `/api/projects/${P}/storyboard/generate-all`, payload: { style: "intimate" } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.planned.map((p: Row) => p.scene_number)).toEqual([1]);
    expect(body.skipped).toEqual([
      { scene_number: 2, reason: "Scene DNA isn't locked yet" },
      { scene_number: 3, reason: "already has a shot plan (kept as it is)" },
    ]);
    expect(fake.calls.filter((c) => c.fn === "generate_shot_plan")).toHaveLength(1);
    expect(fake.calls[0].args).toMatchObject({ p_scene_id: S1, p_replace: false });
  });

  it("computes coverage from the shots against the locked Scene DNA", async () => {
    rows.shot_plans = [planRow()];
    rows.shots = [shotRow({ id: SH1, ordinal: 1, story_start: "0", story_end: "10", dialogue_line_ids: [L1], character_ids: [TUNDE] })];
    const ws = (await (await appWith(fakeDb(rows))).inject({ method: "GET", url: `/api/projects/${P}/storyboard` })).json();
    const c = ws.scenes[0].coverage;
    expect(c.coverage).toBe(0.5);
    expect(c.uncovered_lines).toEqual([L2]);
    expect(c.unseen_characters).toEqual(["Amara Bello"]);
    expect(c.ready_for_approval).toBe(false);
  });

  it("will not approve with an uncovered dialogue line, and says which (412)", async () => {
    rows.shot_plans = [planRow()];
    rows.shots = [shotRow({ id: SH1, ordinal: 1, story_start: "0", story_end: "20", dialogue_line_ids: [L1] })];
    const fake = fakeDb(rows);
    const res = await (await appWith(fake)).inject({ method: "POST", url: `/api/projects/${P}/storyboard/scenes/${S1}/approve` });
    expect(res.statusCode).toBe(412);
    expect(res.json().error.message).toMatch(/every dialogue line is covered/);
    expect(fake.calls).toHaveLength(0);
  });

  it("approves a complete plan with its coverage evidence", async () => {
    rows.shot_plans = [planRow()];
    rows.shots = [
      shotRow({ id: SH1, ordinal: 1, purpose: "establishing", size: "WS", story_start: "0", story_end: "10", dialogue_line_ids: [L1], character_ids: [TUNDE, AMARA] }),
      shotRow({ id: SH2, ordinal: 2, story_start: "10", story_end: "20", dialogue_line_ids: [L2], character_ids: [AMARA] }),
    ];
    const fake = fakeDb(rows, () => ({ data: { id: "v", version_number: 1 } }));
    const res = await (await appWith(fake)).inject({ method: "POST", url: `/api/projects/${P}/storyboard/scenes/${S1}/approve` });
    expect(res.statusCode).toBe(200);
    expect(fake.calls[0].fn).toBe("approve_shot_plan");
    expect(fake.calls[0].args.p_coverage).toMatchObject({ coverage: 1, ready_for_approval: true });
  });

  describe("upstream Scene DNA changes (production graph)", () => {
    beforeEach(() => {
      rows.shot_plans = [planRow({ status: "approved", approved_version_id: PV1 })];
      rows.shot_plan_versions = [{ id: PV1, project_id: P, plan_id: PLAN, version_number: 1, created_at: NOW }];
    });

    it("marks the plan stale when Scene DNA is locked again", async () => {
      rows.scene_dna_versions.push({ ...rows.scene_dna_versions[0], id: DV2, version_number: 2 });
      rows.scene_dna[0].approved_version_id = DV2;
      const fake = fakeDb(rows, (_f, a) => ({ data: planRow({ status: "approved", review_state: a.p_state, review_reason: a.p_reason }) }));
      const ws = (await (await appWith(fake)).inject({ method: "GET", url: `/api/projects/${P}/storyboard` })).json();
      expect(fake.calls[0]).toMatchObject({ fn: "set_shot_plan_review", args: { p_state: "stale" } });
      expect(ws.scenes[0].plan.review_reason).toMatch(/locked again \(now version 2\)/);
      expect(ws.summary.needs_review).toBe(1);
    });

    it("marks review_required (with the Scene DNA evidence) when Scene DNA needs review", async () => {
      rows.scene_dna[0].review_state = "review_required";
      rows.scene_dna[0].drift = [{ message: "Tunde Okafor (character) changed since approval." }];
      const fake = fakeDb(rows, (_f, a) => ({ data: planRow({ review_state: a.p_state, review_reason: a.p_reason }) }));
      await (await appWith(fake)).inject({ method: "GET", url: `/api/projects/${P}/storyboard` });
      expect(fake.calls[0].args).toMatchObject({ p_state: "review_required", p_reason: "Scene DNA needs review. Tunde Okafor (character) changed since approval." });
    });

    it("regression: an upstream change nobody has looked at in Scene DNA still flags the shots", async () => {
      // Stored Scene DNA says "current"; the refresh (Scene DNA's own job) discovers the Casting change.
      refresh.fn = async () => {
        rows.scene_dna[0].review_state = "review_required";
        rows.scene_dna[0].drift = [{ message: "Tunde Okafor (character) changed since approval." }];
      };
      const fake = fakeDb(rows, (_f, a) => ({ data: planRow({ review_state: a.p_state, review_reason: a.p_reason }) }));
      const ws = (await (await appWith(fake)).inject({ method: "GET", url: `/api/projects/${P}/storyboard` })).json();
      refresh.fn = async () => {};
      expect(ws.scenes[0].plan.review_state).toBe("review_required");
      expect(ws.scenes[0].dna.state).toBe("needs_review");
    });

    it("writes nothing when nothing changed", async () => {
      const fake = fakeDb(rows);
      const ws = (await (await appWith(fake)).inject({ method: "GET", url: `/api/projects/${P}/storyboard` })).json();
      expect(fake.calls).toHaveLength(0);
      expect(ws.scenes[0].plan).toMatchObject({ status: "approved", approved_version_number: 1 });
    });
  });

  describe("editing shots", () => {
    beforeEach(() => {
      rows.shot_plans = [planRow()];
      rows.shots = [shotRow({ id: SH1, ordinal: 1 })];
    });
    it("rejects bad values in plain language", async () => {
      const app = await appWith(fakeDb(rows));
      const bad = await app.inject({ method: "PATCH", url: `/api/shots/${SH1}`, payload: { size: "HUGE" } });
      expect(bad.statusCode).toBe(400);
      expect(bad.json().error.message).toBe("Shot size isn't valid");
      const add = await app.inject({
        method: "POST",
        url: `/api/projects/${P}/storyboard/scenes/${S1}/shots`,
        payload: { shot: { purpose: "insert", size: "INSERT", duration_seconds: 1, description: "Phone", story_start: 5, story_end: 4 } },
      });
      expect(add.statusCode).toBe(400);
      expect(add.json().error.message).toBe("A shot can't end before it starts");
    });
    it("saves, moves and deletes through the database functions", async () => {
      const fake = fakeDb(rows, (fn) => ({ data: fn === "delete_shot" ? 1 : shotRow({ id: SH1, ordinal: 1, angle: "high" }) }));
      const app = await appWith(fake);
      expect((await app.inject({ method: "PATCH", url: `/api/shots/${SH1}`, payload: { angle: "high" } })).json().angle).toBe("high");
      expect((await app.inject({ method: "POST", url: `/api/shots/${SH1}/move`, payload: { direction: 1 } })).statusCode).toBe(200);
      expect((await app.inject({ method: "POST", url: `/api/shots/${SH1}/move`, payload: { direction: 5 } })).statusCode).toBe(400);
      expect((await app.inject({ method: "DELETE", url: `/api/shots/${SH1}` })).json()).toEqual({ deleted_ordinal: 1 });
      expect(fake.calls.map((c) => c.fn)).toEqual(["update_shot", "move_shot", "delete_shot"]);
    });
  });
});
