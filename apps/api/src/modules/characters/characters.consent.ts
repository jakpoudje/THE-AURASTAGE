// Casting — actor photos with consent (BUILD_PLAN §8 item 14, migration 0048). A real performer's photo can stand in for a
// generated reference view of the character they play, but only under a consent record (who the performer is, the
// statement they agreed to, who recorded it). The photo itself is uploaded to the Assets Library first (Assets owns
// files); here it is linked as a reference view (execution 'upload'), so prompts and providers use it exactly like a
// generated view. Withdrawing consent stops every photo under it from being used at once; the history stays.
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { characterLook } from "@aurastage/engines";
import { lookFor } from "./characters.look";
import { mapDbError } from "./characters.repository";
import { CharacterNotFoundError, CharacterValidationError } from "./characters.validator";

type Row = Record<string, any>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parse<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const p = schema.safeParse(body ?? {});
  if (!p.success) throw new CharacterValidationError(p.error.issues, p.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; "));
  return p.data;
}
async function many(q: PromiseLike<{ data: unknown; error: any }>) {
  const { data, error } = await q;
  if (error) throw mapDbError(error);
  return (data ?? []) as Row[];
}

const ConsentInput = z.object({
  performer_name: z.string().trim().min(1, "Give the performer's name").max(120),
  statement: z.string().trim().min(20, "Write what the performer agreed to (at least 20 characters)").max(2000),
  /** The person recording it confirms the performer really gave this consent. */
  confirm: z.literal(true, { errorMap: () => ({ message: "Tick the box to confirm the performer gave this consent" }) }),
}).strict();

const PhotoInput = z.object({
  consent_id: z.string().uuid(),
  asset_id: z.string().uuid(),
  view: z.string().regex(/^(front|three_quarter|profile|back):(CU|MCU|MS|FULL)$/, "Pick one of the reference views"),
  look_id: z.string().uuid().nullable().default(null),
  age_state_id: z.string().uuid().nullable().default(null),
}).strict();

/** Every consent recorded for the character (newest first) with the photos used under it. */
export async function listPerformerConsents(db: SupabaseClient, characterId: string) {
  if (!UUID.test(characterId)) throw new CharacterNotFoundError("Character not found");
  const consents = await many(db.from("performer_consents")
    .select("id, performer_name, statement, recorded_by, recorded_at, revoked_at, revoked_by")
    .eq("character_id", characterId).order("recorded_at", { ascending: false }));
  const photos = await many(db.from("character_reference_images")
    .select("id, consent_id, asset_id, angle, size, look_id, age_state_id, status, created_at")
    .eq("character_id", characterId).eq("execution", "upload").order("created_at", { ascending: false }));
  return {
    consents: consents.map((k) => ({
      ...k, active: !k.revoked_at,
      photos: photos.filter((p) => p.consent_id === k.id).map((p) => ({
        id: p.id, asset_id: p.asset_id, view: `${p.angle}:${p.size}`, look_id: p.look_id ?? null, age_state_id: p.age_state_id ?? null,
        in_use: p.status === "succeeded" && !!p.asset_id, status: p.status, created_at: p.created_at,
      })),
    })),
  };
}

export async function recordPerformerConsent(db: SupabaseClient, characterId: string, body: unknown) {
  if (!UUID.test(characterId)) throw new CharacterNotFoundError("Character not found");
  const v = parse(ConsentInput, body);
  const { data, error } = await db.rpc("record_performer_consent", { p_character: characterId, p_performer: v.performer_name, p_statement: v.statement });
  if (error) throw mapDbError(error);
  return data as Row;
}

/** Links an image already in the Assets Library as one reference view of the character, under an active consent. The
 *  view gets the character's current identity hash, so a later profile change flags it "profile changed" like any view. */
export async function addActorPhoto(db: SupabaseClient, characterId: string, body: unknown) {
  const v = parse(PhotoInput, body);
  const { c, look, ageState, engineIn } = await lookFor(db, characterId, v.look_id, v.age_state_id);
  const [angle, size] = v.view.split(":") as [characterLook.LookAngle, characterLook.LookSize];
  const out = characterLook.characterLookEngine(engineIn([[angle, size]]));
  const { data, error } = await db.rpc("add_actor_photo", {
    p_character: c.id, p_consent: v.consent_id, p_asset: v.asset_id, p_angle: angle, p_size: size,
    p_look: look?.id ?? null, p_age_state: ageState?.id ?? null, p_identity_hash: out.identity_hash, p_engine_version: out.engine_version,
  });
  if (error) throw mapDbError(error);
  return data as Row;
}

export async function revokePerformerConsent(db: SupabaseClient, consentId: string) {
  if (!UUID.test(consentId)) throw new CharacterNotFoundError("Consent not found");
  const { data, error } = await db.rpc("revoke_performer_consent", { p_consent: consentId });
  if (error) throw mapDbError(error);
  return data as Row;
}
