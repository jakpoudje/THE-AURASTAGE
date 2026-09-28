import Fastify from "fastify";
import { beforeEach, describe, expect, it } from "vitest";
import { registerRenderingRoutes } from "../rendering.controller";

Object.assign(process.env, { MEDIA_BUCKET: "b", MEDIA_ENDPOINT: "https://storage.example.test", MEDIA_ACCESS_KEY_ID: "id", MEDIA_SECRET_ACCESS_KEY: "secret", MEDIA_REGION: "auto" });

const P = "11111111-1111-4111-8111-111111111111";
const ORG = "22222222-2222-4222-8222-222222222222";
const TL = "e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1";
const LOCK = "aaaa0000-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LV = "bbbb0000-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const S1 = "88888888-8888-4888-8888-888888888888";
const SH1 = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const TK1 = "b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1";
const SES = "abababab-abab-4bab-8bab-abababababab";
const AV1 = "c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1";
const AS1 = "d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1";
const L1 = "99999999-9999-4999-8999-999999999991";
const R1 = "f0f0f0f0-f0f0-4f0f-8f0f-f0f0f0f0f0f0";

type Row = Record<string, any>;
function fakeDb(rows: Record<string, Row[]>, rpcImpl: (fn: string, a: Row) => { data?: unknown; error?: unknown } = () => ({ data: {} })) {
  const calls: { fn: string; args: Row }[] = [];
  const from = (t: string) => {
    const f: ((r: Row) => boolean)[] = [];
    const res = () => (rows[t] ?? []).filter((r) => f.every((p) => p(r)));
    const q: any = {
      select: () => q, order: () => q,
      eq: (k: string, v: unknown) => (f.push((r) => r[k] === v), q),
      in: (k: string, v: unknown[]) => (f.push((r) => v.includes(r[k])), q),
      maybeSingle: async () => ({ data: res()[0] ?? null, error: null }), then: (ok: any) => ok({ data: res(), error: null }),
    };
    return q;
  };
  return { calls, db: { from, rpc: async (fn: string, args: Row) => { calls.push({ fn, args }); const r = rpcImpl(fn, args); return { data: r.data ?? null, error: r.error ?? null }; } } };
}
async function app(fake: ReturnType<typeof fakeDb>) {
  const a = Fastify();
  a.addHook("onRequest", async (req) => void ((req as any).db = fake.db));
  await registerRenderingRoutes(a);
  return a;
}
const lockedClips = () => [
  { id: "c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c1", track: "V1", kind: "take", record_in: 0, duration: 96, source_in: 0, source_frames: null, scene_id: S1, shot_id: SH1, take_id: TK1, audio_session_version_id: null, label: "Scene 1 · Shot 1", grade: {} },
  { id: "c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c2", track: "A1", kind: "audio_mix", record_in: 0, duration: 96, source_in: 0, source_frames: 96, scene_id: S1, shot_id: null, take_id: null, audio_session_version_id: AV1, label: "Scene 1 mix v1", grade: {} },
];
let rows: Record<string, Row[]>;
beforeEach(() => {
  rows = {
    projects: [{ id: P, title: "Shadows of Lagos", org_id: ORG }],
    timelines: [], picture_locks: [], timeline_versions: [], scenes: [{ id: S1, project_id: P, number: 1, heading: "EXT. HARBOUR - NIGHT" }],
    takes: [{ id: TK1, storage_key: "o/p/takes/s/t.svg", media_type: "image/svg+xml", capability: "image", params: {} }],
    audio_sessions: [{ id: SES, project_id: P, scene_id: S1, scene_seconds: "4", approved_version_id: AV1, status: "approved", review_state: "current" }],
    audio_session_versions: [{ id: AV1, session_id: SES, version_number: 1, measurement: { duration_seconds: 4, integrated_lufs: -23.2 },
      tracks: [{ id: "t", family: "DX", gain_db: 0, pan: 0, mute: false, solo: false }],
      clips: [{ track_id: "t", kind: "asset", asset_id: AS1, start_seconds: 1, duration_seconds: 1.5, offset_seconds: 0, gain_db: 0, fade_in_seconds: 0, fade_out_seconds: 0, source: { dialogue_line_id: L1 } }] }],
    assets: [{ id: AS1, storage_path: "o/p/assets/a.wav", metadata: { media_type: "audio/wav" } }],
    dialogue_lines: [{ id: L1, speaker_name: "TUNDE", text: "You came." }],
    renders: [],
  };
});
const locked = () => {
  rows.timelines = [{ id: TL, project_id: P, status: "locked", current_lock_id: LOCK, fps: 24 }];
  rows.picture_locks = [{ id: LOCK, lock_number: 1, version_id: LV, locked_at: "2026-09-28T00:00:00Z" }];
  rows.timeline_versions = [{ id: LV, fps: 24, duration_frames: 96, qc: { ready_for_lock: true }, clips: lockedClips() }];
};

describe("Export & Deliver routes", () => {
  it("without a Picture Lock: honest preflight, the profile catalogue and destinations", async () => {
    rows.timelines = [{ id: TL, project_id: P, status: "draft", current_lock_id: null, fps: 24 }];
    const ws = (await (await app(fakeDb(rows))).inject({ method: "GET", url: `/api/projects/${P}/delivery` })).json();
    expect(ws.picture_lock).toBeNull();
    expect(ws.preflight.find((c: Row) => c.id === "picture_locked")).toMatchObject({ ok: false, blocking: true, evidence: expect.stringMatching(/lock it in Editorial/) });
    expect(ws.profiles.find((p: Row) => p.id === "dcp_theatrical")).toMatchObject({ available: false, unavailable_reason: expect.any(String) });
    expect(ws.destinations.filter((d: Row) => d.state === "ready").map((d: Row) => d.id)).toEqual(["download"]);
    const res = await (await app(fakeDb(rows))).inject({ method: "POST", url: `/api/projects/${P}/delivery/renders`, payload: { profile_id: "streaming_master" } });
    expect(res.statusCode).toBe(412);
    expect(res.json().error.message).toMatch(/Lock the picture/);
  });

  it("with a lock: preflight passes and a render is queued with a checksummed manifest naming every source", async () => {
    locked();
    const ws = (await (await app(fakeDb(rows))).inject({ method: "GET", url: `/api/projects/${P}/delivery` })).json();
    expect(ws.preflight.filter((c: Row) => c.blocking).every((c: Row) => c.ok)).toBe(true);
    expect(ws.preflight.find((c: Row) => c.id === "subtitles").evidence).toBe("1 subtitle cue");
    const fake = fakeDb(rows, () => ({ data: { id: R1 } }));
    const res = await (await app(fake)).inject({ method: "POST", url: `/api/projects/${P}/delivery/renders`, payload: { profile_id: "review_copy", options: { watermark: "FOR REVIEW", burn_timecode: true } } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ render_id: R1, files: ["review_720p24.mp4"] });
    const a = fake.calls[0].args;
    expect(fake.calls[0].fn).toBe("create_render");
    expect(a).toMatchObject({ p_picture_lock_id: LOCK, p_profile_id: "review_copy", p_profile_version: "1.0.0", p_options: { watermark: "FOR REVIEW", burn_timecode: true } });
    expect(a.p_manifest_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(a.p_manifest.picture_lock).toEqual({ id: LOCK, lock_number: 1, timeline_version_id: LV });
    expect(a.p_manifest.sources).toEqual({ take_ids: [TK1], audio_session_version_ids: [AV1], asset_ids: [AS1], dialogue_line_ids: [L1] });
    expect(a.p_manifest.assets[AS1]).toEqual({ storage_key: "o/p/assets/a.wav", media_type: "audio/wav" });
  });

  it("refuses to render when a file is missing (masters, never placeholders) and rejects unknown formats", async () => {
    locked();
    rows.takes[0].storage_key = null;
    const res = await (await app(fakeDb(rows))).inject({ method: "POST", url: `/api/projects/${P}/delivery/renders`, payload: { profile_id: "streaming_master" } });
    expect(res.statusCode).toBe(412);
    expect(res.json().error.issues).toEqual(["Scene 1 · Shot 1: the take's media file is missing"]);
    expect((await (await app(fakeDb(rows))).inject({ method: "POST", url: `/api/projects/${P}/delivery/renders`, payload: { profile_id: "dcp_theatrical" } })).statusCode).toBe(400);
  });

  it("finished deliverables get signed download links; a deliverable from a broken lock is marked stale, files kept", async () => {
    locked();
    const out = { name: "streaming_1080p24.mp4", storage_key: "o/p/renders/r/streaming_1080p24.mp4", media_type: "video/mp4", bytes: 10, sha256: "a".repeat(64) };
    rows.renders = [{ id: R1, project_id: P, picture_lock_id: LOCK, lock_number: 1, profile_id: "streaming_master", status: "succeeded", outputs: [out], review_state: "current", review_reason: null, created_at: "2026-09-28T00:00:00Z" }];
    let ws = (await (await app(fakeDb(rows))).inject({ method: "GET", url: `/api/projects/${P}/delivery` })).json();
    expect(ws.renders[0].outputs[0].download_name).toBe("Shadows_of_Lagos_streaming_1080p24.mp4");
    expect(ws.renders[0].outputs[0].url).toMatch(/^https:\/\/storage\.example\.test\/.*response-content-disposition=attachment/);
    expect(ws.preview).toMatchObject({ render_id: R1, label: "Streaming Master" });
    rows.timelines[0] = { ...rows.timelines[0], status: "draft", current_lock_id: null };
    const fake = fakeDb(rows, (_f, a) => ({ data: { ...rows.renders[0], review_state: a.p_state, review_reason: a.p_reason } }));
    ws = (await (await app(fake)).inject({ method: "GET", url: `/api/projects/${P}/delivery` })).json();
    expect(fake.calls[0]).toMatchObject({ fn: "set_render_review", args: { p_state: "stale" } });
    expect(ws.renders[0].review_reason).toMatch(/Made from Picture Lock 1, which is no longer the current lock/);
    expect(ws.renders[0].outputs).toHaveLength(1);
    expect(ws.preview).toBeNull();
  });

  it("cancel and manifest go through the render's permissions", async () => {
    rows.renders = [{ id: R1, project_id: P, manifest_sha256: "a".repeat(64), manifest: { schema: "aurastage.render-manifest/1" } }];
    const fake = fakeDb(rows, () => ({ data: { status: "running", cancel_requested: true } }));
    expect((await (await app(fake)).inject({ method: "POST", url: `/api/renders/${R1}/cancel` })).json()).toEqual({ status: "running", cancel_requested: true });
    expect(fake.calls[0]).toMatchObject({ fn: "cancel_render", args: { p_render_id: R1 } });
    expect((await (await app(fake)).inject({ method: "GET", url: `/api/renders/${R1}/manifest` })).json().manifest.schema).toBe("aurastage.render-manifest/1");
    rows.renders = [];
    expect((await (await app(fakeDb(rows))).inject({ method: "POST", url: `/api/renders/${R1}/cancel` })).statusCode).toBe(403);
  });

  // Phase 11: a role without the delivery permission gets the gate's reason, not "not accessible".
  it("shows the permission gate's reason when a role can't deliver", async () => {
    rows.renders = [{ id: R1, project_id: P }];
    const fake = fakeDb(rows, () => ({ error: { code: "42501", message: "AURA-COL-403: your role (Reviewer) can't create in Export & Deliver. Ask the project's producer for access." } }));
    const res = await (await app(fake)).inject({ method: "POST", url: `/api/renders/${R1}/cancel` });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toEqual({ code: "AURA-EXP-403", message: "your role (Reviewer) can't create in Export & Deliver. Ask the project's producer for access." });
  });
});
