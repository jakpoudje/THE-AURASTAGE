import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../shots/shots.service", () => ({ refreshShotPlanReview: async () => {} }));
import { registerAudioRoutes } from "../audio.controller";
import { audioReadiness } from "../audio.readiness";

const P = "11111111-1111-4111-8111-111111111111";
const S1 = "88888888-8888-4888-8888-888888888888";
const PLAN = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const PV1 = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const PV2 = "ffffffff-ffff-4fff-8fff-fffffffffff2";
const DV = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const T = "55555555-5555-4555-8555-555555555555";
const L1 = "99999999-9999-4999-8999-999999999991";
const SES = "abababab-abab-4bab-8bab-abababababab";
const TR = "cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd";
const CL = "efefefef-efef-4fef-8fef-efefefefefef";
const REV = "12121212-1212-4212-8212-121212121212";
const NOW = "2026-09-28T00:00:00Z";

type Row = Record<string, any>;
function fakeDb(rows: Record<string, Row[]>, rpcImpl: (fn: string, a: Row) => { data?: unknown; error?: unknown } = () => ({})) {
  const calls: { fn: string; args: Row }[] = [];
  const from = (t: string) => {
    const f: [string, unknown][] = [];
    const res = () => (rows[t] ?? []).filter((r) => f.every(([k, v]) => r[k] === v));
    const q: any = { select: () => q, eq: (k: string, v: unknown) => (f.push([k, v]), q), order: () => q, limit: () => q,
      maybeSingle: async () => ({ data: res()[0] ?? null, error: null }), then: (ok: any) => ok({ data: res(), error: null }) };
    return q;
  };
  return { calls, db: { from, rpc: async (fn: string, args: Row) => (calls.push({ fn, args }), { data: rpcImpl(fn, args).data ?? null, error: rpcImpl(fn, args).error ?? null }) } };
}
async function app(fake: ReturnType<typeof fakeDb>) {
  const a = Fastify();
  a.addHook("onRequest", async (req) => void ((req as any).db = fake.db));
  await registerAudioRoutes(a);
  return a;
}
const session = (over: Row = {}): Row => ({ id: SES, project_id: P, scene_id: S1, shot_plan_version_id: PV1, scene_seconds: "12", status: "draft", review_state: "current", review_reason: null, revision: REV, approved_version_id: null, ...over });
const track = (over: Row = {}): Row => ({ id: TR, project_id: P, session_id: SES, key: "dx:t", ordinal: 1, name: "DX — Tunde", family: "DX", gain_db: "0", pan: "0", mute: false, solo: false, ...over });
const clip = (over: Row = {}): Row => ({ id: CL, project_id: P, session_id: SES, track_id: TR, label: "TUNDE: You came.", kind: "cue", asset_id: null, start_seconds: "4", duration_seconds: "1", offset_seconds: "0", gain_db: "0", fade_in_seconds: "0", fade_out_seconds: "0", source: { dialogue_line_id: L1 }, updated_at: NOW, ...over });

let rows: Record<string, Row[]>;
beforeEach(() => {
  rows = {
    projects: [{ id: P }],
    scenes: [{ id: S1, project_id: P, number: 1, heading: "EXT. HARBOUR - NIGHT", int_ext: "EXT", location: "HARBOUR", time_of_day: "NIGHT", status: "active" }],
    shot_plans: [{ id: PLAN, project_id: P, scene_id: S1, status: "approved", review_state: "current", review_reason: null, approved_version_id: PV1 }],
    shot_plan_versions: [{ id: PV1, project_id: P, plan_id: PLAN, version_number: 1, scene_dna_version_id: DV, shots: [
      { ordinal: 1, story_start: 0, story_end: 4, dialogue_line_ids: [] }, { ordinal: 2, story_start: 4, story_end: 12, dialogue_line_ids: [L1] }] }],
    scene_dna_versions: [{ id: DV, project_id: P, content: { editable: { weather: "rain", atmosphere: null, mood: ["tense"], sound_intent: null }, proposal: { dialogue: { line_ids: [L1] }, sound_candidates: [{ cue: "Footsteps", line: 3, text: "Footsteps approach." }] } } }],
    dialogue_lines: [{ id: L1, project_id: P, speaker_name: "TUNDE", character_id: T, text: "You came.", estimated_seconds: "1.5", extensions: [] }],
    characters: [{ id: T, project_id: P, name: "Tunde Okafor" }],
    audio_sessions: [], audio_tracks: [], audio_clips: [], audio_measurements: [], audio_session_versions: [], assets: [],
  };
});

describe("audioReadiness", () => {
  it("blocks approval until dialogue is recorded and the current mix is measured; loudness target is advisory", () => {
    const s = session();
    let r = audioReadiness(s, [track()], [clip()], null);
    expect(r.ready).toBe(false);
    expect(r.readiness.find((p) => p.id === "dialogue_recorded")!.evidence).toBe("0 of 1 dialogue clips recorded");
    r = audioReadiness(s, [track()], [clip({ kind: "asset", asset_id: "a" })], { session_revision: REV, integrated_lufs: "-30", true_peak_dbtp: "-3", measured_at: NOW });
    expect(r.ready).toBe(true);
    expect(r.readiness.find((p) => p.id === "loudness_target")).toMatchObject({ ok: false, blocking: false, evidence: "-30.0 LUFS" });
    r = audioReadiness(s, [track()], [clip({ kind: "asset", asset_id: "a" })], { session_revision: "old", integrated_lufs: "-23", measured_at: NOW });
    expect(r.readiness.find((p) => p.id === "measured")).toMatchObject({ ok: false, evidence: "The mix changed after the last measurement" });
  });
  it("checks the loudness standard chosen in Project Settings", () => {
    const m = { session_revision: REV, integrated_lufs: "-14.3", true_peak_dbtp: "-1.5", measured_at: NOW };
    const clips = [clip({ kind: "asset", asset_id: "a" })];
    expect(audioReadiness(session(), [track()], clips, m).readiness.find((p) => p.id === "loudness_target")).toMatchObject({ ok: false, label: expect.stringContaining("-23 LUFS") });
    expect(audioReadiness(session(), [track()], clips, m, "streaming").readiness.find((p) => p.id === "loudness_target"))
      .toMatchObject({ ok: true, label: "Integrated loudness -14 LUFS ±1 (Streaming / online)" });
  });
});

describe("Audio Studio routes", () => {
  it("spots from the approved shot plan: dialogue at its shot time, ambience, Foley, score", async () => {
    const fake = fakeDb(rows, () => ({ data: session() }));
    const res = await (await app(fake)).inject({ method: "POST", url: `/api/projects/${P}/audio/scenes/${S1}/spot` });
    expect(res.statusCode).toBe(200);
    const { fn, args } = fake.calls[0];
    expect(fn).toBe("spot_audio_session");
    expect(args).toMatchObject({ p_shot_plan_version_id: PV1, p_scene_seconds: 12 });
    const dx = args.p_clips.find((c: Row) => c.source.dialogue_line_id === L1);
    expect(dx).toMatchObject({ track_key: `dx:${T}`, start_seconds: 4, duration_seconds: 1.5 });
    expect(args.p_tracks.map((t: Row) => t.family)).toEqual(["DX", "FOLEY", "BG", "SCORE"]);
  });

  it("won't spot until the shot plan is approved and current (412)", async () => {
    rows.shot_plans[0].status = "draft";
    const res = await (await app(fakeDb(rows))).inject({ method: "POST", url: `/api/projects/${P}/audio/scenes/${S1}/spot` });
    expect(res.statusCode).toBe(412);
  });

  it("marks a session stale when the shot plan is approved again (recordings kept)", async () => {
    rows.audio_sessions = [session()];
    rows.shot_plan_versions.push({ ...rows.shot_plan_versions[0], id: PV2, version_number: 2 });
    rows.shot_plans[0].approved_version_id = PV2;
    // Like the database: set_audio_review updates the stored row.
    const fake = fakeDb(rows, (_f, a) => ({ data: Object.assign(rows.audio_sessions[0], { review_state: a.p_state, review_reason: a.p_reason }) }));
    const ws = (await (await app(fake)).inject({ method: "GET", url: `/api/projects/${P}/audio` })).json();
    expect(fake.calls[0]).toMatchObject({ fn: "set_audio_review", args: { p_state: "stale" } });
    expect(ws.scenes[0].session.review_reason).toMatch(/Your recordings are kept/);
    // Built-in sound is always available; voice isn't built yet and says so (never a fake "connected").
    expect(ws.generators.find((g: Row) => g.id === "aurastage-synth")).toMatchObject({ state: "configured", execution: "native" });
    expect(ws.generators.find((g: Row) => g.id === "voice")).toMatchObject({ state: "not_connected" });
    expect(ws.target).toMatchObject({ integrated_lufs: -23 });
  });

  it("a recording replaced in the Assets Library after approval flags the mix; re-approving needs a new measurement (regression)", async () => {
    const AS = "abababab-abab-4bab-8bab-abababababab", SV = "cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd";
    rows.audio_sessions = [session({ status: "approved", approved_version_id: SV })];
    rows.audio_session_versions = [{ id: SV, project_id: P, session_id: SES, version_number: 1, created_at: "2026-09-28T01:00:00Z" }];
    rows.audio_tracks = [track()];
    rows.audio_clips = [clip({ kind: "asset", asset_id: AS })];
    rows.audio_measurements = [{ session_id: SES, project_id: P, session_revision: REV, integrated_lufs: "-23", true_peak_dbtp: "-2", measured_at: "2026-09-28T00:30:00Z" }];
    rows.assets = [{ id: AS, project_id: P, type: "audio", name: "Tunde take", current_version: 2, version_updated_at: "2026-09-28T02:00:00Z", metadata: {} }];
    const fake = fakeDb(rows, (_f, a) => ({ data: Object.assign(rows.audio_sessions[0], { review_state: a.p_state, review_reason: a.p_reason }) }));
    const a = await app(fake);
    const ws = (await a.inject({ method: "GET", url: `/api/projects/${P}/audio` })).json();
    expect(fake.calls[0]).toMatchObject({ fn: "set_audio_review", args: { p_state: "review_required" } });
    expect(ws.scenes[0].session).toMatchObject({ recordings_replaced: true, review_reason: expect.stringMatching(/"Tunde take" was replaced in the Assets Library \(now version 2\)/) });
    expect(ws.scenes[0].readiness.find((r: Row) => r.id === "measured")).toMatchObject({ ok: false, evidence: "A recording was replaced in the Assets Library after the last measurement" });
    const refused = await a.inject({ method: "POST", url: `/api/projects/${P}/audio/scenes/${S1}/approve` });
    expect(refused.statusCode).toBe(412);
    expect(refused.json().error.message).toMatch(/loudness measured after the last change/);
    // Measured again after the replacement: approval goes through (it isn't blocked by the review flag itself).
    rows.audio_measurements[0].measured_at = "2026-09-28T03:00:00Z";
    const ok = await a.inject({ method: "POST", url: `/api/projects/${P}/audio/scenes/${S1}/approve` });
    expect(fake.calls.some((c: Row) => c.fn === "approve_audio_session")).toBe(true);
    expect(ok.statusCode).not.toBe(412);
  });

  it("refuses approval with the failing checks listed (412) and invalid values (400)", async () => {
    rows.audio_sessions = [session()];
    rows.audio_tracks = [track()];
    rows.audio_clips = [clip()];
    const a = await app(fakeDb(rows));
    const res = await a.inject({ method: "POST", url: `/api/projects/${P}/audio/scenes/${S1}/approve` });
    expect(res.statusCode).toBe(412);
    expect(res.json().error.message).toMatch(/every dialogue cue has a recording; loudness measured after the last change/);
    expect((await a.inject({ method: "PATCH", url: `/api/audio-tracks/${TR}`, payload: { gain_db: 40 } })).json().error.message).toBe("Gain is too high or too long");
    const bad = await a.inject({ method: "POST", url: `/api/audio-sessions/${SES}/measurements`, payload: { integrated_lufs: 50, duration_seconds: 1, clip_count: 1, engine_version: "1.0.0", session_revision: REV } });
    expect(bad.statusCode).toBe(400);
  });

  it("maps 'mix changed since measured' to 409", async () => {
    rows.audio_sessions = [session()];
    const fake = fakeDb(rows, () => ({ error: { message: "AURA-AUD-409: the mix changed since it was measured — measure again" } }));
    const res = await (await app(fake)).inject({ method: "POST", url: `/api/audio-sessions/${SES}/measurements`, payload: { integrated_lufs: -23, true_peak_dbtp: -2, lra_lu: 4, duration_seconds: 12, clip_count: 3, engine_version: "1.0.0", session_revision: REV } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.message).toBe("the mix changed since it was measured — measure again");
  });

  it("places a recording on a cue through save_audio_clip", async () => {
    rows.audio_clips = [clip()];
    const A = "34343434-3434-4434-8434-343434343434";
    const fake = fakeDb(rows, () => ({ data: clip({ kind: "asset", asset_id: A }) }));
    const res = await (await app(fake)).inject({ method: "PATCH", url: `/api/audio-clips/${CL}`, payload: { asset_id: A } });
    expect(res.json()).toMatchObject({ kind: "asset", asset_id: A });
    expect(fake.calls[0]).toMatchObject({ fn: "save_audio_clip", args: { p_session_id: SES, p_clip_id: CL, p_patch: { asset_id: A } } });
  });
});
