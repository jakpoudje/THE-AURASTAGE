// engines/world/worldLookEngine — reference views for a location or a prop (owner, 2026-09-28: character looks "go with
// environments and props too"). Like the character look panel: one identity description, repeated word for word in
// every view's prompt, so every reference — and later every shot that uses it — shows the same place or object.
// Locations get a view per time of day they are used at in the script (establishing, wide, medium, detail); props get
// hero, three-quarter, detail, overhead and in-hand (for scale). The identity hash changes whenever anything that
// defines the look changes; references made from an older hash are flagged, never deleted (rule 11).
import { z } from "zod";
import { ENGINE_VERSION } from "./version";

export const LOCATION_VIEWS = ["establishing", "wide", "medium", "detail"] as const;
export const PROP_VIEWS = ["hero", "three_quarter", "detail", "overhead", "in_hand"] as const;
export type LocationView = (typeof LOCATION_VIEWS)[number];
export type PropView = (typeof PROP_VIEWS)[number];

const txt = (n: number) => z.string().max(n).nullable().optional();
export const WorldLookInputSchema = z.object({
  kind: z.enum(["location", "prop"]),
  item: z.object({
    name: z.string().min(1).max(160), description: txt(2000), category: z.enum(["prop", "vehicle"]).nullable().optional(),
    int_ext: z.array(z.string().max(10)).max(4).default([]), times_of_day: z.array(z.string().max(40)).max(12).default([]), areas: z.array(z.string().max(120)).max(20).default([]),
  }),
  /** Project look from Project Settings (style.look), so references match the film. */
  style: z.string().max(500).nullable().default(null),
  /** View keys ("wide:NIGHT", "hero"); default is the recommended set. */
  views: z.array(z.string().max(60)).min(1).max(40).optional(),
});
export type WorldLookInput = z.input<typeof WorldLookInputSchema>;

export interface WorldLookView { key: string; view: string; time: string | null; label: string; prompt: string; aspect_ratio: "16:9" | "1:1"; in_default_set: boolean }
export interface WorldLookOutput {
  identity: string; identity_hash: string; views: WorldLookView[]; negative: string[];
  /** Fields that would make the identity richer — shown so the person can fill them (never guessed). */
  missing: string[]; engine_version: string;
}

const LOC_LABEL: Record<LocationView, string> = { establishing: "Establishing", wide: "Wide", medium: "Medium", detail: "Detail" };
const PROP_LABEL: Record<PropView, string> = { hero: "Hero", three_quarter: "¾", detail: "Detail", overhead: "Overhead", in_hand: "In hand (scale)" };
const TIME_TEXT: Record<string, string> = {
  DAY: "in daytime, natural daylight", NIGHT: "at night, practical lights and moonlight", DAWN: "at dawn, low soft warm light", DUSK: "at dusk, fading warm light",
  MORNING: "in the morning, fresh daylight", EVENING: "in the evening, warm low light", AFTERNOON: "in the afternoon, bright daylight",
};
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

export function worldLookEngine(raw: WorldLookInput): WorldLookOutput {
  const input = WorldLookInputSchema.parse(raw);
  const it = input.item;
  const style = clean(input.style) ? `Visual style: ${clean(input.style)}.` : null;
  const desc = clean(it.description) ? `${clean(it.description).replace(/\.$/, "")}.` : null;
  let identity: string, views: WorldLookView[];
  if (input.kind === "location") {
    const ie = it.int_ext.includes("INT") && it.int_ext.includes("EXT") ? "interior and exterior" : it.int_ext.includes("EXT") ? "exterior" : it.int_ext.includes("INT") ? "interior" : "";
    identity = [`${clean(it.name)}${ie ? ` — ${ie}` : ""}${it.areas.length ? `, including ${it.areas.join(", ")}` : ""}.`, desc].filter(Boolean).join(" ");
    const times = it.times_of_day.length ? it.times_of_day : ["DAY"];
    const all = times.flatMap((t) => LOCATION_VIEWS.map((v) => ({ v, t })));
    // Recommended set: establishing + wide at every time of day the script uses, and one detail view.
    const isDefault = (v: LocationView, t: string) => v === "establishing" || v === "wide" || (v === "detail" && t === times[0]);
    const exteriorOnly = ie === "exterior";
    views = all.map(({ v, t }) => ({
      key: `${v}:${t}`, view: v, time: t, label: `${LOC_LABEL[v]} · ${t[0]}${t.slice(1).toLowerCase()}`, aspect_ratio: v === "detail" ? "1:1" : "16:9", in_default_set: isDefault(v, t),
      prompt: [
        `Location reference image, ${v === "establishing" ? (exteriorOnly || !it.int_ext.includes("INT") ? "wide establishing shot of the place" : "establishing shot of the building from outside") : v === "wide" ? `wide shot of the ${exteriorOnly ? "space" : "set"}, showing the whole layout` : v === "medium" ? "medium shot of the main area" : "close detail of textures and set dressing"}, ${TIME_TEXT[t] ?? `at ${t.toLowerCase()}`}.`,
        identity, style, "No people, realistic, cinematic, consistent layout, materials and set dressing across all views.",
      ].filter(Boolean).join(" "),
    }));
  } else {
    const kind = it.category === "vehicle" ? "vehicle" : "object";
    identity = [`${clean(it.name)}${it.category === "vehicle" ? " (vehicle)" : ""}.`, desc].filter(Boolean).join(" ");
    const angle: Record<PropView, string> = {
      hero: `hero view of the ${kind}, front, centred`, three_quarter: `three-quarter view of the ${kind}, turned 45 degrees`, detail: "close-up detail of markings, wear and texture",
      overhead: `overhead view looking straight down on the ${kind}`, in_hand: kind === "vehicle" ? "the vehicle beside a standing person for scale" : "the object held in a hand for scale",
    };
    views = PROP_VIEWS.map((v) => ({
      key: v, view: v, time: null, label: PROP_LABEL[v], aspect_ratio: (kind === "vehicle" && v !== "detail" ? "16:9" : "1:1") as "16:9" | "1:1", in_default_set: v !== "overhead",
      prompt: [`Prop reference image, ${angle[v]}.`, identity, style, "Neutral grey background, even soft lighting, realistic, the same design, colour and wear in every view."].filter(Boolean).join(" "),
    }));
  }
  if (input.views) {
    const want = new Set(input.views);
    views = views.filter((v) => want.has(v.key));
  }
  return {
    identity, views, engine_version: ENGINE_VERSION,
    identity_hash: hash16(JSON.stringify([input.kind, identity, style, ENGINE_VERSION])),
    missing: clean(it.description) ? [] : ["description"],
    negative: input.kind === "location" ? ["people", "text or watermark", "inconsistent architecture", "distorted perspective"] : ["a different object", "extra objects", "text or watermark", "inconsistent colour or design"],
  };
}
