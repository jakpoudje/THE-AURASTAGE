import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../audio/audio.service", () => ({ refreshAudioReview: async () => {} }));
import { registerEditorialRoutes } from "../editorial.controller";

const P = "11111111-1111-4111-8111-111111111111";
const S1 = "88888888-8888-4888-8888-888888888888";
const PLAN = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const PV1 = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const SH1 = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const SH2 = "a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2";
const TK1 = "b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1";
const TK1B = "b3b3b3b3-b3b3-4b3b-8b3b-b3b3b3b3b3b3";
const SES = "abababab-abab-4bab-8bab-abababababab";
const AV1 = "c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1";
const TL = "e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1";
const REV = "12121212-1212-4212-8212-121212121212";
const C1 = "f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1";
const C2 = "f2f2f2f2-f2f2-4f2f-8f2f-f2f2f2f2f2f2";
const C3 = "f3f3f3f3-f3f3-4f3f-8f3f-f3f3f3f3f3f3";
const LOCK = "aaaa0000-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LV = "bbbb0000-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const UUID = /^[0-9a-f-]{36}$/;

type Row = Record<string, any>;
function fakeDb(rows: Record<string, Row[]>, rpcImpl: (fn: string, a: Row) => { data?: unknown; error?: unknown } = () => ({ data: {} })) {
  const calls: { fn: string; args: Row }[] = [];
  const from = (t: string) => {
    const f: [string, unknown][] = [];
    const res = () => (rows[t] ?? []).filter((r) => f.every(([k, v]) => r[k] === v));
    const q: any = { select: () => q, eq: (k: string, v: unknown) => (f.push([k, v]), q), order: () => q,
      maybeSingle: async () => ({ data: res()[0] ?? null, error: null }), then: (ok: any) => ok({ data: res(), error: null }) };
    return q;
  };
  return { calls, db: { from, rpc: async (fn: string, args: Row) => { calls.push({ fn, args }); const r = rpcImpl(fn, args); return { data: r.data ?? null, error: r.error ?? null }; } } };
}
async function app(fake: ReturnType<typeof fakeDb>) {
  const a = Fastify();
  a.addHook("onRequest", async (req) => void ((req as any).db = fake.db));
  await registerEditorialRoutes(a);
  return a;
}
const clip = (id: string, over: Row): Row => ({ id, timeline_id: TL, project_id: P, source_in: 0, source_frames: null, scene_id: S1, shot_id: null, take_id: null, audio_session_version_id: null, grade: {}, ...over });
const timelineRows = () => [
  clip(C1, { track: "V1", kind: "take", record_in: 0, duration: 48, shot_id: SH1, take_id: TK1, label: "Scene 1 · Shot 1 (WS)" }),
  clip(C2, { track: "V1", kind: "slug", record_in: 48, duration: 48, shot_id: SH2, label: "Scene 1 · Shot 2 (CU) — no approved take" }),
  clip(C3, { track: "A1", kind: "audio_mix", record_in: 0, duration: 96, source_frames: 96, audio_session_version_id: AV1, label: "Scene 1 mix v1" }),
];

let rows: Record<string, Row[]>;
beforeEach(() => {
  rows = {
    projects: [{ id: P, title: "Shadows of Lagos", target_runtime_minutes: null }],
    scenes: [{ id: S1, project_id: P, number: 1, heading: "EXT. HARBOUR - NIGHT", status: "active" }],
    shot_plans: [{ id: PLAN, project_id: P, scene_id: S1, status: "approved", review_state: "current", review_reason: null, approved_version_id: PV1 }],
    shot_plan_versions: [{ id: PV1, project_id: P, plan_id: PLAN, version_number: 1, shots: [
      { id: SH1, ordinal: 1, size: "WS", description: "Wide", story_start: 0, story_end: 2 }, { id: SH2, ordinal: 2, size: "CU", description: "Close", story_start: 2, story_end: 4 }] }],
    takes: [{ id: TK1, project_id: P, scene_id: S1, shot_id: SH1, take_number: 1, capability: "image", params: {}, status: "succeeded", approval: "approved", storage_key: "k", media_type: "image/svg+xml" }],
    audio_sessions: [{ id: SES, project_id: P, scene_id: S1, status: "approved", review_state: "current", review_reason: null, approved_version_id: AV1, scene_seconds: "4" }],
    audio_session_versions: [{ id: AV1, project_id: P, session_id: SES, version_number: 1, tracks: [], clips: [], measurement: { duration_seconds: 4 } }],
    timelines: [], timeline_clips: [], timeline_versions: [], picture_locks: [],
  };
});
const withTimeline = (over: Row = {}) => {
  rows.timelines = [{ id: TL, project_id: P, status: "draft", current_lock_id: null, review_state: "current", review_reason: null, revision: REV, updated_at: "2026-09-28T00:00:00Z", ...over }];
  rows.timeline_clips = timelineRows();
};

describe("Editorial routes", () => {
  it("lists the bin (approved takes and mixes) and says the timeline isn't ready yet", async () => {
    const ws = (await (await app(fakeDb(rows))).inject({ method: "GET", url: `/api/projects/${P}/editorial` })).json();
    expect(ws.timeline).toBeNull();
    expect(ws.fps).toBe(24);
    expect(ws.bin[0].shots.map((s: Row) => [s.shot_id, s.take?.take_id ?? null])).toEqual([[SH1, TK1], [SH2, null]]);
    expect(ws.bin[0].mix).toMatchObject({ version_id: AV1, seconds: 4 });
    expect(ws.qc.ready_for_lock).toBe(false);
  });

  it("won't assemble before any shot plan is approved (412)", async () => {
    rows.shot_plans = [];
    const res = await (await app(fakeDb(rows))).inject({ method: "POST", url: `/api/projects/${P}/editorial/assemble`, payload: { base_revision: null } });
    expect(res.statusCode).toBe(412);
  });

  it("assembles from approved takes; missing takes become offline slugs; the mix goes on A1", async () => {
    const fake = fakeDb(rows);
    const res = await (await app(fake)).inject({ method: "POST", url: `/api/projects/${P}/editorial/assemble`, payload: { base_revision: null } });
    expect(res.statusCode).toBe(200);
    expect(res.json().summary).toMatch(/1 picture clip, 1 still offline/);
    const save = fake.calls.find((c) => c.fn === "save_timeline")!;
    expect(save.args).toMatchObject({ p_base_revision: null, p_action: "assemble", p_break_lock: false });
    expect(save.args.p_clips.map((c: Row) => [c.track, c.kind, c.record_in, c.duration])).toEqual([["V1", "take", 0, 48], ["V1", "slug", 48, 48], ["A1", "audio_mix", 0, 96]]);
    expect(save.args.p_clips.every((c: Row) => UUID.test(c.id))).toBe(true);
  });

  it("re-assembly keeps the current cut as a version first (rule 11)", async () => {
    withTimeline();
    const fake = fakeDb(rows);
    await (await app(fake)).inject({ method: "POST", url: `/api/projects/${P}/editorial/assemble`, payload: { base_revision: REV } });
    expect(fake.calls.map((c) => c.fn)).toEqual(["save_timeline_version", "save_timeline"]);
    expect(fake.calls[0].args).toMatchObject({ p_label: "Before re-assembly", p_kind: "auto" });
  });

  it("applies an NLE edit against the current revision; stale revisions and impossible edits are refused", async () => {
    withTimeline();
    let fake = fakeDb(rows);
    let res = await (await app(fake)).inject({ method: "POST", url: `/api/projects/${P}/editorial/edit`, payload: { base_revision: "99999999-9999-4999-8999-999999999999", operation: { op: "lift", clip_id: C1 } } });
    expect(res.statusCode).toBe(409);
    res = await (await app(fake)).inject({ method: "POST", url: `/api/projects/${P}/editorial/edit`, payload: { base_revision: REV, operation: { op: "blade", track: "V1", at: 24 } } });
    expect(res.statusCode).toBe(200);
    const clips = fake.calls.find((c) => c.fn === "save_timeline")!.args.p_clips as Row[];
    expect(clips.filter((c) => c.track === "V1").map((c) => [c.record_in, c.duration])).toEqual([[0, 24], [24, 24], [48, 48]]);
    expect(new Set(clips.map((c) => c.id)).size).toBe(4);
    fake = fakeDb(rows);
    res = await (await app(fake)).inject({ method: "POST", url: `/api/projects/${P}/editorial/edit`, payload: { base_revision: REV, operation: { op: "roll", clip_id: C1, delta: 60 } } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.message).toMatch(/no length left/);
    expect(fake.calls.some((c) => c.fn === "save_timeline")).toBe(false);
  });

  it("inserting a shot uses its currently approved take; a scene without an approved mix is refused", async () => {
    withTimeline();
    const fake = fakeDb(rows);
    const res = await (await app(fake)).inject({ method: "POST", url: `/api/projects/${P}/editorial/edit`, payload: { base_revision: REV, operation: { op: "insert", at: 96, source: { kind: "shot", shot_id: SH1 } } } });
    expect(res.statusCode).toBe(200);
    const placed = (fake.calls[0].args.p_clips as Row[]).find((c) => c.record_in === 96)!;
    expect(placed).toMatchObject({ kind: "take", take_id: TK1, duration: 48 });
    rows.audio_sessions[0].review_state = "stale";
    const r2 = await (await app(fakeDb(rows))).inject({ method: "POST", url: `/api/projects/${P}/editorial/edit`, payload: { base_revision: REV, operation: { op: "insert", at: 96, source: { kind: "scene_mix", scene_id: S1 } } } });
    expect(r2.statusCode).toBe(412);
  });

  it("a newer approved take flags the timeline for review without touching the cut; Conform swaps it in", async () => {
    withTimeline();
    rows.takes[0].approval = "superseded";
    rows.takes.push({ ...rows.takes[0], id: TK1B, take_number: 2, approval: "approved" });
    const fake = fakeDb(rows, (fn, a) => ({ data: fn === "set_timeline_review" ? { ...rows.timelines[0], review_state: a.p_state, review_reason: a.p_reason } : {} }));
    const ws = (await (await app(fake)).inject({ method: "GET", url: `/api/projects/${P}/editorial` })).json();
    expect(ws.issues).toEqual([{ clip_id: C1, code: "newer_take", message: "Scene 1 · Shot 1 (WS): take V2 is now the approved take" }]);
    expect(fake.calls[0]).toMatchObject({ fn: "set_timeline_review", args: { p_state: "review_required" } });
    expect(ws.timeline.review_reason).toMatch(/Your cut is unchanged/);
    expect(ws.qc.checks.find((c: Row) => c.id === "sources_current").ok).toBe(false);
    expect(fake.calls.some((c) => c.fn === "save_timeline")).toBe(false);
    const f2 = fakeDb(rows);
    await (await app(f2)).inject({ method: "POST", url: `/api/projects/${P}/editorial/edit`, payload: { base_revision: REV, operation: { op: "conform" } } });
    const saved = (f2.calls[0].args.p_clips as Row[]).find((c) => c.id === C1)!;
    expect(saved).toMatchObject({ take_id: TK1B, record_in: 0, duration: 48 });
  });

  it("Picture Lock needs passing checks; a locked picture refuses edits until the break is confirmed (with impact)", async () => {
    withTimeline();
    let res = await (await app(fakeDb(rows))).inject({ method: "POST", url: `/api/projects/${P}/editorial/lock`, payload: { base_revision: REV } });
    expect(res.statusCode).toBe(412);
    expect(res.json().error.message).toMatch(/no offline media/);
    rows.timeline_clips = rows.timeline_clips.filter((c) => c.id !== C2).map((c) => (c.id === C1 ? { ...c, duration: 96 } : c));
    let fake = fakeDb(rows, () => ({ data: { lock_number: 1 } }));
    res = await (await app(fake)).inject({ method: "POST", url: `/api/projects/${P}/editorial/lock`, payload: { base_revision: REV } });
    expect(res.json()).toEqual({ lock_number: 1 });
    expect(fake.calls[0].args.p_qc.ready_for_lock).toBe(true);

    rows.timelines[0] = { ...rows.timelines[0], status: "locked", current_lock_id: LOCK };
    rows.picture_locks = [{ id: LOCK, timeline_id: TL, lock_number: 1, version_id: LV, locked_at: "2026-09-28T00:00:00Z", broken_at: null }];
    rows.timeline_versions = [{ id: LV, timeline_id: TL, version_number: 1, label: "Picture Lock 1", kind: "picture_lock", duration_frames: 96, clips: rows.timeline_clips, created_at: "2026-09-28T00:00:00Z" }];
    fake = fakeDb(rows);
    const edit = { base_revision: REV, operation: { op: "trim", clip_id: C1, edge: "out", delta: -12, ripple: false } };
    res = await (await app(fake)).inject({ method: "POST", url: `/api/projects/${P}/editorial/edit`, payload: edit });
    expect(res.statusCode).toBe(423);
    expect(res.json().error.message).toMatch(/Scene 1 — EXT. HARBOUR - NIGHT/);
    expect(res.json().error.issues[0]).toMatchObject({ change: "retimed" });
    expect(fake.calls.some((c) => c.fn === "save_timeline")).toBe(false);
    res = await (await app(fake)).inject({ method: "POST", url: `/api/projects/${P}/editorial/edit`, payload: { ...edit, break_lock: true } });
    expect(res.statusCode).toBe(200);
    const save = fake.calls.find((c) => c.fn === "save_timeline")!;
    expect(save.args.p_break_lock).toBe(true);
    expect(save.args.p_impact[0].affects).toContain("Sound mix (re-conform)");
  });

  it("exports a CMX 3600 EDL", async () => {
    withTimeline();
    const res = await (await app(fakeDb(rows))).inject({ method: "GET", url: `/api/projects/${P}/editorial/edl` });
    expect(res.headers["content-type"]).toMatch(/text\/plain/);
    expect(res.headers["content-disposition"]).toMatch(/Shadows-of-Lagos\.edl/);
    expect(res.body).toContain("FCM: NON-DROP FRAME");
    expect(res.body).toContain("* OFFLINE");
  });

  it("refuses projects the user can't see (403) and bad input (400)", async () => {
    rows.projects = [];
    expect((await (await app(fakeDb(rows))).inject({ method: "GET", url: `/api/projects/${P}/editorial` })).statusCode).toBe(403);
    rows.projects = [{ id: P, title: "X" }];
    withTimeline();
    expect((await (await app(fakeDb(rows))).inject({ method: "POST", url: `/api/projects/${P}/editorial/edit`, payload: { base_revision: REV, operation: { op: "explode" } } })).statusCode).toBe(400);
  });
});
