import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

const stored: Record<string, Buffer> = {};
vi.mock("../../../storage/media", () => ({
  mediaConfigured: (env: Record<string, string | undefined>) => !!env.MEDIA_BUCKET,
  putMedia: async (key: string, bytes: Buffer) => void (stored[key] = Buffer.from(bytes)),
  getMedia: async (key: string) => ({ bytes: new Uint8Array(stored[key] ?? []), contentType: "application/octet-stream" }),
}));
import { registerAssetsRoutes } from "../assets.controller";

const P = "11111111-1111-4111-8111-111111111111";
const ORG = "22222222-2222-4222-8222-222222222222";
const A = "33333333-3333-4333-8333-333333333333";

function wav(samples = 100) {
  const b = Buffer.alloc(44 + samples * 2);
  b.write("RIFF", 0, "latin1"); b.writeUInt32LE(36 + samples * 2, 4); b.write("WAVE", 8, "latin1");
  return b;
}
function app(rows: Record<string, any[]>, calls: any[]) {
  const a = Fastify();
  a.addHook("onRequest", async (req) => {
    (req as any).db = {
      from: (t: string) => {
        const f: [string, unknown][] = [];
        const q: any = {
          select: () => q, eq: (k: string, v: unknown) => (f.push([k, v]), q), order: () => q,
          maybeSingle: async () => ({ data: (rows[t] ?? []).filter((r) => f.every(([k, v]) => r[k] === v))[0] ?? null, error: null }),
          then: (ok: any) => ok({ data: (rows[t] ?? []).filter((r) => f.every(([k, v]) => r[k] === v)), error: null }),
        };
        return q;
      },
      rpc: async (fn: string, args: any) => (calls.push({ fn, args }), { data: { id: A, project_id: P, type: "audio", name: args.p_name, checksum: args.p_checksum, metadata: args.p_metadata, created_at: "now" }, error: null }),
    };
  });
  return a;
}

describe("Assets routes (audio upload)", () => {
  let rows: Record<string, any[]>;
  const env = process.env;
  beforeEach(() => {
    rows = { projects: [{ id: P, org_id: ORG }], assets: [] };
    process.env = { ...env, MEDIA_BUCKET: "b" };
  });

  it("stores a real WAV privately, fingerprints it and registers it through the Assets domain", async () => {
    const calls: any[] = [];
    const a = app(rows, calls);
    await registerAssetsRoutes(a);
    const res = await a.inject({ method: "POST", url: `/api/projects/${P}/assets/audio?name=Tunde%20line%201&duration=1.25&sample_rate=48000&channels=1`, headers: { "content-type": "audio/wav" }, payload: wav() });
    expect(res.statusCode).toBe(201);
    expect(calls[0].fn).toBe("register_asset");
    expect(calls[0].args).toMatchObject({ p_project_id: P, p_type: "audio", p_name: "Tunde line 1" });
    expect(calls[0].args.p_checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(calls[0].args.p_metadata).toMatchObject({ media_type: "audio/wav", size_bytes: 244, duration_seconds: 1.25, sample_rate: 48000, channels: 1 });
    expect(calls[0].args.p_storage_path).toMatch(new RegExp(`^${ORG}/${P}/assets/.+\\.wav$`));
    expect(Object.keys(stored)).toContain(calls[0].args.p_storage_path);
  });

  it("refuses files that only pretend to be audio, and non-audio types", async () => {
    const a = app(rows, []);
    await registerAssetsRoutes(a);
    const fake = await a.inject({ method: "POST", url: `/api/projects/${P}/assets/audio?name=x`, headers: { "content-type": "audio/wav" }, payload: Buffer.from("<html>not audio at all</html>") });
    expect(fake.statusCode).toBe(400);
    expect(fake.json().error.message).toMatch(/doesn't look like audio/);
    const noName = await a.inject({ method: "POST", url: `/api/projects/${P}/assets/audio`, headers: { "content-type": "audio/wav" }, payload: wav() });
    expect(noName.json().error.message).toBe("Give the recording a name.");
  });

  it("says plainly when storage isn't set up (412) and refuses other projects (403)", async () => {
    process.env = { ...env, MEDIA_BUCKET: "" };
    const a = app(rows, []);
    await registerAssetsRoutes(a);
    expect((await a.inject({ method: "POST", url: `/api/projects/${P}/assets/audio?name=x`, headers: { "content-type": "audio/wav" }, payload: wav() })).statusCode).toBe(412);
    rows.projects = [];
    expect((await a.inject({ method: "GET", url: `/api/projects/${P}/assets?type=audio` })).statusCode).toBe(403);
  });

  it("streams the bytes back only to members, with the stored type", async () => {
    stored["k1"] = Buffer.from([1, 2, 3]);
    rows.assets = [{ id: A, project_id: P, name: "x", storage_path: "k1", metadata: { media_type: "audio/wav" } }];
    const a = app(rows, []);
    await registerAssetsRoutes(a);
    const res = await a.inject({ method: "GET", url: `/api/assets/${A}/content` });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("audio/wav");
    expect([...res.rawPayload]).toEqual([1, 2, 3]);
  });
});
