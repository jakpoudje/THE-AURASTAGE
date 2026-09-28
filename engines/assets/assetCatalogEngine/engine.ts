// assetCatalogEngine (SRS §13.3): structured metadata + full-text search over the Assets Library.
// It only matches what is recorded (name, description, tags, category, type, usage evidence) —
// there is no vector/multimodal search yet, and the UI says so.
import { AssetCatalogInputSchema, type AssetCatalogInput, type CatalogAsset, type CatalogQuery } from "./input.schema";
import type { AssetCatalogOutput } from "./output.schema";
import { ENGINE_VERSION } from "./version";

const norm = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Every word in the query must appear somewhere in the asset's text (name, description, tags, category). */
function matchesText(a: CatalogAsset, q: string) {
  const words = norm(q).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = norm([a.name, a.description, a.tags.join(" "), a.category.replace(/_/g, " "), a.type].join(" "));
  return words.every((w) => hay.includes(w));
}

function passes(a: CatalogAsset, q: CatalogQuery, skip: "category" | "type" | null) {
  if (a.archived !== q.archived) return false;
  if (skip !== "category" && q.category && a.category !== q.category) return false;
  if (skip !== "type" && q.type && a.type !== q.type) return false;
  if (q.usage === "used" && a.usage.length === 0) return false;
  if (q.usage === "unused" && a.usage.length > 0) return false;
  if (q.scene_id && !a.usage.some((u) => u.scene_id === q.scene_id)) return false;
  return matchesText(a, q.q);
}

export function assetCatalogEngine(raw: AssetCatalogInput): AssetCatalogOutput {
  const { assets, query } = AssetCatalogInputSchema.parse(raw);
  const hits = assets.filter((a) => passes(a, query, null));
  hits.sort((x, y) => (query.sort === "name" ? x.name.localeCompare(y.name) : y.created_at.localeCompare(x.created_at)));
  const count = (key: "category" | "type") =>
    assets.filter((a) => passes(a, query, key)).reduce<Record<string, number>>((m, a) => ((m[a[key]] = (m[a[key]] ?? 0) + 1), m), {});
  return { ids: hits.map((a) => a.id), category_counts: count("category"), type_counts: count("type"), total: hits.length, engine_version: ENGINE_VERSION };
}
