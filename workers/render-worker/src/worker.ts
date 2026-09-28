// workers/render-worker/src/worker.ts
// Render worker (CLAUDE.md rule 8): claims queued renders through the MOS
// functions in migration 0018, renders from the immutable manifest, runs final
// QC, stores the files and records the result. Completing twice is a no-op; a
// crashed claim is re-queued by the database after 30 minutes without a
// heartbeat (max 3 attempts). A cancel request stops the render at the next
// progress report.
import { CancelledError } from "./ffmpeg";
import { renderDeliverable, type RenderClaim, type RenderDeps } from "./render";

export interface WorkerDeps extends Omit<RenderDeps, "progress"> {
  claim(): Promise<RenderClaim | null>;
  progress(renderId: string, percent: number, stage: string): Promise<boolean>;
  complete(renderId: string, outputs: unknown, qc: unknown, passed: boolean): Promise<void>;
  fail(renderId: string, error: string): Promise<void>;
}

export async function runOnce(d: WorkerDeps): Promise<boolean> {
  const claim = await d.claim();
  if (!claim) return false;
  const r = claim.render;
  d.log("render.claimed", { render_id: r.id, profile: r.profile_id, attempt: r.attempt, frames: claim.manifest.duration_frames });
  try {
    const { outputs, qc } = await renderDeliverable(claim, { ...d, progress: (pct, stage) => d.progress(r.id, pct, stage) });
    await d.complete(r.id, outputs, qc, qc.passed);
  } catch (e) {
    const cancelled = e instanceof CancelledError;
    await d.fail(r.id, cancelled ? "Cancelled by request" : (e as Error).message || "Render failed");
    d.log(cancelled ? "render.cancelled" : "render.failed", { render_id: r.id, error: (e as Error).message });
  }
  return true;
}
