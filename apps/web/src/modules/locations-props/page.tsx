"use client";

// apps/web/src/modules/locations-props/page.tsx
// Locations & Props — every place and prop in the film, found in the approved script with the lines they come from,
// confirmed and described by the team, each with reference views (by time of day for places). Backend:
// apps/api/src/modules/world (migration 0028). Script facts refresh on "Find in the script"; names and descriptions are
// the team's and are never overwritten; anything no longer in the script is flagged, never deleted.

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Project } from "@aurastage/contracts";
import { AppShell } from "@/components/AppShell";
import { apiGet } from "@/lib/apiClient";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { can, useProjectAccess } from "@/lib/useProjectAccess";
import { useReferenceImage } from "@/modules/casting-characters/components/LookPanel";
import { worldApi, type WorldItem, type WorldKind, type WorldWorkspace } from "./api/worldApi";
import { WorldLookPanel } from "./components/WorldLookPanel";

const input = "w-full rounded-md border border-aura-border bg-black/40 px-3 py-2 text-sm outline-none focus:border-aura-gold";

function Thumb({ item }: { item: WorldItem }) {
  const url = useReferenceImage(item.thumbnail_asset_id);
  return (
    <div className={`flex h-10 w-14 shrink-0 items-center justify-center overflow-hidden rounded bg-black/50 text-[10px] text-white/30`}>
      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : item.kind === "location" ? "📍" : "◆"}
    </div>
  );
}

export default function LocationsPropsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const access = useProjectAccess(id);
  const canEdit = can(access, "scene_dna", "edit");
  const [project, setProject] = useState<Project | null>(null);
  const [ws, setWs] = useState<WorldWorkspace | null>(null);
  const [tab, setTab] = useState<WorldKind>("location");
  const [selId, setSelId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The edit form belongs to one item at one revision: switching items can never carry a half-typed value across.
  type Draft = { for: string; name: string; description: string; category: "prop" | "vehicle" };
  const [draftState, setDraftState] = useState<Draft | null>(null);
  const [adding, setAdding] = useState<{ name: string; category: "prop" | "vehicle" } | null>(null);

  const reload = useCallback(async () => setWs(await worldApi.workspace(id)), [id]);
  useEffect(() => {
    (async () => {
      const { data } = await getSupabaseClient().auth.getSession();
      if (!data.session) return router.replace("/sign-in");
      try {
        const [p] = await Promise.all([apiGet<Project>(`/api/projects/${id}`), reload()]);
        setProject(p);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't load");
      }
    })();
  }, [id, router, reload]);

  const list = useMemo(() => (ws ? (tab === "location" ? ws.locations : ws.props) : []).filter((x) => showArchived || !x.archived), [ws, tab, showArchived]);
  const sel = list.find((x) => x.id === selId) ?? list[0] ?? null;
  const tag = sel ? `${sel.kind}:${sel.id}:${sel.revision}` : "";
  const draft: Draft = draftState && draftState.for === tag ? draftState : { for: tag, name: sel?.name ?? "", description: sel?.description ?? "", category: sel?.category ?? "prop" };
  const setDraft = (d: Omit<Draft, "for">) => setDraftState({ ...d, for: tag });

  async function run<T>(fn: () => Promise<T>, done: (r: T) => string) {
    setBusy(true); setError(null); setNotice(null);
    try {
      const r = await fn();
      await reload();
      setNotice(done(r));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (error && !ws) return <div className="p-12 text-center text-red-400">{error}</div>;
  if (!project || !ws) return <div className="p-12 text-center text-white/50">Loading locations and props…</div>;
  const dirty = !!sel && (draft.name !== sel.name || draft.description !== sel.description || (sel.kind === "prop" && draft.category !== sel.category));
  const syncLabel = { no_script: "Approve the script in Scriptwriter first.", never: "Not looked for yet.", current: "Up to date with the approved script.", stale: "The approved script changed since the last look." }[ws.sync.state];

  return (
    <AppShell
      project={project}
      active="world"
      actions={
        <>
          <Link href={`/projects/${id}/casting`} className="rounded-md border border-aura-border px-4 py-2 text-sm">
            ← Casting & Characters
          </Link>
          <Link href={`/projects/${id}/dialogue`} className="rounded-md bg-aura-gold px-4 py-2 text-sm font-medium text-black">
            Next: Dialogue →
          </Link>
        </>
      }
    >
      <section className="border-b border-aura-border bg-gradient-to-r from-black via-[#16120a] to-black px-8 py-10">
        <p className="text-[11px] uppercase tracking-[0.3em] text-aura-gold">Locations & Props</p>
        <h1 className="mt-2 font-display text-4xl">Build the <span className="text-aura-gold">World</span> of Your Film</h1>
        <p className="mt-2 max-w-3xl text-white/60">Every place and prop in your script, with the lines they come from — described once and shown the same way in every reference, storyboard and prompt.</p>
      </section>

      <div className="space-y-4 p-6">
        <div className={`flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 text-sm ${ws.sync.state === "current" ? "border-emerald-400/40 text-emerald-200" : "border-aura-border text-white/70"}`}>
          <span data-testid="world-sync-state">{syncLabel}{ws.sync.synced_at ? ` (checked ${new Date(ws.sync.synced_at).toLocaleString()})` : ""}</span>
          <button onClick={() => run(() => worldApi.sync(id), (r) => `Found ${r.locations} location${r.locations === 1 ? "" : "s"} and ${r.props} prop${r.props === 1 ? "" : "s"} in script version ${r.script_version_number} (${r.new_locations + r.new_props} new${r.flagged ? `, ${r.flagged} no longer in the script — kept and flagged` : ""}).`)}
            disabled={!canEdit || busy || ws.sync.state === "no_script"} title={canEdit ? undefined : "Your role can't edit Scene DNA"}
            className="ml-auto rounded-md bg-aura-gold px-4 py-1.5 font-medium text-black disabled:opacity-40">Find locations & props in the script</button>
        </div>
        {notice && <p role="status" className="rounded-md border border-emerald-400/40 px-4 py-2 text-sm text-emerald-300">{notice}</p>}
        {error && <p role="alert" className="rounded-md border border-red-400/40 px-4 py-2 text-sm text-red-300">{error}</p>}

        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <aside className="rounded-xl border border-aura-border bg-aura-panel">
            <div role="tablist" aria-label="Kind" className="flex border-b border-aura-border">
              {(["location", "prop"] as const).map((k) => (
                <button key={k} role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setSelId(null); setAdding(null); }}
                  className={`flex-1 border-b-2 px-3 py-2.5 text-sm ${tab === k ? "border-aura-gold text-aura-gold" : "border-transparent text-white/60"}`}>
                  {k === "location" ? `Locations (${ws.locations.filter((x) => !x.archived).length})` : `Props (${ws.props.filter((x) => !x.archived).length})`}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 p-3 text-xs">
              <button onClick={() => setAdding({ name: "", category: "prop" })} disabled={!canEdit} className="rounded bg-aura-gold px-2 py-1 font-medium text-black disabled:opacity-40">+ Add {tab === "location" ? "location" : "prop"}</button>
              <label className="ml-auto flex items-center gap-1 text-white/50"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived</label>
            </div>
            {adding && (
              <form className="space-y-2 border-y border-aura-border p-3" onSubmit={(e) => {
                e.preventDefault();
                run(() => worldApi.create(id, tab, { name: adding.name, ...(tab === "prop" ? { category: adding.category } : {}) }), () => { setAdding(null); return `Added “${adding.name}”.`; });
              }}>
                <input aria-label="New name" autoFocus value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} className={input} placeholder={tab === "location" ? "e.g. Mama Put's canteen" : "e.g. Brass key"} />
                {tab === "prop" && (
                  <select aria-label="New category" value={adding.category} onChange={(e) => setAdding({ ...adding, category: e.target.value as "prop" | "vehicle" })} className={input}>
                    <option value="prop">Prop</option><option value="vehicle">Vehicle</option>
                  </select>
                )}
                <div className="flex gap-2"><button type="submit" disabled={busy || !adding.name.trim()} className="rounded bg-aura-gold px-3 py-1 text-xs font-medium text-black disabled:opacity-40">Add</button>
                  <button type="button" onClick={() => setAdding(null)} className="rounded border border-aura-border px-3 py-1 text-xs">Cancel</button></div>
              </form>
            )}
            <ul aria-label={tab === "location" ? "Locations" : "Props"} className="max-h-[70vh] overflow-y-auto">
              {list.length === 0 && <li className="p-4 text-sm text-white/40">{ws.sync.state === "no_script" ? "Approve your script first." : "Nothing yet — use “Find locations & props in the script” or add one by hand."}</li>}
              {list.map((x) => (
                <li key={x.id}>
                  <button onClick={() => setSelId(x.id)} aria-current={sel?.id === x.id}
                    className={`flex w-full items-center gap-3 border-l-2 px-3 py-2 text-left ${sel?.id === x.id ? "border-aura-gold bg-aura-gold/10" : "border-transparent hover:bg-white/5"} ${x.archived ? "opacity-50" : ""}`}>
                    <Thumb item={x} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{x.name}</span>
                      <span className="block truncate text-[11px] text-white/45">
                        {x.scenes.length} scene{x.scenes.length === 1 ? "" : "s"}
                        {x.kind === "location" && x.times_of_day?.length ? ` · ${x.times_of_day.map((t) => t.toLowerCase()).join(", ")}` : ""}
                        {x.kind === "prop" && x.category === "vehicle" ? " · vehicle" : ""}
                      </span>
                    </span>
                    {x.missing_from_script ? <span className="rounded-full border border-amber-400/60 px-1.5 text-[9px] text-amber-300">NOT IN SCRIPT</span>
                      : x.status === "confirmed" ? <span className="text-[11px] text-emerald-300">✓</span>
                      : <span className="rounded-full border border-white/20 px-1.5 text-[9px] text-white/50">FOUND</span>}
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          {sel ? (
            <main className="space-y-4 rounded-xl border border-aura-border bg-aura-panel p-5" aria-label={`${sel.kind === "location" ? "Location" : "Prop"} details`}>
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-2xl">{sel.name}</h2>
                  <p className="text-xs text-white/50">
                    {sel.source === "script" ? (sel.kind === "prop" ? sel.reason : "From the scene headings") : "Added by hand"}
                    {sel.kind === "location" && sel.int_ext?.length ? ` · ${sel.int_ext.map((x) => (x === "INT" ? "Interior" : "Exterior")).join(" & ")}` : ""}
                    {sel.kind === "location" && sel.areas?.length ? ` · areas: ${sel.areas.join(", ")}` : ""}
                    {sel.kind === "prop" && sel.descriptors?.length ? ` · described as ${sel.descriptors.join(", ")}` : ""}
                  </p>
                  {sel.missing_from_script && <p className="mt-2 rounded border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">No longer found in the approved script. It's kept, with its views — archive it if it's gone for good.</p>}
                </div>
                <button onClick={() => run(() => worldApi.update(sel.kind, sel.id, { revision: sel.revision, status: sel.status === "confirmed" ? "detected" : "confirmed" }), () => (sel.status === "confirmed" ? "Marked as not confirmed." : `Confirmed “${sel.name}”.`))}
                  disabled={!canEdit || busy || dirty} className="rounded-md border border-aura-border px-3 py-1.5 text-sm disabled:opacity-40">{sel.status === "confirmed" ? "Confirmed ✓" : "Confirm"}</button>
                <button onClick={() => run(() => worldApi.update(sel.kind, sel.id, { revision: sel.revision, archived: !sel.archived }), () => (sel.archived ? "Restored." : "Archived — hidden from the list, nothing deleted."))}
                  disabled={!canEdit || busy || dirty} className="rounded-md border border-aura-border px-3 py-1.5 text-sm text-white/70 disabled:opacity-40">{sel.archived ? "Restore" : "Archive"}</button>
              </div>

              <div className="grid gap-3 md:grid-cols-[1fr_2fr]">
                <label className="block text-[11px] uppercase tracking-wider text-white/50">Name
                  <input aria-label="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} disabled={!canEdit} className={`${input} mt-1 normal-case tracking-normal`} />
                  {sel.kind === "prop" && (
                    <select aria-label="Category" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as "prop" | "vehicle" })} disabled={!canEdit} className={`${input} mt-2 normal-case tracking-normal`}>
                      <option value="prop">Prop</option><option value="vehicle">Vehicle</option>
                    </select>
                  )}
                </label>
                <label className="block text-[11px] uppercase tracking-wider text-white/50">Description (used in every reference and prompt)
                  <textarea aria-label="Description" rows={3} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} disabled={!canEdit}
                    placeholder={sel.kind === "location" ? "e.g. Rusting cranes, stacked containers, oily water, sodium lights" : "e.g. Red cloth cover, dog-eared, coffee stain on the back"} className={`${input} mt-1 normal-case tracking-normal`} />
                </label>
              </div>
              <div className="flex gap-2">
                <button onClick={() => run(() => worldApi.update(sel.kind, sel.id, { revision: sel.revision, name: draft.name, description: draft.description, ...(sel.kind === "prop" ? { category: draft.category } : {}) }), () => "Saved.")}
                  disabled={!canEdit || busy || !dirty || !draft.name.trim()} className="rounded-md bg-aura-gold px-4 py-1.5 text-sm font-medium text-black disabled:opacity-40">Save</button>
                {dirty && <button onClick={() => setDraft({ name: sel.name, description: sel.description, category: sel.category ?? "prop" })} className="rounded-md border border-aura-border px-3 py-1.5 text-sm">Discard</button>}
              </div>

              <div>
                <div className="mb-1 text-[11px] uppercase tracking-wider text-white/50">Where it appears</div>
                {sel.scenes.length === 0 ? <p className="text-sm text-white/40">Not linked to a scene yet.</p> : (
                  <ul aria-label="Scenes" className="space-y-1 text-sm">
                    {sel.scenes.map((s) => (
                      <li key={s.scene_id} className="flex gap-3"><span className="w-20 shrink-0 text-white/50">Scene {s.scene_number}</span><span className="text-white/75">“{s.evidence}”{s.line ? <span className="text-white/35"> — line {s.line}</span> : null}</span></li>
                    ))}
                  </ul>
                )}
              </div>

              <WorldLookPanel key={`${sel.kind}:${sel.id}:${sel.revision}`} kind={sel.kind} id={sel.id} canEdit={canEdit} onMade={() => reload().catch(() => null)} />
            </main>
          ) : <main className="rounded-xl border border-aura-border bg-aura-panel p-8 text-center text-white/40">Choose a {tab === "location" ? "location" : "prop"}.</main>}
        </div>
      </div>
    </AppShell>
  );
}
