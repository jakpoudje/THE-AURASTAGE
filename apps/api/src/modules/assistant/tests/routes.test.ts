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
  profileEvidence: async () => ({
    elements: tables.script_elements ?? [], appearances: tables.character_appearances ?? [], relationships: [], looks: tables.wardrobe_looks,
    characters: Object.fromEntries(tables.characters.map((c) => [c.id, { introduction: c.intro ?? null, age: c.intro_age ?? null, accent: null }])),
  }),
}));
vi.mock("../../world/world.service", () => ({
  updateWorldItem: async (_db: unknown, kind: string, id: string, body: Row) => {
    const r = tables[kind === "location" ? "locations" : "props"].find((x) => x.id === id)!;
    if (body.revision !== r.revision) throw Object.assign(new Error("stale"), { code: "AURA-WLD-409" });
    const { revision: _r, ...patch } = body;
    return Object.assign(r, patch, { revision: r.revision + 1, updated_at: bump() });
  },
}));
vi.mock("../../settings/settings.service", () => ({
  saveSettings: async (_db: unknown, projectId: string, body: Row) => {
    const cur = tables.project_settings.find((x) => x.project_id === projectId);
    if ((cur?.revision ?? null) !== body.base_revision) throw Object.assign(new Error("stale"), { code: "AURA-SET-409" });
    const row = { project_id: projectId, settings: body.settings, revision: `r${++tick}`, version_number: (cur?.version_number ?? 0) + 1, updated_at: bump(), updated_by: null };
    tables.project_settings = [row];
    return row;
  },
}));
vi.mock("../../audio/audio.service", () => ({
  updateTrack: async (_db: unknown, id: string, patch: Row) => Object.assign(tables.audio_tracks.find((t) => t.id === id)!, patch),
}));
vi.mock("../../editorial/editorial.service", () => ({
  editTimeline: async (_db: unknown, _p: string, body: Row) => {
    const tl = tables.timelines[0];
    if (body.base_revision !== tl.revision) throw Object.assign(new Error("The timeline changed — reload and try again."), { code: "AURA-EDT-409" });
    Object.assign(tables.timeline_clips.find((c) => c.id === body.operation.clip_id)!, { transition: body.operation.transition });
    tl.revision = `rev${++tick}`;
    return { summary: "ok" };
  },
}));
vi.mock("../../assets/assets.service", () => ({
  editAsset: async (_db: unknown, id: string, changes: Row) => Object.assign(tables.assets.find((a) => a.id === id)!, changes, { updated_at: bump() }),
}));
const S_OMITTED = "22222222-2222-4222-8222-22222222cafe";
const CLIP1 = "77777777-7777-4777-8777-777777777771", CLIP2 = "77777777-7777-4777-8777-777777777772", ASSET = "88888888-8888-4888-8888-888888888881";
const HARBOUR = "55555555-5555-4555-8555-555555555555";
const MUSIC = "66666666-6666-4666-8666-666666666661", DIALOGUE = "66666666-6666-4666-8666-666666666662";

function fakeDb(access: Record<string, string[]> = { scene_dna: ["view", "edit"], casting: ["view", "edit"], settings: ["view", "edit"], audio: ["view", "edit"], editorial: ["view", "edit"], assets: ["view", "edit"] }) {
  const calls: { fn: string; args: Row }[] = [];
  const from = (t: string) => {
    const f: [string, unknown][] = [];
    const res = () => (tables[t] ?? []).filter((r) => f.every(([c, v]) => (v === null ? r[c] == null : r[c] === v)));
    const q: any = {
      select: () => q, order: () => q, limit: () => q, range: () => q,
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
/** What the worker does: record the built-in engines' plan, or plan from the frozen snapshot with the labelled test planner. */
async function plan() {
  const row = tables.ai_proposals[0];
  if (row.snapshot.planner === "builtin") {
    Object.assign(row, { status: "proposed", plan: PlanSchema.parse(row.snapshot.builtin_plan), provider: row.snapshot.provider, model: row.snapshot.model, test_output: false });
    return;
  }
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
      { id: S_OMITTED, project_id: P, number: 3, heading: "INT. CUT SCENE - DAY", time_of_day: "DAY", status: "omitted", updated_at: "2026-09-01T00:00:00+00:00" },
    ],
    scene_dna: [
      { id: "d1", scene_id: S1, project_id: P, mood: [], weather: null, updated_at: "2026-09-02T00:00:00+00:00" },
      { id: "d2", scene_id: S2, project_id: P, mood: ["tense"], weather: null, story_time: null, lighting_intent: null, updated_at: "2026-09-02T00:00:00+00:00" },
    ],
    characters: [{ id: AMARA, project_id: P, name: "Amara", age: "30", merged_into: null, updated_at: "2026-09-03T00:00:00+00:00" }],
    wardrobe_looks: [], shots: [], dialogue_lines: [], ai_proposals: [],
    locations: [{ id: HARBOUR, project_id: P, name: "HARBOUR", description: "", int_ext: ["EXT"], times_of_day: ["DAY", "NIGHT"], areas: ["DOCK"], status: "detected", archived_at: null, revision: 3, updated_at: "2026-09-04T00:00:00+00:00" }],
    props: [], project_settings: [],
    audio_sessions: [{ id: "as2", scene_id: S2, project_id: P }],
    audio_tracks: [{ id: DIALOGUE, session_id: "as2", ordinal: 1, name: "Dialogue", family: "DX", gain_db: 0, pan: 0, mute: false, solo: false },
      { id: MUSIC, session_id: "as2", ordinal: 2, name: "Music", family: "MX", gain_db: -4, pan: 0, mute: false, solo: false }],
    timelines: [{ id: "tl1", project_id: P, revision: "rev0" }],
    timeline_clips: [
      { id: CLIP1, timeline_id: "tl1", track: "V1", kind: "take", label: "Sc 1 · Shot 1", record_in: 0, duration: 48, scene_id: S1, transition: { in: "cut", out: "cut", frames: 12 } },
      { id: CLIP2, timeline_id: "tl1", track: "V1", kind: "take", label: "Sc 2 · Shot 1", record_in: 48, duration: 72, scene_id: S2, transition: { in: "cut", out: "cut", frames: 12 } },
    ],
    assets: [{ id: ASSET, project_id: P, name: "harbour-night.wav", type: "audio", category: "sound", description: null, tags: ["harbour"], archived_at: null, updated_at: "2026-09-05T00:00:00+00:00" }],
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
    const r = (await (await app(fake)).inject({ method: "POST", url: `/api/projects/${P}/assistant`, payload: { module: "scene_dna", text: "Make scene 2 night and rainy", planner: "writer" } })).json();
    expect(r.status).toBe("queued");
    const args = fake.calls.find((c) => c.fn === "request_ai_proposal")!.args;
    expect(args.p_intent.operation).toBe("MODIFY_SCENE");
    expect(args.p_snapshot.context.focus).toMatchObject({ type: "scene", id: S2, version: "2026-09-02T00:00:00+00:00" });
    expect(args.p_snapshot.tools).toContain("updateSceneDNA");
    // Regression (owner report 2026-09-30: "changes.accent: at most 120 characters"): the frozen tool schemas carry the
    // real limits, so the model sees them and the worker can send a too-long value back to be shortened.
    expect(args.p_snapshot.tool_schemas.updateCharacter.properties.changes.properties.accent).toMatchObject({ type: "string", maxLength: 120 });
    expect(args.p_snapshot.prompt).toMatch(/"accent":\{"type":"string","maxLength":120/);
    expect(args.p_snapshot.prompt).toMatch(/Request: Make scene 2 night and rainy/);
    // Places and props come last (the request isn't about them), within the budget.
    // The scene before it comes too (continuity), after the focus scene.
    expect(r.context_refs.map((x: Row) => `${x.type}:${x.id}`)).toEqual([`scene:${S2}`, `project:${P}`, `scene:${S1}`, `character:${AMARA}`, `audio_track:${DIALOGUE}`, `audio_track:${MUSIC}`, `settings:${P}`, `location:${HARBOUR}`]);
  });

  it("previews field-level before → after, labelled as test output, then applies through the domain service and undoes", async () => {
    const fake = fakeDb();
    const a = await app(fake);
    await a.inject({ method: "POST", url: `/api/projects/${P}/assistant`, payload: { module: "scene_dna", text: "Make scene 2 night and rainy", planner: "writer" } });
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
    row.plan.calls[0].input_json = JSON.stringify({ scene_id: S_OMITTED, changes: { story_time: "Night" } }); // never in the context
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
    expect(capabilities({}).tools.map((t) => t.name)).toEqual(["updateStory", "updateCharacter", "changeWardrobe", "modifyDialogue", "updateSceneDNA", "modifyShot", "updateLocationOrProp", "updateSettings", "adjustAudioTrack", "setClipTransition", "updateAssetDetails"]);
  });

  it("describes a location through Locations & Props (owner: AI helps on every page), with its revision; undo puts it back", async () => {
    const fake = fakeDb();
    const a = await app(fake);
    const q = (await a.inject({ method: "POST", url: `/api/projects/${P}/assistant`, payload: { module: "scene_dna", text: 'Describe the location "HARBOUR" for its reference views', planner: "writer" } })).json();
    const args = fake.calls.find((c) => c.fn === "request_ai_proposal")!.args;
    expect(args.p_intent.operation).toBe("MODIFY_WORLD");
    expect(args.p_snapshot.tools).toContain("updateLocationOrProp");
    expect(q.context_refs.map((x: Row) => x.id)).toContain(HARBOUR);
    await plan();
    const p = (await a.inject({ method: "GET", url: `/api/assistant/proposals/${PR}` })).json();
    expect(p.preview.calls[0]).toMatchObject({ tool: "updateLocationOrProp", allowed: true, stale: false, object: { label: "HARBOUR" },
      before: { description: "" }, after: { description: "HARBOUR — exterior; seen at day, night; areas: DOCK (from the script)." } });
    expect(p.plan.not_possible[0]).toMatch(/needs a connected writer/);
    expect((await a.inject({ method: "POST", url: `/api/assistant/proposals/${PR}/apply` })).json().status).toBe("applied");
    expect(tables.locations[0]).toMatchObject({ description: "HARBOUR — exterior; seen at day, night; areas: DOCK (from the script).", revision: 4 });
    expect((await a.inject({ method: "POST", url: `/api/assistant/proposals/${PR}/undo` })).json().status).toBe("undone");
    expect(tables.locations[0]).toMatchObject({ description: "", revision: 5 });
  });

  it("places and props stay out of the way unless the request is about them", async () => {
    const fake = fakeDb();
    const r = (await (await app(fake)).inject({ method: "POST", url: `/api/projects/${P}/assistant`, payload: { module: "casting", text: "Make Amara approximately 45" } })).json();
    const ids = r.context_refs.map((x: Row) => x.id);
    // Still readable (budget permitting) but ranked after the cast.
    expect(ids.indexOf(HARBOUR)).toBeGreaterThan(ids.indexOf(AMARA));
  });

  it("changes titles & credits and a credit name in Project Settings (a new settings version); undo restores them; spending is never offered", async () => {
    const fake = fakeDb();
    const a = await app(fake);
    await a.inject({ method: "POST", url: `/api/projects/${P}/assistant`, payload: { module: "settings", text: 'Turn on the end credits and the opening title with the theme music, and set the director to "Ada Obi".' } });
    const args = fake.calls.find((c) => c.fn === "request_ai_proposal")!.args;
    expect(args.p_intent.operation).toBe("UPDATE_SETTINGS");
    const ctxSettings = args.p_snapshot.context.items.find((x: Row) => x.ref.type === "settings");
    expect(ctxSettings.data.generation).toBeUndefined(); // spending settings aren't shown to the assistant
    await plan();
    const p = (await a.inject({ method: "GET", url: `/api/assistant/proposals/${PR}` })).json();
    expect(p.preview.calls[0]).toMatchObject({ tool: "updateSettings", allowed: true, stale: false, object: { label: "Project Settings" },
      before: { "titles.end_credits": false, "titles.opening_title": false, "titles.music": "none", "production.director": null },
      after: { "titles.end_credits": true, "titles.opening_title": true, "titles.music": "theme", "production.director": "Ada Obi" } });
    expect((await a.inject({ method: "POST", url: `/api/assistant/proposals/${PR}/apply` })).json().status).toBe("applied");
    expect(tables.project_settings[0].settings.titles).toMatchObject({ end_credits: true, opening_title: true, music: "theme", credits_speed: "medium" });
    expect(tables.project_settings[0].settings.production.director).toBe("Ada Obi");
    expect(tables.project_settings[0].version_number).toBe(1);
    expect((await a.inject({ method: "POST", url: `/api/assistant/proposals/${PR}/undo` })).json().status).toBe("undone");
    expect(tables.project_settings[0].settings.titles).toMatchObject({ end_credits: false, opening_title: false, music: "none" });
    expect(tables.project_settings[0].settings.production.director).toBeNull();
    expect(tables.project_settings[0].version_number).toBe(2);
  });

  it("refuses a plan that tries to change spending settings", async () => {
    const { toolRegistry } = await import("../tools");
    const def = toolRegistry.get("updateSettings")!;
    expect(def.input.safeParse({ changes: { generation: { monthly_paid_take_limit: 100000 } } }).success).toBe(false);
    expect(def.input.safeParse({ changes: { titles: { end_credits: true } } }).success).toBe(true);
    expect(def.input.safeParse({ changes: { titles: { opening_seconds: 99 } } }).success).toBe(false);
  });

  it("turns the music down in a scene's mix through Audio Studio (only the music track); undo restores it", async () => {
    const fake = fakeDb();
    const a = await app(fake);
    const q = (await a.inject({ method: "POST", url: `/api/projects/${P}/assistant`, payload: { module: "audio", text: "Make the music quieter in scene 2" } })).json();
    expect(q.context_refs.filter((r: Row) => r.type === "audio_track").map((r: Row) => r.label)).toEqual(["Dialogue track", "Music track"]);
    await plan();
    const p = (await a.inject({ method: "GET", url: `/api/assistant/proposals/${PR}` })).json();
    expect(p.preview.calls).toHaveLength(1);
    expect(p.preview.calls[0]).toMatchObject({ tool: "adjustAudioTrack", allowed: true, object: { label: "Music track" }, before: { gain_db: -4 }, after: { gain_db: -10 } });
    await a.inject({ method: "POST", url: `/api/assistant/proposals/${PR}/apply` });
    expect(tables.audio_tracks.map((t) => t.gain_db)).toEqual([0, -10]);
    expect((await a.inject({ method: "POST", url: `/api/assistant/proposals/${PR}/undo` })).json().status).toBe("undone");
    expect(tables.audio_tracks[1].gain_db).toBe(-4);
  });

  it("a person without Audio Studio edit rights sees the suggestion but can't apply it", async () => {
    const a = await app(fakeDb({ scene_dna: ["view"], casting: ["view"], settings: ["view"], audio: ["view"] }));
    await a.inject({ method: "POST", url: `/api/projects/${P}/assistant`, payload: { module: "audio", text: "Mute the music in scene 2" } });
    await plan();
    const p = (await a.inject({ method: "GET", url: `/api/assistant/proposals/${PR}` })).json();
    expect(p.preview).toMatchObject({ can_apply: false, calls: [{ tool: "adjustAudioTrack", allowed: false, after: { mute: true } }] });
    expect((await a.inject({ method: "POST", url: `/api/assistant/proposals/${PR}/apply` })).statusCode).toBe(403);
    expect(tables.audio_tracks[1].mute).toBe(false);
  });

  it("fades the first clip of the cut up from black through Editorial (against the timeline's revision); undo restores the cut", async () => {
    const a = await app(fakeDb());
    const q = (await a.inject({ method: "POST", url: `/api/projects/${P}/assistant`, payload: { module: "editorial", text: "Fade up from black on the first clip over 1 second" } })).json();
    expect(q.context_refs.filter((r: Row) => r.type === "timeline_clip").map((r: Row) => r.label)).toEqual(["Clip 1: Sc 1 · Shot 1", "Clip 2: Sc 2 · Shot 1"]);
    await plan();
    const p = (await a.inject({ method: "GET", url: `/api/assistant/proposals/${PR}` })).json();
    expect(p.preview.calls[0]).toMatchObject({ tool: "setClipTransition", allowed: true, stale: false, before: { transition: { in: "cut" } }, after: { transition: { in: "fade_from_black", out: "cut", frames: 24 } } });
    expect((await a.inject({ method: "POST", url: `/api/assistant/proposals/${PR}/apply` })).json().status).toBe("applied");
    expect(tables.timeline_clips[0].transition).toEqual({ in: "fade_from_black", out: "cut", frames: 24 });
    expect((await a.inject({ method: "POST", url: `/api/assistant/proposals/${PR}/undo` })).json().status).toBe("undone");
    expect(tables.timeline_clips[0].transition).toEqual({ in: "cut", out: "cut", frames: 12 });
  });

  it("an edit made to the cut after the request makes the suggestion stale (never applied over it)", async () => {
    const a = await app(fakeDb());
    await a.inject({ method: "POST", url: `/api/projects/${P}/assistant`, payload: { module: "editorial", text: "Fade to black at the end of the last clip" } });
    await plan();
    tables.timelines[0].revision = "someone-else";
    const p = (await a.inject({ method: "GET", url: `/api/assistant/proposals/${PR}` })).json();
    expect(p.preview).toMatchObject({ can_apply: false, calls: [{ tool: "setClipTransition", stale: true, after: { transition: { out: "fade_to_black" } } }] });
  });

  it("tags and renames a file in the Assets Library; undo restores it; archiving is never offered", async () => {
    const a = await app(fakeDb());
    await a.inject({ method: "POST", url: `/api/projects/${P}/assistant`, payload: { module: "assets", text: 'Tag the file "harbour-night.wav" with night, ambience' } });
    await plan();
    const p = (await a.inject({ method: "GET", url: `/api/assistant/proposals/${PR}` })).json();
    expect(p.preview.calls[0]).toMatchObject({ tool: "updateAssetDetails", allowed: true, before: { tags: ["harbour"] }, after: { tags: ["harbour", "night", "ambience"] } });
    await a.inject({ method: "POST", url: `/api/assistant/proposals/${PR}/apply` });
    expect(tables.assets[0].tags).toEqual(["harbour", "night", "ambience"]);
    await a.inject({ method: "POST", url: `/api/assistant/proposals/${PR}/undo` });
    expect(tables.assets[0].tags).toEqual(["harbour"]);
    const { toolRegistry } = await import("../tools");
    expect(toolRegistry.get("updateAssetDetails")!.input.safeParse({ asset_id: ASSET, changes: { archived: true } }).success).toBe(false);
  });

  it("prices a request before it is sent (owner: every stage tells the cost): the exact prompt, nothing queued", async () => {
    const fake = fakeDb();
    const a = await app(fake);
    const free = (await a.inject({ method: "POST", url: `/api/projects/${P}/assistant/estimate`, payload: { module: "casting", text: "Make Amara older", planner: "writer" } })).json();
    expect(free.input_chars).toBeGreaterThan(1000);
    expect(fake.calls.some((c) => c.fn === "request_ai_proposal")).toBe(false);
    const keep = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-key";
    try {
      const paid = (await a.inject({ method: "POST", url: `/api/projects/${P}/assistant/estimate`, payload: { module: "casting", text: "Make Amara older", planner: "writer" } })).json();
      expect(paid).toMatchObject({ provider: "anthropic", model: "claude-opus-5-5" });
      expect(paid.estimate.lines[0].min).toBeGreaterThan(0);
      expect(paid.estimate.lines[0].basis).toMatch(/\$4\/\$20 per million/);
    } finally {
      if (keep === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = keep;
    }
  });

  it("Scene DNA sections (owner request 2026-09-30): continuity notes come from the scenes around it, and only facts from the script", async () => {
    const a = await app(fakeDb());
    const q = (await a.inject({ method: "POST", url: `/api/projects/${P}/assistant`, payload: { module: "scene_dna", text: "For scene 2, write its continuity notes in Scene DNA: what must match the previous and next scenes, from the script.", planner: "writer" } })).json();
    expect(q.context_refs.filter((r: Row) => r.type === "scene").map((r: Row) => r.label)).toEqual(["Scene 2", "Scene 1"]);
    await plan();
    const p = (await a.inject({ method: "GET", url: `/api/assistant/proposals/${PR}` })).json();
    expect(p.preview.calls[0]).toMatchObject({ tool: "updateSceneDNA", allowed: true, after: { continuity_notes: expect.stringMatching(/^After Scene 1 \(INT\. FLAT - DAY\)\. The last scene\. Same time of day/) } });
    expect(JSON.stringify(p)).toMatch(/needs a connected writer/);
  });

  it("built-in story intelligence (owner, 2026-09-30: only third-party generation costs): the whole cast is developed from the script, free, previewed and undoable", async () => {
    tables.characters[0] = { ...tables.characters[0], age: null, intro: "AMARA BELLO (30s), a journalist in a rain-soaked denim jacket, clutches a notebook.", intro_age: "30s" };
    tables.dialogue_lines = [{ id: "99999999-9999-4999-8999-999999999991", scene_id: S2, project_id: P, ordinal: 1, speaker_name: "AMARA", character_id: AMARA, text: "I will not stop until they count every vote!", status: "active", emotion: null, intensity: null, intention: null, subtext: null, notes: null, updated_at: "2026-09-03T00:00:00+00:00" }];
    const fake = fakeDb();
    const a = await app(fake);
    const est = (await a.inject({ method: "POST", url: `/api/projects/${P}/assistant/estimate`, payload: { module: "casting", text: "Develop every character's profile", task: "develop_cast" } })).json();
    expect(est).toMatchObject({ provider: "aurastage", estimate: { free: true } });
    const q = (await a.inject({ method: "POST", url: `/api/projects/${P}/assistant`, payload: { module: "casting", text: "Develop every character's profile: fill only the empty fields from the script.", task: "develop_cast" } })).json();
    const args = fake.calls.find((c) => c.fn === "request_ai_proposal")!.args;
    expect(args.p_snapshot).toMatchObject({ planner: "builtin", provider: "aurastage" });
    expect(args.p_snapshot.prompt).toBeUndefined();
    // Regression (owner report: "String must contain at most 4000 characters"): the page sends a short request whatever the cast size.
    expect(q.request.length).toBeLessThan(200);
    await plan();
    const p = (await a.inject({ method: "GET", url: `/api/assistant/proposals/${PR}` })).json();
    expect(p).toMatchObject({ provider: "aurastage", test_output: false });
    expect(p.preview.can_apply).toBe(true);
    const upd = p.preview.calls.find((c: Row) => c.tool === "updateCharacter");
    expect(upd.after).toMatchObject({ age: "30s", occupation: "Journalist", description: expect.stringMatching(/rain-soaked denim jacket/), personality: expect.stringMatching(/^Resolute/) });
    expect(upd.after.age).toBe("30s");
    expect(p.preview.calls.find((c: Row) => c.tool === "changeWardrobe").after.look).toMatchObject({ name: "As written: rain-soaked denim jacket" });
    expect((await a.inject({ method: "POST", url: `/api/assistant/proposals/${PR}/apply` })).json().status).toBe("applied");
    expect(tables.characters[0]).toMatchObject({ age: "30s", occupation: "Journalist" });
    expect((await a.inject({ method: "POST", url: `/api/assistant/proposals/${PR}/undo` })).json().status).toBe("undone");
    expect(tables.characters[0].age).toBeNull();
  });

  it("built-in: a whole scene — every line's performance and the Scene DNA — only empty fields, never touching what's written", async () => {
    tables.scenes[1] = { ...tables.scenes[1], int_ext: "EXT", location: "HARBOUR", element_start: 0, element_end: 5 };
    tables.script_elements = [{ index: 1, type: "action", text: "Rain hammers the harbour. Amara runs along the dock, clutching a phone. Sirens wail in the distance." }];
    tables.dialogue_lines = [
      { id: "99999999-9999-4999-8999-999999999991", scene_id: S2, project_id: P, ordinal: 1, speaker_name: "AMARA", character_id: AMARA, text: "Where is he?", status: "active", emotion: null, intensity: null, intention: null, subtext: null, notes: null, updated_at: "2026-09-03T00:00:00+00:00" },
      { id: "99999999-9999-4999-8999-999999999992", scene_id: S2, project_id: P, ordinal: 2, speaker_name: "AMARA", character_id: AMARA, text: "Get out of my way!", status: "active", emotion: "anger", intensity: 9, intention: "Mine", subtext: "Mine", notes: "Mine", updated_at: "2026-09-03T00:00:00+00:00" },
    ];
    const a = await app(fakeDb({ scene_dna: ["view", "edit"], dialogue: ["view", "edit"] }));
    await a.inject({ method: "POST", url: `/api/projects/${P}/assistant`, payload: { module: "scene_dna", text: "Fill scene 2 from the script", task: "fill_scene", object: { type: "scene", id: S2 } } });
    await plan();
    const p = (await a.inject({ method: "GET", url: `/api/assistant/proposals/${PR}` })).json();
    const lines = p.preview.calls.filter((c: Row) => c.tool === "modifyDialogue");
    expect(lines).toHaveLength(1); // the written line is left alone
    expect(lines[0].after).toMatchObject({ emotion: "tension", intention: expect.any(String), subtext: expect.any(String), notes: expect.stringMatching(/^Delivery:/) });
    const dna = p.preview.calls.find((c: Row) => c.tool === "updateSceneDNA");
    expect(dna.after).toMatchObject({ weather: expect.stringMatching(/^Rain/), lighting_intent: expect.any(String), sound_intent: expect.stringMatching(/rain ambience/i), camera_energy: "dynamic" });
    expect(dna.after.mood).toBeUndefined(); // scene 2 already has a mood
    expect(p.summary ?? p.plan.summary).toMatch(/Built in and free/);
  });

  it("built-in: describes a location from the script's own words", async () => {
    const a = await app(fakeDb());
    await a.inject({ method: "POST", url: `/api/projects/${P}/assistant`, payload: { module: "scene_dna", text: 'Describe the location "HARBOUR" for its reference views', task: "describe_world", object: { type: "location", id: HARBOUR } } });
    await plan();
    const p = (await a.inject({ method: "GET", url: `/api/assistant/proposals/${PR}` })).json();
    expect(p.preview.calls[0]).toMatchObject({ tool: "updateLocationOrProp", after: { description: expect.stringMatching(/^HARBOUR: exterior\. Seen at day and night\. Areas: DOCK\./) } });
  });

  it("built-in: the whole film's Scene DNA in one click — every scene, only empty fields, one suggestion", async () => {
    const a = await app(fakeDb());
    await a.inject({ method: "POST", url: `/api/projects/${P}/assistant`, payload: { module: "scene_dna", text: "Fill every scene's Scene DNA from the script: only empty fields.", task: "fill_all_scene_dna" } });
    await plan();
    const p = (await a.inject({ method: "GET", url: `/api/assistant/proposals/${PR}` })).json();
    const dna = p.preview.calls.filter((c: Row) => c.tool === "updateSceneDNA");
    expect(dna.map((c: Row) => c.object.label).sort()).toEqual(["Scene 1", "Scene 2"]); // the omitted scene is left out
    expect(dna.find((c: Row) => c.object.label === "Scene 2").after.mood).toBeUndefined(); // already written
    expect(dna.every((c: Row) => c.allowed && !c.stale && c.after.lighting_intent)).toBe(true);
    expect(p.preview.can_apply).toBe(true);
  });
});
