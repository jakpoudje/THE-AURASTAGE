// Script Analysis (UI_REFERENCE §3): all figures are computed from the text by
// story.sceneBoundaryEngine — nothing here is estimated by hand or invented.
import type { ScriptAnalysis } from "@aurastage/engines";

export function ScriptAnalysisPanel({ analysis }: { analysis: ScriptAnalysis }) {
  return (
    <div className="rounded-xl border border-aura-border bg-aura-panel p-4">
      <h3 className="mb-3 text-xs uppercase tracking-widest text-aura-gold">Script Analysis</h3>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <Row label="Pages (approx.)" value={analysis.estimated_pages} />
        <Row label="Runtime (approx.)" value={`${analysis.estimated_minutes} min`} />
        <Row label="Scenes" value={analysis.scene_count} />
        <Row label="Speaking characters" value={analysis.speaking_characters.length} />
        <Row label="Locations" value={analysis.locations.length} />
      </dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <>
      <dt className="text-white/50">{label}</dt>
      <dd className="text-right">{value}</dd>
    </>
  );
}
