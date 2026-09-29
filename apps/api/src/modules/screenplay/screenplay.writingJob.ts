// apps/api/src/modules/screenplay/screenplay.writingJob.ts — runs one AuraScript job (migration 0030) inside the
// generation worker (rule 8). The job input was frozen by the API; this asks the reasoning backend from the Provider
// Gateway (rule 7) with the engine's prompt and schema, and checks every answer with scriptWritingEngine before it is
// stored. A full script is written in batches of scenes; progress (scenes written / total) and the scenes so far are
// saved after every batch, so a long script shows real progress and a failure keeps what was already written.
import { scriptWriting, storyDevelopment } from "@aurastage/engines";
import type { ReasoningAdapter, ReasoningResult } from "../../providers/reasoning/types";

type Row = Record<string, any>;
type Env = Record<string, string | undefined>;
export interface WritingJob { id: string; kind: "develop_story" | "outline" | "write_script" | "rewrite_scene"; input: Row; output?: Row | null }
export interface WritingDeps {
  reasoner(): ReasoningAdapter | null;
  progress(id: string, progress: Row, output: Row | null): Promise<void>;
  env: Env;
}
export interface WritingResult { output: Row; checks: Row[]; provider: string; model: string; test_output: boolean; usage: { input_tokens: number; output_tokens: number; calls: number } }

export async function runWritingJob(job: WritingJob, d: WritingDeps): Promise<WritingResult> {
  const r = d.reasoner();
  if (!r) throw new Error("No writing backend is connected. Add ANTHROPIC_API_KEY on the server to use Claude.");
  const usage = { input_tokens: 0, output_tokens: 0, calls: 0 };
  let model = "", test = false;
  const ask = async <T>(req: { system: string; prompt: string; schema: any; max_tokens?: number }, kind: "develop_story" | "outline" | "write_scenes" | "rewrite_scene", snapshot: unknown, effort: "medium" | "high" = "high") => {
    const res: ReasoningResult<T> = await r.complete<T>({ ...req, effort, task: { kind, snapshot } }, d.env);
    usage.input_tokens += res.usage.input_tokens; usage.output_tokens += res.usage.output_tokens; usage.calls++;
    model = res.model; test = res.test_output;
    return res.data;
  };
  const done = (output: Row, checks: Row[]): WritingResult => ({ output, checks, provider: r.id, model, test_output: test, usage });

  if (job.kind === "develop_story") {
    const req = storyDevelopment.storyDevelopmentRequest(job.input.brief);
    const out = await ask<Row>(req, "develop_story", job.input);
    return done(out, storyDevelopment.checkStoryDevelopment(job.input.brief, out as never));
  }
  if (job.kind === "outline") {
    const req = scriptWriting.outlineRequest({ story: job.input.story, request: job.input.request });
    const out = await ask<scriptWriting.OutlineOutput>(req, "outline", job.input);
    const scenes = out.scenes.map((s, i) => ({ ...s, number: i + 1, location: s.location.toUpperCase() }));
    const fixed = { ...out, scenes };
    return done(fixed, scriptWriting.checkOutline(job.input.story, fixed));
  }
  if (job.kind === "rewrite_scene") {
    const req = scriptWriting.rewriteRequest(job.input as scriptWriting.RewriteInput);
    const out = await ask<scriptWriting.RewriteOutput>(req, "rewrite_scene", job.input);
    return done(out, scriptWriting.checkRewrite(job.input as scriptWriting.RewriteInput, out));
  }
  // write_script: batch by batch, carrying the end of the previous scene into the next batch.
  const outline = job.input.outline as scriptWriting.OutlineScene[];
  const batches = scriptWriting.writingBatches(outline);
  // Resume after a restart: keep scenes already written by an earlier attempt of this job.
  const written = new Map<number, { number: number; fountain: string }>(((job.output?.scenes ?? []) as Row[]).map((s) => [s.number, s as { number: number; fountain: string }]));
  const checks: Row[] = [];
  let tail = "";
  for (const [bi, batch] of batches.entries()) {
    // Only what's still missing: scenes kept from an earlier attempt are never rewritten or replaced.
    const numbers = batch.filter((n) => !written.has(n));
    if (!numbers.length) { tail = written.get(batch[batch.length - 1])!.fountain.slice(-1500); continue; }
    const before = written.get(numbers[0] - 1);
    if (before) tail = before.fountain.slice(-1500);
    const input = { story: job.input.story, outline, numbers, previous_tail: tail, request: job.input.request ?? "" };
    let out: scriptWriting.WriteScenesOutput | null = null, lastErr: Error | null = null;
    for (let attempt = 0; attempt < 2 && !out; attempt++) {
      try {
        out = await ask<scriptWriting.WriteScenesOutput>(scriptWriting.writeScenesRequest(input), "write_scenes", input);
      } catch (e) { lastErr = e as Error; }
    }
    if (!out) throw new Error(`Writing stopped at scenes ${numbers.join(", ")} (${written.size} of ${outline.length} written and kept): ${lastErr?.message ?? "no answer"}`);
    for (const s of out.scenes) if (numbers.includes(s.number) && !written.has(s.number)) written.set(s.number, s);
    checks.push(...scriptWriting.checkScenes(input, out).map((c) => ({ ...c, batch: bi + 1 })));
    tail = (written.get(numbers[numbers.length - 1])?.fountain ?? "").slice(-1500);
    await d.progress(job.id, { done: written.size, total: outline.length, batches_done: bi + 1, batches: batches.length }, { scenes: [...written.values()].sort((a, b) => a.number - b.number) });
  }
  // One summary per check across all batches (failing batches listed as evidence).
  const merged = [...new Set(checks.map((c) => c.id))].map((id) => {
    const all = checks.filter((c) => c.id === id), bad = all.filter((c) => !c.ok);
    return { id, label: all[0].label, ok: bad.length === 0, evidence: bad.length ? bad.map((c) => c.evidence).join("; ").slice(0, 600) : all[all.length - 1].evidence };
  });
  return done({ scenes: [...written.values()].sort((a, b) => a.number - b.number) }, merged);
}
