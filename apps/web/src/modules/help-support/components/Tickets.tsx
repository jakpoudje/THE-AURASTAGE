"use client";

// Support tickets. Diagnostics (counts and error codes only, built on the server) are attached only
// when you tick the box, and you can see exactly what would be sent first.
import { useCallback, useEffect, useState } from "react";
import { helpApi, type Finding, type Ticket } from "../api/helpApi";

const PILL: Record<Ticket["status"], string> = { open: "border-aura-gold/50 text-aura-gold", answered: "border-emerald-500/40 text-emerald-300", closed: "border-white/20 text-white/50" };

export function Tickets({ projectId, module }: { projectId: string | null; module: string | null }) {
  const [data, setData] = useState<{ staff: boolean; tickets: Ticket[] } | null>(null);
  const [inbox, setInbox] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [attach, setAttach] = useState(false);
  const [preview, setPreview] = useState<Finding[] | null>(null);
  const [reply, setReply] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const load = useCallback(() => helpApi.tickets(inbox).then(setData).catch((e) => setError(e.message)), [inbox]);
  useEffect(() => void load(), [load]);
  useEffect(() => {
    if (attach && projectId) helpApi.diagnostics(projectId).then((d) => setPreview(d.findings)).catch(() => setPreview([]));
  }, [attach, projectId]);

  async function act(fn: () => Promise<unknown>, msg: string) {
    setError(null);
    setNotice(null);
    try {
      await fn();
      await load();
      setNotice(msg);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work");
      return false;
    }
  }

  return (
    <div className="rounded-lg border border-aura-border bg-aura-panel p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg">Support tickets</h2>
        {data?.staff && (
          <label className="text-xs text-white/60"><input type="checkbox" checked={inbox} onChange={(e) => setInbox(e.target.checked)} className="mr-1 accent-[#d4a64a]" />Staff inbox (everyone's)</label>
        )}
      </div>
      <form className="mt-2 space-y-2" aria-label="New ticket"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await act(() => helpApi.createTicket({ subject, body, project_id: projectId, module, include_diagnostics: attach && !!projectId }), "Ticket sent. You'll see replies here.")) {
            setSubject("");
            setBody("");
            setAttach(false);
          }
        }}>
        <input aria-label="Subject" required value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject"
          className="w-full rounded-md border border-aura-border bg-black/40 px-3 py-2 text-sm" />
        <textarea aria-label="What happened?" required rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What happened, and what did you expect?"
          className="w-full rounded-md border border-aura-border bg-black/40 px-3 py-2 text-sm" />
        {projectId && (
          <label className="flex items-center gap-2 text-xs text-white/60">
            <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} className="accent-[#d4a64a]" />
            Attach this project's diagnostics (counts and error codes only — never your script or media)
          </label>
        )}
        {attach && preview && (
          <ul className="rounded-md border border-aura-border p-2 text-[11px] text-white/60" aria-label="Diagnostics that will be sent">
            {preview.length ? preview.map((f, i) => <li key={i}>{f.message} — {f.evidence}</li>) : <li>No problems found in this project.</li>}
          </ul>
        )}
        <button className="rounded-md bg-aura-gold px-3 py-1.5 text-sm text-black">Send ticket</button>
      </form>
      {error && <p role="alert" className="mt-2 text-xs text-red-300">{error}</p>}
      {notice && <p role="status" className="mt-2 text-xs text-emerald-300">{notice}</p>}
      <ul className="mt-3 space-y-2" aria-label="Your tickets">
        {data && !data.tickets.length && <li className="text-xs text-white/50">No tickets yet.</li>}
        {data?.tickets.map((t) => (
          <li key={t.id} className="rounded-md border border-aura-border p-3 text-sm" data-testid={`ticket-${t.subject}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{t.subject}</span>
              <span className={`rounded-full border px-2 py-0.5 text-[11px] capitalize ${PILL[t.status]}`}>{t.status}</span>
            </div>
            <div className="text-[11px] text-white/40">{inbox ? `${t.user_email} · ` : ""}{new Date(t.created_at).toLocaleString()}{t.consent_diagnostics ? " · diagnostics attached" : ""}</div>
            <ul className="mt-2 space-y-1">
              {t.messages.map((m) => (
                <li key={m.id} className={`text-xs ${m.from_staff ? "text-emerald-200" : "text-white/70"}`}>
                  <span className="text-white/40">{m.from_staff ? "AuraStage support" : "You"}:</span> {m.body}
                </li>
              ))}
            </ul>
            {t.status !== "closed" && (
              <div className="mt-2 flex gap-2">
                <input aria-label={`Reply to ${t.subject}`} value={reply[t.id] ?? ""} onChange={(e) => setReply({ ...reply, [t.id]: e.target.value })}
                  className="min-w-0 flex-1 rounded-md border border-aura-border bg-black/40 px-2 py-1 text-xs" placeholder="Add a reply" />
                <button onClick={() => reply[t.id]?.trim() && act(() => helpApi.reply(t.id, reply[t.id]), "Reply sent.").then((ok) => ok && setReply({ ...reply, [t.id]: "" }))}
                  className="rounded-md border border-aura-border px-2 py-1 text-xs">Reply</button>
                <button onClick={() => act(() => helpApi.close(t.id), "Ticket closed.")} className="rounded-md border border-aura-border px-2 py-1 text-xs text-white/60">Close</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
