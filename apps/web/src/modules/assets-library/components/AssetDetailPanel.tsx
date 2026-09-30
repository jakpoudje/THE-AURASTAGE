"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, useState } from "react";
import { assetsApi } from "../api/assetsApi";
import type { AssetDetail, Library } from "../types";
import { usePreview } from "./AssetGrid";
import { AssetEditor } from "./AssetEditor";
import { actionLabel, bytes, specLine, TYPE_LABEL } from "./format";

const TABS = ["Overview", "Usage", "Metadata", "Versions"] as const;

async function download(assetId: string, name: string, version: number) {
  const b = await assetsApi.bytes(assetId, version);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([b]));
  a.download = `${name}${version > 1 ? ` v${version}` : ""}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function AssetDetailPanel({ d, lib, projectId, canEdit, busy, onUpdate, onReplace, onLink, onDelete, onClose }: {
  d: AssetDetail; lib: Library; projectId: string; canEdit: boolean; busy: boolean;
  onUpdate: (patch: Record<string, unknown>, label?: string) => void; onReplace: (f: File, note: string) => void;
  onLink: (type: "scene" | "character", id: string, linked: boolean) => void; onDelete: (confirm: boolean) => void; onClose: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const a = d.asset;
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const [draft, setDraft] = useState({ name: a.name, category: a.category, description: a.description, tags: a.tags.join(", ") });
  const [note, setNote] = useState("");
  const [sceneId, setSceneId] = useState("");
  const [charId, setCharId] = useState("");
  const [editing, setEditing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const preview = usePreview(a);
  useEffect(() => setDraft({ name: a.name, category: a.category, description: a.description, tags: a.tags.join(", ") }), [a.id, a.name, a.category, a.description, a.tags]);
  const dirty = draft.name !== a.name || draft.category !== a.category || draft.description !== a.description || draft.tags !== a.tags.join(", ");
  const linkedScenes = new Set(d.links.filter((l) => l.scene_id).map((l) => l.scene_id));
  const input = "w-full rounded-md border border-aura-border bg-black px-2 py-1.5 text-sm disabled:opacity-60";

  return (
    <aside aria-label="Asset details" className="rounded-lg border border-aura-border bg-aura-panel p-4">
      {editing && <AssetEditor d={d} busy={busy} onClose={() => setEditing(false)} onSave={(f, n) => { onReplace(f, n); setEditing(false); }} />}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate font-display text-xl">{a.name}</h2>
          <p className="text-xs text-white/50">{TYPE_LABEL[a.type]} · version {a.current_version} of {d.versions.length}{a.archived ? " · archived" : ""}</p>
        </div>
        <button onClick={onClose} aria-label="Close details" className="text-white/40 hover:text-white">✕</button>
      </div>

      <div className="mt-3 flex items-center justify-center overflow-hidden rounded-md bg-black" style={{ minHeight: 120 }}>
        {a.type === "image" && preview && <img src={preview} alt={a.name} className="max-h-64 w-full object-contain" />}
        {a.type === "audio" && preview && <audio controls src={preview} className="w-full" aria-label="Play" />}
        {a.type === "video" && preview && <video controls src={preview} className="max-h-64 w-full" />}
        {(!preview || a.type === "document" || a.type === "reference") && <span className="p-6 text-xs text-white/40">{a.type === "document" ? "Download to open this document." : "Loading preview…"}</span>}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => download(a.id, a.name, a.current_version)} className="rounded-md border border-aura-border px-3 py-1.5 text-xs">Download</button>
        {canEdit && !a.archived && (
          <>
            {(a.type === "image" || a.type === "audio") && (
              <button onClick={() => setEditing(true)} disabled={busy} className="rounded-md border border-aura-gold/60 px-3 py-1.5 text-xs text-aura-gold">Edit…</button>
            )}
            <button onClick={() => fileRef.current?.click()} disabled={busy} className="rounded-md border border-aura-border px-3 py-1.5 text-xs">Replace…</button>
            <input ref={fileRef} type="file" aria-label="Replacement file" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onReplace(f, note); e.target.value = ""; }} />
          </>
        )}
        {a.type === "image" && <Link href={`/projects/${projectId}/visual`} className="rounded-md border border-aura-border px-3 py-1.5 text-xs">Open in Visual Generation →</Link>}
        {canEdit && (
          <button onClick={() => onUpdate({ archived: !a.archived }, a.archived ? "Restored." : "Archived. It's kept, with every version.")} disabled={busy}
            className="rounded-md border border-aura-border px-3 py-1.5 text-xs text-white/60">{a.archived ? "Restore" : "Archive"}</button>
        )}
        {canEdit && (
          <button onClick={() => setDeleting(true)} disabled={busy} className="rounded-md border border-red-500/50 px-3 py-1.5 text-xs text-red-300">Delete…</button>
        )}
      </div>
      {deleting && (() => {
        // Owner request 2026-09-30: say exactly where it is used before deleting. A recording on Audio Studio clips can't go
        // (the mix would lose it); anything else can, after this warning.
        const clips = a.usage.filter((u) => u.kind === "audio_clip");
        const others = a.usage.filter((u) => u.kind !== "audio_clip");
        return (
          <div role="alertdialog" aria-label="Delete this asset" className="mt-3 rounded-md border border-red-500/40 bg-red-500/5 p-3 text-sm">
            <p className="font-medium text-red-200">Delete “{a.name}” for good?</p>
            <p className="mt-1 text-xs text-white/60">All {d.versions.length} version{d.versions.length === 1 ? "" : "s"} and the file{d.versions.length === 1 ? "" : "s"} are removed. This can't be undone — Archive hides it instead and keeps everything.</p>
            {clips.length > 0 ? (
              <>
                <p className="mt-2 text-xs text-red-200">It can't be deleted while it is placed in Audio Studio:</p>
                <ul aria-label="Blocking uses" className="mt-1 list-disc pl-5 text-xs text-white/70">
                  {clips.map((u) => <li key={u.label}>{u.href ? <Link href={u.href} className="underline">{u.label}</Link> : u.label}</li>)}
                </ul>
                <p className="mt-1 text-xs text-white/50">Remove it from those clips first, or archive it.</p>
              </>
            ) : others.length > 0 ? (
              <>
                <p className="mt-2 text-xs text-aura-gold">It is used in this project:</p>
                <ul aria-label="Where it is used" className="mt-1 list-disc pl-5 text-xs text-white/70">
                  {others.map((u) => <li key={u.label}>{u.href ? <Link href={u.href} className="underline">{u.label}</Link> : u.label}</li>)}
                </ul>
                <p className="mt-1 text-xs text-white/50">
                  {others.some((u) => u.kind === "reference") && "Reference views made from it will show as missing and can be made again. "}
                  {others.some((u) => u.kind === "render") && "Deliverables already made keep their own copy; a new render will need a replacement. "}
                  {others.some((u) => u.kind === "link") && "Its links to scenes and characters are removed."}
                </p>
              </>
            ) : (
              <p className="mt-2 text-xs text-white/60">It isn't used anywhere in this project.</p>
            )}
            <div className="mt-3 flex gap-2">
              {clips.length === 0 && (
                <button onClick={() => { onDelete(others.length > 0); setDeleting(false); }} disabled={busy}
                  className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white">{others.length ? "Delete anyway" : "Delete permanently"}</button>
              )}
              <button onClick={() => setDeleting(false)} className="rounded-md border border-aura-border px-3 py-1.5 text-xs">Cancel</button>
            </div>
          </div>
        );
      })()}
      {canEdit && !a.archived && (
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the next version (optional)" aria-label="Version note" className={`${input} mt-2 text-xs`} />
      )}

      <div role="tablist" aria-label="Asset sections" className="mt-4 flex gap-1 border-b border-aura-border">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-xs ${tab === t ? "border-b-2 border-aura-gold text-aura-gold" : "text-white/60"}`}>{t}</button>
        ))}
      </div>

      {tab === "Overview" && (
        <div className="mt-3 space-y-2 text-sm">
          <label className="block text-xs text-white/50">Name<input aria-label="Name" value={draft.name} disabled={!canEdit} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={input} /></label>
          <label className="block text-xs text-white/50">Category
            <select aria-label="Category" value={draft.category} disabled={!canEdit} onChange={(e) => setDraft({ ...draft, category: e.target.value })} className={input}>
              {lib.categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
          <label className="block text-xs text-white/50">Description<textarea aria-label="Description" rows={3} value={draft.description} disabled={!canEdit} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className={input} /></label>
          <label className="block text-xs text-white/50">Tags (comma separated)<input aria-label="Tags" value={draft.tags} disabled={!canEdit} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} className={input} /></label>
          {canEdit && (
            <button disabled={!dirty || busy} onClick={() => onUpdate({ name: draft.name, category: draft.category, description: draft.description, tags: draft.tags.split(",").map((t) => t.trim()).filter(Boolean) })}
              className="rounded-md bg-aura-gold px-3 py-1.5 text-xs font-medium text-black disabled:opacity-40">Save details</button>
          )}
        </div>
      )}

      {tab === "Usage" && (
        <div className="mt-3 space-y-3 text-sm">
          {a.usage.length ? (
            <ul aria-label="Used in" className="space-y-1">
              {a.usage.map((u, i) => (
                <li key={`${u.kind}-${i}`} className="flex items-center justify-between gap-2">
                  <span>{u.href ? <Link href={u.href} className="underline decoration-white/20">{u.label}</Link> : u.label}</span>
                  <span className="text-[10px] uppercase text-white/40">{u.kind === "audio_clip" ? "in the mix" : u.kind === "render" ? "rendered" : u.kind === "reference" ? "reference view" : u.kind === "timeline" ? "music in the cut" : "linked"}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-white/50">Not used anywhere yet.</p>}
          <p className="text-[11px] text-white/40">Found from Audio Studio clips, render manifests and the links below — nothing is guessed.</p>
          {canEdit && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <select aria-label="Scene to add to" value={sceneId} onChange={(e) => setSceneId(e.target.value)} className={input}>
                  <option value="">Choose a scene…</option>
                  {lib.scenes.map((s) => <option key={s.id} value={s.id} disabled={linkedScenes.has(s.id)}>Scene {s.number} — {s.heading}</option>)}
                </select>
                <button disabled={!sceneId || busy} onClick={() => { onLink("scene", sceneId, true); setSceneId(""); }} className="whitespace-nowrap rounded-md border border-aura-border px-3 text-xs">Add to Scene</button>
              </div>
              <div className="flex gap-2">
                <select aria-label="Character to link" value={charId} onChange={(e) => setCharId(e.target.value)} className={input}>
                  <option value="">Choose a character…</option>
                  {lib.characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button disabled={!charId || busy} onClick={() => { onLink("character", charId, true); setCharId(""); }} className="whitespace-nowrap rounded-md border border-aura-border px-3 text-xs">Link</button>
              </div>
              {d.links.length > 0 && (
                <ul aria-label="Links" className="space-y-1 text-xs">
                  {d.links.map((l) => {
                    const sc = l.scene_id ? l.scene_id : null;
                    const ch = !sc ? lib.characters.find((c) => l.label.startsWith(c.name)) : null;
                    return (
                      <li key={l.label} className="flex justify-between">
                        <span>{l.label}</span>
                        {(sc || ch) && <button onClick={() => onLink(sc ? "scene" : "character", (sc ?? ch!.id) as string, false)} className="text-white/40 underline">Remove</button>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "Metadata" && (
        <dl className="mt-3 grid grid-cols-[110px_1fr] gap-y-1 text-xs">
          {([
            ["Type", TYPE_LABEL[a.type]], ["Format", a.specs.media_type], ["Specs", specLine(a.specs) || "—"], ["Size", bytes(a.specs.size_bytes)],
            ["SHA-256", a.checksum], ["Added", new Date(a.created_at).toLocaleString()], ["Last change", new Date(a.updated_at).toLocaleString()],
          ] as [string, string | null][]).map(([k, v]) => (
            <Fragment key={k}>
              <dt className="text-white/50">{k}</dt>
              <dd className="break-all">{v ?? "—"}</dd>
            </Fragment>
          ))}
          <dt className="text-white/50">History</dt>
          <dd>
            <ul aria-label="History">{d.history.map((h, i) => <li key={i}>{actionLabel(h.action)} · {new Date(h.created_at).toLocaleString()}</li>)}</ul>
          </dd>
        </dl>
      )}

      {tab === "Versions" && (
        <ul aria-label="Versions" className="mt-3 space-y-2 text-xs">
          {d.versions.map((v) => (
            <li key={v.version_number} className="flex items-center justify-between gap-2 rounded-md border border-aura-border px-3 py-2">
              <span>
                <span className="text-aura-gold">v{v.version_number}</span>{v.current ? " · current" : ""} · {new Date(v.created_at).toLocaleString()}
                {v.note ? ` · ${v.note}` : ""}{bytes(v.size_bytes) ? ` · ${bytes(v.size_bytes)}` : ""}
              </span>
              <button onClick={() => download(a.id, a.name, v.version_number)} className="underline">Download</button>
            </li>
          ))}
          <li className="text-white/40">Replacing a file adds a version. Earlier versions are kept, and deliverables already rendered keep the file they used.</li>
        </ul>
      )}
    </aside>
  );
}
