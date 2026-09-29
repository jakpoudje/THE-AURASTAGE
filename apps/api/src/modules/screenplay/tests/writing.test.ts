import { describe, expect, it } from "vitest";
import { runWritingJob } from "../screenplay.writingJob";
import { testReasoningAdapter } from "../../../providers/reasoning";
import { parseScreenplay } from "../screenplay.derive";
import { scriptWriting } from "@aurastage/engines";

const brief = { title: "Shadows of Lagos", type: "short_film", logline: "A journalist uncovers a buried election fraud.", synopsis: null, genre: "Thriller", subgenre: null,
  tone: "Tense", setting: "Lagos", time_period: "Present day", target_runtime_minutes: 12, request: "" };
const deps = (log: unknown[] = []) => ({ reasoner: () => testReasoningAdapter, progress: async (_id: string, p: unknown) => void log.push(p), env: {} });

describe("AuraScript job runner (with the labelled test writer)", () => {
  it("develops the story, outlines it and writes every scene in batches with real progress; the result parses as a screenplay", async () => {
    const dev = await runWritingJob({ id: "d", kind: "develop_story", input: { brief } }, deps());
    expect(dev.test_output).toBe(true);
    expect(dev.checks.find((c) => c.id === "protagonist")!.ok).toBe(true);
    const story = { ...brief, characters: dev.output.characters, beats: dev.output.beats };
    const ol = await runWritingJob({ id: "o", kind: "outline", input: { story } }, deps());
    expect(ol.output.scenes.length).toBe(6);
    expect(ol.checks.find((c) => c.id === "runtime")!.ok).toBe(true);
    const progress: any[] = [];
    const sc = await runWritingJob({ id: "s", kind: "write_script", input: { story, outline: ol.output.scenes } }, deps(progress));
    expect(sc.output.scenes.map((s: any) => s.number)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(progress.at(-1)).toMatchObject({ done: 6, total: 6 });
    expect(progress.length).toBe(scriptWriting.writingBatches(ol.output.scenes).length);
    expect(sc.checks.find((c) => c.id === "headings")!.ok).toBe(true);
    const text = scriptWriting.assembleScript("Shadows of Lagos", sc.output.scenes);
    expect(parseScreenplay(text).filter((e) => e.type === "scene_heading")).toHaveLength(6);
    expect(sc.usage.calls).toBe(progress.length);
  });
  it("resumes a restarted script job without rewriting scenes it already has", async () => {
    const outline = [1, 2, 3].map((n) => ({ number: n, int_ext: "INT", location: "FLAT", time_of_day: "DAY", purpose: "", beat: "b", summary: "s", characters: [], est_minutes: 5 }));
    const r = await runWritingJob({ id: "s", kind: "write_script", input: { story: { title: "T" }, outline }, output: { scenes: [{ number: 1, fountain: "INT. FLAT - DAY\n\nKept from before." }] } }, deps());
    expect(r.output.scenes[0].fountain).toBe("INT. FLAT - DAY\n\nKept from before.");
    expect(r.usage.calls).toBe(2);
  });
  it("rewrites: expand grows the scene and keeps its heading; no backend is a plain error", async () => {
    const scene = "INT. FLAT - NIGHT\n\nTunde paces.\n\nTUNDE\nThey buried it.";
    const r = await runWritingJob({ id: "r", kind: "rewrite_scene", input: { story: { title: "T" }, mode: "expand", scene_text: scene } }, deps());
    expect(r.output.fountain.startsWith("INT. FLAT - NIGHT")).toBe(true);
    expect(r.checks.every((c) => c.ok)).toBe(true);
    await expect(runWritingJob({ id: "x", kind: "outline", input: {} }, { ...deps(), reasoner: () => null })).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });
  it("asks once more when an answer is refused as retryable (regression: one bad story answer failed the whole step)", async () => {
    let calls = 0;
    const flaky = { ...testReasoningAdapter, complete: async (req: any, env: any) => {
      if (++calls === 1) throw Object.assign(new Error("Claude's answer didn't match the expected shape (logline: Required)."), { retryable: true });
      return testReasoningAdapter.complete(req, env);
    } };
    const r = await runWritingJob({ id: "d", kind: "develop_story", input: { brief } }, { ...deps(), reasoner: () => flaky as never });
    expect(calls).toBe(2);
    expect(r.usage.calls).toBe(1);
    const hard = { ...testReasoningAdapter, complete: async () => { calls++; throw new Error("Claude rejected the API key on the server."); } };
    calls = 0;
    await expect(runWritingJob({ id: "d", kind: "develop_story", input: { brief } }, { ...deps(), reasoner: () => hard as never })).rejects.toThrow(/API key/);
    expect(calls).toBe(1);
  });
});
