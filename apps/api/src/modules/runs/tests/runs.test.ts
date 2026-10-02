import { beforeEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";

// The batch functions are the domains' own (tested there); here they are stand-ins so a run's rounds can be followed.
const audio = { spotAllScenes: vi.fn(), generateAllCues: vi.fn(), placeGenerated: vi.fn() };
const visual = { compileAllShots: vi.fn(), sketchAllShots: vi.fn(), approveAllShots: vi.fn() };
vi.mock("../../audio/audio.batch", () => audio);
vi.mock("../../generation/generation.batch", () => visual);
const { registerRunRoutes } = await import("../runs.controller");
const { toRunDTO } = await import("../runs.service");

type Row = Record<string, any>;
const P = "11111111-1111-4111-8111-111111111111";
const R = "22222222-2222-4222-8222-222222222222";
const run = (over: Row = {}): Row => ({
  id: R, project_id: P, area: "audio", kind: "audio.film", scene_id: null, status: "running", phase: "spot", message: null, progress: {}, log: [],
  rounds: 0, lease_until: null, started_by_label: "ama", started_at: new Date().toISOString(), updated_at: new Date().toISOString(), finished_at: null, ...over,
});

function fakeDb(state: { run: Row; lease?: boolean }) {
  const calls: { fn: string; args: Row }[] = [];
  const from = (t: string) => {
    const q: any = { select: () => q, eq: () => q, order: () => q, limit: () => q,
      maybeSingle: async () => ({ data: t === "projects" ? { id: P } : state.run, error: null }),
      then: (ok: any) => ok({ data: [state.run], error: null }) };
    return q;
  };
  const rpc = async (fn: string, args: Row) => {
    calls.push({ fn, args });
    if (fn === "lease_production_run") return { data: state.lease ?? true, error: null };
    if (fn === "save_production_run") {
      state.run = { ...state.run, phase: args.p_phase, status: args.p_status, message: args.p_message, progress: args.p_progress, updated_at: new Date().toISOString(),
        log: args.p_log ? [...state.run.log, { at: new Date().toISOString(), text: args.p_log }] : state.run.log };
      return { data: state.run, error: null };
    }
    if (fn === "start_production_run") return { data: { run: state.run, joined: false }, error: null };
    if (fn === "control_production_run") { state.run = { ...state.run, status: args.p_action === "pause" ? "paused" : state.run.status }; return { data: state.run, error: null }; }
    return { data: null, error: null };
  };
  return { calls, db: { from, rpc } };
}
async function app(fake: ReturnType<typeof fakeDb>) {
  const a = Fastify();
  a.addHook("onRequest", async (req) => void ((req as any).db = fake.db));
  await registerRunRoutes(a);
  return a;
}

beforeEach(() => { for (const f of [...Object.values(audio), ...Object.values(visual)]) f.mockReset(); });

describe("production runs (owner request 2026-10-02: batches, scene by scene, always showing what is happening)", () => {
  it("a whole-film sound run goes spot → generate (placing what's ready) → finish, waits for the generator when its queue is full, and completes", async () => {
    const st = { run: run() };
    const fake = fakeDb(st);
    const a = await app(fake);
    audio.spotAllScenes.mockResolvedValue({ spotted: [1, 2], waiting: [3], already: 0, remaining: 0 });
    let r = (await a.inject({ method: "POST", url: `/api/runs/${R}/step` })).json();
    expect(r.run.phase).toBe("generate");
    expect(r.run.message).toMatch(/Spotted scenes 1, 2\. .*Waiting for a shot plan: 3/);

    audio.generateAllCues.mockResolvedValue({ scenes: 2, requested: 48, skipped: 0, remaining: 30, busy: true, making: 48, failed: [] });
    audio.placeGenerated.mockResolvedValue({ placed: 5, remaining: 0, still_making: 43, not_generated: 30 });
    r = (await a.inject({ method: "POST", url: `/api/runs/${R}/step` })).json();
    expect(r.run.phase).toBe("generate");
    expect(r.wait_ms).toBe(5000); // the generator's run queue is full: wait, never "too many in a minute"
    expect(r.run.message).toMatch(/waiting for the generator/);
    expect(r.run.message).toMatch(/Placed 5 finished sounds/);
    expect(audio.generateAllCues.mock.calls[0][4]).toEqual({ budgetMs: 15_000 }); // each round stays inside the time budget

    audio.generateAllCues.mockResolvedValue({ scenes: 2, requested: 30, skipped: 0, remaining: 0, busy: false, making: 50, failed: [] });
    r = (await a.inject({ method: "POST", url: `/api/runs/${R}/step` })).json();
    expect(r.run.phase).toBe("finish");

    audio.placeGenerated.mockResolvedValue({ placed: 10, remaining: 0, still_making: 3, not_generated: 0 });
    r = (await a.inject({ method: "POST", url: `/api/runs/${R}/step` })).json();
    expect(r.run.status).toBe("running"); // still waiting for the last three
    audio.placeGenerated.mockResolvedValue({ placed: 3, remaining: 0, still_making: 0, not_generated: 0 });
    r = (await a.inject({ method: "POST", url: `/api/runs/${R}/step` })).json();
    expect(r.run.status).toBe("completed");
    expect(r.run.message).toMatch(/^Done\./);
    expect(r.run.log.at(-1).text).toMatch(/^Finished —/);
  });

  it("only the page holding the lease drives a round; the others just watch", async () => {
    const fake = fakeDb({ run: run(), lease: false });
    const r = (await (await app(fake)).inject({ method: "POST", url: `/api/runs/${R}/step` })).json();
    expect(r.driving).toBe(false);
    expect(audio.spotAllScenes).not.toHaveBeenCalled();
    expect(fake.calls.map((c) => c.fn)).toEqual(["lease_production_run"]);
  });

  it("a permission problem pauses the run with the reason; other problems are retried, then the run stops after three", async () => {
    const st = { run: run({ phase: "generate" }) };
    const fake = fakeDb(st);
    const a = await app(fake);
    audio.generateAllCues.mockRejectedValue(Object.assign(new Error("your role (Writer) can't generate in Audio Studio"), { code: "AURA-AUD-403" }));
    let r = (await a.inject({ method: "POST", url: `/api/runs/${R}/step` })).json();
    expect(r.run.status).toBe("paused");
    expect(r.run.message).toMatch(/^Paused: your role/);
    st.run = run({ phase: "generate" });
    audio.generateAllCues.mockRejectedValue(new Error("timeout"));
    for (let i = 0; i < 2; i++) expect((await a.inject({ method: "POST", url: `/api/runs/${R}/step` })).json().run.status).toBe("running");
    r = (await a.inject({ method: "POST", url: `/api/runs/${R}/step` })).json();
    expect(r.run.status).toBe("failed");
  });

  it("a visual film run compiles (starting sketches for the ready shots), makes, then approves each take as it finishes", async () => {
    const st = { run: run({ area: "visual", kind: "visual.film", phase: "compile" }) };
    const a = await app(fakeDb(st));
    visual.compileAllShots.mockResolvedValue({ compiled: 40, remaining: 0, already: 0, waiting_scenes: [], failed: [] });
    visual.sketchAllShots.mockResolvedValue({ requested: 20, remaining: 0, already: 0, needs_prompt: 0, busy: false, making: 20, failed: [] });
    visual.approveAllShots.mockResolvedValue({ approved: 0, remaining: 0, waiting: 20, total: 40, making: 20 });
    let r = (await a.inject({ method: "POST", url: `/api/runs/${R}/step` })).json();
    expect(r.run.phase).toBe("make");
    r = (await a.inject({ method: "POST", url: `/api/runs/${R}/step` })).json();
    expect(r.run.phase).toBe("finish");
    r = (await a.inject({ method: "POST", url: `/api/runs/${R}/step` })).json();
    expect(r.run.status).toBe("running"); // 20 still being made
    visual.approveAllShots.mockResolvedValue({ approved: 20, remaining: 0, waiting: 0, total: 40, making: 0 });
    r = (await a.inject({ method: "POST", url: `/api/runs/${R}/step` })).json();
    expect(r.run.status).toBe("completed");
  });

  it("start validates the kind (visual runs are whole-film); pause goes through the gated function; idle runs are flagged", async () => {
    const fake = fakeDb({ run: run() });
    const a = await app(fake);
    expect((await a.inject({ method: "POST", url: `/api/projects/${P}/runs`, payload: { kind: "audio.everything" } })).statusCode).toBe(400);
    expect((await a.inject({ method: "POST", url: `/api/projects/${P}/runs`, payload: { kind: "visual.film", scene_id: R } })).statusCode).toBe(400);
    expect((await a.inject({ method: "POST", url: `/api/projects/${P}/runs`, payload: { kind: "audio.film" } })).json().joined).toBe(false);
    expect((await a.inject({ method: "POST", url: `/api/runs/${R}/control`, payload: { action: "pause" } })).json().run.status).toBe("paused");
    expect((await a.inject({ method: "POST", url: `/api/runs/${R}/control`, payload: { action: "explode" } })).statusCode).toBe(400);
    const old = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(toRunDTO(run({ updated_at: old })).idle).toBe(true);
    expect(toRunDTO(run()).idle).toBe(false);
    // Regression (live smoke 2026-10-02): a brand-new run is on its first step, not "start", and lists its steps.
    const fresh = toRunDTO(run({ phase: "start", progress: {} }));
    expect(fresh.phase).toBe("spot");
    expect(fresh.progress.phases).toEqual(["spot", "generate", "finish"]);
    expect(toRunDTO(run({ kind: "visual.film", area: "visual", phase: "start" })).phase).toBe("compile");
    const list = (await a.inject({ method: "GET", url: `/api/projects/${P}/runs` })).json();
    expect(list.active.audio.id).toBe(R);
  });
});
