import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

const P = "11111111-1111-4111-8111-111111111111", S1 = "22222222-2222-4222-8222-222222222222", LOCK = "33333333-3333-4333-8333-333333333333";
vi.mock("../../screenplay/screenplay.service", () => ({ getWorkspace: async () => ({
  script: { approved_version_id: "v2" }, current_version: { id: "v2" }, versions: [{ id: "v2", version_number: 2 }],
  scenes: [{ id: S1, status: "active", location: "Harbour" }, { id: "s2", status: "active", location: "HARBOUR" }, { id: "s3", status: "omitted", location: "Office" }] }) }));
vi.mock("../../characters/characters.service", () => ({ getCastingWorkspace: async () => ({ characters: [{ status: "approved", merged_into: null }, { status: "draft", merged_into: null }, { status: "approved", merged_into: "x" }], pending: [], sync: { state: "current" } }) }));
vi.mock("../../dialogue/dialogue.service", () => ({ getDialogueWorkspace: async () => ({ lines: [{ scene_id: S1, status: "active", approval: "approved" }, { scene_id: "s2", status: "active", approval: "draft" }], analysis: { review_required: 0 }, sync: { state: "current" } }) }));
vi.mock("../../scene-dna/sceneDna.service", () => ({ getSceneDnaWorkspace: async () => ({ summary: { scenes: 2, approved: 1, ready: 1, needs_review: 0 } }) }));
vi.mock("../../shots/shots.service", () => ({ getStoryboard: async () => ({ summary: { scenes: 2, dna_locked: 1, planned: 1, approved: 1, shots: 3, needs_review: 0 } }) }));
vi.mock("../../generation/generation.service", () => ({ getVisualWorkspace: async () => ({ queue: { waiting: 0, running: 0 },
  scenes: [{ shots: [{ approved_take_id: "t", package: { review_state: "current" } }, { approved_take_id: null, package: { review_state: "review_required" } }, { approved_take_id: null, package: null }] }] }) }));
vi.mock("../../audio/audio.service", () => ({ getAudioWorkspace: async () => ({ scenes: [{ plan: {}, session: { review_state: "current" } }], summary: { approved: 1 } }) }));
vi.mock("../../editorial/editorial.service", () => ({ getEditorialWorkspace: async () => ({ timeline: { status: "locked", review_state: "current", lock: { lock_number: 1 } }, clips: [], issues: [] }) }));
vi.mock("../../rendering/rendering.service", () => ({ getDeliveryWorkspace: async () => ({ picture_lock: { id: LOCK }, required_profiles: ["streaming_master", "subtitles"],
  renders: [{ picture_lock_id: LOCK, profile_id: "streaming_master", status: "succeeded", qc_passed: true, review_state: "current" }, { picture_lock_id: LOCK, profile_id: "subtitles", status: "failed", qc_passed: false, review_state: "current" }] }) }));
import { registerProjectsRoutes } from "../projects.controller";

function app(project: unknown) {
  const a = Fastify();
  a.addHook("onRequest", async (req) => {
    (req as any).db = {
      from: (t: string) => {
        const q: any = { select: () => q, eq: () => q, is: () => q, maybeSingle: async () => ({ data: t === "projects" ? project : null, error: null }), then: (ok: any) => ok({ count: 4, error: null }) };
        return q;
      },
    };
  });
  return a;
}

describe("GET /api/projects/:id/overview", () => {
  it("counts every stage from the domains' own read models", async () => {
    const a = app({ id: P, title: "Shadows of Lagos", type: "feature_film", genre: "Thriller", logline: null, target_runtime_minutes: 110 });
    await registerProjectsRoutes(a);
    const res = await a.inject({ method: "GET", url: `/api/projects/${P}/overview` });
    expect(res.statusCode).toBe(200);
    const o = res.json();
    expect(o.counts).toEqual({ scenes: 2, shots: 3, characters: 2, locations: 1, dialogue_lines: 2, assets: 4 });
    const by = Object.fromEntries(o.stages.map((s: any) => [s.id, s]));
    expect(by.scriptwriter.summary).toBe("Version 2 approved · 2 scenes");
    expect(by.casting).toMatchObject({ done: 1, total: 2, state: "in_progress" });
    expect(by.dialogue).toMatchObject({ done: 1, total: 2 });
    expect(by.visual).toMatchObject({ state: "needs_review", done: 1, total: 3 });
    expect(by.editorial.state).toBe("complete");
    expect(by.export).toMatchObject({ done: 1, total: 2, state: "in_progress" });
    expect(by.export.checks.find((c: any) => c.label === "No failed renders")).toMatchObject({ ok: false, evidence: "1 failed render" });
  });
  it("refuses unknown projects", async () => {
    const a = app(null);
    await registerProjectsRoutes(a);
    expect((await a.inject({ method: "GET", url: `/api/projects/${P}/overview` })).statusCode).toBe(403);
    expect((await a.inject({ method: "GET", url: `/api/projects/not-a-uuid/overview` })).statusCode).toBe(403);
  });
});
