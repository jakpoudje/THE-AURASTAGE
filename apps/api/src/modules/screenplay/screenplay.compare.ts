// apps/api/src/modules/screenplay/screenplay.compare.ts — version compare (BUILD_PLAN §8 item 13). Read-only: two saved
// versions of this project's script, compared scene by scene and line by line (scriptCompareEngine).
import type { SupabaseClient } from "@supabase/supabase-js";
import { scriptCompareEngine } from "@aurastage/engines";
import { assertProjectAccess } from "./screenplay.permissions";
import * as repo from "./screenplay.repository";
import { ScriptNotFoundError, ScriptValidationError } from "./screenplay.validator";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function compareVersions(db: SupabaseClient, projectId: string, fromId: unknown, toId: unknown) {
  await assertProjectAccess(db, projectId);
  if (typeof fromId !== "string" || typeof toId !== "string" || !UUID.test(fromId) || !UUID.test(toId)) throw new ScriptValidationError([], "Choose two versions to compare.");
  const script = await repo.getScriptByProject(db, projectId);
  const [a, b] = await Promise.all([repo.getVersion(db, fromId), repo.getVersion(db, toId)]);
  if (!script || !a || !b || a.script_id !== script.id || b.script_id !== script.id) throw new ScriptNotFoundError("Version not found in this project");
  const r = scriptCompareEngine({ from: { version_number: a.version_number, source_text: a.source_text }, to: { version_number: b.version_number, source_text: b.source_text } });
  return { from: { id: a.id, version_number: a.version_number, note: a.note ?? null }, to: { id: b.id, version_number: b.version_number, note: b.note ?? null }, ...r };
}
