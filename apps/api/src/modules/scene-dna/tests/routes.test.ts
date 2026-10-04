// Route tests for Scene DNA with an in-memory stand-in for the per-request
// Supabase client. Database behaviour is covered by tests/integration/scene_dna_db.sql.
import Fastify from "fastify";
import { beforeEach, describe, expect, it } from "vitest";
import { screenplayFormatEngine } from "@aurastage/engines";
import { registerSceneDnaRoutes } from "../sceneDna.controller";

const P = "11111111-1111-4111-8111-111111111111";
const V = "44444444-4444-4444-8444-444444444444";
const TUNDE = "55555555-5555-4555-8555-555555555555";
const AMARA = "66666666-6666-4666-8666-666666666666";
const S1 = "88888888-8888-4888-8888-888888888888";
const S2 = "89999999-8888-4888-8888-888888888888";
const L1 = "99999999-9999-4999-8999-999999999999";
const LOOK = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DNA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DV = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
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
      limit: () => q,
      maybeSingle: async () => ({ data: res()[0] ?? null, error: null }),
      single: async () => ({ data: res()[0], error: null }),
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
  await registerSceneDnaRoutes(app);
  return app;
}

const SCRIPT = `EXT. LAGOS HARBOUR - NIGHT

Rain lashes the harbour. TUNDE OKAFOR (35) waits. Footsteps approach.

TUNDE
You came.

INT. NEWSROOM - CONTINUOUS

AMARA BELLO (32) reads alone.
`;
const elements = screenplayFormatEngine({ source_text: SCRIPT }).elements;
const sceneRow = (over: Row): Row => ({
  project_id: P, int_ext: "EXT", location: "LAGOS HARBOUR", time_of_day: "NIGHT", estimated_seconds: 30, source_version_id: V, status: "active", ...over,
});
const lineRow = (over: Row = {}): Row => ({
  id: L1, project_id: P, scene_id: S1, scene_number: 1, ordinal: 1, speaker_name: "TUNDE", character_id: TUNDE, text: "You came.", text_hash: "h1",
  intention: null, subtext: null, emotion: "tension", intensity: 6, approval: "approved", review_state: "current", status: "active", ...over,
});
const dnaRow = (over: Row = {}): Row => ({
  id: DNA, project_id: P, scene_id: S1, purpose: "Tunde commits", stakes: null, story_time: null, mood: ["tense"], weather: null, atmosphere: null,
  lighting_intent: null, sound_intent: null, camera_energy: null, silent_scene: false, wardrobe: {}, notes: null, status: "approved",
  review_state: "current", approved_version_id: DV, drift: [], updated_at: NOW, ...over,
});

describe("Scene DNA routes", () => {
  let rows: Record<string, Row[]>;
  beforeEach(() => {
    rows = {
      projects: [{ id: P }],
      scripts: [{ id: "s", project_id: P, approved_version_id: V }],
      script_versions: [{ id: V, version_number: 1, elements }],
      scenes: [
        sceneRow({ id: S1, number: 1, heading: "EXT. LAGOS HARBOUR - NIGHT", element_start: 0, element_end: 3, content_hash: "c1" }),
        sceneRow({ id: S2, number: 2, heading: "INT. NEWSROOM - CONTINUOUS", int_ext: "INT", location: "NEWSROOM", time_of_day: "CONTINUOUS", element_start: 4, element_end: 5, content_hash: "c2" }),
      ],
      characters: [
        { id: TUNDE, project_id: P, name: "Tunde Okafor", role: "lead", kind: "individual", status: "approved", age: "35", gender: null, description: null, merged_into: null },
        { id: AMARA, project_id: P, name: "Amara Bello", role: "lead", kind: "individual", status: "draft", age: "32", gender: null, description: null, merged_into: null },
      ],
      character_appearances: [
        { project_id: P, character_id: TUNDE, scene_id: S1, speaking: true, voice_only: false, line_count: 1 },
        { project_id: P, character_id: AMARA, scene_id: S2, speaking: false, voice_only: false, line_count: 0 },
      ],
      wardrobe_looks: [{ id: LOOK, project_id: P, character_id: TUNDE, name: "Field outfit", description: "Khaki jacket" }],
      dialogue_lines: [lineRow()],
      scene_dna: [],
      scene_dna_versions: [],
    };
  });

  it("assembles every scene from upstream evidence, with readiness", async () => {
    const res = await (await appWith(fakeDb(rows))).inject({ method: "GET", url: `/api/projects/${P}/scene-dna` });
    expect(res.statusCode).toBe(200);
    const ws = res.json();
    expect(ws.scenes).toHaveLength(2);
    const [one, two] = ws.scenes;
    expect(one.record).toBeNull();
    expect(one.proposal.participants.map((p: Row) => p.name)).toEqual(["Tunde Okafor"]);
    expect(one.proposal.environment.weather[0]).toMatchObject({ value: "rain" });
    expect(one.proposal.sound_candidates.map((s: Row) => s.cue)).toContain("Footsteps");
    expect(one.proposal.ready_for_approval).toBe(true);
    expect(one.looks).toEqual([{ id: LOOK, character_id: TUNDE, name: "Field outfit", description: "Khaki jacket" }]);
    expect(two.proposal.dialogue.silent).toBe(true);
    expect(two.proposal.continuity.notes.join(" ")).toMatch(/Continues directly from scene 1/);
    expect(ws.summary).toMatchObject({ scenes: 2, approved: 0, ready: 2 });
  });

  it("says so plainly when the script is not approved yet", async () => {
    rows.scripts = [];
    const res = await (await appWith(fakeDb(rows))).inject({ method: "GET", url: `/api/projects/${P}/scene-dna` });
    expect(res.json()).toMatchObject({ script: null, scenes: [] });
  });

  it("refuses projects the caller cannot see (403)", async () => {
    rows.projects = [];
    const res = await (await appWith(fakeDb(rows))).inject({ method: "GET", url: `/api/projects/${P}/scene-dna` });
    expect(res.statusCode).toBe(403);
  });

  it("saves edits through save_scene_dna and rejects bad values in plain language", async () => {
    const fake = fakeDb(rows, () => ({ data: dnaRow({ status: "draft", approved_version_id: null }) }));
    const app = await appWith(fake);
    const bad = await app.inject({ method: "PATCH", url: `/api/projects/${P}/scene-dna/${S1}`, payload: { camera_energy: "wild" } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.message).toBe("Camera energy isn't valid");
    const ok = await app.inject({ method: "PATCH", url: `/api/projects/${P}/scene-dna/${S1}`, payload: { purpose: "Tunde commits", mood: ["tense"] } });
    expect(ok.statusCode).toBe(200);
    expect(fake.calls).toEqual([{ fn: "save_scene_dna", args: { p_project_id: P, p_scene_id: S1, p_patch: { purpose: "Tunde commits", mood: ["tense"] } } }]);
  });

  it("refuses a scene from another project (403)", async () => {
    rows.scenes[1].project_id = "00000000-0000-4000-8000-000000000000";
    const res = await (await appWith(fakeDb(rows))).inject({ method: "PATCH", url: `/api/projects/${P}/scene-dna/${S2}`, payload: { purpose: "x" } });
    expect(res.statusCode).toBe(403);
  });

  it("will not lock a scene whose dialogue is still in draft (412) and says why", async () => {
    rows.dialogue_lines = [lineRow({ approval: "draft" })];
    const fake = fakeDb(rows);
    const res = await (await appWith(fake)).inject({ method: "POST", url: `/api/projects/${P}/scene-dna/${S1}/approve` });
    expect(res.statusCode).toBe(412);
    expect(res.json().error.message).toMatch(/dialogue approved/);
    expect(fake.calls).toHaveLength(0);
  });

  it("locks with the exact upstream dependency refs frozen (rule 10)", async () => {
    rows.scene_dna = [dnaRow({ status: "draft", approved_version_id: null, wardrobe: { [TUNDE]: LOOK } })];
    const fake = fakeDb(rows, () => ({ data: { id: DV, version_number: 1 } }));
    const res = await (await appWith(fake)).inject({ method: "POST", url: `/api/projects/${P}/scene-dna/${S1}/approve` });
    expect(res.statusCode).toBe(200);
    const { fn, args } = fake.calls[0];
    expect(fn).toBe("approve_scene_dna");
    const deps = args.p_dependencies as Row[];
    expect(deps.map((d) => [d.type, d.id, d.strength])).toEqual([
      ["scene", S1, "hard"],
      ["character", TUNDE, "soft"],
      ["dialogue_line", L1, "soft"],
      ["wardrobe_look", LOOK, "soft"],
    ]);
    expect(deps[0].fingerprint).toBe("c1");
    expect((args.p_content as Row).script_version_id).toBe(V);
    expect(String(args.p_engine_version)).toMatch(/^\d+\.\d+\.\d+$/);
  });

  describe("upstream change invalidation", () => {
    async function approvedDeps() {
      const fake = fakeDb(rows, () => ({ data: { id: DV, version_number: 1 } }));
      await (await appWith(fake)).inject({ method: "POST", url: `/api/projects/${P}/scene-dna/${S1}/approve` });
      return fake.calls[0].args.p_dependencies;
    }
    beforeEach(async () => {
      rows.scene_dna_versions = [{ id: DV, project_id: P, scene_dna_id: DNA, version_number: 1, dependencies: await approvedDeps(), engine_version: "1.0.0" }];
      rows.scene_dna = [dnaRow()];
    });

    it("stays current (and writes nothing) when nothing upstream changed", async () => {
      const fake = fakeDb(rows);
      const ws = (await (await appWith(fake)).inject({ method: "GET", url: `/api/projects/${P}/scene-dna` })).json();
      expect(fake.calls).toHaveLength(0);
      expect(ws.scenes[0].record).toMatchObject({ status: "approved", review_state: "current", approved_version_number: 1 });
      expect(ws.summary.approved).toBe(1);
    });

    it("marks review_required with evidence when a line's emotion changes in Dialogue", async () => {
      rows.dialogue_lines = [lineRow({ emotion: "fear" })];
      const fake = fakeDb(rows, (_fn, a) => ({ data: dnaRow({ review_state: a.p_state, drift: a.p_drift }) }));
      const ws = (await (await appWith(fake)).inject({ method: "GET", url: `/api/projects/${P}/scene-dna` })).json();
      expect(fake.calls[0]).toMatchObject({ fn: "set_scene_dna_drift", args: { p_scene_dna_id: DNA, p_state: "review_required" } });
      expect(ws.scenes[0].record.drift[0]).toMatchObject({ type: "dialogue_line", kind: "changed", effect: "review_required" });
      expect(ws.scenes[0].record.drift[0].message).toMatch(/changed since approval/);
    });

    it("does not rewrite stored drift that only differs in key order (jsonb)", async () => {
      rows.dialogue_lines = [lineRow({ emotion: "fear" })];
      const first = fakeDb(rows, (_fn, a) => ({ data: dnaRow({ review_state: a.p_state, drift: a.p_drift }) }));
      await (await appWith(first)).inject({ method: "GET", url: `/api/projects/${P}/scene-dna` });
      const stored = (first.calls[0].args.p_drift as Row[]).map((d) => Object.fromEntries(Object.entries(d).reverse()));
      rows.scene_dna = [dnaRow({ review_state: "review_required", drift: stored })];
      const again = fakeDb(rows);
      await (await appWith(again)).inject({ method: "GET", url: `/api/projects/${P}/scene-dna` });
      expect(again.calls).toHaveLength(0);
    });

    it("marks stale when the scene text itself changed in Scriptwriter", async () => {
      rows.scenes[0].content_hash = "c1-edited";
      const fake = fakeDb(rows, (_fn, a) => ({ data: dnaRow({ review_state: a.p_state, drift: a.p_drift }) }));
      await (await appWith(fake)).inject({ method: "GET", url: `/api/projects/${P}/scene-dna` });
      expect(fake.calls[0].args.p_state).toBe("stale");
    });

    it("flags a character newly added to the scene for review", async () => {
      rows.character_appearances.push({ project_id: P, character_id: AMARA, scene_id: S1, speaking: false, voice_only: false, line_count: 0 });
      const fake = fakeDb(rows, (_fn, a) => ({ data: dnaRow({ review_state: a.p_state, drift: a.p_drift }) }));
      await (await appWith(fake)).inject({ method: "GET", url: `/api/projects/${P}/scene-dna` });
      const drift = fake.calls[0].args.p_drift as Row[];
      expect(drift).toEqual([expect.objectContaining({ type: "character", id: AMARA, kind: "added", effect: "review_required" })]);
    });
  });
});
