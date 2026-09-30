// Route tests for Casting with an in-memory stand-in for the per-request
// Supabase client. Database behaviour (RLS, merges, versioning) is covered by
// tests/integration/casting_db.sql.
import Fastify from "fastify";
import { beforeEach, describe, expect, it } from "vitest";
import { screenplayFormatEngine } from "@aurastage/engines";
import { registerCharactersRoutes } from "../characters.controller";

const P = "11111111-1111-4111-8111-111111111111";
const ORG = "22222222-2222-4222-8222-222222222222";
const V = "44444444-4444-4444-8444-444444444444";
const TUNDE = "55555555-5555-4555-8555-555555555555";
const NOW = "2026-09-26T00:00:00Z";

type Row = Record<string, unknown>;
type Rows = Record<string, Row[]>;

function fakeDb(rows: Rows, rpcImpl: (fn: string, args: Row) => { data?: unknown; error?: unknown } = () => ({})) {
  const calls: { fn: string; args: Row }[] = [];
  const from = (table: string) => {
    const filters: [string, unknown][] = [];
    let lim: number | null = null;
    const res = () => {
      const r = (rows[table] ?? []).filter((x) => filters.every(([k, v]) => x[k] === v));
      return lim === null ? r : r.slice(0, lim);
    };
    const q = {
      select: () => q,
      eq: (k: string, v: unknown) => (filters.push([k, v]), q),
      order: () => q,
      limit: (n: number) => ((lim = n), q),
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
  await registerCharactersRoutes(app);
  return app;
}

const SCRIPT = `INT. NEWSROOM - MORNING

TUNDE OKAFOR (35) reviews documents.

TUNDE
Someone has to tell the truth.

EXT. HARBOUR - DAWN

AMARA BELLO waits. DETECTIVE RAMOS watches from a car.

AMARA
You came.
`;

const character = (over: Row = {}): Row => ({
  id: TUNDE, org_id: ORG, project_id: P, name: "Tunde Okafor", role: "lead", kind: "individual", status: "draft",
  merged_into: null, created_from_version_id: V, created_at: NOW, updated_at: NOW, ...over,
});

describe("Casting routes", () => {
  let rows: Rows;
  beforeEach(() => {
    rows = {
      projects: [{ id: P, org_id: ORG }],
      scripts: [{ id: "s", project_id: P, approved_version_id: V }],
      script_versions: [{ id: V, version_number: 3, elements: screenplayFormatEngine({ source_text: SCRIPT }).elements }],
      characters: [],
      character_aliases: [],
      character_appearances: [],
      jobs: [],
    };
  });

  it("refuses to sync before the script is approved (412, plain-language message)", async () => {
    rows.scripts = [];
    const app = await appWith(fakeDb(rows));
    const res = await app.inject({ method: "POST", url: `/api/projects/${P}/characters/sync`, payload: {} });
    expect(res.statusCode).toBe(412);
    expect(res.json().error.message).toMatch(/Approve the script/);
  });

  it("creates confident characters, holds uncertain ones, and stamps the engine version", async () => {
    const fake = fakeDb(rows, () => ({ data: { created: 2 } }));
    const app = await appWith(fake);
    const res = await app.inject({ method: "POST", url: `/api/projects/${P}/characters/sync`, payload: {} });
    expect(res.statusCode).toBe(200);
    const { fn, args } = fake.calls[0];
    expect(fn).toBe("sync_script_characters");
    expect(args.p_version_id).toBe(V);
    expect(args.p_engine_version).toMatch(/^\d+\.\d+\.\d+$/);
    const items = args.p_items as Row[];
    expect(items.map((i) => [i.decision, i.name]).sort()).toEqual([
      ["create", "Amara Bello"],
      ["create", "Tunde Okafor"],
    ]);
    const tunde = items.find((i) => i.name === "Tunde Okafor") as { aliases: { alias: string; normalized: string }[]; appearances: unknown[]; age: string };
    expect(tunde.aliases).toEqual([{ alias: "Tunde", normalized: "TUNDE" }]);
    expect(tunde.age).toBe("35");
    expect(res.json().pending.map((c: { key: string }) => c.key)).toEqual(["DETECTIVE RAMOS"]);
  });

  it("creates a held candidate once confirmed", async () => {
    const fake = fakeDb(rows, () => ({ data: {} }));
    const app = await appWith(fake);
    await app.inject({ method: "POST", url: `/api/projects/${P}/characters/sync`, payload: { confirm: ["DETECTIVE RAMOS"] } });
    expect((fake.calls[0].args.p_items as Row[]).map((i) => i.name)).toContain("Detective Ramos");
  });

  it("matches existing characters by alias instead of duplicating them", async () => {
    rows.characters = [character()];
    rows.character_aliases = [{ id: "aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1", project_id: P, character_id: TUNDE, alias: "Tunde", normalized: "TUNDE", source: "script" }];
    const fake = fakeDb(rows, () => ({ data: {} }));
    const app = await appWith(fake);
    await app.inject({ method: "POST", url: `/api/projects/${P}/characters/sync`, payload: {} });
    const items = fake.calls[0].args.p_items as Row[];
    expect(items.find((i) => i.character_id === TUNDE)).toMatchObject({ decision: "match" });
    expect(items.filter((i) => i.decision === "create").map((i) => i.name)).toEqual(["Amara Bello"]);
  });

  it("points out characters named twice (owner report 2026-09-30) and remembers a \"not the same\" answer through the gated function", async () => {
    const AMARA = "66666666-6666-4666-8666-666666666666", AMARA2 = "66666666-6666-4666-8666-666666666667";
    rows.characters = [character(), character({ id: AMARA, name: "Amara Bello" }), character({ id: AMARA2, name: "Amara" })];
    const fake = fakeDb(rows);
    const app = await appWith(fake);
    const ws = (await app.inject({ method: "GET", url: `/api/projects/${P}/characters` })).json();
    expect(ws.duplicates).toEqual([expect.objectContaining({ keep_id: AMARA, merge_id: AMARA2, keep_name: "Amara Bello", merge_name: "Amara" })]);
    expect((await app.inject({ method: "POST", url: `/api/projects/${P}/characters/distinct`, payload: { a_id: AMARA, b_id: AMARA } })).statusCode).toBe(400);
    const r = await app.inject({ method: "POST", url: `/api/projects/${P}/characters/distinct`, payload: { a_id: AMARA, b_id: AMARA2 } });
    expect(r.statusCode).toBe(200);
    expect(fake.calls.find((c) => c.fn === "mark_characters_distinct")?.args).toEqual({ p_a: AMARA, p_b: AMARA2 });
    rows.characters[2].distinct_from = [AMARA];
    expect((await (await appWith(fakeDb(rows))).inject({ method: "GET", url: `/api/projects/${P}/characters` })).json().duplicates).toEqual([]);
  });

  it("one click fills only EMPTY profile fields for the whole cast from the script and story (owner request 2026-09-30); written fields are never changed", async () => {
    const AMARA = "66666666-6666-4666-8666-666666666666";
    rows.projects = [{ id: P, org_id: ORG, setting: "Lagos, Nigeria", time_period: "Present day", logline: null }];
    rows.scenes = [{ id: "sc1", project_id: P, location: "LAGOS HARBOUR", status: "active" }];
    rows.characters = [character({ age: null, description: null }), character({ id: AMARA, name: "Amara Bello", description: "Written by the director", accent: "Her own accent" })];
    rows.character_aliases = [
      { id: "aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1", project_id: P, character_id: TUNDE, alias: "Tunde Okafor", normalized: "TUNDE OKAFOR", source: "name" },
      { id: "aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaa2", project_id: P, character_id: AMARA, alias: "Amara Bello", normalized: "AMARA BELLO", source: "name" },
    ];
    rows.character_appearances = [{ character_id: TUNDE, scene_id: "sc1", project_id: P }, { character_id: AMARA, scene_id: "sc1", project_id: P }];
    const fake = fakeDb(rows, () => ({ data: character() }));
    const r = await (await appWith(fake)).inject({ method: "POST", url: `/api/projects/${P}/characters/apply-suggestions` });
    expect(r.statusCode).toBe(200);
    const patches = fake.calls.filter((c) => c.fn === "update_character").map((c) => [c.args.p_character_id, c.args.p_patch]);
    const tunde = patches.find(([id]) => id === TUNDE)![1] as Row;
    expect(tunde).toMatchObject({ age: "35" });
    expect(String(tunde.description)).toMatch(/reviews documents/);
    const amara = patches.find(([id]) => id === AMARA)?.[1] as Row | undefined;
    expect(amara?.description).toBeUndefined();
    expect(amara?.accent).toBeUndefined();
    expect(r.json().updated.map((u: Row) => u.name)).toContain("Tunde Okafor");
  });

  it("reports sync state honestly: never / current / stale", async () => {
    let app = await appWith(fakeDb(rows));
    const first = await app.inject({ method: "GET", url: `/api/projects/${P}/characters` });
    if (first.statusCode !== 200) throw new Error(first.body);
    expect((await app.inject({ method: "GET", url: `/api/projects/${P}/characters` })).json().sync.state).toBe("never");

    rows.characters = [character(), character({ id: "66666666-6666-4666-8666-666666666666", name: "Amara Bello", role: "lead" })];
    rows.character_aliases = [
      { id: "aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1", project_id: P, character_id: TUNDE, alias: "Tunde Okafor", normalized: "TUNDE OKAFOR", source: "name" },
      { id: "aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaa2", project_id: P, character_id: "66666666-6666-4666-8666-666666666666", alias: "Amara Bello", normalized: "AMARA BELLO", source: "name" },
    ];
    rows.jobs = [{ project_id: P, engine_id: "character.characterCandidateExtractionEngine", status: "completed", input_snapshot: { script_version_id: V }, output_refs: {}, engine_version: "1.0.0", completed_at: NOW }];
    app = await appWith(fakeDb(rows));
    const ws = (await app.inject({ method: "GET", url: `/api/projects/${P}/characters` })).json();
    expect(ws.sync.state).toBe("current");
    expect(ws.pending.map((c: { key: string }) => c.key)).toEqual(["DETECTIVE RAMOS"]);
    expect(ws.script.version_number).toBe(3);

    rows.jobs[0].input_snapshot = { script_version_id: "77777777-7777-4777-8777-777777777777" };
    app = await appWith(fakeDb(rows));
    expect((await app.inject({ method: "GET", url: `/api/projects/${P}/characters` })).json().sync.state).toBe("stale");
  });

  it("renames with a normalised name and maps a name clash to 409", async () => {
    rows.characters = [character()];
    const fake = fakeDb(rows, () => ({ error: { message: "AURA-CHR-409: another character already uses that name", code: "P0409" } }));
    const app = await appWith(fake);
    const res = await app.inject({ method: "PATCH", url: `/api/characters/${TUNDE}`, payload: { name: "Mr. Ramos" } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.message).toBe("another character already uses that name");
    expect(fake.calls[0].args).toMatchObject({ p_character_id: TUNDE, p_normalized_name: "MR RAMOS" });
  });

  it("validates edits (400) and hides other projects' characters (403)", async () => {
    rows.characters = [character()];
    const app = await appWith(fakeDb(rows));
    expect((await app.inject({ method: "PATCH", url: `/api/characters/${TUNDE}`, payload: { role: "hero" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "PATCH", url: `/api/characters/${TUNDE}`, payload: {} })).statusCode).toBe(400);
    expect((await app.inject({ method: "PATCH", url: `/api/characters/99999999-9999-4999-8999-999999999999`, payload: { age: "3" } })).statusCode).toBe(403);
    expect((await app.inject({ method: "GET", url: `/api/projects/not-a-uuid/characters` })).statusCode).toBe(403);
  });

  it("adds aliases with their normalised form", async () => {
    rows.characters = [character()];
    const fake = fakeDb(rows, () => ({ data: { id: "88888888-8888-4888-8888-888888888888", character_id: TUNDE, alias: "T.O.", normalized: "TO", source: "user" } }));
    const app = await appWith(fake);
    const res = await app.inject({ method: "POST", url: `/api/characters/${TUNDE}/aliases`, payload: { alias: "T.O." } });
    expect(res.statusCode).toBe(201);
    expect(fake.calls[0].args).toMatchObject({ p_alias: "T.O.", p_normalized: "TO" });
  });

  it("re-syncs after undoing a merge so the character gets its scenes back", async () => {
    rows.characters = [character({ merged_into: "66666666-6666-4666-8666-666666666666" })];
    const fake = fakeDb(rows, (fn) => ({ data: fn === "unmerge_character" ? character() : {} }));
    const app = await appWith(fake);
    const res = await app.inject({ method: "POST", url: `/api/characters/${TUNDE}/unmerge` });
    expect(res.statusCode).toBe(200);
    expect(fake.calls.map((c) => c.fn)).toEqual(["unmerge_character", "sync_script_characters"]);
  });

  it("creates a character by hand with its normalised name (201) and maps a clash to 409", async () => {
    const fake = fakeDb(rows, () => ({ data: character({ name: "Chief Adeyemi", role: "supporting" }) }));
    const app = await appWith(fake);
    const res = await app.inject({ method: "POST", url: `/api/projects/${P}/characters`, payload: { name: "Chief Adeyemi", role: "supporting" } });
    expect(res.statusCode).toBe(201);
    expect(fake.calls[0]).toMatchObject({ fn: "create_character", args: { p_name: "Chief Adeyemi", p_normalized: "CHIEF ADEYEMI", p_role: "supporting", p_kind: "individual" } });
    const clash = await appWith(fakeDb(rows, () => ({ error: { message: "AURA-CHR-409: a character with that name already exists" } })));
    expect((await clash.inject({ method: "POST", url: `/api/projects/${P}/characters`, payload: { name: "Tunde" } })).statusCode).toBe(409);
    expect((await clash.inject({ method: "POST", url: `/api/projects/${P}/characters`, payload: { name: "" } })).statusCode).toBe(400);
  });

  it("sets relationships and wardrobe looks through the database functions", async () => {
    const OTHER = "66666666-6666-4666-8666-666666666666";
    rows.characters = [character()];
    const fake = fakeDb(rows, (fn) => ({
      data:
        fn === "set_character_relationship"
          ? { id: "77777777-7777-4777-8777-777777777777", project_id: P, character_a: TUNDE, character_b: OTHER, relationship: "Sister", description: null, created_at: NOW, updated_at: NOW }
          : { id: "88888888-8888-4888-8888-888888888888", project_id: P, character_id: TUNDE, name: "Field outfit", description: "Khaki", created_at: NOW, updated_at: NOW },
    }));
    const app = await appWith(fake);
    const rel = await app.inject({ method: "POST", url: `/api/projects/${P}/relationships`, payload: { character_a: TUNDE, character_b: OTHER, relationship: "Sister" } });
    expect(rel.statusCode).toBe(200);
    expect(fake.calls[0].args).toMatchObject({ p_a: TUNDE, p_b: OTHER, p_relationship: "Sister", p_description: null });
    const look = await app.inject({ method: "POST", url: `/api/characters/${TUNDE}/looks`, payload: { name: "Field outfit", description: "Khaki" } });
    expect(look.statusCode).toBe(200);
    expect(fake.calls[1].args).toMatchObject({ p_id: null, p_character_id: TUNDE, p_name: "Field outfit", p_description: "Khaki" });
    expect((await app.inject({ method: "POST", url: `/api/characters/${TUNDE}/looks`, payload: { name: "" } })).statusCode).toBe(400);
  });

  it("refuses to delete relationships/looks the caller cannot see (403)", async () => {
    const app = await appWith(fakeDb(rows));
    expect((await app.inject({ method: "DELETE", url: `/api/relationships/99999999-9999-4999-8999-999999999999` })).statusCode).toBe(403);
    expect((await app.inject({ method: "DELETE", url: `/api/looks/not-a-uuid` })).statusCode).toBe(403);
  });
});
