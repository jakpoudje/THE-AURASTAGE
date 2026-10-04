// apps/api/src/infrastructure/scriptVersionCache.ts
// Script versions are immutable once saved (a new edit is a new version), but six pages read the same version's
// `elements` (the whole script, ~75 kB) on almost every request — 33k reads in the database's stats (BUILD_PLAN item 50).
// This keeps the elements in memory by version id. Access is still checked on every call: the caller's own
// (RLS-scoped) client must be able to read the version's row before a cached copy is handed back.
type Version = { id: string; version_number: number; elements: unknown[] };
const MAX = 40;
const cache = new Map<string, unknown[]>();

type Db = { from: (t: string) => any };
async function one(q: PromiseLike<{ data: unknown[] | null; error: unknown }>) {
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? [])[0] as Record<string, unknown> | undefined;
}

/** The version (id, number, elements), or null when it doesn't exist or this user can't read it. */
export async function readScriptVersion(db: Db, id: string): Promise<Version | null> {
  const hit = cache.get(id);
  if (hit) {
    const row = await one(db.from("script_versions").select("id, version_number").eq("id", id).limit(1));
    if (!row) return null;
    cache.delete(id); cache.set(id, hit); // most recently used last
    return { id, version_number: row.version_number as number, elements: hit };
  }
  const row = await one(db.from("script_versions").select("id, version_number, elements").eq("id", id).limit(1));
  if (!row) return null;
  const elements = (row.elements ?? []) as unknown[];
  cache.set(id, elements);
  if (cache.size > MAX) cache.delete(cache.keys().next().value as string);
  return { id, version_number: row.version_number as number, elements };
}

/** Tests only. */
export const clearScriptVersionCache = () => cache.clear();
