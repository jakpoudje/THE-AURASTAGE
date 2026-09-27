// Shows, from real sync records, whether dialogue reflects the approved script.
import Link from "next/link";
import type { DialogueWorkspace } from "../types";

export function DialogueSyncBanner({ ws, projectId, busy, onSync }: { ws: DialogueWorkspace; projectId: string; busy: boolean; onSync: () => void }) {
  const { state, synced_at } = ws.sync;
  if (state === "no_script") {
    return (
      <div className="rounded-xl border border-dashed border-aura-border p-5 text-sm text-white/60">
        Dialogue comes from your approved script.{" "}
        <Link href={`/projects/${projectId}/scriptwriter`} className="text-aura-gold underline">
          Write and approve it in Scriptwriter →
        </Link>
      </div>
    );
  }
  const current = state === "current";
  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-xl border px-5 py-3 text-sm ${current ? "border-emerald-500/30 text-emerald-200" : "border-aura-gold/40 text-aura-gold"}`}>
      <span className="flex-1">
        {state === "never"
          ? `Script version ${ws.script!.version_number} is approved. Bring its dialogue in to start annotating.`
          : current
            ? `Up to date with approved script version ${ws.script!.version_number}${synced_at ? ` (checked ${new Date(synced_at).toLocaleString()})` : ""}.`
            : `The approved script changed (now version ${ws.script!.version_number}). Update to bring the dialogue in line — your notes are kept and changed lines are flagged.`}
      </span>
      <button onClick={onSync} disabled={busy} className={`rounded-md px-4 py-1.5 font-medium disabled:opacity-50 ${current ? "border border-emerald-500/40 text-emerald-200" : "bg-aura-gold text-black"}`}>
        {busy ? "Working…" : state === "never" ? "Bring in dialogue" : current ? "Re-check speakers" : "Update from script"}
      </button>
    </div>
  );
}
