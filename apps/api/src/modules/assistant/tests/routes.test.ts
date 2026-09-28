import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlanSchema } from "@aurastage/aura-intelligence";
import { testReasoningAdapter } from "../../../providers/reasoning";

type Row = Record<string, any>;
const P = "11111111-1111-4111-8111-111111111111";
const S1 = "22222222-2222-4222-8222-222222222221";
const S2 = "22222222-2222-4222-8222-222222222222";
const AMARA = "33333333-3333-4333-8333-333333333333";
const PR = "44444444-4444-4444-8444-444444444444";

// The domain services the tools call: stand-ins that write the fake tables and bump the version, like the real ones.
let tables: Record<string, Row[]>;
let tick = 0;
const bump = () => `2026-09-28T10:00:${String(++tick).padStart(2, "0")}+00:00`;
vi.mock("../../scene-dna/sceneDna.service", () => ({
  updateSceneDna: async (_db: unknown, _p: string, sceneId: string, changes: Row) => {
    const d = tables.scene_dna.find((x) => x.scene_id === sceneId)!;
    Object.assign(d, changes, { updated_at: bump() });
    return d;
  },
}));
vi.mock("../../characters/characters.service", () => ({
  editCharacter: async (_db: unknown, id: string, changes: Row) => Object.assign(tables.characters.find((c) => c.id === id)!, changes, { updated_at: bump() }),
  saveLook: async () => ({}),
}));

function fakeDb(access: Record<string, string[]> = { scene_dna: ["view", "edit"], casting: ["view", "edit"] }) {
  const calls: { fn: string; args: Row }[] = [];
  const from = (t: string) => {
    const f: [string, unknown][] = [];
    const res = () => (tables[t] ?? []).filter((r) => f.every(([c, v]) => (v === null ? r[c] == null : r[c] === v)));
    const q: any = {
      select: () => q, order: () => q, limit: () => q,
      eq: (c: string, v: unknown) => (f.push([c, v]), q), is: (c: string, v: unknown) => (f.push([c, v]), q),
      maybeSingle: async () => ({ data: res()[0] ?? null, error: null }),
      then: (ok: any) => ok({ data: res(), error: null }),
    };
    return q;
  };
  const rpc = async (fn: string, args: Row) => {
    calls.push({ fn, args });
    if (fn === "project_access") return { data: { modules: access }, error: null };
    if (fn === "request_ai_proposal") {
      const row = { id: PR, project_id: args.p_project, module: args.p_module, request: args.p_request, mode: args.p_mode, intent: args.p_intent, snapshot: args.p_snapshot, status: "queued", engine_version: args.p_engine_version, test_output: false };
      tables.ai_proposals = [row];
      return { data: row, error: null };
    }
    if (fn === "set_ai_proposal_outcome") {
      const row = tables.ai_proposals.find((r) => r.id === args.p_id)!;
      Object.assign(row, { status: args.p_status, results: args.p_results ?? row.results, error: args.p_error });
      return { data: row, error: null };
    }
    return { data: null, error: null };
  };
  return { calls, db: { from, rpc } };
}
async function app(fake: ReturnType<typeof fakeDb>) {
  const { registerAssistantRoutes } = await import("../assistant.controller");
  const a = Fastify();
  a.addHook("onRequest", async (req) => void Object.assign(req as any, { db: fake.db }));
  await registerAssistantRoutes(a);
  return a;
}
/** What the worker does: plan from the frozen snapshot with the labelled test planner. */
async function plan() {
  const row = tables.ai_proposals[0];
  const r = await testReasoningAdapter.complete({ system: "", prompt: row.snapshot.prompt, schema: PlanSchema, task: { kind: "plan", snapshot: row.snapshot } }, {});
  Object.assign(row, { status: "proposed", plan: r.data, provider: testReasoningAdapter.id, model: r.model, test_output: r.test_output });
}

beforeEach(() => {
  tick = 0;
  tables = {
    projects: [{ id: P, org_id: "o", title: "Shadows of Lagos", genre: "Thriller", tone: "Tense", updated_at: "2026-09-01T00:00:00+00:00" }],
    scenes: [
      { id: S1, project_id: P, number: 1, heading: "INT. FLAT - DAY", time_of_day: "DAY", status: "active", updated_at: "2026-09-01T00:00:00+00:00" },
      { id: S2, project_id: P, number: 2, heading: "EXT. HARBOUR - DAY", time_of_day: "DAY", status: "active", updated_at: "2026-09-01T00:00:00+00:00" },
    ],
    scene_dna: [
      { id: "d1", scene_id: S1, project_id: P, mood: [], weather: null, updated_at: "2026-09-02T00:00:00+00:00" },
      { id: "d2", scene_id: S2, project_id: P, mood: ["tense"], weather: null, story_time: null, lighting_intent: null, updated_at: "2026-09-02T00:00:00+00:00" },
    ],
    characters: [{ id: AMARA, project_id: P, name: "Amara", age: "30", merged_into: null, updated_at: "2026-09-03T00:00:00+00:00" }],
    wardrobe_looks: [], shots: [], dialogue_lines: [], ai_proposals: [],
  };
});

describe("Ask AuraStage", () => {
  it("refuses an empty request with a plain message", async () => {
    const r = await (await app(fakeDb())).inject({ method: "POST", url: `/api/projects/${P}/assistant`, payload: { module: "scene_dna", text: "a" } });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toMatchObject({ code: "AURA-AI-400", message: "Tell AuraStage what you'd like to change" });
  });

  it("queues a planning job with the frozen context: canonical ids and the versions they were read at", async () => {
    const fake = fakeDb();
    const r = (await (await app(fake)).inject({ method: "POST", url: `/api/projects/${P}/assistant`, payload: { module: "scene_dna", text: "Make scene 2 night and rainy" } })).json();
    expect(r.status).toBe("queued");
    const args = fake.calls.find((c) => c.fn === "request_ai_proposal")!.args;
    expect(args.p_intent.operation).toBe("MODIFY_SCENE");
    expect(args.p_snapshot.context.focus).toMatchObject({ type: "scene", id: S2, version: "2026-09-02T00:00:00+00:00" });
    expect(args.p_snapshot.tools).toContain("updateSceneDNA");
    expect(args.p_snapshot.prompt).toMatch(/Request: Make scene 2 night and rainy/);
    expect(r.context_refs.map((x: Row) => x.id).sort()).toEqual([P, S2, AMARA].sort());
  });

  it("previews field-level before → after, labelled as test output, then applies through the domain service and undoes", async () => {
    const fake = fakeDb();
    const a = await app(fake);
    await a.inject({ method: "POST", url: `/api/projects/${P}/assistant`, payload: { module: "scene_dna", text: "Make scene 2 night and rainy" } });
    await plan();
    const p = (await a.inject({ method: "GET", url: `/api/assistant/proposals/${PR}` })).json();
    expect(p.test_output).toBe(true);
    expect(p.preview.can_apply).toBe(true);
    expect(p.preview.calls[0]).toMatchObject({ tool: "updateSceneDNA", allowed: true, stale: false, object: { label: "Scene 2" },
      before: { story_time: null, weather: null }, after: { story_time: "Night", weather: "Rain" } });
    expect(p.plan.not_possible[0]).toMatch(/heading's time of day comes from the script/);

    const applied = (await a.inject({ method: "POST", url: `/api/assistant/proposals/${PR}/apply` })).json();
    expect(applied.status).toBe("applied");
    expect(tables.scene_dna[1]).toMatchObject({ story_time: "Night", weather: "Rain" });
    expect(fake.calls.filter((c) => c.fn === "set_ai_proposal_outcome").map((c) => c.args.p_status)).toEqual(["applying", "applied"]);

    const undone = (await a.inject({ method: "POST", url: `/api/assistant/proposals/${PR}/undo` })).json();
    expect(undone.status).toBe("undone");
    expect(tables.scene_dna[1]).toMatchObject({ story_time: null, weather: null });
  });

  it("won't apply over a newer edit (stale), and won't undo over one either", async () => {
    const a = await app(fakeDb());
    await a.inject({ method: "POST", url: `/api/projects/${P}/assistant`, payload: { module: "scene_dna", text: "Make scene 2 night" } });
    await plan();
    tables.scene_dna[1].updated_at = "2026-09-05T00:00:00+00:00"; // someone edited Scene 2 meanwhile
    const r = await a.inject({ method: "POST", url: `/api/assistant/proposals/${PR}/apply` });
    expect(r.statusCode).toBe(409);
    expect(r.json().error.message).toMatch(/^Scene 2 changed after AuraStage read it/);
    expect(tables.scene_dna[1].story_time).toBeNull();

    tables.scene_dna[1].updated_at = "2026-09-02T00:00:00+00:00";
    expect((await a.inject({ method: "POST", url: `/api/assistant/proposals/${PR}/apply` })).statusCode).toBe(200);
    tables.scene_dna[1].story_time = "Dawn"; // changed by hand after applying
    const u = await a.inject({ method: "POST", url: `/api/assistant/proposals/${PR}/undo` });
    expect(u.statusCode).toBe(409);
    expect(tables.scene_dna[1].story_time).toBe("Dawn");
  });

  it("checks the user's own permission per call before anything changes", async () => {
    const a = await app(fakeDb({ scene_dna: ["view"], casting: ["view"] }));
    await a.inject({ method: "POST", url: `/api/projects/${P}/assistant`, payload: { module: "scene_dna", text: "Make scene 2 night" } });
    await plan();
    const p = (await a.inject({ method: "GET", url: `/api/assistant/proposals/${PR}` })).json();
    expect(p.preview).toMatchObject({ can_apply: false, calls: [{ allowed: false }] });
    const r = await a.inject({ method: "POST", url: `/api/assistant/proposals/${PR}/apply` });
    expect(r.statusCode).toBe(403);
    expect(tables.scene_dna[1].story_time).toBeNull();
  });

  it("rejects a plan that targets an object it was never shown (no guessed ids)", async () => {
    const a = await app(fakeDb());
    await a.inject({ method: "POST", url: `/api/projects/${P}/assistant`, payload: { module: "scene_dna", text: "Make scene 2 night" } });
    await plan();
    const row = tables.ai_proposals[0];
    row.plan.calls[0].input_json = JSON.stringify({ scene_id: S1, changes: { story_time: "Night" } }); // Scene 1 wasn't in the context
    const p = (await a.inject({ method: "GET", url: `/api/assistant/proposals/${PR}` })).json();
    expect(p.preview.calls[0].problem).toMatch(/didn't read/);
    expect((await a.inject({ method: "POST", url: `/api/assistant/proposals/${PR}/apply` })).statusCode).toBe(422);
  });

  it("changes a character's age through Casting and says what else it can't do", async () => {
    const a = await app(fakeDb());
    await a.inject({ method: "POST", url: `/api/projects/${P}/assistant`, payload: { module: "casting", text: "Make Amara approximately 45" } });
    await plan();
    const p = (await a.inject({ method: "GET", url: `/api/assistant/proposals/${PR}` })).json();
    expect(p.preview.calls[0]).toMatchObject({ tool: "updateCharacter", before: { age: "30" }, after: { age: "45" } });
    await a.inject({ method: "POST", url: `/api/assistant/proposals/${PR}/apply` });
    expect(tables.characters[0].age).toBe("45");
  });

  it("reports capabilities from evidence: the test planner until a Claude key is set", async () => {
    const { capabilities } = await import("../assistant.service");
    expect(capabilities({}).planner).toEqual({ id: "aurastage-test", name: "AuraStage test planner", test_output: true });
    expect(capabilities({ ANTHROPIC_API_KEY: "k" }).planner).toMatchObject({ id: "anthropic", test_output: false });
    expect(capabilities({ AURA_TEST_PROVIDER: "off" }).planner).toBeNull();
    expect(capabilities({}).tools.map((t) => t.name)).toEqual(["updateStory", "updateCharacter", "changeWardrobe", "modifyDialogue", "updateSceneDNA", "modifyShot"]);
  });
});
