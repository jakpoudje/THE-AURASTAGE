"use client";

// Production hand-offs (migration 0057, owner request 2026-10-02): who owns each stage, and the moment they are told it
// can start on a scene. Notifications are written by the server when a scene clears the stage before; several scenes
// are grouped into one message while it's unread. With no owner set, the members whose role edits that stage are told.

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPut } from "@/lib/apiClient";

type Stage = { id: string; label: string; path: string; after: string; owners: { user_id: string; email: string | null }[] };
type Data = { can_manage: boolean; stages: Stage[] };
type Member = { user_id: string; email: string | null };

export function StageOwners({ projectId, members }: { projectId: string; members: Member[] }) {
  const [data, setData] = useState<Data | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [pick, setPick] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useCallback(async () => setData(await apiGet<Data>(`/api/projects/${projectId}/stage-owners`)), [projectId]);
  useEffect(() => { void load().catch((e) => setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't load the hand-offs" })); }, [load]);

  async function save(stage: Stage) {
    setBusy(true);
    setMsg(null);
    try {
      setData(await apiPut<Data>(`/api/projects/${projectId}/stage-owners/${stage.id}`, { user_ids: [...pick] }));
      setEditing(null);
      setMsg({ ok: true, text: pick.size ? `${stage.label}: ${pick.size} owner${pick.size === 1 ? "" : "s"} saved — they're told as soon as ${stage.after}.` : `${stage.label}: no owner — the members whose role edits it are told instead.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't save" });
    } finally {
      setBusy(false);
    }
  }
  if (!data) return null;
  const who = (m: { email: string | null }) => (m.email ? m.email.split("@")[0] : "a team member");

  return (
    <section aria-label="Production hand-offs" className="rounded-xl border border-aura-border bg-aura-panel p-4">
      <h2 className="text-sm font-medium text-white">Production hand-offs — who is told when their stage can start</h2>
      <p className="mt-1 text-xs text-white/50">
        As each scene clears a stage, the owners of the next stage get a notification with a link, so the film moves forward scene by scene.
        Several scenes are grouped into one message. Nobody is told about their own work. Anyone can still work on any stage their role allows.
      </p>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`mt-2 text-xs ${msg.ok ? "text-emerald-300" : "text-red-300"}`}>{msg.text}</p>}
      <ul className="mt-3 divide-y divide-aura-border" aria-label="Stages">
        {data.stages.map((s) => (
          <li key={s.id} className="py-2 text-sm" aria-label={`Stage ${s.label}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-44 text-white">{s.label}</span>
              <span className="flex-1 text-xs text-white/45">told when {s.after}</span>
              {s.owners.length ? s.owners.map((o) => <span key={o.user_id} className="rounded-full border border-aura-gold/50 px-2 py-0.5 text-xs text-aura-gold">{who(o)}</span>)
                : <span className="text-xs text-white/35">no owner — members whose role edits it</span>}
              {data.can_manage && editing !== s.id && (
                <button onClick={() => { setEditing(s.id); setPick(new Set(s.owners.map((o) => o.user_id))); }} className="rounded border border-aura-border px-2 py-0.5 text-xs">
                  Choose owners
                </button>
              )}
            </div>
            {editing === s.id && (
              <div className="mt-2 rounded-md border border-aura-border p-2">
                <div className="flex flex-wrap gap-3">
                  {members.map((m) => (
                    <label key={m.user_id} className="flex items-center gap-1 text-xs text-white/80">
                      <input type="checkbox" checked={pick.has(m.user_id)} onChange={(e) => setPick((p) => { const n = new Set(p); if (e.target.checked) n.add(m.user_id); else n.delete(m.user_id); return n; })} />
                      {m.email ?? m.user_id}
                    </label>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <button disabled={busy} onClick={() => save(s)} className="rounded bg-aura-gold px-3 py-1 text-xs font-medium text-black disabled:opacity-40">Save owners</button>
                  <button disabled={busy} onClick={() => setEditing(null)} className="rounded border border-aura-border px-3 py-1 text-xs">Cancel</button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
