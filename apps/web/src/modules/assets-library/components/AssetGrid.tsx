"use client";

import { useEffect, useState } from "react";
import { assetsApi } from "../api/assetsApi";
import type { LibraryAsset } from "../types";
import { specLine, TYPE_LABEL } from "./format";

/** Private media: images are fetched with the person's own access, never from a public URL. */
export function usePreview(asset: LibraryAsset | null, version?: number) {
  const [url, setUrl] = useState<string | null>(null);
  const key = asset ? `${asset.id}:${version ?? asset.current_version}` : null;
  useEffect(() => {
    if (!asset || (asset.type !== "image" && asset.type !== "audio" && asset.type !== "video")) return setUrl(null);
    let u: string | null = null, live = true;
    assetsApi.bytes(asset.id, version).then((b) => {
      if (!live) return;
      u = URL.createObjectURL(new Blob([b], { type: asset.specs.media_type ?? undefined }));
      setUrl(u);
    }).catch(() => live && setUrl(null));
    return () => {
      live = false;
      if (u) URL.revokeObjectURL(u);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return url;
}

function Thumb({ a }: { a: LibraryAsset }) {
  const url = usePreview(a.type === "image" ? a : null);
  if (a.type === "image" && url) return <img src={url} alt="" className="h-full w-full object-cover" />;
  return <span className="text-3xl text-white/20">{a.type === "audio" ? "♪" : a.type === "video" ? "▶" : a.type === "document" ? "¶" : "◇"}</span>;
}

export function AssetGrid({ assets, selected, onSelect, categoryLabel, picked }: {
  assets: LibraryAsset[]; selected: string | null; onSelect: (id: string) => void; categoryLabel: (id: string) => string;
  /** Select-to-delete mode: a click ticks the card instead of opening it. */
  picked?: { ids: Set<string>; toggle: (id: string) => void };
}) {
  return (
    <ul aria-label="Assets" className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
      {assets.map((a) => (
        <li key={a.id}>
          <button onClick={() => (picked ? picked.toggle(a.id) : onSelect(a.id))} data-testid={`asset-${a.name}`}
            aria-pressed={picked ? picked.ids.has(a.id) : undefined}
            className={`w-full overflow-hidden rounded-lg border text-left ${picked?.ids.has(a.id) ? "border-red-400 ring-1 ring-red-400" : selected === a.id && !picked ? "border-aura-gold" : "border-aura-border hover:border-white/30"} bg-aura-panel`}>
            <div className="relative flex h-28 items-center justify-center bg-black">
              {picked && (
                <span aria-hidden className={`absolute bottom-2 left-2 flex h-5 w-5 items-center justify-center rounded border text-xs ${picked.ids.has(a.id) ? "border-red-400 bg-red-500 text-white" : "border-white/50 bg-black/60"}`}>
                  {picked.ids.has(a.id) ? "✓" : ""}
                </span>
              )}
              <Thumb a={a} />
              <span className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-white/80">{TYPE_LABEL[a.type] ?? a.type}</span>
              <span className="absolute right-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-aura-gold">v{a.current_version}</span>
            </div>
            <div className="p-3">
              <p className="truncate text-sm">{a.name}</p>
              <p className="truncate text-[11px] text-white/40">{categoryLabel(a.category)}{specLine(a.specs) ? ` · ${specLine(a.specs)}` : ""}</p>
              <p className="mt-1 truncate text-[11px] text-white/60">
                {a.usage.length ? `Used in ${a.usage.slice(0, 2).map((u) => u.label.split(" · ")[0]).join(", ")}${a.usage.length > 2 ? ` +${a.usage.length - 2}` : ""}` : "Not used yet"}
              </p>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
