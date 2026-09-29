// Casting — character look panel (owner request 2026-09-28). characterLookEngine turns the Casting profile, a wardrobe
// look and the project style into one identity description and a prompt per reference view; an image backend from the
// Provider Gateway makes each view in the generation worker (migration 0027); files land in the Assets Library linked
// to the character. A view made from an older identity is shown as "profile changed", never replaced silently.
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { characterAppearanceEngine, characterLook } from "@aurastage/engines";
import { stillBackends, stillBackendStatuses } from "../../providers";
import { readProjectSettings } from "../settings/settings.read";
import { mapDbError } from "./characters.repository";
import { CharacterNotFoundError, CharacterValidationError } from "./characters.validator";

type Env = Record<string, string | undefined>;
type Row = Record<string, any>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALL_VIEWS = characterLook.LOOK_ANGLES.flatMap((a) => characterLook.LOOK_SIZES.map((s) => [a, s] as [characterLook.LookAngle, characterLook.LookSize]));

async function one(db: SupabaseClient, table: string, cols: string, col: string, v: string) {
  const { data, error } = await db.from(table).select(cols).eq(col, v).maybeSingle();
  if (error) throw mapDbError(error);
  return data as Row | null;
}
async function many(q: PromiseLike<{ data: unknown; error: any }>) {
  const { data, error } = await q;
  if (error) throw mapDbError(error);
  return (data ?? []) as Row[];
}

async function lookFor(db: SupabaseClient, characterId: string, lookId: string | null, ageStateId: string | null = null) {
  if (!UUID.test(characterId)) throw new CharacterNotFoundError("Character not found");
  const c = await one(db, "characters", "id, project_id, name, age, gender, nationality, occupation, description, personality, merged_into", "id", characterId);
  if (!c) throw new CharacterNotFoundError("Character not found");
  const looks = await many(db.from("wardrobe_looks").select("id, name, description").eq("character_id", characterId).order("created_at", { ascending: true }));
  const look = lookId ? looks.find((l) => l.id === lookId) ?? null : null;
  if (lookId && !look) throw new CharacterValidationError([], "That wardrobe look isn't this character's");
  const ages = await many(db.from("character_age_states").select("id, label, age, description").eq("character_id", characterId).order("created_at", { ascending: true }));
  const ageState = ageStateId ? ages.find((a) => a.id === ageStateId) ?? null : null;
  if (ageStateId && !ageState) throw new CharacterValidationError([], "That age isn't this character's");
  const style = (await readProjectSettings(db, c.project_id)).settings.style?.look ?? null;
  const engineIn = (views?: [characterLook.LookAngle, characterLook.LookSize][]) => ({
    character: { name: c.name, age: c.age, gender: c.gender, nationality: c.nationality, occupation: c.occupation, description: c.description, personality: c.personality },
    wardrobe: look ? { name: look.name, description: look.description } : null, style: style || null, views,
    age_state: ageState ? { label: ageState.label, age: ageState.age, description: ageState.description } : null,
  });
  // What AuraSketch draws: the same profile, wardrobe and age, read into concrete appearance facts.
  const appearance = characterAppearanceEngine({
    name: c.name, age: c.age, gender: c.gender, description: c.description,
    wardrobe: look ? [look.name, look.description].filter(Boolean).join(" — ") : null,
    age_state: ageState ? { age: ageState.age, description: ageState.description } : null,
  });
  return { c, looks, look, ages, ageState, engineIn, appearance };
}

export async function getCharacterLook(db: SupabaseClient, characterId: string, lookId: string | null, env: Env = process.env, ageStateId: string | null = null) {
  const { c, looks, look, ages, ageState, engineIn, appearance } = await lookFor(db, characterId, lookId, ageStateId);
  const out = characterLook.characterLookEngine(engineIn(ALL_VIEWS));
  const refs = await many(db.from("character_reference_images")
    .select("id, look_id, age_state_id, angle, size, status, asset_id, error, provider, model, execution, identity_hash, created_at, completed_at")
    .eq("character_id", characterId).order("created_at", { ascending: false }).limit(300));
  // Views for this outfit at this age (no age = as in the profile).
  const mine = refs.filter((r) => (r.look_id ?? null) === (look?.id ?? null) && (r.age_state_id ?? null) === (ageState?.id ?? null));
  const views = out.views.map((v) => {
    const hist = mine.filter((r) => `${r.angle}:${r.size}` === v.key);
    const latest = hist[0] ?? null;
    const lastGood = hist.find((r) => r.status === "succeeded") ?? null;
    return {
      ...v, in_default_set: characterLook.DEFAULT_VIEWS.some(([a, s]) => `${a}:${s}` === v.key),
      latest: latest && { id: latest.id, status: latest.status, error: latest.error, provider: latest.provider, execution: latest.execution, created_at: latest.created_at },
      image: lastGood && { reference_id: lastGood.id, asset_id: lastGood.asset_id, provider: lastGood.provider, execution: lastGood.execution, created_at: lastGood.completed_at,
        // Made from an older profile / wardrobe / style: flagged for review, kept (rule 11).
        stale: lastGood.identity_hash !== out.identity_hash },
      versions: hist.filter((r) => r.status === "succeeded").length,
    };
  });
  return {
    character: { id: c.id, name: c.name, project_id: c.project_id },
    looks: looks.map((l) => ({ id: l.id, name: l.name })), look_id: look?.id ?? null,
    age_states: ages.map((a) => ({ id: a.id, label: a.label, age: a.age })), age_state_id: ageState?.id ?? null,
    sketch_reads: { evidence: appearance.evidence, unspecified: appearance.unspecified },
    identity: out.identity, wardrobe: out.wardrobe, identity_hash: out.identity_hash, missing: out.missing, negative: out.negative, engine_version: out.engine_version,
    views, backends: stillBackends(env), backend_statuses: stillBackendStatuses(env),
  };
}

const GenerateInput = z.object({
  look_id: z.string().uuid().nullable().default(null),
  age_state_id: z.string().uuid().nullable().default(null),
  views: z.array(z.string().regex(/^(front|three_quarter|profile|back):(CU|MCU|MS|FULL)$/)).min(1).max(16).optional(),
  provider: z.string().max(60).optional(),
}).strict();

export async function generateCharacterLook(db: SupabaseClient, characterId: string, body: unknown, env: Env = process.env) {
  const p = GenerateInput.safeParse(body ?? {});
  if (!p.success) throw new CharacterValidationError(p.error.issues, p.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; "));
  const { c, look, ageState, engineIn, appearance } = await lookFor(db, characterId, p.data.look_id, p.data.age_state_id);
  const pairs = p.data.views ? p.data.views.map((k) => k.split(":") as [characterLook.LookAngle, characterLook.LookSize]) : undefined;
  const out = characterLook.characterLookEngine(engineIn(pairs));
  const backends = stillBackends(env);
  // Built in (free) unless the person picks a connected paid backend: nothing spends money by default.
  const b = p.data.provider ? backends.find((x) => x.id === p.data.provider) : backends.find((x) => x.execution === "native");
  if (!b) throw new CharacterValidationError([], p.data.provider ? `${p.data.provider} isn't connected on the server.` : "No image generator is available.");
  const requested: Row[] = [];
  for (const v of out.views) {
    const { data, error } = await db.rpc("request_character_reference", {
      p_character: c.id, p_look: look?.id ?? null, p_angle: v.angle, p_size: v.size, p_aspect: v.aspect_ratio, p_prompt: v.prompt, p_negative: out.negative,
      p_identity_hash: out.identity_hash, p_provider: b.id, p_model: b.model, p_execution: b.execution, p_seed: Math.floor(Math.random() * 2 ** 31),
      p_age_state: ageState?.id ?? null,
      p_sketch: { title: c.name, subtitle: ageState ? `${v.label} · ${ageState.label} (${ageState.age})` : v.label, angle: v.angle, size: v.size, lines: [out.identity, out.wardrobe].filter(Boolean), appearance }, p_engine_version: out.engine_version,
    });
    if (error) throw mapDbError(error);
    requested.push({ id: (data as Row).id, key: v.key, status: (data as Row).status, provider: b.id });
  }
  return { requested, provider: b.id, identity_hash: out.identity_hash };
}
