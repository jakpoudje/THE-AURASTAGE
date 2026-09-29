// engines/character/characterAppearanceEngine — what AuraSketch draws (owner, 2026-09-29: "AuraSketch should be one of
// the advanced sketching character engines… rather than circles and heads"). It reads the Casting profile, the
// description, the wardrobe look and the age for the scene, and returns concrete drawing facts — build, height, life
// stage, hair, facial hair, glasses, headwear, clothing and colours — each with the words it came from.
//
// It only draws what the person wrote. Skin tone comes from the description's own words, never from a name, nationality
// or heritage; anything not described is drawn neutrally and listed in `unspecified` so the person can add it.
import { z } from "zod";
import { ENGINE_VERSION } from "./version";

const txt = (n: number) => z.string().max(n).nullable().optional();
export const CharacterAppearanceInputSchema = z.object({
  name: z.string().max(120).default(""),
  age: txt(40),
  gender: txt(60),
  description: txt(4000),
  /** Structured appearance fields when Casting has them (they win over words in the description). */
  appearance: z.object({
    build: txt(60), height: txt(60), skin_tone: txt(60), hair: txt(200), facial_hair: txt(120), eyes: txt(60), distinguishing: txt(400),
  }).partial().nullable().optional(),
  wardrobe: txt(2000),
  /** The character at another point in the story (Casting ages): its age and description win. */
  age_state: z.object({ age: z.string().max(40), description: z.string().max(2000).nullable() }).nullable().optional(),
});
export type CharacterAppearanceInput = z.input<typeof CharacterAppearanceInputSchema>;

export type Presentation = "feminine" | "masculine" | "neutral";
export type LifeStage = "child" | "teen" | "adult" | "middle" | "elder";
export type HairStyle = "bald" | "shaved" | "cropped" | "short" | "medium" | "long" | "braids" | "locs" | "afro" | "curly" | "bun" | "ponytail";
export type Headwear = "none" | "cap" | "hat" | "beanie" | "headscarf" | "hijab" | "turban" | "gele" | "helmet" | "beret";
export type Top = "tshirt" | "shirt" | "blouse" | "sweater" | "hoodie" | "jacket" | "suit" | "coat" | "dress" | "robe" | "uniform" | "kaftan";
export type Bottom = "trousers" | "jeans" | "skirt" | "shorts" | "none";

export interface Appearance {
  presentation: Presentation;
  age_years: number | null;
  life_stage: LifeStage;
  /** 0.85 petite … 1.15 tall (relative figure height). */
  height: number;
  /** 0.8 slim … 1.35 heavy (relative width). */
  width: number;
  muscular: boolean;
  skin: string | null;
  hair: { style: HairStyle; colour: string; grey: boolean };
  facial_hair: "none" | "stubble" | "beard" | "full_beard" | "moustache" | "goatee";
  glasses: boolean;
  headwear: Headwear;
  scar: "left" | "right" | null;
  earrings: boolean;
  clothing: {
    top: Top; bottom: Bottom; colours: string[]; open_jacket: boolean; tie: boolean;
    /** Colours tied to the garment they describe ("navy hijab, cream robe"): these win over the plain list. */
    named: { top?: string; inner?: string; bottom?: string; headwear?: string; tie?: string };
  };
  /** Which words produced which fact (shown as evidence). */
  evidence: { fact: string; from: string }[];
  /** Facts the text doesn't give; drawn neutrally. */
  unspecified: string[];
  engine_version: string;
}

// Named colours → drawing colours (muted, pencil-and-wash palette).
export const COLOURS: Record<string, string> = {
  black: "#26252b", charcoal: "#3b3b42", grey: "#8a8a92", gray: "#8a8a92", silver: "#b9bcc4", white: "#ecebe6", cream: "#e8dfc9", beige: "#cdbb98",
  khaki: "#a79a6c", tan: "#b08a5a", brown: "#6b4a33", chocolate: "#4f3526", navy: "#27324f", blue: "#3f64a0", "light blue": "#8fb3d9", teal: "#2f7a78",
  turquoise: "#3fa6a0", green: "#3f7a45", olive: "#6b6b3a", "dark green": "#2c4f33", red: "#a3333a", crimson: "#8e2233", maroon: "#652232", burgundy: "#6a2335",
  pink: "#d88aa0", purple: "#6b4a8f", lavender: "#a898c8", yellow: "#d9b53f", mustard: "#b8912e", gold: "#c9a24a", orange: "#d27a36", coral: "#e0806a",
};
const HAIR_COLOURS: [RegExp, string, string][] = [
  [/\b(jet[- ]black|black)\b/i, "#1f1c1c", "black"], [/\b(dark[- ]brown|brunette)\b/i, "#3a2618", "dark brown"], [/\bchestnut\b/i, "#5a3421", "chestnut"],
  [/\b(auburn)\b/i, "#7a3a22", "auburn"], [/\b(red|ginger|copper)\b/i, "#a8492a", "red"], [/\b(strawberry blonde)\b/i, "#c9905a", "strawberry blonde"],
  [/\b(blonde?|golden|flaxen|fair[- ]haired)\b/i, "#d8b56a", "blonde"], [/\b(platinum)\b/i, "#e6dcc0", "platinum"], [/\b(brown)\b/i, "#5a3b26", "brown"],
  [/\b(silver|grey|gray|salt[- ]and[- ]pepper)\b/i, "#a8a8ad", "grey"], [/\b(white)\b/i, "#e3e1dc", "white"],
];
// Skin: only explicit words, drawn as warm washes.
const SKIN: [RegExp, string, string][] = [
  [/\b(ebony|very dark|deep brown|dark[- ]skinned|dark skin|deep skin)\b/i, "#4a2e22", "deep"], [/\b(dark brown skin|brown[- ]skinned|brown skin|umber)\b/i, "#6b4430", "brown"],
  [/\b(tan(ned)?|olive[- ]skinned|olive skin|golden[- ]brown|bronze)\b/i, "#a87a52", "olive/tan"], [/\b(light brown|caramel)\b/i, "#b98a62", "light brown"],
  [/\b(fair[- ]skinned|fair skin|light[- ]skinned|light skin|pale|porcelain|freckled)\b/i, "#e6c4a8", "fair"], [/\b(ruddy|rosy)\b/i, "#d9a38a", "rosy"],
];

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

function ageYears(s: string): number | null {
  const n = s.match(/\b(\d{1,3})\b/);
  if (n) return Math.min(110, Number(n[1]));
  const words: [RegExp, number][] = [[/infant|baby|toddler/i, 2], [/child|little/i, 8], [/teens?|teenager|adolescent/i, 16], [/twenties|20s/i, 25],
    [/thirties|30s/i, 35], [/forties|40s/i, 45], [/fifties|50s/i, 55], [/sixties|60s/i, 65], [/seventies|70s/i, 75], [/eighties|80s/i, 85], [/elderly|old/i, 72], [/middle[- ]aged/i, 50]];
  for (const [re, y] of words) if (re.test(s)) return y + (/early/i.test(s) ? (y < 20 ? -2 : -3) : /late/i.test(s) ? (y < 20 ? 2 : 3) : 0);
  return null;
}

export function characterAppearanceEngine(raw: CharacterAppearanceInput): Appearance {
  const i = CharacterAppearanceInputSchema.parse(raw);
  const ap = i.appearance ?? {};
  const desc = [clean(i.age_state?.description), clean(ap.hair), clean(ap.facial_hair), clean(ap.build), clean(ap.height), clean(ap.skin_tone), clean(ap.distinguishing), clean(i.description)].filter(Boolean).join(". ");
  const wear = clean(i.wardrobe);
  const evidence: Appearance["evidence"] = [];
  const unspecified: string[] = [];
  const find = (re: RegExp, text = desc) => text.match(re)?.[0] ?? null;
  const note = (fact: string, from: string | null) => { if (from) evidence.push({ fact, from }); };

  // Presentation: the gender field first, then pronoun-free words in the description. Unknown stays neutral.
  const g = clean(i.gender);
  const fem = /\b(woman|female|girl|lady|she|her|feminine|mother|wife|queen|actress)\b/i, masc = /\b(man|male|boy|gentleman|he|him|masculine|father|husband|king|actor)\b/i;
  let presentation: Presentation = "neutral";
  if (g && fem.test(g) && !/non[- ]?binary/i.test(g)) presentation = "feminine";
  else if (g && masc.test(g) && !/non[- ]?binary/i.test(g)) presentation = "masculine";
  else if (!g) { const f = find(fem), m = find(masc); if (f && !m) presentation = "feminine"; else if (m && !f) presentation = "masculine"; }
  note(`presentation: ${presentation}`, g || null);
  if (presentation === "neutral") unspecified.push("gender presentation");

  const age_years = ageYears(clean(i.age_state?.age) || clean(i.age)) ?? ageYears(desc);
  const life_stage: LifeStage = age_years === null ? "adult" : age_years < 13 ? "child" : age_years < 20 ? "teen" : age_years < 45 ? "adult" : age_years < 65 ? "middle" : "elder";
  if (age_years === null) unspecified.push("age");
  else note(`age ${age_years} (${life_stage})`, clean(i.age_state?.age) || clean(i.age) || null);

  // Build and height.
  let width = presentation === "masculine" ? 1.05 : presentation === "feminine" ? 0.92 : 1;
  let height = presentation === "masculine" ? 1.03 : presentation === "feminine" ? 0.97 : 1;
  let w: string | null;
  if ((w = find(/\b(heavy[- ]?set|stocky|portly|plump|overweight|large|big[- ]boned|rotund|burly|heavy)\b/i))) { width *= 1.28; note("heavier build", w); }
  else if ((w = find(/\b(slim|slender|thin|skinny|wiry|lean|gaunt|willowy)\b/i))) { width *= 0.85; note("slim build", w); }
  else if ((w = find(/\b(athletic|muscular|broad[- ]shouldered|strong|toned|powerful)\b/i))) { width *= 1.12; note("athletic build", w); }
  else unspecified.push("build");
  const muscular = !!find(/\b(muscular|athletic|broad[- ]shouldered|toned|powerful|burly)\b/i);
  if ((w = find(/\b(very tall|towering|tall|lanky)\b/i))) { height *= w.match(/very|towering/i) ? 1.12 : 1.07; note("tall", w); }
  else if ((w = find(/\b(short|petite|small|diminutive)\b/i))) { height *= 0.9; note("short", w); }

  // Skin (explicit words only).
  let skin: string | null = null;
  for (const [re, hex, label] of SKIN) { const m = find(re); if (m) { skin = hex; note(`skin: ${label}`, m); break; } }
  if (!skin) unspecified.push("skin tone");

  // Hair.
  let style: HairStyle = presentation === "feminine" ? "medium" : "short";
  const styles: [RegExp, HairStyle][] = [[/\b(bald|hairless)\b/i, "bald"], [/\b(shaved head|shaven head|buzz[- ]?cut|shaved)\b/i, "shaved"],
    [/\b(dreadlocks|dreads|locs|locks)\b/i, "locs"], [/\b(braids?|braided|cornrows|plaits?)\b/i, "braids"], [/\b(afro|natural hair|coily|kinky)\b/i, "afro"],
    [/\b(bun|topknot|updo)\b/i, "bun"], [/\b(ponytail)\b/i, "ponytail"], [/\b(close[- ]cropped|cropped|crew cut)\b/i, "cropped"],
    [/\b(curly|curls|ringlets)\b/i, "curly"], [/\b(long hair|long,? \w+ hair|waist[- ]length|flowing)\b/i, "long"],
    [/\b(shoulder[- ]length|bob|medium[- ]length)\b/i, "medium"], [/\b(short hair|short,? \w+ hair)\b/i, "short"]];
  let hw: string | null = null;
  for (const [re, s] of styles) { const m = find(re); if (m) { style = s; hw = m; break; } }
  if (hw) note(`hair: ${style}`, hw); else unspecified.push("hair style");
  let hairColour = "#2a2220", hairName = "dark";
  let hc: string | null = null;
  for (const [re, hex, name] of HAIR_COLOURS) {
    const m = desc.match(new RegExp(`${re.source}[^.,;]{0,20}\\b(hair|beard|curls|locs|braids|afro)\\b|\\b(hair|beard)[^.,;]{0,12}${re.source}`, "i"));
    if (m) { hairColour = hex; hairName = name; hc = m[0]; break; }
  }
  const grey = hairName === "grey" || hairName === "white" || (!hc && life_stage === "elder");
  if (!hc && life_stage === "elder") { hairColour = "#b3b2b0"; hairName = "grey"; note("grey hair (age)", `${age_years}`); }
  if (hc) note(`hair colour: ${hairName}`, hc); else if (life_stage !== "elder") unspecified.push("hair colour");

  // Face and extras.
  let facial_hair: Appearance["facial_hair"] = "none";
  if ((w = find(/\b(full beard|thick beard|bushy beard)\b/i))) facial_hair = "full_beard";
  else if ((w = find(/\b(goatee)\b/i))) facial_hair = "goatee";
  else if ((w = find(/\b(beard|bearded)\b/i))) facial_hair = "beard";
  else if ((w = find(/\b(moustache|mustache)\b/i))) facial_hair = "moustache";
  else if ((w = find(/\b(stubble|five o'?clock shadow|unshaven)\b/i))) facial_hair = "stubble";
  note(`facial hair: ${facial_hair}`, w && facial_hair !== "none" ? w : null);
  const glasses = !!(w = find(/\b(glasses|spectacles|specs|bifocals|sunglasses)\b/i)); note("glasses", glasses ? w : null);
  const earrings = !!(w = find(/\b(earrings?|hoops|studs)\b/i)); note("earrings", earrings ? w : null);
  const scarWord = find(/\bscar\b[^.]{0,40}/i);
  const scar = scarWord ? (/\bright\b/i.test(scarWord) ? "right" : "left") : null; note(`scar (${scar})`, scarWord);

  const all = `${desc}. ${wear}`;
  const headwears: [RegExp, Headwear][] = [[/\b(gele|head ?tie)\b/i, "gele"], [/\b(hijab)\b/i, "hijab"], [/\b(turban|pagri|dastar)\b/i, "turban"],
    [/\b(head ?scarf|headwrap|head wrap|bandana|kerchief)\b/i, "headscarf"], [/\b(helmet)\b/i, "helmet"], [/\b(beanie|woolly hat|knit cap)\b/i, "beanie"],
    [/\b(beret)\b/i, "beret"], [/\b(baseball cap|cap)\b/i, "cap"], [/\b(fedora|trilby|hat|stetson)\b/i, "hat"]];
  let headwear: Headwear = "none";
  for (const [re, h] of headwears) { const m = all.match(re); if (m) { headwear = h; note(`headwear: ${h}`, m[0]); break; } }

  // Clothing from the wardrobe look (then the description).
  const tops: [RegExp, Top][] = [[/\b(agbada|kaftan|caftan|dashiki|boubou)\b/i, "kaftan"], [/\b(dress|gown|frock)\b/i, "dress"], [/\b(robe|cassock|abaya|thobe)\b/i, "robe"],
    [/\b(uniform|scrubs|overalls|fatigues)\b/i, "uniform"], [/\b(suit|blazer|tuxedo)\b/i, "suit"], [/\b(coat|trench|overcoat|parka|raincoat|oilskin)\b/i, "coat"],
    [/\b(jacket|bomber|windbreaker|denim jacket|leather jacket)\b/i, "jacket"], [/\b(hoodie|hooded)\b/i, "hoodie"], [/\b(sweater|jumper|cardigan|pullover)\b/i, "sweater"],
    [/\b(blouse)\b/i, "blouse"], [/\b(t[- ]shirt|tshirt|tee|vest|tank top)\b/i, "tshirt"], [/\b(shirt|button[- ]down|polo)\b/i, "shirt"]];
  let top: Top = "shirt";
  let tw: string | null = null;
  for (const src of [wear, desc]) { for (const [re, t] of tops) { const m = src.match(re); if (m) { top = t; tw = m[0]; break; } } if (tw) break; }
  if (tw) note(`top: ${top}`, tw); else unspecified.push("clothing");
  let bottom: Bottom = top === "dress" || top === "robe" || top === "kaftan" ? "none" : "trousers";
  const bw = all.match(/\b(jeans|denims?)\b/i) ? "jeans" : all.match(/\b(skirt)\b/i) ? "skirt" : all.match(/\b(shorts)\b/i) ? "shorts" : all.match(/\b(trousers|pants|slacks|chinos)\b/i) ? "trousers" : null;
  if (bw) { bottom = bw as Bottom; note(`bottom: ${bw}`, bw); }
  const colours: string[] = [];
  const colourNames = Object.keys(COLOURS).sort((a, b) => b.length - a.length);
  const colourSrc = wear || all;
  const hits: { at: number; hex: string; name: string }[] = [];
  for (const c of colourNames) {
    const re = new RegExp(`\\b${c}\\b`, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(colourSrc))) {
      // A colour word describing hair/skin/eyes isn't clothing.
      const after = colourSrc.slice(m.index, m.index + c.length + 14);
      if (/\b(hair|beard|skin|eyes?|curls|locs|braids)\b/i.test(after)) continue;
      if (!hits.some((h) => m!.index >= h.at && m!.index < h.at + h.name.length)) hits.push({ at: m.index, hex: COLOURS[c], name: c });
    }
  }
  hits.sort((a, b) => a.at - b.at).forEach((h) => { if (!colours.includes(h.hex)) colours.push(h.hex); });
  if (hits.length) note(`colours: ${hits.map((h) => h.name).join(", ")}`, hits.map((h) => h.name).join(", "));
  // Each colour belongs to the garment in its own phrase: "khaki jacket over a white shirt, navy trousers".
  const named: Appearance["clothing"]["named"] = {};
  const phrases = colourSrc.split(/,|;|\.|\bwith\b|\bover\b|\bunder\b|\band\b|\bplus\b/i);
  const colourIn = (ph: string) => { for (const c of colourNames) if (new RegExp(`\\b${c}\\b`, "i").test(ph) && !new RegExp(`\\b${c}\\b[^,]{0,14}\\b(hair|beard|skin|eyes?)\\b`, "i").test(ph)) return COLOURS[c]; return undefined; };
  const layeredTop = top === "jacket" || top === "suit" || top === "coat";
  for (const ph of phrases) {
    const c = colourIn(ph);
    if (!c) continue;
    if (/\b(tie|necktie|bow tie)\b/i.test(ph)) named.tie ??= c;
    else if (headwears.some(([re]) => re.test(ph))) named.headwear ??= c;
    else if (/\b(jeans|denims?|skirt|shorts|trousers|pants|slacks|chinos)\b/i.test(ph)) named.bottom ??= c;
    else if (layeredTop && /\b(t[- ]shirt|shirt|blouse|sweater|jumper|top|vest|polo)\b/i.test(ph) && !tops.some(([re, t]) => (t === "jacket" || t === "suit" || t === "coat") && re.test(ph))) named.inner ??= c;
    else if (tops.some(([re]) => re.test(ph))) named.top ??= c;
  }
  const open_jacket = (top === "suit" || top === "jacket" || top === "coat") && !/\b(buttoned|zipped)\b/i.test(all);
  const tie = !!all.match(/\b(tie|necktie|bow tie)\b/i);

  return {
    presentation, age_years, life_stage, height: Math.round(height * 100) / 100, width: Math.round(width * 100) / 100, muscular, skin,
    hair: { style, colour: hairColour, grey }, facial_hair, glasses, headwear, scar, earrings,
    clothing: { top, bottom, colours, open_jacket, tie, named }, evidence, unspecified, engine_version: ENGINE_VERSION,
  };
}
