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
    const res = () => (rows[t] ?? []).filter((r) => f.every(([k, v]) => (v === null ? r[k] == null : r[k] === v)));
    const q: any = { select: () => q, eq: (k: string, v: unknown) => (f.push([k, v]), q), is: (k: string, v: unknown) => (f.push([k, v]), q), order: () => q, limit: () => q,
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

  it("owner request 2026-10-01: Audio Studio's effects and ambience show on the picture timeline at their frame; dialogue and music don't; trimmed-out sounds are left out", async () => {
    withTimeline();
    // The A1 mix starts 1 s (24 frames) into the scene's sound.
    rows.timeline_clips = rows.timeline_clips.map((c) => (c.id === C3 ? { ...c, record_in: 0, source_in: 24, duration: 72 } : c));
    rows.audio_tracks = [{ id: "t-fx", project_id: P, session_id: SES, family: "FX", name: "Effects" }, { id: "t-bg", project_id: P, session_id: SES, family: "BG", name: "Ambience" }, { id: "t-dx", project_id: P, session_id: SES, family: "DX", name: "Dialogue" }];
    rows.audio_clips = [
      { id: "door", project_id: P, session_id: SES, track_id: "t-fx", label: "Door slam", kind: "cue", asset_id: null, start_seconds: "2", duration_seconds: "0.5" },
      { id: "rain", project_id: P, session_id: SES, track_id: "t-bg", label: "Rain", kind: "asset", asset_id: "a1", start_seconds: "0", duration_seconds: "4" },
      { id: "early", project_id: P, session_id: SES, track_id: "t-fx", label: "Cut before the mix", kind: "cue", asset_id: null, start_seconds: "0", duration_seconds: "0.5" },
      { id: "line", project_id: P, session_id: SES, track_id: "t-dx", label: "Tunde: You came", kind: "cue", asset_id: null, start_seconds: "1", duration_seconds: "1" },
    ];
    const ws = (await (await app(fakeDb(rows))).inject({ method: "GET", url: `/api/projects/${P}/editorial` })).json();
    expect(ws.sound_cues).toEqual([
      { scene_id: S1, clip_id: "rain", label: "Rain", family: "BG", planned: false, at: 0, frames: 96 },
      { scene_id: S1, clip_id: "door", label: "Door slam", family: "FX", planned: true, at: 24, frames: 12 },
    ]);
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

  it("item 9: an insert over the picture (V2) and music across scenes (A2) are laid without moving the cut; music has its own level", async () => {
    withTimeline();
    const MUS = "9a9a9a9a-9a9a-49a9-89a9-9a9a9a9a9a9a";
    rows.assets = [{ id: MUS, project_id: P, name: "Main theme.wav", type: "audio", metadata: { duration_seconds: 10 }, archived_at: null }];
    let fake = fakeDb(rows);
    let res = await (await app(fake)).inject({ method: "POST", url: `/api/projects/${P}/editorial/edit`, payload: { base_revision: REV, operation: { op: "overwrite", at: 10, source: { kind: "insert_shot", shot_id: SH1 } } } });
    expect(res.statusCode).toBe(200);
    let saved = fake.calls[0].args.p_clips as Row[];
    expect(saved.find((c) => c.track === "V2")).toMatchObject({ kind: "take", take_id: TK1, record_in: 10 });
    expect(saved.filter((c) => c.track === "V1").map((c) => [c.record_in, c.duration])).toEqual([[0, 48], [48, 48]]);
    // No approved take → no insert (an offline slug over the picture would hide it).
    res = await (await app(fakeDb(rows))).inject({ method: "POST", url: `/api/projects/${P}/editorial/edit`, payload: { base_revision: REV, operation: { op: "overwrite", at: 10, source: { kind: "insert_shot", shot_id: SH2 } } } });
    expect(res.statusCode).toBe(412);
    fake = fakeDb(rows);
    res = await (await app(fake)).inject({ method: "POST", url: `/api/projects/${P}/editorial/edit`, payload: { base_revision: REV, operation: { op: "overwrite", at: 0, source: { kind: "music", asset_id: MUS, gain_db: -9 } } } });
    expect(res.statusCode).toBe(200);
    saved = fake.calls[0].args.p_clips as Row[];
    expect(saved.find((c) => c.track === "A2")).toMatchObject({ kind: "music", asset_id: MUS, gain_db: -9, duration: 240, source_frames: 240, label: "Main theme.wav" });
    expect(saved.find((c) => c.track === "A1")).toMatchObject({ record_in: 0, duration: 96 });
    rows.assets[0].type = "image";
    res = await (await app(fakeDb(rows))).inject({ method: "POST", url: `/api/projects/${P}/editorial/edit`, payload: { base_revision: REV, operation: { op: "overwrite", at: 0, source: { kind: "music", asset_id: MUS } } } });
    expect(res.statusCode).toBe(412);
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

  it("owner report 2026-10-02: a scene mix approved after the cut was built is offered and Conform lays it on A1 in sync with its picture", async () => {
    withTimeline();
    // The cut was assembled before the mix was approved: no sound on A1.
    rows.timeline_clips = rows.timeline_clips.filter((c) => c.track !== "A1");
    const fake = fakeDb(rows, (fn, a) => ({ data: fn === "set_timeline_review" ? { ...rows.timelines[0], review_state: a.p_state, review_reason: a.p_reason } : {} }));
    const ws = (await (await app(fake)).inject({ method: "GET", url: `/api/projects/${P}/editorial` })).json();
    expect(ws).toMatchObject({ conformable: 1, sound_to_add: 1 });
    const f2 = fakeDb(rows);
    const res = await (await app(f2)).inject({ method: "POST", url: `/api/projects/${P}/editorial/edit`, payload: { base_revision: REV, operation: { op: "conform" } } });
    expect(res.json()).toMatchObject({ summary: expect.stringMatching(/Added the approved/) });
    expect(res.json().summary).toMatch(/Added the approved sound of 1 scene in sync/);
    const saved = f2.calls.find((c) => c.fn === "save_timeline")!.args.p_clips as Row[];
    expect(saved.find((c) => c.track === "A1")).toMatchObject({ kind: "audio_mix", audio_session_version_id: AV1, scene_id: S1, record_in: 0, duration: 96, source_frames: 96, label: "Scene 1 mix v1" });
    expect(saved.filter((c) => c.track === "V1").map((c) => [c.id, c.record_in, c.duration])).toEqual([[C1, 0, 48], [C2, 48, 48]]);
    // Nothing to add once the scene has sound on the cut; an unapproved mix is never added.
    withTimeline();
    expect((await (await app(fakeDb(rows))).inject({ method: "GET", url: `/api/projects/${P}/editorial` })).json().sound_to_add).toBe(0);
    rows.timeline_clips = rows.timeline_clips.filter((c) => c.track !== "A1");
    rows.audio_sessions[0].status = "draft";
    expect((await (await app(fakeDb(rows))).inject({ method: "GET", url: `/api/projects/${P}/editorial` })).json().sound_to_add).toBe(0);
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

  it("volume automation: saved against its own revision, returned with the workspace, refused when invalid or stale; a locked picture stays locked", async () => {
    const AREV = "cccc0000-cccc-4ccc-8ccc-cccccccccccc";
    withTimeline({ status: "locked", current_lock_id: LOCK, automation: { A1: [{ frame: 0, db: -3 }] }, automation_revision: AREV });
    rows.picture_locks = [{ id: LOCK, timeline_id: TL, lock_number: 1, version_id: LV, locked_at: "2026-09-28T00:00:00Z", broken_at: null }];
    let res = await (await app(fakeDb(rows))).inject({ method: "GET", url: `/api/projects/${P}/editorial` });
    expect(res.json().timeline).toMatchObject({ automation: { A1: [{ frame: 0, db: -3 }] }, automation_revision: AREV });
    const saved = { ...rows.timelines[0], automation: { A1: [{ frame: 0, db: 0 }, { frame: 48, db: -12 }] }, automation_revision: "dddd0000-dddd-4ddd-8ddd-dddddddddddd" };
    let fake = fakeDb(rows, (fn) => (fn === "save_timeline_automation" ? { data: saved } : { data: {} }));
    const body = { automation: { A1: [{ frame: 0, db: 0 }, { frame: 48, db: -12 }] }, base_revision: AREV };
    res = await (await app(fake)).inject({ method: "PUT", url: `/api/projects/${P}/editorial/automation`, payload: body });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ points: 2, automation_revision: saved.automation_revision });
    expect(fake.calls).toEqual([{ fn: "save_timeline_automation", args: { p_project_id: P, p_automation: body.automation, p_base_revision: AREV } }]);
    expect(fake.calls.some((c) => c.fn === "save_timeline")).toBe(false); // the picture (and its lock) is untouched
    res = await (await app(fake)).inject({ method: "PUT", url: `/api/projects/${P}/editorial/automation`, payload: { ...body, automation: { A1: [{ frame: 1.5, db: 0 }] } } });
    expect(res.statusCode).toBe(400);
    fake = fakeDb(rows, () => ({ error: { message: "AURA-EDT-409: the automation changed — reload and try again" } }));
    res = await (await app(fake)).inject({ method: "PUT", url: `/api/projects/${P}/editorial/automation`, payload: body });
    expect(res.statusCode).toBe(409);
  });
  it("owner request 2026-10-02: Undo takes back the newest edit on this revision through the gated save; nothing to undo is a 404; a locked cut asks first", async () => {
    withTimeline();
    rows.timeline_undo = [{ timeline_id: TL, after_revision: REV, undone_at: null, action: "lift", summary: "Lifted Scene 1 · Shot 2 (CU)", created_at: "2026-10-02T00:00:00Z" }];
    let res = await (await app(fakeDb(rows))).inject({ method: "GET", url: `/api/projects/${P}/editorial` });
    expect(res.json().timeline.undo).toEqual({ action: "lift", summary: "Lifted Scene 1 · Shot 2 (CU)" });
    const fake = fakeDb(rows, (fn) => (fn === "undo_timeline" ? { data: rows.timelines[0] } : { data: {} }));
    res = await (await app(fake)).inject({ method: "POST", url: `/api/projects/${P}/editorial/undo`, payload: { base_revision: REV } });
    expect(res.statusCode).toBe(200);
    expect(res.json().summary).toBe("Undid: Lifted Scene 1 · Shot 2 (CU)");
    expect(fake.calls).toEqual([{ fn: "undo_timeline", args: { p_project_id: P, p_base_revision: REV, p_break_lock: false } }]);
    // A stale revision is a conflict; no history is 404; bad input is 400.
    res = await (await app(fakeDb(rows))).inject({ method: "POST", url: `/api/projects/${P}/editorial/undo`, payload: { base_revision: LOCK } });
    expect(res.statusCode).toBe(409);
    res = await (await app(fakeDb(rows))).inject({ method: "POST", url: `/api/projects/${P}/editorial/undo`, payload: {} });
    expect(res.statusCode).toBe(400);
    rows.timeline_undo = [];
    res = await (await app(fakeDb(rows))).inject({ method: "GET", url: `/api/projects/${P}/editorial` });
    expect(res.json().timeline.undo).toBeNull();
    res = await (await app(fakeDb(rows))).inject({ method: "POST", url: `/api/projects/${P}/editorial/undo`, payload: { base_revision: REV } });
    expect(res.statusCode).toBe(404);
    // Locked picture: Undo asks for the break first, then passes it on.
    rows.timeline_undo = [{ timeline_id: TL, after_revision: REV, undone_at: null, action: "trim", summary: "Trimmed", created_at: "2026-10-02T00:00:00Z" }];
    rows.timelines[0] = { ...rows.timelines[0], status: "locked", current_lock_id: LOCK };
    const locked = fakeDb(rows, () => ({ data: rows.timelines[0] }));
    res = await (await app(locked)).inject({ method: "POST", url: `/api/projects/${P}/editorial/undo`, payload: { base_revision: REV } });
    expect(res.statusCode).toBe(423);
    expect(locked.calls).toEqual([]);
    res = await (await app(locked)).inject({ method: "POST", url: `/api/projects/${P}/editorial/undo`, payload: { base_revision: REV, break_lock: true } });
    expect(res.statusCode).toBe(200);
    expect(locked.calls[0].args.p_break_lock).toBe(true);
  });
});
