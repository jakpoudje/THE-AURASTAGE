"use client";

// apps/web/src/modules/casting-characters/page.tsx
// Orchestration/composition surface ONLY. No provider SDK calls, no SQL/database code,
// no complex AI prompts, no unrelated domain logic — see CLAUDE.md.
//
// Casting & Characters workspace (docs/design/UI_REFERENCE.md §4).
// Canonical backend authority: apps/api/src/modules/characters
// Engine domain: engines/character

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useCasting } from "./hooks/useCasting";
import { AddCharacterForm } from "./components/AddCharacterForm";
import { CharacterList } from "./components/CharacterList";
import { CharacterProfile } from "./components/CharacterProfile";
import { ConsistencyChecklist } from "./components/ConsistencyChecklist";
import { PendingCandidates } from "./components/PendingCandidates";
import { SyncBanner } from "./components/SyncBanner";
import { CastLooksBar } from "./components/CastLooksBar";
import { DuplicatesBar } from "./components/DuplicatesBar";

export default function CastingCharactersPage() {
  const { id } = useParams<{ id: string }>();
  const c = useCasting(id);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (c.loading) return <div className="p-12 text-center text-white/50">Opening Casting…</div>;
  if (!c.project || !c.ws) {
    return (
      <div className="mx-auto max-w-lg p-12 text-center">
        <p className="text-red-400">{c.error ?? "Project not found."}</p>
        <Link href="/dashboard" className="mt-4 inline-block text-sm text-aura-gold underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  const active = c.ws.characters.filter((ch) => !ch.merged_into);
  const selected = active.find((ch) => ch.id === selectedId) ?? active[0] ?? null;

  return (
    <AppShell
      project={c.project}
      active="casting"
      actions={
        <>
          <Link href={`/projects/${id}/scriptwriter`} className="rounded-md border border-aura-border px-4 py-2 text-sm">
            ← Scriptwriter
          </Link>
          <Link href={`/projects/${id}/world`} className="rounded-md bg-aura-gold px-4 py-2 text-sm font-medium text-black">
            Next: Locations & Props →
          </Link>
        </>
      }
    >
      <section className="border-b border-aura-border bg-gradient-to-r from-black via-[#16120a] to-black px-8 py-10">
        <p className="text-[11px] uppercase tracking-[0.3em] text-aura-gold">Casting & Characters</p>
        <h1 className="mt-2 font-display text-4xl">
          Bring Your <span className="text-aura-gold">Characters</span> to Life
        </h1>
        <p className="mt-3 max-w-2xl text-white/60">
          Every character is found in your approved script, with the lines and scenes that prove it. Build each profile
          here — this is the one place a character's identity is defined.
        </p>
      </section>

      <div className="space-y-4 p-6">
        <div className="flex items-center gap-2 text-xs text-white/50">
          <span className="rounded-md border border-aura-border px-3 py-1.5">
            Scriptwriter{c.ws.script ? ` · approved v${c.ws.script.version_number}` : " · not approved yet"}
          </span>
          <span className="text-aura-gold">→</span>
          <span className="rounded-md border border-aura-gold px-3 py-1.5 text-aura-gold">Casting & Characters</span>
          <span className="text-white/30">→ Dialogue Intelligence · Scene DNA</span>
        </div>

        <SyncBanner ws={c.ws} projectId={id} busy={c.busy === "sync"} onSync={() => c.sync()} />

        {(c.error || c.notice) && (
          <div className={`rounded-md border px-4 py-2 text-sm ${c.error ? "border-red-500/40 text-red-300" : "border-emerald-500/40 text-emerald-300"}`}>
            {c.error ?? c.notice}
          </div>
        )}

        <DuplicatesBar
          pairs={c.ws.duplicates ?? []}
          busy={c.busy !== null}
          canEdit
          onMerge={(mergeId, keepId) => c.merge(mergeId, keepId)}
          onDistinct={(a, b, names) => c.markDistinct(a, b, names)}
        />

        {active.length > 0 && <CastLooksBar projectId={id} firstCharacterId={active[0].id} count={active.length} />}

        {active.length === 0 ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="rounded-xl border border-dashed border-aura-border p-10 text-center text-sm text-white/50">
              <p>No characters yet.</p>
              <div className="mx-auto mt-4 max-w-xs text-left">
                <AddCharacterForm busy={c.busy !== null} onCreate={async (name, role) => {
                  const cid = await c.create(name, role);
                  if (cid) setSelectedId(cid);
                  return cid;
                }} />
              </div>
            </div>
            <PendingCandidates pending={c.ws.pending} busy={c.busy !== null} onConfirm={(keys) => c.sync(keys)} />
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)_300px]">
            <CharacterList
              characters={active}
              appearances={c.ws.appearances}
              selectedId={selected?.id ?? null}
              onSelect={setSelectedId}
              busy={c.busy !== null}
              onCreate={async (name, role) => {
                const id = await c.create(name, role);
                if (id) setSelectedId(id);
                return id;
              }}
            />
            {selected && (
              <CharacterProfile
                key={`${selected.id}:${selected.updated_at}`}
                character={selected}
                characters={c.ws.characters}
                aliases={c.ws.aliases}
                appearances={c.ws.appearances}
                accent={c.ws.accent_suggestions?.[selected.id] ?? null}
                projectId={id}
                busy={c.busy}
                onSave={(input) => c.save(selected.id, input)}
                onAddAlias={(alias) => c.addAlias(selected.id, alias)}
                onMerge={(sourceId) => c.merge(sourceId, selected.id)}
                onUnmerge={(sourceId) => c.unmerge(sourceId)}
                relationships={c.ws.relationships}
                looks={c.ws.wardrobe_looks}
                onSaveRelationship={(input) => c.setRelationship(input)}
                onDeleteRelationship={(rid) => c.deleteRelationship(rid)}
                onSaveLook={(input) => c.saveLook(selected.id, input)}
                onDeleteLook={(lid) => c.deleteLook(lid)}
              />
            )}
            <div className="space-y-4">
              {selected && <ConsistencyChecklist character={selected} appearances={c.ws.appearances} />}
              <PendingCandidates pending={c.ws.pending} busy={c.busy !== null} onConfirm={(keys) => c.sync(keys)} />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
