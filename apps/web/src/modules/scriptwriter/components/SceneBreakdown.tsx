// Scene Breakdown: the canonical Scene rows created when a version is approved.
// Before approval, shows the live (unsaved) breakdown clearly labelled as a draft.
import type { Scene } from "@aurastage/contracts";
import type { SceneCandidate } from "@aurastage/engines";

function fmt(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
}

export function SceneBreakdown({ scenes, draftScenes }: { scenes: Scene[]; draftScenes: SceneCandidate[] }) {
  const approved = scenes.length > 0;
  const rows = approved ? scenes : draftScenes;
  return (
    <div className="rounded-xl border border-aura-border bg-aura-panel">
      <div className="border-b border-aura-border px-5 py-3">
        <h2 className="font-display text-xl">Scene Breakdown</h2>
        <p className="text-sm text-white/50">
          {approved
            ? "Scenes from the approved script. Later stages build on these."
            : "Draft only: approve the script to lock these in as production scenes."}
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="p-5 text-sm text-white/40">No scenes yet. Scenes start at lines beginning with INT. or EXT.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wider text-white/40">
            <tr>
              <th className="px-5 py-2">#</th>
              <th className="py-2">Heading</th>
              <th className="py-2">Characters</th>
              <th className="py-2">Length</th>
              <th className="px-5 py-2 text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const scene = "id" in s ? (s as Scene) : null;
              return (
                <tr key={scene?.id ?? s.number} className={`border-t border-aura-border ${scene?.status === "omitted" ? "opacity-40" : ""}`}>
                  <td className="px-5 py-2 text-white/50">{s.number}</td>
                  <td className="py-2">{s.heading}</td>
                  <td className="py-2 text-white/60">{s.speaking_characters.join(", ") || "—"}</td>
                  <td className="py-2 text-white/60">{fmt(s.estimated_seconds)}</td>
                  <td className="px-5 py-2 text-right">
                    {!scene ? (
                      <Pill tone="muted">Draft</Pill>
                    ) : scene.status === "omitted" ? (
                      <Pill tone="muted">Omitted</Pill>
                    ) : scene.review_state === "review_required" ? (
                      <Pill tone="gold">Review required</Pill>
                    ) : (
                      <Pill tone="green">Approved</Pill>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Pill({ tone, children }: { tone: "green" | "gold" | "muted"; children: React.ReactNode }) {
  const cls = {
    green: "border-emerald-400/50 text-emerald-300",
    gold: "border-aura-gold/60 text-aura-gold",
    muted: "border-white/20 text-white/50",
  }[tone];
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase ${cls}`}>{children}</span>;
}
