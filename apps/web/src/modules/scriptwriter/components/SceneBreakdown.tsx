// Scene Breakdown: the canonical Scene rows created when a version is approved.
// Before approval, shows the live (unsaved) breakdown clearly labelled as a draft.
import type { Scene } from "@aurastage/contracts";
import type { SceneCandidate } from "@aurastage/engines";

function fmt(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
}

export function SceneBreakdown({ scenes, draftScenes, projectId, targetMinutes, onOpen, onRework, currentIsApproved = true }: {
  scenes: Scene[]; draftScenes: SceneCandidate[]; projectId: string; targetMinutes: number | null;
  /** False when a newer version than the approved one is open: the breakdown then follows the current script
   *  (regression, owner 2026-09-30: steps 5–7 kept showing the older approved scenes). */
  currentIsApproved?: boolean;
  /** Open the scene's heading in the editor (by its number in the current draft). */
  onOpen: (number: number) => void;
  /** Open the AI scene tools on this scene. */
  onRework: (number: number) => void;
}) {
  const approved = scenes.length > 0 && currentIsApproved;
  const olderApproved = scenes.length > 0 && !currentIsApproved;
  const rows = approved ? scenes : draftScenes;
  const total = rows.reduce((a, s) => a + s.estimated_seconds, 0);
  const inDraft = new Set(draftScenes.map((s) => s.number));
  return (
    <div className="rounded-xl border border-aura-border bg-aura-panel">
      <div className="border-b border-aura-border px-5 py-3">
        <h2 className="font-display text-xl">Scene Breakdown</h2>
        <p className="text-sm text-white/50">
          {approved
            ? "Scenes from the approved script. Later stages build on these."
            : olderApproved
              ? `Scenes from your current script (not approved yet). Later stages still use the ${scenes.filter((x) => x.status !== "omitted").length} scenes of the previously approved version until you approve this one.`
              : "Draft only: approve the script to lock these in as production scenes."}
        </p>
        {rows.length > 0 && (
          <p className="mt-1 text-xs text-white/60" data-testid="breakdown-total">
            {rows.length} scene{rows.length === 1 ? "" : "s"} · about {fmt(Math.round(total))}
            {targetMinutes ? ` of a ${targetMinutes}-minute target${total > targetMinutes * 60 * 1.1 ? " — running long" : total < targetMinutes * 60 * 0.8 ? " — running short" : " — on target"}` : ""}
          </p>
        )}
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
              <th className="py-2 text-right">Status</th>
              <th className="px-5 py-2 text-right">Actions</th>
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
                  <td className="whitespace-nowrap px-5 py-2 text-right text-xs">
                    {inDraft.has(s.number) && (
                      <>
                        <button onClick={() => onOpen(s.number)} aria-label={`Open scene ${s.number} in the editor`} className="text-aura-gold underline">Edit</button>
                        <button onClick={() => onRework(s.number)} aria-label={`Rework scene ${s.number} with AI`} className="ml-3 text-aura-gold underline">Rework</button>
                      </>
                    )}
                    {scene && scene.status !== "omitted" && (
                      <a href={`/projects/${projectId}/scene-dna?scene=${scene.id}`} className="ml-3 text-white/60 underline">Scene DNA →</a>
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
