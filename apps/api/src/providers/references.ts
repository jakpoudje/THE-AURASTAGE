// apps/api/src/providers/references.ts
// Which of a shot's reference images a provider actually receives. The prompt compiler lists every reference that
// matters for the shot (characters in frame, the location at its time of day, props); each provider accepts a
// different number and kind of image. Characters come first (identity matters most), then the place, then props.
// Every reference is reported as sent or not sent with the reason, so the take records exactly what was used.
import type { ProviderCapability } from "@aurastage/contracts";
import type { ProviderAdapter } from "./types";

export interface ReferenceCandidate {
  kind: "character" | "location" | "prop";
  object_id: string;
  name: string;
  view: string;
  asset_id: string;
  /** From the Assets Library at claim time (null when the asset is missing or not in this project). */
  asset: { storage_path: string | null; media_type: string | null; size_bytes: number | null; version: number | null } | null;
}

export interface ReferenceDecision {
  kind: ReferenceCandidate["kind"];
  object_id: string;
  name: string;
  view: string;
  asset_id: string;
  asset_version: number | null;
  sent: boolean;
  reason: string | null;
}

const ORDER: Record<ReferenceCandidate["kind"], number> = { character: 0, location: 1, prop: 2 };

export function chooseReferences(
  adapter: Pick<ProviderAdapter, "name" | "references">,
  capability: ProviderCapability,
  candidates: ReferenceCandidate[],
  /** Files that turned out to be unreadable (by asset id → reason); their slot goes to the next eligible reference. */
  unreadable: Record<string, string> = {}
): ReferenceDecision[] {
  const support = adapter.references?.[capability];
  const sorted = candidates.map((c, i) => ({ c, i })).sort((a, b) => ORDER[a.c.kind] - ORDER[b.c.kind] || a.i - b.i).map((x) => x.c);
  let used = 0;
  return sorted.map((c) => {
    const base = { kind: c.kind, object_id: c.object_id, name: c.name, view: c.view, asset_id: c.asset_id, asset_version: c.asset?.version ?? null };
    const no = (reason: string): ReferenceDecision => ({ ...base, sent: false, reason });
    if (!support) {
      return no(capability === "video"
        ? `${adapter.name} video starts from the approved frame, which was made with the references; it takes no extra reference images.`
        : `${adapter.name} draws from the prompt only and can't use reference images.`);
    }
    if (!c.asset?.storage_path) return no("The reference file is no longer in this project's Assets Library.");
    if (unreadable[c.asset_id]) return no(unreadable[c.asset_id]);
    const mt = c.asset.media_type ?? "";
    if (mt === "image/svg+xml") return no("This view is a built-in sketch; providers need a picture. Make the view with Runway or OpenAI in its stage.");
    if (!support.media_types.includes(mt)) return no(`${adapter.name} doesn't accept ${mt || "this file type"} as a reference.`);
    if (c.asset.size_bytes !== null && c.asset.size_bytes > support.max_bytes) return no(`Larger than the ${Math.round(support.max_bytes / 1_000_000)} MB ${adapter.name} accepts.`);
    if (used >= support.max) return no(`${adapter.name} takes at most ${support.max} reference image${support.max === 1 ? "" : "s"}; characters and the location go first.`);
    used++;
    return { ...base, sent: true, reason: null };
  });
}

/** A short plain sentence naming what each sent reference is, for providers that read references alongside the prompt. */
export function describeReferences(refs: { kind: ReferenceCandidate["kind"]; name: string }[], label: (i: number) => string) {
  if (!refs.length) return "";
  const what = (r: { kind: ReferenceCandidate["kind"]; name: string }) => (r.kind === "character" ? r.name : r.kind === "location" ? `the location (${r.name})` : `the ${r.name}`);
  return `Keep these consistent with the reference images: ${refs.map((r, i) => `${label(i)} is ${what(r)}`).join("; ")}. `;
}
