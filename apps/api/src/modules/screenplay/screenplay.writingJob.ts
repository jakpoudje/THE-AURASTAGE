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
    // A retryable failure (an answer that didn't fit, a cut-off answer, a busy backend) is asked once more.
    let res: ReasoningResult<T>;
    try {
      res = await r.complete<T>({ ...req, effort, task: { kind, snapshot } }, d.env);
    } catch (e) {
      if (!(e as { retryable?: boolean }).retryable) throw e;
      res = await r.complete<T>({ ...req, effort, task: { kind, snapshot } }, d.env);
    }
    usage.input_tokens += res.usage.input_tokens; usage.output_tokens += res.usage.output_tokens; usage.calls++;
    model = res.model; test = res.test_output;
    return res.data;
  };
  const done = (output: Row, checks: Row[]): WritingResult => ({ output, checks, provider: r.id, model, test_output: test, usage });

  // What the writer sees while waiting: the step actually running (never an invented percentage).
  const stage = (text: string, extra: Row = {}) => d.progress(job.id, { stage: text, ...extra }, null).catch(() => undefined);
  if (job.kind === "develop_story") {
    const req = storyDevelopment.storyDevelopmentRequest(job.input.brief);
    const kept = ((job.input.brief?.characters ?? []) as Row[]).map((c) => c.name);
    await stage(kept.length ? `Developing the story around ${kept.slice(0, 3).join(", ")}${kept.length > 3 ? "…" : ""}` : "Developing the story from your brief");
    const out = await ask<Row>(req, "develop_story", job.input, "medium");
    return done(out, storyDevelopment.checkStoryDevelopment(job.input.brief, out as never));
  }
  if (job.kind === "outline") {
    const req = scriptWriting.outlineRequest({ story: job.input.story, request: job.input.request });
    await stage(`Planning scenes for ${job.input.story?.target_runtime_minutes ? `${job.input.story.target_runtime_minutes} minutes` : "the story"} across ${(job.input.story?.beats ?? []).length || "its"} beats`);
    const out = await ask<scriptWriting.OutlineOutput>(req, "outline", job.input, "medium");
    const scenes = out.scenes.map((s, i) => ({ ...s, number: i + 1, location: s.location.toUpperCase() }));
    const fixed = { ...out, scenes };
    return done(fixed, scriptWriting.checkOutline(job.input.story, fixed));
  }
  if (job.kind === "rewrite_scene") {
    const req = scriptWriting.rewriteRequest(job.input as scriptWriting.RewriteInput);
    await stage(`Reworking scene ${job.input.scene_number ?? ""}: ${job.input.mode ?? ""}`.trim());
    const out = await ask<scriptWriting.RewriteOutput>(req, "rewrite_scene", job.input);
    return done(out, scriptWriting.checkRewrite(job.input as scriptWriting.RewriteInput, out));
  }
  // write_script: batch by batch, carrying the end of the previous scene into the next batch.
  const outline = job.input.outline as scriptWriting.OutlineScene[];
  const batches = scriptWriting.writingBatches(outline);
  // Resume after a restart: keep scenes already written by an earlier attempt of this job.
  const written = new Map<number, { number: number; fountain: string }>(((job.output?.scenes ?? []) as Row[]).map((s) => [s.number, s as { number: number; fountain: string }]));
  const checks: Row[] = [];
  // Batches run CONCURRENCY at a time (a full script used to be written strictly one batch after another). A batch
  // continues from the real end of the scene before it when that scene is already written; otherwise the outline
  // (which every batch receives in full) carries the continuity.
  const CONCURRENCY = 3;
  const heading = (n: number) => { const o = outline.find((x) => x.number === n); return o ? `${o.int_ext}. ${o.location} - ${o.time_of_day}` : `scene ${n}`; };
  let batchesDone = 0;
  const runBatch = async (bi: number) => {
    const batch = batches[bi];
    const numbers = batch.filter((n) => !written.has(n));
    if (!numbers.length) return;
    const before = written.get(numbers[0] - 1);
    const input = { story: job.input.story, outline, numbers, previous_tail: before ? before.fountain.slice(-1500) : "", request: job.input.request ?? "" };
    let out: scriptWriting.WriteScenesOutput | null = null, lastErr: Error | null = null;
    for (let attempt = 0; attempt < 2 && !out; attempt++) {
      try {
        out = await ask<scriptWriting.WriteScenesOutput>(scriptWriting.writeScenesRequest(input), "write_scenes", input);
      } catch (e) { lastErr = e as Error; if (!(e as { retryable?: boolean }).retryable) break; }
    }
    if (!out) throw new Error(`Writing stopped at scenes ${numbers.join(", ")} (${written.size} of ${outline.length} written and kept): ${lastErr?.message ?? "no answer"}`);
    for (const sc of out.scenes) if (numbers.includes(sc.number) && !written.has(sc.number)) written.set(sc.number, sc);
    checks.push(...scriptWriting.checkScenes(input, out).map((c) => ({ ...c, batch: bi + 1 })));
    batchesDone++;
    const next = batches.findIndex((bt, k) => k > bi && bt.some((n) => !written.has(n)));
    await d.progress(job.id, {
      done: written.size, total: outline.length, batches_done: batchesDone, batches: batches.length,
      stage: written.size >= outline.length ? "Checking headings, cast and length across the whole script" : `Wrote ${heading(numbers[numbers.length - 1])}${next >= 0 ? ` · now writing ${heading(batches[next][0])}` : ""}`,
    }, { scenes: [...written.values()].sort((x, y) => x.number - y.number) });
  };
  await stage(`Writing ${outline.length} scenes, ${Math.min(CONCURRENCY, batches.length)} batches at a time — starting with ${heading(outline[0]?.number ?? 1)}`, { done: written.size, total: outline.length, batches_done: 0, batches: batches.length });
  for (let w = 0; w < batches.length; w += CONCURRENCY) {
    const wave = batches.slice(w, w + CONCURRENCY).map((_, k) => w + k);
    const results = await Promise.allSettled(wave.map(runBatch));
    const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (failed) throw failed.reason;
  }
  // One summary per check across all batches (failing batches listed as evidence).
  const merged = [...new Set(checks.map((c) => c.id))].map((id) => {
    const all = checks.filter((c) => c.id === id), bad = all.filter((c) => !c.ok);
    return { id, label: all[0].label, ok: bad.length === 0, evidence: bad.length ? bad.map((c) => c.evidence).join("; ").slice(0, 600) : all[all.length - 1].evidence };
  });
  return done({ scenes: [...written.values()].sort((a, b) => a.number - b.number) }, merged);
}
