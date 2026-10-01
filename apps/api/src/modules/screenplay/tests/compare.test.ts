import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerScreenplayRoutes } from "../screenplay.controller";

const P = "11111111-1111-4111-8111-111111111111", S = "33333333-3333-4333-8333-333333333333";
const V1 = "44444444-4444-4444-8444-444444444441", V2 = "44444444-4444-4444-8444-444444444442", OTHER = "44444444-4444-4444-8444-444444444449";
const rows: Record<string, Record<string, unknown>[]> = {
  projects: [{ id: P }],
  scripts: [{ id: S, project_id: P }],
  script_versions: [
    { id: V1, script_id: S, version_number: 1, note: null, source_text: "INT. ROOM - DAY\n\nShe waits.\n" },
    { id: V2, script_id: S, version_number: 2, note: "Rewrite", source_text: "INT. ROOM - DAY\n\nShe waits, afraid.\n\nEXT. STREET - NIGHT\n\nRain.\n" },
    { id: OTHER, script_id: "99999999-9999-4999-8999-999999999999", version_number: 1, note: null, source_text: "x" },
  ],
};
async function app() {
  const a = Fastify();
  const from = (t: string) => { const f: [string, unknown][] = []; const res = () => (rows[t] ?? []).filter((r) => f.every(([k, v]) => r[k] === v));
    const q: any = { select: () => q, eq: (k: string, v: unknown) => (f.push([k, v]), q), limit: () => q, maybeSingle: async () => ({ data: res()[0] ?? null, error: null }), then: (ok: any) => ok({ data: res(), error: null }) }; return q; };
  a.addHook("onRequest", async (req) => void ((req as any).db = { from }));
  await registerScreenplayRoutes(a);
  return a;
}

describe("version compare", () => {
  it("compares two saved versions scene by scene", async () => {
    const r = await (await app()).inject({ method: "GET", url: `/api/projects/${P}/script/compare?from=${V1}&to=${V2}` });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ from: { version_number: 1 }, to: { version_number: 2, note: "Rewrite" }, summary: { changed: 1, added: 1, removed: 0 } });
  });
  it("won't compare a version from another project (404) or without two versions (400)", async () => {
    const a = await app();
    expect((await a.inject({ method: "GET", url: `/api/projects/${P}/script/compare?from=${V1}&to=${OTHER}` })).statusCode).toBe(404);
    expect((await a.inject({ method: "GET", url: `/api/projects/${P}/script/compare?from=${V1}` })).statusCode).toBe(400);
  });
});
