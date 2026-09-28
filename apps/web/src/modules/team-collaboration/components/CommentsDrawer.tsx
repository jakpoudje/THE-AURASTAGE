"use client";

// Comments for whatever the workspace is showing (SRS §13.2 commentEngine, timecodeCommentEngine).
// Each comment records the version it was made on and, in Editorial, the timecode; a comment on
// an older version is marked so, never moved. Mentions notify people on the project.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Comment, PermissionModule, TeamMember } from "@aurastage/contracts";
import { collabApi } from "../api/collabApi";
import { teamApi } from "../api/teamApi";

export type CommentAnchor = { frame?: number; timecode?: string; label?: string };
export type CommentContext = {
  module: PermissionModule;
  objectType: string;
  objectId: string;
  objectVersion?: string | null;
  /** What is being discussed, e.g. "the timeline" or "Scene 3". */
  objectLabel?: string;
  /** A point in the object the comment can be pinned to (e.g. the playhead). */
  anchor?: CommentAnchor | null;
  onJump?: (anchor: CommentAnchor) => void;
};

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const who = (email: string | null) => (email ? email.split("@")[0] : "Someone");

export function CommentsDrawer({
  projectId, context, me, canEditHere, highlight, onClose,
}: {
  projectId: string; context: CommentContext; me: string | null; canEditHere: boolean; highlight: string | null; onClose: () => void;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [filter, setFilter] = useState<"open" | "resolved" | "all">("open");
  const [body, setBody] = useState("");
  const [mentions, setMentions] = useState<string[]>([]);
  const [pin, setPin] = useState(true);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [review, setReview] = useState<{ assignee: string; title: string; due: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const filterKey = `${context.module}/${context.objectType}/${context.objectId}`;

  const load = useCallback(async () => {
    const list = await collabApi.comments(projectId, { module: context.module, object_type: context.objectType, object_id: context.objectId });
    setComments(list);
  }, [projectId, context.module, context.objectType, context.objectId]);

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Could not load comments"));
    teamApi.projectTeam(projectId).then((t) => setTeam(t.members)).catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, projectId]);

  useEffect(() => {
    if (highlight && comments.some((c) => c.id === highlight)) {
      const root = comments.find((c) => c.id === highlight);
      if (root?.resolved_at) setFilter("all");
      setTimeout(() => document.getElementById(`comment-${highlight}`)?.scrollIntoView({ block: "center" }), 50);
    }
  }, [highlight, comments]);

  const threads = useMemo(() => {
    const roots = comments.filter((c) => !c.parent_id);
    return roots
      .filter((r) => filter === "all" || (filter === "open" ? !r.resolved_at : !!r.resolved_at))
      .map((r) => ({ root: r, replies: comments.filter((c) => c.parent_id === r.id) }));
  }, [comments, filter]);

  async function run(fn: () => Promise<unknown>, message?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      await load();
      if (message) setNotice(message);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    const ok = await run(() =>
      collabApi.addComment(projectId, {
        module: context.module, object_type: context.objectType, object_id: context.objectId, object_version: context.objectVersion ?? null,
        anchor: !replyTo && pin && context.anchor ? context.anchor : {}, body, parent_id: replyTo, mentions,
      })
    );
    if (ok) {
      setBody("");
      setMentions([]);
      setReplyTo(null);
    }
  }

  const people = team.filter((m) => m.user_id !== me);
  const addMention = (userId: string) => {
    const m = team.find((x) => x.user_id === userId);
    if (!m || mentions.includes(userId)) return;
    setMentions([...mentions, userId]);
    setBody((b) => `${b}${b && !b.endsWith(" ") ? " " : ""}@${who(m.email)} `);
  };

  return (
    <aside role="complementary" aria-label="Comments" className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-aura-border bg-aura-panel shadow-2xl">
      <div className="flex items-center justify-between border-b border-aura-border px-4 py-3">
        <div>
          <div className="font-display text-lg">Comments</div>
          <div className="text-xs text-white/50">On {context.objectLabel ?? "this workspace"}{context.objectVersion ? ` · current version ${context.objectVersion.slice(0, 8)}` : ""}</div>
        </div>
        <button onClick={onClose} aria-label="Close comments" className="rounded-md border border-aura-border px-2 py-1 text-xs">Close</button>
      </div>

      <div className="flex gap-1 border-b border-aura-border px-4 py-2 text-xs" role="tablist" aria-label="Show">
        {(["open", "resolved", "all"] as const).map((f) => (
          <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
            className={`rounded-md px-2 py-1 capitalize ${filter === f ? "bg-aura-gold/15 text-aura-gold" : "text-white/60"}`}>{f}</button>
        ))}
        <button onClick={() => setReview(review ? null : { assignee: people[0]?.user_id ?? "", title: `Review ${context.objectLabel ?? "this workspace"}`, due: "" })}
          className="ml-auto rounded-md border border-aura-border px-2 py-1 text-white/70">Request review</button>
      </div>

      {review && (
        <form className="space-y-2 border-b border-aura-border px-4 py-3 text-xs" aria-label="Request a review"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run(() => collabApi.createTask(projectId, { module: context.module, object_type: context.objectType, object_id: context.objectId,
              kind: "review", title: review.title, assignee: review.assignee || null, due_date: review.due || null }), "Review requested — they've been notified.");
            if (ok) setReview(null);
          }}>
          <label className="block">Ask
            <select aria-label="Reviewer" value={review.assignee} onChange={(e) => setReview({ ...review, assignee: e.target.value })}
              className="ml-2 rounded-md border border-aura-border bg-black/40 px-2 py-1">
              {people.map((m) => <option key={m.user_id} value={m.user_id}>{m.email}</option>)}
            </select>
          </label>
          <input aria-label="Review title" value={review.title} onChange={(e) => setReview({ ...review, title: e.target.value })}
            className="w-full rounded-md border border-aura-border bg-black/40 px-2 py-1" />
          <label className="block">Due <input type="date" aria-label="Due date" value={review.due} onChange={(e) => setReview({ ...review, due: e.target.value })}
            className="ml-2 rounded-md border border-aura-border bg-black/40 px-2 py-1" /></label>
          <button type="submit" disabled={busy || !review.assignee} className="rounded-md bg-aura-gold px-3 py-1 text-black disabled:opacity-50">Send request</button>
        </form>
      )}

      {error && <div role="alert" className="mx-4 mt-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>}
      {notice && <div role="status" className="mx-4 mt-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">{notice}</div>}

      <ol className="flex-1 space-y-3 overflow-y-auto px-4 py-3" aria-label="Threads">
        {!threads.length && <li className="py-8 text-center text-xs text-white/50">{filter === "open" ? "No open comments here." : "Nothing to show."}</li>}
        {threads.map(({ root, replies }) => (
          <li key={root.id} className={`rounded-md border p-3 ${root.id === highlight ? "border-aura-gold" : "border-aura-border"} ${root.resolved_at ? "opacity-70" : ""}`}
            data-testid="thread">
            {[root, ...replies].map((c) => {
              const older = !!c.object_version && !!context.objectVersion && c.object_version !== context.objectVersion;
              const tcode = typeof c.anchor.timecode === "string" ? (c.anchor.timecode as string) : null;
              return (
                <div key={c.id} id={`comment-${c.id}`} className={c.parent_id ? "ml-4 mt-2 border-l border-aura-border pl-3" : ""}>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/50">
                    <span className="font-medium text-white/80">{who(c.author_email)}</span>
                    <span>{when(c.created_at)}</span>
                    {c.edited_at && !c.deleted_at && <span>(edited)</span>}
                    {tcode && (
                      context.onJump && typeof c.anchor.frame === "number"
                        ? <button onClick={() => context.onJump!(c.anchor as CommentAnchor)} className="rounded bg-aura-gold/15 px-1.5 text-aura-gold" title="Jump to this point">⏱ {tcode}</button>
                        : <span className="rounded bg-aura-gold/15 px-1.5 text-aura-gold">⏱ {tcode}</span>
                    )}
                    {older && !c.parent_id && <span className="rounded border border-white/20 px-1.5" title="Made on an earlier version; it stays as it was">earlier version</span>}
                  </div>
                  {editing?.id === c.id ? (
                    <div className="mt-1 space-y-1">
                      <textarea aria-label="Edit comment" value={editing.body} onChange={(e) => setEditing({ id: c.id, body: e.target.value })}
                        className="w-full rounded-md border border-aura-border bg-black/40 px-2 py-1 text-sm" />
                      <button disabled={busy} onClick={async () => (await run(() => collabApi.edit(c.id, editing.body))) && setEditing(null)}
                        className="rounded-md bg-aura-gold px-2 py-0.5 text-xs text-black">Save</button>
                      <button onClick={() => setEditing(null)} className="ml-2 text-xs text-white/50">Cancel</button>
                    </div>
                  ) : (
                    <p className={`mt-1 whitespace-pre-wrap text-sm ${c.deleted_at ? "italic text-white/40" : ""}`}>{c.body}</p>
                  )}
                  {!c.deleted_at && editing?.id !== c.id && (
                    <div className="mt-1 flex gap-3 text-[11px] text-white/50">
                      {!c.parent_id && <button onClick={() => setReplyTo(c.id)} className="hover:text-white">Reply</button>}
                      {!c.parent_id && (c.created_by === me || canEditHere) && (
                        <button disabled={busy} onClick={() => run(() => collabApi.resolve(c.id, !c.resolved_at), c.resolved_at ? "Thread reopened." : "Thread resolved.")} className="hover:text-white">
                          {c.resolved_at ? "Reopen" : "Resolve"}
                        </button>
                      )}
                      {c.created_by === me && <button onClick={() => setEditing({ id: c.id, body: c.body })} className="hover:text-white">Edit</button>}
                      {c.created_by === me && (
                        <button disabled={busy} onClick={() => window.confirm("Delete this comment?") && run(() => collabApi.remove(c.id))} className="hover:text-red-300">Delete</button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {root.resolved_at && <div className="mt-2 text-[11px] text-emerald-300">Resolved by {who(root.resolved_by_email)}</div>}
          </li>
        ))}
      </ol>

      <div className="border-t border-aura-border px-4 py-3">
        {replyTo && (
          <div className="mb-1 flex items-center justify-between text-[11px] text-aura-gold">
            Replying to {who(comments.find((c) => c.id === replyTo)?.author_email ?? null)}
            <button onClick={() => setReplyTo(null)} className="text-white/50">Cancel</button>
          </div>
        )}
        <textarea aria-label="Write a comment" rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a comment…"
          className="w-full rounded-md border border-aura-border bg-black/40 px-3 py-2 text-sm outline-none focus:border-aura-gold" />
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <select aria-label="Mention someone" value="" onChange={(e) => addMention(e.target.value)} className="rounded-md border border-aura-border bg-black/40 px-2 py-1">
            <option value="">@ Mention…</option>
            {people.map((m) => <option key={m.user_id} value={m.user_id}>{m.email}</option>)}
          </select>
          {!replyTo && context.anchor?.timecode && (
            <label className="flex items-center gap-1 text-white/60">
              <input type="checkbox" checked={pin} onChange={(e) => setPin(e.target.checked)} className="accent-[#d4a64a]" /> at {context.anchor.timecode}
            </label>
          )}
          <button onClick={send} disabled={busy || !body.trim()} className="ml-auto rounded-md bg-aura-gold px-3 py-1.5 font-medium text-black disabled:opacity-50">
            {replyTo ? "Reply" : "Comment"}
          </button>
        </div>
        {mentions.length > 0 && <div className="mt-1 text-[11px] text-white/50">Will notify: {mentions.map((id) => team.find((m) => m.user_id === id)?.email).join(", ")}</div>}
      </div>
    </aside>
  );
}
