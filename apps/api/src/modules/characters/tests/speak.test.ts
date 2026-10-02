import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerCharactersRoutes } from "../characters.controller";

type Row = Record<string, any>;
const P = "11111111-1111-4111-8111-111111111111", C = "22222222-2222-4222-8222-222222222222";
const L1 = "33333333-3333-4333-8333-333333333333", L2 = "44444444-4444-4444-8444-444444444444", OTHER = "55555555-5555-4555-8555-555555555555";
function fakeDb(rows: Record<string, Row[]>) {
  const from = (t: string) => {
    const f: ((r: Row) => boolean)[] = [];
    const get = (r: Row, k: string) => (k.includes("->>") ? r[k.split("->>")[0]]?.[k.split("->>")[1]] : r[k]);
    const res = () => (rows[t] ?? []).filter((r) => f.every((x) => x(r)));
    const q: any = {
      select: () => q, order: () => q, limit: () => q,
      eq: (k: string, v: unknown) => (f.push((r) => get(r, k) === v), q),
      neq: (k: string, v: unknown) => (f.push((r) => get(r, k) !== v), q),
      not: (k: string) => (f.push((r) => get(r, k) != null), q),
      in: (k: string, vs: unknown[]) => (f.push((r) => vs.includes(get(r, k))), q),
      maybeSingle: async () => ({ data: res()[0] ?? null, error: null }), then: (ok: any) => ok({ data: res(), error: null }),
    };
    return q;
  };
  return { from, rpc: async () => ({ data: null, error: null }) };
}
const rows = (): Record<string, Row[]> => ({
  projects: [{ id: P, genre: "Political thriller", subgenre: null }],
  characters: [{ id: C, project_id: P, name: "Amara Bello", age: "32", gender: "Woman", description: "Dark skin, almond-shaped eyes, braids", merged_into: null }],
  wardrobe_looks: [], character_age_states: [], project_settings: [],
  dialogue_lines: [
    { id: L1, project_id: P, character_id: C, scene_number: 1, ordinal: 1, text: "You came. I waited all night.", emotion: "relief", status: "active" },
    { id: L2, project_id: P, character_id: C, scene_number: 2, ordinal: 1, text: "Mama, open the door!", emotion: "fear", status: "active" },
    { id: OTHER, project_id: P, character_id: "x", scene_number: 1, ordinal: 2, text: "Not hers.", status: "active" },
  ],
  audio_clips: [{ project_id: P, kind: "asset", asset_id: "aaaa", duration_seconds: 2.4, source: { dialogue_line_id: L1 } }],
});
async function app(r = rows()) {
  const a = Fastify();
  a.addHook("onRequest", async (req) => void ((req as any).db = fakeDb(r)));
  await registerCharactersRoutes(a);
  return a;
}

describe("See them speak (owner request 2026-10-02: animate their speech)", () => {
  it("lists the character's own lines, says which have a voice, and the genre's style", async () => {
    const r = (await (await app()).inject({ method: "GET", url: `/api/characters/${C}/speak` })).json();
    expect(r.lines.map((l: Row) => [l.id, l.has_voice])).toEqual([[L1, true], [L2, false]]);
    expect(r.style.id).toBe("thriller");
    expect(r.svg).toBeUndefined();
  });
  it("a line with a voice is timed to the voice; one without is estimated; the drawing speaks and blinks", async () => {
    const a = await app();
    const v = (await a.inject({ method: "GET", url: `/api/characters/${C}/speak?line_id=${L1}` })).json();
    expect(v).toMatchObject({ seconds: 2.4, timed_by: "voice", voice_asset_id: "aaaa" });
    expect(v.svg).toContain('dur="3.6s"');
    expect(v.svg).toContain("<animate");
    expect(v.mouth_shapes).toBeGreaterThan(4);
    const e = (await a.inject({ method: "GET", url: `/api/characters/${C}/speak?line_id=${L2}&angle=three_quarter` })).json();
    expect(e.timed_by).toBe("estimate");
    expect(e.voice_asset_id).toBeNull();
    expect(e.seconds).toBeGreaterThan(1);
  });
  it("another character's line and bad ids are refused", async () => {
    const a = await app();
    expect((await a.inject({ method: "GET", url: `/api/characters/${C}/speak?line_id=${OTHER}` })).statusCode).toBe(400);
    expect((await a.inject({ method: "GET", url: `/api/characters/${C}/speak?line_id=nope` })).statusCode).toBe(400);
  });
});
