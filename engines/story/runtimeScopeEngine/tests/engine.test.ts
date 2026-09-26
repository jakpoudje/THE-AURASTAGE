import { describe, expect, it } from "vitest";
import { runtimeScopeEngine } from "../engine";

describe("runtimeScopeEngine", () => {
  it("uses the genre prior: N ≈ R / μ", () => {
    const plan = runtimeScopeEngine({ target_runtime_minutes: 120, genre: "Thriller" });
    expect(plan.mean_scene_minutes).toBe(1.9);
    expect(plan.estimated_scene_count).toBe(Math.round(120 / 1.9));
  });

  it("act budgets sum exactly to the runtime and scene count", () => {
    const plan = runtimeScopeEngine({ target_runtime_minutes: 97, genre: "drama" });
    const minutes = plan.acts.reduce((s, a) => s + a.minutes, 0);
    const scenes = plan.acts.reduce((s, a) => s + a.scenes, 0);
    expect(Math.round(minutes * 10) / 10).toBe(97);
    expect(scenes).toBe(plan.estimated_scene_count);
  });

  it("honours a user override", () => {
    const plan = runtimeScopeEngine({ target_runtime_minutes: 100, genre: "action", mean_scene_minutes_override: 4 });
    expect(plan.estimated_scene_count).toBe(25);
    expect(plan.basis).toContain("override");
  });

  it("falls back to a default prior for unknown genres", () => {
    const plan = runtimeScopeEngine({ target_runtime_minutes: 22 });
    expect(plan.mean_scene_minutes).toBe(2.2);
    expect(plan.estimated_scene_count).toBe(10);
  });

  it("gives a page range around one page per minute", () => {
    expect(runtimeScopeEngine({ target_runtime_minutes: 120 }).estimated_pages).toEqual({ min: 108, max: 132 });
  });

  it("rejects invalid runtimes", () => {
    expect(() => runtimeScopeEngine({ target_runtime_minutes: 0 })).toThrow();
  });
});
