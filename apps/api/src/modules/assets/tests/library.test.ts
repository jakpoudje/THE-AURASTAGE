import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

const stored: Record<string, Buffer> = {};
vi.mock("../../../storage/media", () => ({
  mediaConfigured: (env: Record<string, string | undefined> = process.env) => !!env.MEDIA_BUCKET,
  putMedia: async (key: string, bytes: Buffer) => void (stored[key] = Buffer.from(bytes)),
  getMedia: async (key: string) => ({ bytes: new Uint8Array(stored[key] ?? []), contentType: "application/octet-stream" }),
}));
import { registerAssetsRoutes } from "../assets.controller";

const P = "11111111-1111-4111-8111-111111111111";
const ORG = "22222222-2222-4222-8222-222222222222";
const IMG = "33333333-3333-4333-8333-333333333333";
const WAV = "44444444-4444-4444-8444-444444444444";
const S1 = "55555555-5555-4555-8555-555555555555";
const CH = "66666666-6666-4666-8666-666666666666";
const SESS = "77777777-7777-4777-8777-777777777777";

const png = (extra = 0) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16 + extra, 1)]);

function app(rows: Record<string, any[]>, calls: any[]) {
  const a = Fastify();
  a.addHook("onRequest", async (req) => {
    (req as any).db = {
      from: (t: string) => {
        const f: ((r: any) => boolean)[] = [];
        const res = () => (rows[t] ?? []).filter((r) => f.every((x) => x(r)));
        const q: any = {
          select: () => q, order: () => q, limit: () => q,
          eq: (k: string, v: unknown) => (f.push((r) => r[k] === v), q),
          neq: (k: string, v: unknown) => (f.push((r) => r[k] !== v), q),
          not: (k: string) => (f.push((r) => r[k] !== null && r[k] !== undefined), q),
          maybeSingle: async () => ({ data: res()[0] ?? null, error: null }),
          then: (ok: any) => ok({ data: res(), error: null }),
        };
        return q;
      },
      rpc: async (fn: string, args: any) => {
        calls.push({ fn, args });
        if (fn === "register_asset") {
          const row = { id: IMG, org_id: ORG, project_id: P, type: args.p_type, name: args.p_name, storage_path: args.p_storage_path, checksum: args.p_checksum,
            metadata: args.p_metadata, category: "visual_references", tags: [], description: "", current_version: 1, created_at: "2026-09-28T10:00:00Z" };
          rows.assets = [row, ...rows.assets.filter((x) => x.id !== IMG)];
          return { data: row, error: null };
        }
        if (fn === "add_asset_version") {
          const a0 = rows.assets.find((x) => x.id === args.p_asset);
          const n = (a0.current_version ?? 1) + 1;
          rows.asset_versions.push({ asset_id: a0.id, project_id: P, version_number: n, storage_path: args.p_storage_path, checksum: args.p_checksum, metadata: args.p_metadata, note: args.p_note, created_at: "2026-09-28T12:00:00Z" });
          Object.assign(a0, { storage_path: args.p_storage_path, checksum: args.p_checksum, metadata: args.p_metadata, current_version: n });
          return { data: { version_number: n }, error: null };
        }
        if (fn === "update_asset") {
          if (args.p_patch.name === "forbidden") return { data: null, error: { message: "AURA-COL-403: your role (Writer) can't edit in the Assets Library. Ask the project's producer for access.", code: "42501" } };
          Object.assign(rows.assets.find((x) => x.id === args.p_asset), args.p_patch);
          return { data: {}, error: null };
        }
        if (fn === "set_asset_link") {
          rows.asset_links.push({ asset_id: args.p_asset, project_id: P, object_type: args.p_object_type, object_id: args.p_object_id });
          return { data: 1, error: null };
        }
        return { data: null, error: null };
      },
    };
  });
  return a;
}

describe("Assets Library routes", () => {
  let rows: Record<string, any[]>;
  const env = process.env;
  beforeEach(() => {
    process.env = { ...env, MEDIA_BUCKET: "b" };
    stored["k/wav1.wav"] = Buffer.from("RIFF....WAVEold");
    rows = {
      projects: [{ id: P, org_id: ORG }],
      assets: [
        { id: WAV, org_id: ORG, project_id: P, type: "audio", category: "audio", name: "Tunde line 1", description: "Take 3, close mic", tags: ["dialogue"], storage_path: "k/wav1.wav",
          checksum: "a".repeat(64), metadata: { media_type: "audio/wav", size_bytes: 15, duration_seconds: 1.2 }, current_version: 1, created_at: "2026-09-27T10:00:00Z" },
      ],
      asset_versions: [{ asset_id: WAV, project_id: P, version_number: 1, storage_path: "k/wav1.wav", checksum: "a".repeat(64), metadata: { media_type: "audio/wav" }, note: "Original upload", created_at: "2026-09-27T10:00:00Z" }],
      asset_links: [],
      audio_clips: [{ asset_id: WAV, session_id: SESS, label: "Tunde line", project_id: P }],
      audio_sessions: [{ id: SESS, scene_id: S1, project_id: P }],
      scenes: [{ id: S1, number: 1, heading: "INT. NEWSROOM - MORNING", project_id: P }],
      characters: [{ id: CH, name: "Amara Bello", project_id: P }],
      renders: [{ id: "r1", project_id: P, profile_id: "audio_package", lock_number: 2, status: "succeeded", asset_ids: [WAV] }],
      audit_events: [],
    };
  });

  it("lists the library with usage evidence (Audio Studio clip, render manifest) and honest search scope", async () => {
    const a = app(rows, []);
    await registerAssetsRoutes(a);
    const res = await a.inject({ method: "GET", url: `/api/projects/${P}/library` });
    expect(res.statusCode).toBe(200);
    const b = res.json();
    expect(b.assets[0].usage.map((u: any) => u.label)).toEqual(["Scene 1 — INT. NEWSROOM - MORNING · Audio Studio", "Audio Package · Picture Lock 2"]);
    expect(b.category_counts).toEqual({ audio: 1 });
    expect(b.categories).toHaveLength(12);
    expect(b.search_note).toMatch(/isn't available yet/);
    expect((await a.inject({ method: "GET", url: `/api/projects/${P}/library?q=close%20mic` })).json().total).toBe(1);
    expect((await a.inject({ method: "GET", url: `/api/projects/${P}/library?usage=unused` })).json().total).toBe(0);
    expect((await a.inject({ method: "GET", url: `/api/projects/${P}/library?usage=sometimes` })).statusCode).toBe(400);
  });

  it("uploads an image checked by content into the chosen category; fakes and unsupported types are refused", async () => {
    const calls: any[] = [];
    const a = app(rows, calls);
    await registerAssetsRoutes(a);
    const res = await a.inject({ method: "POST", url: `/api/projects/${P}/library?name=Harbour%20dawn&category=locations&width=1920&height=1080`, headers: { "content-type": "image/png" }, payload: png() });
    expect(res.statusCode).toBe(201);
    expect(calls.map((c) => c.fn)).toEqual(["register_asset", "update_asset"]);
    expect(calls[0].args).toMatchObject({ p_type: "image", p_metadata: { media_type: "image/png", width: 1920, height: 1080 } });
    expect(calls[1].args.p_patch).toEqual({ category: "locations" });
    expect(res.json().asset.category).toBe("locations");
    const fake = await a.inject({ method: "POST", url: `/api/projects/${P}/library?name=x`, headers: { "content-type": "image/png" }, payload: Buffer.from("<svg>not a png</svg>") });
    expect(fake.json().error.message).toMatch(/don't match its type/);
    const exe = await a.inject({ method: "POST", url: `/api/projects/${P}/library?name=x`, headers: { "content-type": "application/pdf" }, payload: Buffer.from("MZ binary") });
    expect(exe.statusCode).toBe(400);
  });

  it("replace adds a version under a new key and keeps the old file; same file (409) or another kind (400) is refused", async () => {
    const calls: any[] = [];
    const a = app(rows, calls);
    await registerAssetsRoutes(a);
    const other = await a.inject({ method: "POST", url: `/api/assets/${WAV}/versions`, headers: { "content-type": "image/png" }, payload: png() });
    expect(other.json().error.message).toMatch(/same kind of file/);
    const wav2 = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVE"), Buffer.alloc(40, 2)]);
    const r = await a.inject({ method: "POST", url: `/api/assets/${WAV}/versions?note=Cleaner%20take`, headers: { "content-type": "audio/wav" }, payload: wav2 });
    expect(r.statusCode).toBe(201);
    const call = calls.find((c) => c.fn === "add_asset_version");
    expect(call.args.p_storage_path).not.toBe("k/wav1.wav");
    expect(call.args.p_note).toBe("Cleaner take");
    expect(r.json().asset.current_version).toBe(2);
    expect(r.json().versions.map((v: any) => [v.version_number, v.current])).toEqual([[1, false], [2, true]]);
    expect(stored["k/wav1.wav"].toString()).toBe("RIFF....WAVEold");
    const same = await a.inject({ method: "POST", url: `/api/assets/${WAV}/versions`, headers: { "content-type": "audio/wav" }, payload: wav2 });
    expect(same.statusCode).toBe(409);
    // Version 1's bytes are still downloadable.
    const v1 = await a.inject({ method: "GET", url: `/api/assets/${WAV}/content?version=1&download=1` });
    expect(v1.body).toBe("RIFF....WAVEold");
    expect(v1.headers["content-disposition"]).toBe('attachment; filename="Tunde line 1_v1.wav"');
  });

  it("edits metadata through the gated function, passes refusals through, and links to a character", async () => {
    const calls: any[] = [];
    const a = app(rows, calls);
    await registerAssetsRoutes(a);
    expect((await a.inject({ method: "PATCH", url: `/api/assets/${WAV}`, payload: { colour: "red" } })).statusCode).toBe(400);
    const ok = await a.inject({ method: "PATCH", url: `/api/assets/${WAV}`, payload: { tags: ["dialogue", "tunde"], category: "music_sound" } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().asset.category).toBe("music_sound");
    const no = await a.inject({ method: "PATCH", url: `/api/assets/${WAV}`, payload: { name: "forbidden" } });
    expect(no.statusCode).toBe(403);
    expect(no.json().error.message).toMatch(/your role \(Writer\) can't edit in the Assets Library/);
    const l = await a.inject({ method: "POST", url: `/api/assets/${WAV}/links`, payload: { object_type: "character", object_id: CH } });
    expect(l.json().links.map((x: any) => x.label)).toEqual(["Amara Bello · Casting"]);
    expect((await a.inject({ method: "POST", url: `/api/assets/${WAV}/links`, payload: { object_type: "planet", object_id: CH } })).statusCode).toBe(400);
  });
});
