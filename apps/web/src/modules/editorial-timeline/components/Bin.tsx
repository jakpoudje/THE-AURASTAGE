"use client";

// Media bin: approved shots (with their approved take) and approved scene mixes.
// Insert/Overwrite place them at the playhead; the server resolves the CURRENT
// approved source, so the bin never puts an unapproved take on the timeline.
import type { EditSource } from "@aurastage/contracts";
import type { EditorialWorkspace } from "../types";

export function Bin({ bin, media, music, canEdit, busy, onPlace }: {
  bin: EditorialWorkspace["bin"]; media: EditorialWorkspace["media"]; music: NonNullable<EditorialWorkspace["music_library"]>; canEdit: boolean; busy: boolean;
  onPlace: (source: EditSource, mode: "insert" | "overwrite") => void;
}) {
  return (
    <div className="rounded-xl border border-aura-border bg-aura-panel p-3" aria-label="Media bin">
      <h3 className="font-display text-lg">Media</h3>
      <p className="mb-2 text-[11px] text-white/40">Approved shots and scene mixes. Places at the playhead.</p>
      <div className="max-h-[560px] space-y-3 overflow-y-auto pr-1">
        {bin.map((s) => (
          <div key={s.scene_id}>
            <p className="text-xs font-medium text-white/70">
              {s.number}. {s.heading}
              {s.plan && !s.plan.usable && <span className="ml-1 text-aura-gold">· plan changed</span>}
            </p>
            <ul className="mt-1 space-y-1">
              {s.shots.map((sh) => {
                const m = sh.take ? media[sh.take.take_id] : undefined;
                return (
                  <li key={sh.shot_id} className="flex items-center gap-2 rounded border border-aura-border/60 bg-black/30 p-1.5" aria-label={`Bin shot ${s.number}.${sh.ordinal}`}>
                    <div className="h-9 w-16 shrink-0 overflow-hidden rounded bg-black">
                      {m?.url && m.capability === "image" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full items-center justify-center text-[8px] text-red-300">{sh.take ? "VIDEO" : "NO TAKE"}</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 text-[11px]">
                      <p className="truncate">
                        Shot {sh.ordinal}
                        {sh.size ? ` · ${sh.size}` : ""} · {sh.seconds.toFixed(1)}s
                      </p>
                      <p className="truncate text-white/40">{sh.take ? `Take V${sh.take.take_number} approved` : "No approved take (offline)"}</p>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <button disabled={!canEdit || busy} onClick={() => onPlace({ kind: "shot", shot_id: sh.shot_id }, "insert")} className="rounded border border-aura-border px-1.5 text-[10px] disabled:opacity-40">
                        Insert
                      </button>
                      <button disabled={!canEdit || busy} onClick={() => onPlace({ kind: "shot", shot_id: sh.shot_id }, "overwrite")} className="rounded border border-aura-border px-1.5 text-[10px] disabled:opacity-40">
                        Overwrite
                      </button>
                      {sh.take && (
                        <button disabled={!canEdit || busy} onClick={() => onPlace({ kind: "insert_shot", shot_id: sh.shot_id }, "overwrite")} title="Show this shot over the picture at the playhead (V2) — the cut doesn't move"
                          className="rounded border border-amber-300/60 px-1.5 text-[10px] text-amber-200 disabled:opacity-40">
                          Over picture
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
              <li className="flex items-center justify-between rounded border border-emerald-600/30 bg-emerald-950/30 p-1.5 text-[11px]">
                <span>{s.mix ? `Scene mix v${s.mix.version_number} · ${s.mix.seconds.toFixed(1)}s` : <span className="text-white/40">{s.mix_note}</span>}</span>
                {s.mix && (
                  <button disabled={!canEdit || busy} onClick={() => onPlace({ kind: "scene_mix", scene_id: s.scene_id }, "overwrite")} className="rounded border border-aura-border px-1.5 text-[10px] disabled:opacity-40">
                    Place on A1
                  </button>
                )}
              </li>
            </ul>
          </div>
        ))}
        <div role="group" aria-label="Music for the music track">
          <p className="text-xs font-medium text-white/70">Music (A2) — runs across scenes</p>
          {music.length === 0 && <p className="mt-1 text-[11px] text-white/40">Upload music in the Assets Library, or make a theme in Audio Studio, and it appears here.</p>}
          <ul className="mt-1 space-y-1">
            {music.map((m) => (
              <li key={m.asset_id} className="flex items-center justify-between gap-2 rounded border border-fuchsia-500/30 bg-fuchsia-950/30 p-1.5 text-[11px]">
                <span className="min-w-0 truncate">{m.name}{m.seconds ? ` · ${m.seconds.toFixed(1)}s` : ""}</span>
                <button aria-label={`Place ${m.name} on A2`} disabled={!canEdit || busy || !m.seconds} onClick={() => onPlace({ kind: "music", asset_id: m.asset_id }, "overwrite")} className="shrink-0 rounded border border-aura-border px-1.5 text-[10px] disabled:opacity-40">
                  Place on A2
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
