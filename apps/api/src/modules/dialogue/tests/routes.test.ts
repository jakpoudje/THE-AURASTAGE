// Route tests for Dialogue Intelligence with an in-memory stand-in for the
// per-request Supabase client. Database behaviour is covered by
// tests/integration/dialogue_db.sql.
import Fastify from "fastify";
import { beforeEach, describe, expect, it } from "vitest";
import { screenplayFormatEngine } from "@aurastage/engines";
import { registerDialogueRoutes } from "../dialogue.controller";

const P = "11111111-1111-4111-8111-111111111111";
const ORG = "22222222-2222-4222-8222-222222222222";
const V = "44444444-4444-4444-8444-444444444444";
const TUNDE = "55555555-5555-4555-8555-555555555555";
const AMARA = "66666666-6666-4666-8666-666666666666";
const OLD_AMARA = "77777777-7777-4777-8777-777777777777";
const SCENE = "88888888-8888-4888-8888-888888888888";
const LINE = "99999999-9999-4999-8999-999999999999";
const NOW = "2026-09-27T00:00:00Z";

type Row = Record<string, unknown>;
function fakeDb(rows: Record<string, Row[]>, rpcImpl: (fn: string, args: Row) => { data?: unknown; error?: unknown } = () => ({})) {
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
  await registerDialogueRoutes(app);
  return app;
}

const SCRIPT = `INT. NEWSROOM - MORNING

TUNDE OKAFOR (35) and AMARA BELLO (32) argue. A VOICE on the radio.

TUNDE
(quietly)
They buried it.

AMARA
Then dig it up!

RADIO (V.O.)
Breaking news.
`;

const lineRow = (over: Row = {}): Row => ({
  id: LINE, org_id: ORG, project_id: P, scene_id: SCENE, scene_number: 1, ordinal: 1, character_id: TUNDE, speaker_name: "TUNDE",
  speaker_key: "TUNDE", extensions: [], parenthetical: "(quietly)", text: "They buried it.", text_hash: "x", listener_ids: [AMARA],
  estimated_seconds: "1.7", element_index: 2, source_version_id: V, intention: null, subtext: null, emotion: null, intensity: null,
  notes: null, status: "active", approval: "draft", review_state: "current", previous_text: null, created_at: NOW, updated_at: NOW, ...over,
});

describe("Dialogue routes", () => {
  let rows: Record<string, Row[]>;
  beforeEach(() => {
    rows = {
      projects: [{ id: P }],
      scripts: [{ id: "s", project_id: P, approved_version_id: V }],
      script_versions: [{ id: V, version_number: 2, elements: screenplayFormatEngine({ source_text: SCRIPT }).elements }],
      scenes: [{ id: SCENE, project_id: P, number: 1, heading: "INT. NEWSROOM - MORNING", status: "active", review_state: "current" }],
      characters: [
        { id: TUNDE, project_id: P, name: "Tunde Okafor", merged_into: null },
        { id: AMARA, project_id: P, name: "Amara Bello", merged_into: null },
        { id: OLD_AMARA, project_id: P, name: "Amara", merged_into: AMARA },
      ],
      character_aliases: [
        { project_id: P, character_id: TUNDE, normalized: "TUNDE" },
        { project_id: P, character_id: OLD_AMARA, normalized: "AMARA" },
      ],
      character_appearances: [
        { project_id: P, character_id: TUNDE, scene_number: 1, voice_only: false },
        { project_id: P, character_id: AMARA, scene_number: 1, voice_only: false },
      ],
      dialogue_lines: [],
      jobs: [],
    };
  });

  it("refuses to sync before the script is approved (412)", async () => {
    rows.scripts = [];
    const res = await (await appWith(fakeDb(rows))).inject({ method: "POST", url: `/api/projects/${P}/dialogue/sync` });
    expect(res.statusCode).toBe(412);
  });

  it("syncs lines with resolved speakers (following merges), listeners and the engine version", async () => {
    const fake = fakeDb(rows, () => ({ data: { created: 3 } }));
    const res = await (await appWith(fake)).inject({ method: "POST", url: `/api/projects/${P}/dialogue/sync` });
    expect(res.statusCode).toBe(200);
    const { fn, args } = fake.calls[0];
    expect(fn).toBe("sync_dialogue_lines");
    expect(args.p_version_id).toBe(V);
    const items = args.p_items as Row[];
    expect(items.map((i) => [i.speaker_name, i.character_id])).toEqual([
      ["TUNDE", TUNDE],
      ["AMARA", AMARA], // alias belongs to a merged character -> resolved to the survivor
      ["RADIO", null], // not in Casting: left unresolved, never guessed
    ]);
    expect(items[0].listener_ids).toEqual([AMARA]);
    expect(items[0].parenthetical).toBe("(quietly)");
    expect(items[2].extensions).toEqual(["V.O."]);
  });

  it("returns the workspace with honest sync state and analysis", async () => {
    rows.dialogue_lines = [
      lineRow(),
      lineRow({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", ordinal: 2, character_id: null, speaker_name: "RADIO", speaker_key: "RADIO", text: "Breaking news.", listener_ids: [] }),
    ];
    rows.jobs = [{ project_id: P, engine_id: "dialogue.dialogueExtractionEngine", status: "completed", input_snapshot: { script_version_id: V }, completed_at: NOW }];
    const ws = (await (await appWith(fakeDb(rows))).inject({ method: "GET", url: `/api/projects/${P}/dialogue` })).json();
    expect(ws.sync.state).toBe("current");
    expect(ws.script.version_number).toBe(2);
    expect(ws.lines).toHaveLength(2);
    expect(ws.lines[0].estimated_seconds).toBe(1.7);
    expect(ws.analysis.unresolved_speakers).toEqual(["RADIO"]);
    expect(ws.analysis.balance[0].speakers.map((s: Row) => s.speaker_key)).toEqual(["TUNDE", "RADIO"]);
    expect(ws.characters.map((c: Row) => c.name)).toEqual(["Tunde Okafor", "Amara Bello"]);
  });

  it("annotates a line and validates the emotion vocabulary", async () => {
    rows.dialogue_lines = [lineRow()];
    const fake = fakeDb(rows, () => ({ data: lineRow({ emotion: "tension", intensity: 7 }) }));
    const app = await appWith(fake);
    const ok = await app.inject({ method: "PATCH", url: `/api/dialogue-lines/${LINE}`, payload: { emotion: "tension", intensity: 7 } });
    expect(ok.statusCode).toBe(200);
    expect(fake.calls[0]).toMatchObject({ fn: "update_dialogue_line", args: { p_id: LINE, p_patch: { emotion: "tension", intensity: 7 } } });
    expect((await app.inject({ method: "PATCH", url: `/api/dialogue-lines/${LINE}`, payload: { emotion: "rage" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "PATCH", url: `/api/dialogue-lines/${LINE}`, payload: { intensity: 11 } })).statusCode).toBe(400);
    expect((await app.inject({ method: "PATCH", url: `/api/dialogue-lines/${LINE}`, payload: {} })).statusCode).toBe(400);
  });

  it("approves a scene only if it belongs to the project", async () => {
    const fake = fakeDb(rows, () => ({ data: 3 }));
    const app = await appWith(fake);
    const res = await app.inject({ method: "POST", url: `/api/projects/${P}/dialogue/scenes/${SCENE}/approve` });
    expect(res.json()).toEqual({ approved_lines: 3 });
    rows.scenes[0].project_id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    expect((await (await appWith(fakeDb(rows))).inject({ method: "POST", url: `/api/projects/${P}/dialogue/scenes/${SCENE}/approve` })).statusCode).toBe(403);
  });

  it("maps database refusals to clear errors", async () => {
    rows.dialogue_lines = [lineRow()];
    const app = await appWith(fakeDb(rows, () => ({ error: { message: "AURA-DLG-409: this line is no longer in the approved script" } })));
    const res = await app.inject({ method: "PATCH", url: `/api/dialogue-lines/${LINE}`, payload: { approval: "approved" } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.message).toBe("this line is no longer in the approved script");
    expect((await app.inject({ method: "PATCH", url: `/api/dialogue-lines/not-a-uuid`, payload: { notes: "x" } })).statusCode).toBe(403);
  });
});
