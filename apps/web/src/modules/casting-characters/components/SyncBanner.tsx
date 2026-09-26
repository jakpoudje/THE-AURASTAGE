// Shows, from real sync records, whether characters reflect the approved script.
import Link from "next/link";
import type { CastingWorkspace } from "../types";

export function SyncBanner({
  ws,
  projectId,
  busy,
  onSync,
}: {
  ws: CastingWorkspace;
  projectId: string;
  busy: boolean;
  onSync: () => void;
}) {
  const { state, synced_at, new_from_script } = ws.sync;
  if (state === "no_script") {
    return (
      <div className="rounded-xl border border-dashed border-aura-border p-5 text-sm text-white/60">
        Characters come from your approved script.{" "}
        <Link href={`/projects/${projectId}/scriptwriter`} className="text-aura-gold underline">
          Write and approve it in Scriptwriter →
        </Link>
      </div>
    );
  }
  const current = state === "current";
  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-xl border px-5 py-3 text-sm ${
        current ? "border-emerald-500/30 text-emerald-200" : "border-aura-gold/40 text-aura-gold"
      }`}
    >
      <span className="flex-1">
        {state === "never"
          ? `Script version ${ws.script!.version_number} is approved. Find the characters in it to get started.`
          : current
            ? `Up to date with approved script version ${ws.script!.version_number}${synced_at ? ` (checked ${new Date(synced_at).toLocaleString()})` : ""}.`
            : `The approved script (version ${ws.script!.version_number}) has changed${new_from_script ? ` — ${new_from_script} new ${new_from_script === 1 ? "character" : "characters"} found` : ""}. Update to bring characters and their scenes in line.`}
      </span>
      {!current && (
        <button onClick={onSync} disabled={busy} className="rounded-md bg-aura-gold px-4 py-1.5 font-medium text-black disabled:opacity-50">
          {busy ? "Working…" : state === "never" ? "Find characters in script" : "Update from script"}
        </button>
      )}
    </div>
  );
}
