// Right column: planning tools, the scene shot summary and the coverage checks.
// Coverage is interval maths over story time (SRS §9.1) — never a made-up score.
import Link from "next/link";
import type { StoryboardScene } from "../types";
import { secs } from "../state/labels";

export function PlanPanel({
  s,
  projectId,
  busy,
  onGenerate,
  onApprove,
}: {
  s: StoryboardScene;
  projectId: string;
  busy: null | "generate" | "shot" | "approve";
  onGenerate: () => void;
  onApprove: () => void;
}) {
  const c = s.coverage;
  const plan = s.plan;
  const approvedCurrent = plan?.status === "approved" && plan.review_state === "current";
  const canPlan = s.dna.state === "locked" && s.scene.status === "active";
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-aura-border bg-aura-panel p-4">
        <h3 className="font-display text-lg">Shot planning tools</h3>
        {s.dna.state === "not_locked" ? (
          <p className="mt-2 text-sm text-white/60">
            Shots are planned from a locked Scene DNA.{" "}
            <Link href={`/projects/${projectId}/scene-dna`} className="text-aura-gold underline">
              Lock this scene in Scene DNA →
            </Link>
          </p>
        ) : s.dna.state === "needs_review" ? (
          <p className="mt-2 text-sm text-aura-gold">
            This scene's Scene DNA changed and needs to be locked again.{" "}
            <Link href={`/projects/${projectId}/scene-dna`} className="underline">
              Open Scene DNA →
            </Link>
          </p>
        ) : (
          <p className="mt-2 text-xs text-white/50">
            From Scene DNA version {s.dna.version_number}
            {s.dna.camera_energy ? ` · ${s.dna.camera_energy} camera` : ""}
            {s.dna.mood.length ? ` · ${s.dna.mood.join(", ")}` : ""}
          </p>
        )}
        <button
          onClick={onGenerate}
          disabled={!canPlan || busy !== null}
          className="mt-3 w-full rounded-md border border-aura-gold/60 px-4 py-2 text-sm text-aura-gold disabled:opacity-40"
        >
          {busy === "generate" ? "Planning…" : plan ? "Re-plan shots from Scene DNA" : "Plan shots from Scene DNA"}
        </button>
        <button
          onClick={onApprove}
          disabled={!plan || !c?.ready_for_approval || approvedCurrent || plan.review_state !== "current" || busy !== null}
          className="mt-2 w-full rounded-md bg-aura-gold px-4 py-2 text-sm font-medium text-black disabled:opacity-40"
        >
          {busy === "approve"
            ? "Approving…"
            : approvedCurrent
              ? `Approved · version ${plan!.approved_version_number} ✓`
              : plan?.approved_version_id
                ? "Approve again (new version)"
                : "Approve shot plan"}
        </button>
        <p className="mt-2 text-[11px] text-white/30">Suggestions are a starting point — change, add, reorder or remove any shot.</p>
      </div>

      {c && (
        <div className="rounded-xl border border-aura-border bg-aura-panel p-4 text-sm">
          <h3 className="font-display text-lg">Scene shot summary</h3>
          <dl className="mt-2 grid grid-cols-2 gap-y-1 text-white/70">
            <dt>Shots</dt>
            <dd className="text-right">{c.shot_count}</dd>
            <dt>Screen time</dt>
            <dd className="text-right">{secs(c.screen_seconds)}</dd>
            <dt>Story time covered</dt>
            <dd className="text-right">
              {secs(c.covered_seconds)} ({Math.round(c.coverage * 100)}%)
            </dd>
          </dl>
          <ul className="mt-3 space-y-2" aria-label="Coverage checks">
            {c.readiness.map((r) => (
              <li key={r.id} className="flex gap-2">
                <span aria-hidden className={r.ok ? "text-emerald-400" : r.blocking ? "text-red-400" : "text-aura-gold"}>
                  {r.ok ? "✓" : r.blocking ? "✕" : "!"}
                </span>
                <span className="min-w-0">
                  <span>{r.label}</span>
                  {!r.blocking && !r.ok && <span className="ml-1 text-[10px] uppercase text-white/40">recommended</span>}
                  <span className="block text-xs text-white/40">{r.evidence}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
