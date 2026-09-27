// Evidence of upstream changes since this Scene DNA was locked (production graph).
import type { SceneDnaRecord } from "@aurastage/contracts";

export function DriftBanner({ record }: { record: SceneDnaRecord | null }) {
  if (!record || record.review_state === "current" || record.drift.length === 0) return null;
  const stale = record.review_state === "stale";
  return (
    <div role="alert" className={`rounded-lg border px-4 py-3 text-sm ${stale ? "border-red-400/40 text-red-200" : "border-aura-gold/40 text-aura-gold"}`}>
      <p className="font-medium">
        {stale
          ? "The scene itself changed in the script since you locked version " + record.approved_version_number + ". Review and lock again."
          : "Something this scene depends on changed since you locked version " + record.approved_version_number + ". Check it and lock again."}
      </p>
      <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs opacity-90">
        {record.drift.map((d) => (
          <li key={`${d.type}:${d.id}`}>{d.message}</li>
        ))}
      </ul>
      <p className="mt-2 text-xs opacity-70">Your locked version is kept; nothing was deleted.</p>
    </div>
  );
}
