// placeSketchEngine — reading a place (owner, 2026-10-02: "locations and environments … must intelligently reflect real
// description of locations, environments, props"). The name, description, INT/EXT and the script's words become a
// concrete spec: what kind of place it is, its size, materials and colours, condition and wealth, light and weather,
// and the objects that must be in it — each with the words it came from. Nothing is assumed from a city or country
// name beyond what the words say about the place itself.

export type PlaceType =
  | "bedroom" | "living_room" | "kitchen" | "office" | "newsroom" | "boardroom" | "classroom" | "hospital" | "church" | "mosque"
  | "bar" | "restaurant" | "shop" | "cell" | "interrogation" | "warehouse" | "hotel_room" | "corridor" | "courtroom" | "studio" | "hall"
  | "car" | "bus"
  | "street" | "alley" | "market" | "harbour" | "beach" | "forest" | "field" | "village" | "highway" | "rooftop" | "compound" | "building_ext" | "park";
export type Mat = "plaster" | "brick" | "concrete" | "wood" | "tile" | "glass" | "marble" | "metal" | "carpet" | "earth" | "zinc";

export interface PlaceSpec {
  type: PlaceType;
  interior: boolean;
  size: "small" | "medium" | "large";
  wall: { mat: Mat; colour: string };
  floor: { mat: Mat; colour: string };
  condition: "new" | "kept" | "worn" | "derelict";
  wealth: "poor" | "modest" | "comfortable" | "luxury";
  era: "modern" | "period";
  /** Extra objects the words ask for (drawn on top of the type's own set). */
  objects: string[];
  weather: "clear" | "rain" | "fog" | "storm" | "dust";
  lit: "day" | "night" | "dawn" | "dusk";
  /** Window light, lamps, neon, candle, fluorescent… the practical light in the room. */
  practical: "none" | "lamp" | "fluorescent" | "neon" | "candle" | "fire";
  evidence: { fact: string; from: string }[];
}

const TYPES: [RegExp, PlaceType][] = [
  [/\b(car|taxi|cab|van|jeep|suv|truck)\b(?!\s*park)/i, "car"], [/\b(bus|danfo|minibus|coach|train carriage)\b/i, "bus"],
  [/\b(bedroom|bed ?room|dorm)\b/i, "bedroom"], [/\b(living ?room|sitting ?room|parlou?r|lounge|apartment|flat|home|house)\b/i, "living_room"],
  [/\b(kitchen)\b/i, "kitchen"], [/\b(newsroom|news ?desk)\b/i, "newsroom"], [/\b(boardroom|conference room|meeting room)\b/i, "boardroom"],
  [/\b(office|bureau|study|headquarters|hq)\b/i, "office"], [/\b(classroom|lecture|school ?room|class)\b/i, "classroom"],
  [/\b(hospital|ward|clinic|surgery|icu|emergency room)\b/i, "hospital"], [/\b(church|chapel|cathedral)\b/i, "church"], [/\b(mosque)\b/i, "mosque"],
  [/\b(bar|pub|club|nightclub|beer parlou?r|lounge bar)\b/i, "bar"], [/\b(restaurant|cafe|café|canteen|buka|diner|eatery)\b/i, "restaurant"],
  [/\b(shop|store|kiosk|boutique|pharmacy|supermarket)\b/i, "shop"], [/\b(cell|prison|jail|holding)\b/i, "cell"],
  [/\b(interrogation|police station|station house|precinct)\b/i, "interrogation"], [/\b(warehouse|factory|workshop|garage|depot)\b/i, "warehouse"],
  [/\b(hotel)\b/i, "hotel_room"], [/\b(corridor|hallway|hall ?way|stairwell|lobby)\b/i, "corridor"], [/\b(court ?room|courthouse|tribunal)\b/i, "courtroom"],
  [/\b(studio|broadcast|radio station|tv station)\b/i, "studio"], [/\b(hall|assembly|parliament|auditorium|chamber)\b/i, "hall"],
  [/\b(market|bazaar|stalls?)\b/i, "market"], [/\b(harbou?r|port|dock|jetty|quay|wharf|marina|waterfront|pier)\b/i, "harbour"],
  [/\b(beach|shore|coast|seaside|lagoon)\b/i, "beach"], [/\b(forest|bush|jungle|woods|woodland)\b/i, "forest"],
  [/\b(farm|field|plantation|savannah|grassland|countryside)\b/i, "field"], [/\b(village|hamlet|settlement)\b/i, "village"],
  [/\b(highway|expressway|motorway|road ?side|checkpoint|bridge)\b/i, "highway"], [/\b(roof|rooftop)\b/i, "rooftop"],
  [/\b(compound|yard|courtyard|gate)\b/i, "compound"], [/\b(park|garden|square|plaza)\b/i, "park"], [/\b(alley|backstreet|side ?street)\b/i, "alley"],
  [/\b(street|road|avenue|junction|roundabout|motor ?park|bus stop|downtown|city)\b/i, "street"],
];
const INTERIOR = new Set<PlaceType>(["bedroom", "living_room", "kitchen", "office", "newsroom", "boardroom", "classroom", "hospital", "church", "mosque", "bar", "restaurant", "shop", "cell", "interrogation", "warehouse", "hotel_room", "corridor", "courtroom", "studio", "hall", "car", "bus"]);

export const COLOUR_WORDS: [RegExp, string][] = [
  [/\bwhite\b/i, "#e6e2d8"], [/\bcream|ivory|off[- ]white\b/i, "#e3d8bf"], [/\bbeige|sand(y)?\b/i, "#cbb894"], [/\byellow\b/i, "#d8bd5a"], [/\bochre|mustard\b/i, "#b98f3a"],
  [/\borange\b/i, "#c9783a"], [/\bred\b/i, "#9e3b36"], [/\bpink\b/i, "#d59aa3"], [/\bgreen\b/i, "#5d7a52"], [/\bolive\b/i, "#6e6e45"], [/\bteal|turquoise\b/i, "#3f7f7b"],
  [/\bblue\b/i, "#4f6e94"], [/\bnavy\b/i, "#2c3a58"], [/\bpurple|violet\b/i, "#6a527f"], [/\bgr[ae]y\b/i, "#8a8a88"], [/\bblack|dark\b/i, "#2e2c2a"], [/\bbrown\b/i, "#6e5039"],
];
const WALL_DEFAULT: Partial<Record<PlaceType, [Mat, string]>> = {
  office: ["plaster", "#d9d5ca"], newsroom: ["plaster", "#cfcabd"], boardroom: ["wood", "#7a5a3e"], classroom: ["plaster", "#d8cfae"], hospital: ["tile", "#dfe6e2"],
  church: ["plaster", "#e2dccb"], mosque: ["plaster", "#e8e2d2"], bar: ["brick", "#6e3f2e"], restaurant: ["plaster", "#cdb48c"], shop: ["plaster", "#d8d3c4"],
  cell: ["concrete", "#7d7b75"], interrogation: ["concrete", "#8c8a82"], warehouse: ["metal", "#7a7f80"], corridor: ["plaster", "#cfc8b6"], courtroom: ["wood", "#6b4a33"],
  studio: ["plaster", "#3a3d44"], hall: ["plaster", "#d8d0ba"], kitchen: ["tile", "#dcd9cf"], bedroom: ["plaster", "#d6cbb4"], living_room: ["plaster", "#d4c6a8"], hotel_room: ["plaster", "#d7cdb8"],
};
const FLOOR_DEFAULT: Partial<Record<PlaceType, [Mat, string]>> = {
  office: ["carpet", "#5b6066"], newsroom: ["carpet", "#55595e"], boardroom: ["carpet", "#4e4a48"], classroom: ["tile", "#a49b88"], hospital: ["tile", "#c9cec9"],
  church: ["tile", "#a8937a"], mosque: ["carpet", "#8a3a34"], bar: ["wood", "#4f3626"], restaurant: ["tile", "#9e8a72"], cell: ["concrete", "#5f5d58"], interrogation: ["concrete", "#66645e"],
  warehouse: ["concrete", "#6b6a64"], courtroom: ["wood", "#5c4130"], kitchen: ["tile", "#b5ab98"], studio: ["concrete", "#2c2e33"],
};
const OBJECT_WORDS: [RegExp, string][] = [
  [/\bceiling fan\b/i, "ceiling_fan"], [/\b(tv|television)\b/i, "tv"], [/\b(laptops?)\b/i, "laptop"], [/\b(computers?|monitors?|screens?)\b/i, "monitor"], [/\b(desks?)\b/i, "desk"],
  [/\b(bookshel(f|ves)|bookcase|books)\b/i, "bookshelf"], [/\b(filing cabinets?|files|archives?)\b/i, "cabinet"], [/\b(sofa|couch|settee)\b/i, "sofa"], [/\b(armchairs?)\b/i, "armchair"],
  [/\b(dining table|table)\b/i, "table"], [/\b(chairs?|stools?)\b/i, "chair"], [/\b(bed)\b/i, "bed"], [/\b(wardrobe|closet)\b/i, "wardrobe"], [/\b(fridge|refrigerator)\b/i, "fridge"],
  [/\b(stove|cooker|gas cooker)\b/i, "stove"], [/\b(plants?|potted|flowers)\b/i, "plant"], [/\b(rug|mat|carpet)\b/i, "rug"], [/\b(lamps?)\b/i, "lamp"], [/\b(curtains?|drapes|blinds)\b/i, "curtains"],
  [/\b(photos?|pictures?|portraits?|paintings?|framed)\b/i, "frames"], [/\b(clock)\b/i, "clock"], [/\b(whiteboard|blackboard|chalkboard)\b/i, "board"], [/\b(generator)\b/i, "generator"],
  [/\b(motorbikes?|motorcycles?|okada)\b/i, "motorbike"], [/\b(cars?|vehicles?|taxis?)\b/i, "car"], [/\b(boats?|canoes?|ferry)\b/i, "boat"], [/\b(containers?)\b/i, "container"],
  [/\b(cranes?)\b/i, "crane"], [/\b(palm trees?|palms?)\b/i, "palm"], [/\b(trees?)\b/i, "tree"], [/\b(street ?lights?|lamp ?posts?)\b/i, "streetlight"], [/\b(power lines?|wires|cables)\b/i, "wires"],
  [/\b(billboards?|signs?|posters?)\b/i, "sign"], [/\b(newspapers?|papers|documents)\b/i, "papers"], [/\b(phones?|telephone)\b/i, "phone"], [/\b(bottles?|glasses|drinks)\b/i, "bottles"],
  [/\b(window)\b/i, "window"], [/\b(fan)\b/i, "fan"], [/\b(radio)\b/i, "radio"], [/\b(cross|altar|pulpit)\b/i, "altar"], [/\b(bars|cell door)\b/i, "bars"], [/\b(fence|wall)\b/i, "fence"],
];

export function readPlace(name: string, description: string, intExt: string[], time: string | null): PlaceSpec {
  const text = `${name}. ${description}`.replace(/\s+/g, " ");
  const evidence: PlaceSpec["evidence"] = [];
  const note = (fact: string, from: string | null | undefined) => { if (from) evidence.push({ fact, from }); };
  const find = (re: RegExp) => text.match(re)?.[0] ?? null;

  let type: PlaceType | null = null;
  // The name decides first (EXT. LAGOS HARBOUR is a harbour even if the description mentions an office).
  for (const src of [name, description]) {
    for (const [re, t] of TYPES) { const m = src.match(re); if (m) { type = t; note(`place: ${t.replace("_", " ")}`, m[0]); break; } }
    if (type) break;
  }
  const intOnly = intExt.includes("INT") && !intExt.includes("EXT"), extOnly = intExt.includes("EXT") && !intExt.includes("INT");
  if (!type) type = extOnly ? "street" : "living_room";
  // INT/EXT from the heading wins over the word: "INT. MARKET HALL" is a hall, "EXT. HOUSE" is outside the house.
  if (extOnly && INTERIOR.has(type) && type !== "car" && type !== "bus") type = type === "warehouse" || type === "church" || type === "mosque" || type === "hospital" || type === "shop" ? "building_ext" : "compound";
  if (intOnly && !INTERIOR.has(type)) type = type === "market" ? "hall" : type === "harbour" ? "warehouse" : "living_room";
  const interior = INTERIOR.has(type);

  let size: PlaceSpec["size"] = "medium", w: string | null;
  if ((w = find(/\b(tiny|cramped|small|narrow|poky|claustrophobic)\b/i))) { size = "small"; note("small", w); }
  else if ((w = find(/\b(huge|vast|large|spacious|big|cavernous|sprawling|grand)\b/i))) { size = "large"; note("large", w); }

  let condition: PlaceSpec["condition"] = "kept";
  if ((w = find(/\b(derelict|abandoned|ruined|collapsing|burnt[- ]out|bombed)\b/i))) condition = "derelict";
  else if ((w = find(/\b(worn|shabby|peeling|cracked|dilapidated|run[- ]down|rusty|rusting|dirty|grimy|faded|leaking|old)\b/i))) condition = "worn";
  else if ((w = find(/\b(new|brand[- ]new|pristine|spotless|immaculate|freshly)\b/i))) condition = "new";
  note(`condition: ${condition}`, w);
  let wealth: PlaceSpec["wealth"] = "modest";
  if ((w = find(/\b(luxur(y|ious)|opulent|lavish|mansion|penthouse|marble|chandelier|expensive|executive)\b/i))) wealth = "luxury";
  else if ((w = find(/\b(comfortable|well[- ]furnished|modern|smart|tidy)\b/i))) wealth = "comfortable";
  else if ((w = find(/\b(poor|bare|sparse|makeshift|shack|slum|zinc|corrugated)\b/i))) wealth = "poor";
  note(`wealth: ${wealth}`, w);
  const era: PlaceSpec["era"] = (w = find(/\b(colonial|victorian|1[6-9]\d0s|period|antique|old[- ]fashioned|vintage)\b/i)) ? "period" : "modern";
  if (era === "period") note("period", w);

  const matOf = (re: string): [Mat, string] | null => {
    const m = text.match(new RegExp(`\\b(brick|concrete|cement|wood(en)?|panell?ed|tiled?|glass|marble|metal|steel|zinc|corrugated|mud|plaster(ed)?|carpet(ed)?|lino(leum)?)\\b[^.,;]{0,10}\\b${re}`, "i"));
    if (!m) return null;
    const k = m[1].toLowerCase();
    const mat: Mat = /brick/.test(k) ? "brick" : /concrete|cement/.test(k) ? "concrete" : /wood|panel/.test(k) ? "wood" : /tile/.test(k) ? "tile" : /glass/.test(k) ? "glass" : /marble/.test(k) ? "marble"
      : /metal|steel/.test(k) ? "metal" : /zinc|corrugated/.test(k) ? "zinc" : /mud/.test(k) ? "earth" : /carpet|lino/.test(k) ? "carpet" : "plaster";
    return [mat, ""];
  };
  const colourOf = (re: string) => {
    for (const [cr, hex] of COLOUR_WORDS) { const m = text.match(new RegExp(`${cr.source}[^.,;]{0,12}\\b${re}`, "i")); if (m) return { hex, from: m[0] }; }
    return null;
  };
  const wd = WALL_DEFAULT[type] ?? ["plaster", "#d2c9b4"];
  const fd = FLOOR_DEFAULT[type] ?? ["wood", "#7a5a40"];
  const wm = matOf("walls?"), fm = matOf("floors?");
  const wc = colourOf("walls?"), fc = colourOf("(floor|tiles|carpet)");
  const wall = { mat: wm?.[0] ?? wd[0], colour: wc?.hex ?? wd[1] }, floor = { mat: fm?.[0] ?? fd[0], colour: fc?.hex ?? fd[1] };
  if (wm || wc) note(`walls: ${wall.mat}`, wc?.from ?? text.match(/\b\w+ walls?\b/i)?.[0]);
  if (fm || fc) note(`floor: ${floor.mat}`, fc?.from ?? text.match(/\b\w+ floors?\b/i)?.[0]);

  const objects: string[] = [];
  for (const [re, o] of OBJECT_WORDS) { const m = description.match(re); if (m && !objects.includes(o)) { objects.push(o); note(`has ${o.replace("_", " ")}`, m[0]); } }

  let weather: PlaceSpec["weather"] = "clear";
  if ((w = find(/\b(storm|thunder|lightning)\b/i))) weather = "storm";
  else if ((w = find(/\b(rain|raining|downpour|drizzle|wet|monsoon)\b/i))) weather = "rain";
  else if ((w = find(/\b(fog|foggy|mist|misty|haze|harmattan|smog)\b/i))) weather = /harmattan|dust/i.test(w) ? "dust" : "fog";
  else if ((w = find(/\b(dust|dusty|sandstorm)\b/i))) weather = "dust";
  if (weather !== "clear") note(`weather: ${weather}`, w);
  const t = (time ?? "").toUpperCase();
  const lit: PlaceSpec["lit"] = /NIGHT|EVENING|LATE|MIDNIGHT/.test(t) ? "night" : /DAWN|SUNRISE|EARLY MORNING/.test(t) ? "dawn" : /DUSK|SUNSET|TWILIGHT/.test(t) ? "dusk" : "day";
  let practical: PlaceSpec["practical"] = interior ? (lit === "night" ? "lamp" : "none") : "none";
  if ((w = find(/\b(fluorescent|strip light|tube light)\b/i))) practical = "fluorescent";
  else if ((w = find(/\b(neon)\b/i))) practical = "neon";
  else if ((w = find(/\b(candle|candlelit|lantern|kerosene)\b/i))) practical = "candle";
  else if ((w = find(/\b(fire|bonfire|fireplace|flames)\b/i))) practical = "fire";
  else if (["office", "newsroom", "classroom", "hospital", "cell", "interrogation", "warehouse", "corridor", "shop"].includes(type) && interior) practical = "fluorescent";
  if (w) note(`light: ${practical}`, w);
  return { type, interior, size, wall, floor, condition, wealth, era, objects, weather, lit, practical, evidence };
}
