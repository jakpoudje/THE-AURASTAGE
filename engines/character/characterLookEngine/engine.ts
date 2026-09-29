// engines/character/characterLookEngine — the character look panel's brain (owner request 2026-09-28: "initial character
// look of various angles and shot type for each character, taken from the script, used for storyboards and prompts").
// One identity description is built from the Casting profile (+ wardrobe look + project style) and repeated word for
// word in every view's prompt, so every reference — and later every shot that uses them — describes the same person.
// The identity hash changes whenever anything that defines the look changes; references made from an older hash are
// flagged "profile changed" (rule 11), never deleted.
import { CharacterLookInputSchema, DEFAULT_VIEWS, type CharacterLookInput, type LookAngle, type LookSize } from "./input.schema";
import { ENGINE_VERSION } from "./version";

const ANGLE: Record<LookAngle, string> = { front: "front view, facing camera", three_quarter: "three-quarter view, turned 45 degrees", profile: "side profile view", back: "back view, facing away" };
const SIZE: Record<LookSize, string> = { CU: "close-up of the face", MCU: "medium close-up, head and shoulders", MS: "medium shot, waist up", FULL: "full-length shot, head to toe" };
export const ANGLE_LABEL: Record<LookAngle, string> = { front: "Front", three_quarter: "¾", profile: "Profile", back: "Back" };
export const SIZE_LABEL: Record<LookSize, string> = { CU: "Close-up", MCU: "Medium close-up", MS: "Medium", FULL: "Full" };
/** Small deterministic hash (two FNV-1a passes) — engines also run in the browser, so no Node crypto. */
function hash16(text: string) {
  let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c ^ (i & 0xff), 0x01000193) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}
const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

export interface LookView { key: string; angle: LookAngle; size: LookSize; label: string; prompt: string; aspect_ratio: "1:1" | "9:16" }
export interface CharacterLookOutput {
  identity: string;
  identity_hash: string;
  wardrobe: string | null;
  views: LookView[];
  negative: string[];
  /** Fields that would make the identity richer — shown so the person can fill them (never guessed). */
  missing: string[];
  engine_version: string;
}

export function characterLookEngine(raw: CharacterLookInput): CharacterLookOutput {
  const input = CharacterLookInputSchema.parse(raw);
  const c = input.character;
  const who = [clean(c.gender), clean(c.age) && `aged ${clean(c.age).replace(/^aged\s+/i, "")}`, clean(c.nationality)].filter(Boolean).join(", ");
  const identity = [
    `${clean(c.name)}${who ? ` — ${who}` : ""}.`,
    clean(c.occupation) && `${clean(c.occupation)}.`,
    clean(c.description) && `${clean(c.description).replace(/\.$/, "")}.`,
  ].filter(Boolean).join(" ");
  const wardrobe = input.wardrobe ? `Wearing: ${clean(input.wardrobe.name)}${clean(input.wardrobe.description) ? ` — ${clean(input.wardrobe.description)}` : ""}.` : null;
  const style = clean(input.style) ? `Visual style: ${clean(input.style)}.` : null;
  const views = (input.views ?? DEFAULT_VIEWS).map(([angle, size]) => ({
    key: `${angle}:${size}`, angle, size, label: `${ANGLE_LABEL[angle]} · ${SIZE_LABEL[size]}`,
    aspect_ratio: (size === "FULL" ? "9:16" : "1:1") as "1:1" | "9:16",
    prompt: [
      `Character reference sheet image, ${SIZE[size]}, ${ANGLE[angle]}.`,
      identity, wardrobe, style,
      "Neutral grey studio background, even soft lighting, neutral expression, realistic, consistent identity across all views.",
    ].filter(Boolean).join(" "),
  }));
  const missing = (["age", "gender", "description"] as const).filter((k) => !clean(c[k]));
  const identity_hash = hash16(JSON.stringify([identity, wardrobe, style, ENGINE_VERSION]));
  return {
    identity, identity_hash, wardrobe, views, missing, engine_version: ENGINE_VERSION,
    negative: ["a different person", "inconsistent face or hair", "extra people", "text or watermark", "distorted anatomy"],
  };
}
