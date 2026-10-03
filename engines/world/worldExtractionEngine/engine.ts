// engines/world/worldExtractionEngine — canonical locations and props from the approved script (SRS: Location and Prop
// are canonical "Scene/Asset domain" entities; owner, 2026-09-28: "these go with environments and props too").
// Locations come from scene headings (one per place, with every INT/EXT, time of day and sub-area it is used with).
// Props come from action lines: an object named after a/the/his/her… that is either in the prop word list or written
// in CAPITALS (the screenplay convention for important props). Every item carries the scene and the source line it was
// found on, so nothing is invented; the person confirms, edits or removes them.
import { z } from "zod";
import { ENGINE_VERSION } from "./version";

const ElementSchema = z.object({ index: z.number().int().nonnegative(), type: z.string(), text: z.string(), line: z.number().int().positive() });
const SceneSchema = z.object({
  number: z.number().int().positive(), heading: z.string(), int_ext: z.string(), location: z.string(), time_of_day: z.string().nullable(),
  element_start: z.number().int().nonnegative(), element_end: z.number().int().nonnegative(), heading_line: z.number().int().positive().optional(),
});
export const WorldExtractionInputSchema = z.object({
  elements: z.array(ElementSchema),
  scenes: z.array(SceneSchema),
  /** Character names (any case) so a CAPITALISED name is never mistaken for a prop. */
  character_names: z.array(z.string()).default([]),
});
export type WorldExtractionInput = z.input<typeof WorldExtractionInputSchema>;

export interface WorldEvidence { scene_number: number; line: number; text: string }
export interface ExtractedLocation {
  key: string; name: string; int_ext: string[]; times_of_day: string[]; areas: string[]; scenes: WorldEvidence[];
}
export interface ExtractedProp {
  key: string; name: string; category: "prop" | "vehicle"; descriptors: string[]; confidence: "high" | "medium"; reason: string; scenes: WorldEvidence[];
}
export interface WorldExtractionOutput { locations: ExtractedLocation[]; props: ExtractedProp[]; engine_version: string }

/** Everyday screen props (singular). Vehicles are kept as their own category. */
const PROPS = new Set(("phone mobile smartphone letter envelope gun pistol revolver rifle shotgun knife machete dagger sword key keys laptop computer tablet notebook " +
  "diary journal book bible newspaper magazine camera photograph photo picture badge bag handbag backpack briefcase suitcase wallet purse ring necklace bracelet " +
  "watch glass glasses bottle cup mug flask cigarette lighter matchbox map file folder dossier document report ledger radio walkie-talkie torch flashlight umbrella box " +
  "package parcel crate recorder dictaphone tape cassette usb pen pencil card passport ticket cash money coin banknote rope chain lamp lantern candle mirror " +
  "microphone headphones syringe pill pills drink plate bowl tray cane stick bat hammer spanner crowbar shovel axe helmet mask scarf hat cap sunglasses " +
  "handcuffs remote television tv screen monitor drone guitar drum trophy medal flag banner sign poster painting statue vase basket cooler").split(" "));
const VEHICLES = new Set("car van truck lorry bus taxi cab motorbike motorcycle okada keke danfo bicycle bike boat canoe ship ferry jeep suv ambulance helicopter".split(" "));
const DETERMINERS = new Set("a an the his her their its my our your this that one another".split(" "));
const POSSESSIVE = new Set("his her their its my our your".split(" "));
/** People and titles written in capitals when they first appear (a STEWARD, the LAWYER, HON. TAFIDA) — never props. */
const PEOPLE = new Set(("STEWARD STEWARDS LAWYER LAWYERS GUARD GUARDS DRIVER DRIVERS GATEMAN PRODUCER VOLUNTEER VOLUNTEERS INSIDER ATTENDANT ATTENDANTS ESCORT ESCORTS " +
  "LOYALIST LOYALISTS OBSERVER OBSERVERS HOST REPORTER REPORTERS JOURNALIST JOURNALISTS OFFICER OFFICERS AGENT AGENTS AIDE AIDES VOTER VOTERS SUPPORTER SUPPORTERS " +
  "SECURITY POLICE POLICEMAN SOLDIER SOLDIERS NURSE DOCTOR WAITER WAITRESS CLERK CROWD WOMAN WOMEN MAN MEN BOY BOYS GIRL GIRLS CHILD CHILDREN YOUTH YOUTHS " +
  "TRADER TRADERS VENDOR VENDORS PROTESTER PROTESTERS MARCHER MARCHERS DELEGATE DELEGATES OFFICIAL OFFICIALS STAFF ORDERLY CAMERAMAN PHOTOGRAPHER SPEAKER " +
  "HON CHIEF DR PROF MR MRS MS ALHAJI ALHAJA MALLAM SENATOR BARRISTER GOVERNOR PRESIDENT JUSTICE JUDGE PASTOR IMAM MAMA PAPA BABA").split(" "));
/** Common words and places that are emphasis, not objects (OTHER AGENTS, NATIONAL DEMOCRATIC CONGRESS). */
const COMMON_CAPS = new Set(("OTHER OTHERS ALL EVERY EACH SOME MANY FEW MORE MOST NO NOT YES NEW OLD BIG SMALL FIRST LAST NEXT ONLY JUST VERY NOW STILL " +
  "NATIONAL COUNTRY NATION NIGERIA NAIJA AFRICA STATE FEDERAL DEMOCRATIC CONGRESS PARTY PEOPLE VOTE VOTES ORDER WE YOU THEY HE SHE IT FOR HOW WHAT WHY " +
  "WHO HAS HAVE IS ARE WAS WERE BE DO DID DONE GO STOP WAIT LIVE BREAKING").split(" "));
/** Words that put the capitals after them into someone's mouth or on a surface (a sign, a page, a screen). */
const SAYS = new Set(("shout shouts shouting shouted chant chants chanting chanted read reads reading says say said yell yells yelling cry cries crying " +
  "call calls calling scream screams screaming write writes written writing label labelled labeled mark marked stamp stamped spell spells spelling print printed " +
  "type types typed typing headline caption hashtag slogan banner").split(" "));
/** Glass the material (windows, doors, a glass table) and glasses to see with are not a drinking glass. */
const GLASS_SURROUND = /\b(window|windows|windscreen|windshield|louvre|louvred|louvered|pane|panes|door|doors|partition|wall|walls|screen|frame|table|counter|case|cabinet|roof|ceiling|tinted)\b/i;
const DRINK = /\b(water|wine|zobo|juice|beer|whisky|whiskey|gin|palm|drink|drinks|sips?|pours?|raises?|lifts?|toasts?|clinks?|fills?|empty|empties|downs?)\b/i;
const SOUNDS = new Set(("CHEER CHEERS CHEERING GROAN GROANS APPLAUSE LAUGHTER GASP GASPS MURMUR MURMURS SHOUT SHOUTS CHANT CHANTS WHISTLE WHISTLES BANG CRASH THUD THUMP RING RINGS RINGING SLAM SLAMS BOOM CLICK CLICKS BUZZ BUZZES BEEP BEEPS KNOCK KNOCKS KNOCKING SCREAM SCREAMS WHOOSH " +
  "SMASH SMASHES SHATTERS SHATTER CRACK CRACKS SNAP POP HISS RUMBLE RUMBLES ROAR ROARS SPLASH GUNSHOT GUNSHOTS BLAST SIREN SIRENS HONK HONKS WAIL CREAK CREAKS " +
  "VIBRATES VIBRATING THUNDER").split(" "));
const STOP = new Set(("CONTINUOUS LATER INT EXT CUT FADE POV CONT'D BEAT SUPER TITLE INSERT BACK SCENE THE AND OF TO IN ON AT A AN MOMENTS MORNING NIGHT DAY " +
  "DAWN DUSK EVENING AFTERNOON FLASHBACK END MONTAGE SERIES SHOTS INTERCUT O.S V.O OS VO").split(" "));
const TIMES: [RegExp, string][] = [[/night|midnight/i, "NIGHT"], [/dawn|sunrise/i, "DAWN"], [/dusk|sunset|twilight/i, "DUSK"], [/morning/i, "MORNING"],
  [/evening/i, "EVENING"], [/afternoon/i, "AFTERNOON"], [/day|noon/i, "DAY"]];
const ADJ_STOP = new Set(["a", "an", "the", "and", "or", "of", "with", "to", "into", "from", "on", "in"]);

const title = (s: string) => s.toLowerCase().replace(/(^|[\s\-/(])([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase());
const singular = (w: string) => (w === "spectacles" || w === "eyeglasses" ? "glasses" : PROPS.has(w) || VEHICLES.has(w) ? w : w.endsWith("ies") ? w.slice(0, -3) + "y" : w.endsWith("es") && PROPS.has(w.slice(0, -2)) ? w.slice(0, -2) : w.endsWith("s") ? w.slice(0, -1) : w);
export const normalizeLocation = (s: string) => s.toUpperCase().replace(/\((CONTINUOUS|CONT'D|LATER|MOMENTS LATER)\)|\b(CONTINUOUS|MOMENTS LATER)\b/g, "").replace(/[^A-Z0-9'&/\- ]/g, " ").replace(/\s+/g, " ").trim().replace(/[\s-]+$/, "");
export function timeOfDay(s: string | null | undefined) {
  if (!s) return null;
  for (const [re, v] of TIMES) if (re.test(s)) return v;
  return s.trim().toUpperCase() || null;
}
/** A sound written in capitals, in any form: BOOM, BOOMS, BOOMING, BOOMED. */
const isSound = (w: string) => SOUNDS.has(w) || SOUNDS.has(w.replace(/(ING|ED|ES|S)$/, ""));
const sentences = (text: string) => text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);

export function worldExtractionEngine(raw: WorldExtractionInput): WorldExtractionOutput {
  const input = WorldExtractionInputSchema.parse(raw);
  const names = new Set(input.character_names.flatMap((n) => { const u = n.toUpperCase().trim(); return [u, ...u.split(/\s+/)]; }).filter((x) => x.length > 1));

  // ---- Locations: one per place; sub-areas ("HOUSE - KITCHEN") stay on the parent place ----
  const locs = new Map<string, ExtractedLocation>();
  for (const s of [...input.scenes].sort((a, b) => a.number - b.number)) {
    const full = normalizeLocation(s.location);
    if (!full) continue;
    const [place, ...rest] = full.split(/\s+-\s+/);
    const key = place.trim();
    const l = locs.get(key) ?? { key, name: title(key), int_ext: [], times_of_day: [], areas: [], scenes: [] };
    for (const ie of s.int_ext.split("/")) if (["INT", "EXT"].includes(ie) && !l.int_ext.includes(ie)) l.int_ext.push(ie);
    const t = timeOfDay(s.time_of_day);
    if (t && !l.times_of_day.includes(t)) l.times_of_day.push(t);
    const area = rest.join(" - ").trim();
    if (area && !l.areas.includes(title(area))) l.areas.push(title(area));
    l.scenes.push({ scene_number: s.number, line: s.heading_line ?? 1, text: s.heading });
    locs.set(key, l);
  }
  const locationWords = new Set([...locs.keys()].flatMap((k) => [k, ...k.split(/\s+/)]));

  // ---- Props: from action lines in each scene ----
  const props = new Map<string, ExtractedProp>();
  const add = (key: string, name: string, category: "prop" | "vehicle", caps: boolean, adjectives: string[], ev: WorldEvidence) => {
    const p = props.get(key) ?? { key, name, category, descriptors: [], confidence: "medium" as const, reason: "", scenes: [] };
    if (caps) p.confidence = "high";
    p.reason = p.confidence === "high" ? "Written in capitals in the action (the screenplay convention for important props)" : "Named as an object in the action";
    for (const a of adjectives) if (!p.descriptors.includes(a) && p.descriptors.length < 4) p.descriptors.push(a);
    if (!p.scenes.some((x) => x.scene_number === ev.scene_number)) p.scenes.push(ev);
    props.set(key, p);
  };
  for (const s of input.scenes) {
    for (const el of input.elements) {
      if (el.index < s.element_start || el.index > s.element_end || el.type !== "action") continue;
      const lineIsCaps = el.text === el.text.toUpperCase() && /[A-Z]/.test(el.text);
      for (const sentence of sentences(el.text)) {
        const ev = { scene_number: s.number, line: el.line, text: sentence.slice(0, 240) };
        const raw = sentence.split(/\s+/).filter((w) => w.replace(/^[^A-Za-z0-9']+|[^A-Za-z0-9'\-]+$/g, ""));
        const words = raw.map((w) => w.replace(/^[^A-Za-z0-9']+|[^A-Za-z0-9'\-]+$/g, ""));
        // Text written on something or said aloud: inside quotes, after a colon, or a #hashtag — never a prop.
        const quoted: boolean[] = [];
        { let q = false, colon = false; raw.forEach((w, k) => { const opens = /^["“‘]/.test(w); if (opens) q = true; quoted[k] = q || colon || /^#/.test(w); if (/["”’][^A-Za-z]*$/.test(w) && (!opens || w.length > 1)) q = false; if (/:$/.test(w)) colon = true; }); }
        for (let i = 0; i < words.length; i++) {
          const w = words[i];
          const lower = w.toLowerCase().replace(/'s$/, "");
          // A determiner within the two words before (allowing adjectives): "a battered NOTEBOOK", "his phone".
          const detAt = [i - 1, i - 2, i - 3].find((j) => j >= 0 && DETERMINERS.has(words[j].toLowerCase()));
          if (detAt === undefined) continue;
          const adjectives = words.slice(detAt + 1, i).map((a) => a.toLowerCase()).filter((a) => !ADJ_STOP.has(a) && !DETERMINERS.has(a) && /^[a-z\-]+$/.test(a));
          const between = words.slice(detAt + 1, i).map((a) => a.toLowerCase());
          if (between.some((a) => ADJ_STOP.has(a))) continue;
          // "The phone RINGS": the object comes first; what follows it is what it does, not another object.
          if (between.some((a) => PROPS.has(singular(a)) || VEHICLES.has(singular(a)))) continue;
          if (isSound(w)) continue;
          const isCaps = !lineIsCaps && w.length >= 3 && w === w.toUpperCase() && /^[A-Z][A-Z'\-]+$/.test(w);
          const sing = singular(lower);
          if (VEHICLES.has(sing)) { add(sing, title(sing), "vehicle", isCaps, adjectives, ev); continue; }
          if (sing === "glass") {
            // A drinking glass only: "a glass of water", "his glass", or with a drink nearby — not a window, a door or a glass table.
            const next = (words[i + 1] ?? "").toLowerCase();
            const possessive = POSSESSIVE.has(words[detAt].toLowerCase());
            if (next !== "of" && !possessive && (GLASS_SURROUND.test(sentence) || !DRINK.test(sentence))) continue;
            if (/^[a-z]+$/.test(next) && next !== "of" && !DRINK.test(next) && /^(table|door|doors|wall|case|top|front|panel|screen|bowl|jar|vase)$/.test(next)) continue;
          }
          if (PROPS.has(sing)) { add(sing, title(sing), "prop", isCaps, adjectives, ev); continue; }
          // "A crane BOOMS": a capitalised word ending in -S after a lower-case noun is what that thing does.
          const verbLike = between.length > 0 && /S$/.test(w);
          if (isCaps && !verbLike && !STOP.has(w) && !names.has(w) && !locationWords.has(w)) {
            // A capitalised object that isn't in the word list: take the capitalised run it starts ("the RED FILE").
            let j = i; const run = [w];
            while (j + 1 < words.length && words[j + 1] === words[j + 1].toUpperCase() && /^[A-Z][A-Z'\-]+$/.test(words[j + 1]) && !isSound(words[j + 1]) && !names.has(words[j + 1])) run.push(words[++j]);
            // Not a prop (owner report 2026-10-03): a person or title written in capitals (a STEWARD, HON.), a slogan or headline
            // (three words or more), text on a sign/page/screen or said aloud (quoted, after a colon, a #hashtag, after
            // "shouting"/"reads"), a common word used for emphasis (OTHER, NATIONAL), or a label on an object that follows
            // ("the RETRY button").
            const after = (words[j + 1] ?? "").toLowerCase();
            const notProp = run.length > 2 || quoted[i] || run.some((x) => PEOPLE.has(x.replace(/'S$/, "")) || COMMON_CAPS.has(x) || names.has(x))
              || words.slice(Math.max(0, i - 3), i).some((x) => SAYS.has(x.toLowerCase()))
              || (/^[a-z]+$/.test(after) && !/(s|ed|ing)$/.test(after) && !ADJ_STOP.has(after) && !["is", "was", "lies", "sits", "and", "or"].includes(after));
            if (!notProp) {
              const k = singular(run.join(" ").toLowerCase());
              add(k, title(k), "prop", true, adjectives, ev);
            }
            i = j;
          }
        }
      }
    }
  }
  const byUse = <T extends { scenes: WorldEvidence[] }>(a: T, b: T) => b.scenes.length - a.scenes.length || a.scenes[0].scene_number - b.scenes[0].scene_number;
  return { locations: [...locs.values()].sort(byUse), props: [...props.values()].sort(byUse), engine_version: ENGINE_VERSION };
}
