// Outline & Structure (SRS §5.1): the runtime-driven plan. Every number comes
// from story.runtimeScopeEngine; the basis line says where the estimate came from.
import type { ScopePlan } from "@aurastage/contracts";

export function ScopePlanPanel({ plan, actualScenes }: { plan: ScopePlan | null; actualScenes?: number }) {
  if (!plan) {
    return (
      <div className="rounded-xl border border-dashed border-aura-border p-6 text-sm text-white/50">
        Set a target runtime in Project Setup to see the scene and act plan.
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-aura-border bg-aura-panel p-6">
      <h2 className="font-display text-xl">Runtime plan</h2>
      <p className="mt-1 text-sm text-white/60">{plan.basis} This is a planning guide, not a rule.</p>
      <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Target runtime" value={`${plan.target_runtime_minutes} min`} />
        <Stat label="Planned scenes" value={`≈ ${plan.estimated_scene_count}`} />
        <Stat label="Pages (approx.)" value={`${plan.estimated_pages.min}–${plan.estimated_pages.max}`} />
        <Stat label="Scenes written" value={actualScenes === undefined ? "—" : String(actualScenes)} />
      </dl>
      <div className="mt-5 space-y-2">
        {plan.acts.map((a) => (
          <div key={a.act} className="flex items-center gap-3 text-sm">
            <span className="w-40 shrink-0 text-white/70">
              Act {a.act} · {a.label}
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
              <div className="h-full bg-aura-gold/70" style={{ width: `${(a.minutes / plan.target_runtime_minutes) * 100}%` }} />
            </div>
            <span className="w-32 shrink-0 text-right text-white/60">
              {a.minutes} min · {a.scenes} scenes
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-aura-border bg-black/30 p-3">
      <dt className="text-[11px] uppercase tracking-wider text-white/50">{label}</dt>
      <dd className="mt-1 font-display text-lg">{value}</dd>
    </div>
  );
}
