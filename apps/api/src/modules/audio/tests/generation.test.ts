import Fastify from "fastify";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

const voiceInstalled = existsSync("/usr/bin/espeak-ng") || existsSync("/usr/local/bin/espeak-ng");
import { registerAudioRoutes } from "../audio.controller";

type Row = Record<string, any>;
const P = "11111111-1111-4111-8111-111111111111", S1 = "22222222-2222-4222-8222-222222222222", SES = "33333333-3333-4333-8333-333333333333";
const T = { dx: "44444444-4444-4444-8444-444444444441", bg: "44444444-4444-4444-8444-444444444442", fx: "44444444-4444-4444-8444-444444444443", sc: "44444444-4444-4444-8444-444444444444" };
const LINE = "66666666-6666-4666-8666-666666666666", AMARA = "77777777-7777-4777-8777-777777777777";
const C = { dx: "55555555-5555-4555-8555-555555555551", bg: "55555555-5555-4555-8555-555555555552", fx: "55555555-5555-4555-8555-555555555553", sc: "55555555-5555-4555-8555-555555555554", rec: "55555555-5555-4555-8555-555555555555" };

function fakeDb(rows: Record<string, Row[]>) {
  const calls: { fn: string; args: Row }[] = [];
  const from = (t: string) => {
    const f: [string, unknown][] = [];
    const res = () => (rows[t] ?? []).filter((r) => f.every(([k, v]) => r[k] === v));
    const q: any = { select: () => q, eq: (k: string, v: unknown) => (f.push([k, v]), q), order: () => q, limit: () => q,
      maybeSingle: async () => ({ data: res()[0] ?? null, error: null }), then: (ok: any) => ok({ data: res(), error: null }) };
    return q;
  };
  const rpc = async (fn: string, args: Row) => {
    calls.push({ fn, args });
    if (fn === "request_audio_generation") return { data: { id: `g${calls.length}`, scene_id: args.p_scene, clip_id: args.p_clip, kind: args.p_kind, description: args.p_description, duration_seconds: args.p_duration, provider: args.p_provider, model: args.p_model, execution: args.p_execution, seed: args.p_seed, status: "queued" }, error: null };
    return { data: null, error: null };
  };
  return { calls, db: { from, rpc } };
}
const rows = (): Record<string, Row[]> => ({
  projects: [{ id: P }], scenes: [{ id: S1, project_id: P }],
  audio_sessions: [{ id: SES, project_id: P, scene_id: S1 }],
  audio_tracks: [
    { id: T.dx, project_id: P, session_id: SES, family: "DX" }, { id: T.bg, project_id: P, session_id: SES, family: "BG" },
    { id: T.fx, project_id: P, session_id: SES, family: "FX" }, { id: T.sc, project_id: P, session_id: SES, family: "SCORE" },
  ],
  audio_clips: [
    { id: C.dx, project_id: P, session_id: SES, track_id: T.dx, kind: "cue", label: "AMARA: “You came.”", duration_seconds: "2" },
    { id: C.bg, project_id: P, session_id: SES, track_id: T.bg, kind: "cue", label: "Exterior lagos harbour ambience — rain, dawn", duration_seconds: "20" },
    { id: C.fx, project_id: P, session_id: SES, track_id: T.fx, kind: "cue", label: "door slams", duration_seconds: "2" },
    { id: C.sc, project_id: P, session_id: SES, track_id: T.sc, kind: "cue", label: "Score — tense", duration_seconds: "20" },
    { id: C.rec, project_id: P, session_id: SES, track_id: T.fx, kind: "asset", asset_id: "x", label: "recorded", duration_seconds: "1" },
  ],
  audio_generations: [{ id: "old", project_id: P, scene_id: S1, clip_id: C.fx, status: "succeeded" }],
  dialogue_lines: [{ id: LINE, scene_id: S1, project_id: P, text: "You came.", speaker_name: "AMARA", character_id: AMARA, emotion: "anger", intensity: 8, estimated_seconds: 1.5 }],
  characters: [{ id: AMARA, name: "Amara Bello", age: "32", gender: "Woman", nationality: "Nigerian", personality: "Calm" }],
});
async function app(fake: ReturnType<typeof fakeDb>) {
  const a = Fastify();
  a.addHook("onRequest", async (req) => void ((req as any).db = fake.db));
  await registerAudioRoutes(a);
  return a;
}

describe("Audio Studio — generate sound", () => {
  it("generates every planned ambience/effect/score cue with the built-in synthesiser; skips dialogue, recordings and cues already generated", async () => {
    const fake = fakeDb(rows());
    const r = (await (await app(fake)).inject({ method: "POST", url: `/api/projects/${P}/audio/scenes/${S1}/generate-cues` })).json();
    const reqs = fake.calls.filter((c) => c.fn === "request_audio_generation").map((c) => c.args);
    expect(reqs.map((a) => [a.p_clip, a.p_kind, a.p_provider, a.p_execution, a.p_duration])).toEqual([
      [C.bg, "ambience", "aurastage-synth", "native", 20], [C.sc, "score", "aurastage-synth", "native", 20],
    ]);
    expect(reqs[0].p_description).toBe("Exterior lagos harbour ambience — rain, dawn");
    expect(r.skipped).toEqual(["door slams"]);
  });
  it("one cue on request; a voice is spoken in the speaker's Voice DNA where the built-in voice is installed, otherwise refused plainly (412)", async () => {
    const fake = fakeDb(rows());
    const a = await app(fake);
    const ok = await a.inject({ method: "POST", url: `/api/projects/${P}/audio/scenes/${S1}/generate`, payload: { clip_id: C.fx, kind: "fx", description: "door slams twice", duration_seconds: 3, seed: 9 } });
    expect(ok.json()).toMatchObject({ kind: "fx", provider: "aurastage-synth", seed: 9, status: "queued" });
    const v = await a.inject({ method: "POST", url: `/api/projects/${P}/audio/scenes/${S1}/generate`, payload: { kind: "voice", line_id: LINE, duration_seconds: 2 } });
    if (voiceInstalled) {
      // Voice DNA from Amara's Casting profile + the line's emotion; the words are the script's.
      const args = fake.calls.filter((c) => c.fn === "request_audio_generation").at(-1)!.args;
      expect(args).toMatchObject({ p_kind: "voice", p_description: "You came.", p_provider: "aurastage-voice", p_execution: "native" });
      expect(args.p_params.voice).toMatchObject({ gender: "female", age_band: "adult" });
      expect(args.p_params.voice.description).toMatch(/for anger \(intensity 8\/10\)\.$/);
      const noLine = await a.inject({ method: "POST", url: `/api/projects/${P}/audio/scenes/${S1}/generate`, payload: { kind: "voice", duration_seconds: 2 } });
      expect(noLine.json().error.message).toBe("Choose the dialogue line to speak.");
    } else {
      expect(v.statusCode).toBe(412);
      expect(v.json().error.message).toBe("No voice generator is connected yet.");
    }
    const bad = await a.inject({ method: "POST", url: `/api/projects/${P}/audio/scenes/${S1}/generate`, payload: { kind: "fx", description: "", duration_seconds: 3 } });
    expect(bad.statusCode).toBe(400);
    const paid = await a.inject({ method: "POST", url: `/api/projects/${P}/audio/scenes/${S1}/generate`, payload: { kind: "fx", description: "x", duration_seconds: 3, provider: "elevenlabs" } });
    expect(paid.statusCode).toBe(400);
  });
});
