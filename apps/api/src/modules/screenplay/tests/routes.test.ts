// Route-level tests for the Scriptwriter API with an in-memory stand-in for the
// per-request Supabase client, so transport, validation, error codes and the
// approve flow are exercised without a network. Database-side behaviour
// (RLS, concurrency, REVIEW_REQUIRED) is covered by tests/integration/scriptwriter_db.sql.
import Fastify from "fastify";
import { beforeEach, describe, expect, it } from "vitest";
import { registerScreenplayRoutes } from "../screenplay.controller";

const PROJECT = "11111111-1111-4111-8111-111111111111";
const ORG = "22222222-2222-4222-8222-222222222222";
const SCRIPT = "33333333-3333-4333-8333-333333333333";
const V1 = "44444444-4444-4444-8444-444444444444";
const NOW = "2026-09-26T00:00:00Z";

type Rows = Record<string, Record<string, unknown>[]>;

function fakeDb(rows: Rows, rpc: (fn: string, args: Record<string, unknown>) => { data?: unknown; error?: unknown }) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const from = (table: string) => {
    const filters: [string, unknown][] = [];
    const q = {
      select: () => q,
      eq: (k: string, v: unknown) => (filters.push([k, v]), q),
      order: () => q,
      limit: () => q,
      is: () => q,
      result: () => (rows[table] ?? []).filter((r) => filters.every(([k, v]) => r[k] === v)),
      maybeSingle: async () => ({ data: q.result()[0] ?? null, error: null }),
      single: async () => ({ data: q.result()[0], error: null }),
      then: (res: (v: unknown) => void) => res({ data: q.result(), error: null }),
    };
    return q;
  };
  return {
    calls,
    db: {
      from,
      rpc: async (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args });
        const r = rpc(fn, args);
        return { data: r.data ?? null, error: r.error ?? null };
      },
    },
  };
}

const TEXT = "INT. OFFICE - DAY\n\nTUNDE\nHello.\n\nEXT. STREET - NIGHT\n\nAMARA\nRun.\n";

function versionRow(elements: unknown[]) {
  return { id: V1, script_id: SCRIPT, org_id: ORG, version_number: 1, source_text: TEXT, elements, parser_version: "p", note: null, created_by: null, created_at: NOW };
}

async function appWith(fake: ReturnType<typeof fakeDb>) {
  const app = Fastify();
  app.addHook("onRequest", async (req) => {
    (req as unknown as { db: unknown }).db = fake.db;
  });
  await registerScreenplayRoutes(app);
  return app;
}

describe("Scriptwriter routes", () => {
  let rows: Rows;
  beforeEach(() => {
    rows = { projects: [{ id: PROJECT, org_id: ORG, target_runtime_minutes: 100, genre: "Thriller", type: "feature_film" }] };
  });

  it("returns an empty workspace for a project with no script", async () => {
    const app = await appWith(fakeDb(rows, () => ({})));
    const res = await app.inject({ method: "GET", url: `/api/projects/${PROJECT}/script` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ script: null, current_version: null, versions: [], scenes: [], analysis: null });
  });

  it("rejects a non-UUID or invisible project with 403 before touching data", async () => {
    const app = await appWith(fakeDb(rows, () => ({})));
    expect((await app.inject({ method: "GET", url: `/api/projects/not-a-uuid/script` })).statusCode).toBe(403);
    const other = "99999999-9999-4999-8999-999999999999";
    const res = await app.inject({ method: "GET", url: `/api/projects/${other}/script` });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("AURA-SCR-403");
  });

  it("parses on the server and sends typed elements + parser version to the save function", async () => {
    const fake = fakeDb(rows, (_fn, args) => ({ data: versionRow(args.p_elements as unknown[]) }));
    const app = await appWith(fake);
    const res = await app.inject({
      method: "POST",
      url: `/api/projects/${PROJECT}/script/versions`,
      payload: { source_text: TEXT, base_version_id: null, note: "first" },
    });
    expect(res.statusCode).toBe(201);
    const call = fake.calls[0];
    expect(call.fn).toBe("save_script_version");
    expect(call.args.p_parser_version).toMatch(/^story\.screenplayFormatEngine@/);
    expect((call.args.p_elements as { type: string }[]).map((e) => e.type)).toEqual([
      "scene_heading", "character", "dialogue", "scene_heading", "character", "dialogue",
    ]);
  });

  it("maps a concurrent-edit conflict to 409 AURA-SCR-409", async () => {
    const app = await appWith(fakeDb(rows, () => ({ error: { message: "AURA-SCR-409: script changed since you opened it", code: "P0409" } })));
    const res = await app.inject({
      method: "POST",
      url: `/api/projects/${PROJECT}/script/versions`,
      payload: { source_text: "x", base_version_id: null },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("AURA-SCR-409");
  });

  it("validates the save payload (400)", async () => {
    const app = await appWith(fakeDb(rows, () => ({})));
    const res = await app.inject({ method: "POST", url: `/api/projects/${PROJECT}/script/versions`, payload: { base_version_id: "nope" } });
    expect(res.statusCode).toBe(400);
  });

  it("approves by re-deriving scenes from the stored version, with hashes and engine version", async () => {
    const { screenplayFormatEngine } = await import("@aurastage/engines");
    rows.script_versions = [versionRow(screenplayFormatEngine({ source_text: TEXT }).elements)];
    const fake = fakeDb(rows, () => ({
      data: { id: SCRIPT, org_id: ORG, project_id: PROJECT, status: "approved", current_version_id: V1, approved_version_id: V1, created_at: NOW, updated_at: NOW },
    }));
    const app = await appWith(fake);
    const res = await app.inject({ method: "POST", url: `/api/projects/${PROJECT}/script/approve`, payload: { version_id: V1 } });
    expect(res.statusCode).toBe(200);
    const { fn, args } = fake.calls[0];
    expect(fn).toBe("approve_script_version");
    expect(args.p_engine_version).toMatch(/^story\.sceneBoundaryEngine@/);
    const scenes = args.p_scenes as { number: number; heading: string; speaking_characters: string[]; content_hash: string }[];
    expect(scenes.map((s) => [s.number, s.heading, s.speaking_characters])).toEqual([
      [1, "INT. OFFICE - DAY", ["TUNDE"]],
      [2, "EXT. STREET - NIGHT", ["AMARA"]],
    ]);
    expect(scenes.every((s) => /^[0-9a-f]{64}$/.test(s.content_hash))).toBe(true);
  });

  it("refuses to approve a version with no scene headings (400) and never calls the database function", async () => {
    rows.script_versions = [versionRow([{ index: 0, type: "action", text: "Notes only.", line: 1 }])];
    const fake = fakeDb(rows, () => ({}));
    const app = await appWith(fake);
    const res = await app.inject({ method: "POST", url: `/api/projects/${PROJECT}/script/approve`, payload: { version_id: V1 } });
    expect(res.statusCode).toBe(400);
    expect(fake.calls).toHaveLength(0);
  });

  it("returns 404 when approving an unknown version", async () => {
    const app = await appWith(fakeDb(rows, () => ({})));
    const res = await app.inject({ method: "POST", url: `/api/projects/${PROJECT}/script/approve`, payload: { version_id: V1 } });
    expect(res.statusCode).toBe(404);
  });

  it("builds the runtime scope plan from the project's own runtime and genre", async () => {
    const app = await appWith(fakeDb(rows, () => ({})));
    const res = await app.inject({ method: "GET", url: `/api/projects/${PROJECT}/scope-plan` });
    expect(res.statusCode).toBe(200);
    const { plan } = res.json();
    expect(plan.target_runtime_minutes).toBe(100);
    expect(plan.acts.reduce((s: number, a: { minutes: number }) => s + a.minutes, 0)).toBeCloseTo(100);
  });

  it("returns a null plan when no runtime is set", async () => {
    rows.projects[0].target_runtime_minutes = null;
    const app = await appWith(fakeDb(rows, () => ({})));
    const res = await app.inject({ method: "GET", url: `/api/projects/${PROJECT}/scope-plan` });
    expect(res.json()).toEqual({ plan: null });
  });
  it("story development and the outline are made by the built-in engines by default — free, finished at once, checked; screenplay pages need the AI writer", async () => {
    rows.projects[0] = { ...rows.projects[0], title: "Shadows of Lagos", setting: "Lagos, Nigeria", genre: "Political thriller", target_runtime_minutes: 110,
      logline: "When her brother Tunde vanishes, Amara Bello, a fearless journalist, must expose the rigged election before the polls close — but Governor Adeyemi will kill to keep it buried." };
    rows.characters = [];
    rows.script_generations = [];
    let n = 0;
    const fake = fakeDb(rows, (fn, a) => (fn === "request_script_generation" ? { data: { id: `55555555-5555-4555-8555-55555555555${n++}`, kind: a.p_kind, parent_id: a.p_parent, source: a.p_source, status: "succeeded", output: a.p_output, provider: "aurastage" } } : {}));
    const app = await appWith(fake);
    const dev = await app.inject({ method: "POST", url: `/api/projects/${PROJECT}/script/writing`, payload: { kind: "develop_story" } });
    expect(dev.statusCode).toBe(201);
    const call = fake.calls.find((c) => c.fn === "request_script_generation")!;
    expect(call.args).toMatchObject({ p_kind: "develop_story", p_source: "builtin" });
    const story = call.args.p_output as { characters: { name: string; role: string }[]; beats: unknown[] };
    expect(story.characters.find((c) => c.role === "protagonist")!.name).toBe("Amara Bello");
    expect(story.beats.length).toBeGreaterThan(10);
    expect(dev.json().checks.every((c: { ok: boolean }) => c.ok)).toBe(true);
    // The outline from that story, built in as well.
    rows.script_generations = [{ id: "55555555-5555-4555-8555-555555555550", project_id: PROJECT, kind: "develop_story", status: "succeeded", source: "builtin", output: story, parent_id: null }];
    const ol = await app.inject({ method: "POST", url: `/api/projects/${PROJECT}/script/writing`, payload: { kind: "outline" } });
    expect(ol.statusCode).toBe(201);
    const oc = fake.calls.filter((c) => c.fn === "request_script_generation")[1];
    expect(oc.args).toMatchObject({ p_kind: "outline", p_source: "builtin", p_parent: "55555555-5555-4555-8555-555555555550" });
    expect((oc.args.p_output as { scenes: unknown[] }).scenes.length).toBeGreaterThan(20);
    // Pages are written by the AI writer only.
    const bad = await app.inject({ method: "POST", url: `/api/projects/${PROJECT}/script/writing`, payload: { kind: "write_script", engine: "builtin", parent_id: "55555555-5555-4555-8555-555555555551" } });
    expect(bad.statusCode).toBe(400);
  });
});
