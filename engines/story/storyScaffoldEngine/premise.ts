// Reading the brief: who is in it, what they want, what stands in the way, what is at stake, by when, where, and what it
// is about. Only what the writer's words say — anything missing is filled later and listed as an assumption.

export interface PremisePerson { name: string; descriptor: string | null; age: number | null; relation: string | null; relation_to: string | null; title: string | null; absent: boolean }
export interface Premise {
  people: PremisePerson[];
  goal: string | null;        // "expose the rigged election"
  obstacle: string | null;    // "a powerful governor who will kill to win"
  stakes: string | null;      // "or the country falls"
  deadline: string | null;    // "before the polls close"
  inciting: string | null;    // "when her brother vanishes"
  places: string[];           // "NEWSROOM", "HARBOUR"…
  themes: string[];
  sentences: string[];
}

const TITLES = /^(Governor|Senator|Minister|President|General|Chief|Officer|Detective|Inspector|Captain|Professor|Doctor|Dr|Mr|Mrs|Ms|Madam|Sir|Pastor|Father|Sister|Mama|Papa|Aunt|Uncle|Judge|Commissioner|Alhaji|Alhaja|Oba|King|Queen|Prince|Princess|Lady|Lord)\s+/;
const ABSENT = /\b(vanish(?:es|ed)?|disappear(?:s|ed)?|goes missing|went missing|is missing|is kidnapped|was kidnapped|is abducted|was abducted|is taken|was taken|is murdered|was murdered|is killed|was killed|dies|died)\b/i;
const STOP = new Set(("The A An And But Or When While As After Before In On At Of For To With From By Into Over Under Then Now One Two Three His Her Their Its This That These Those " +
  "She He They We You I It Mr Mrs Ms Dr Sir Madam Act Scene Day Night Morning Evening INT EXT Chief Officer Detective Inspector Governor President Senator Minister " +
  "God Lord Lady King Queen Prince Princess Captain General Professor Father Mother Mama Papa Aunt Uncle Brother Sister Christmas Easter Monday Tuesday Wednesday Thursday " +
  "Friday Saturday Sunday January February March April May June July August September October November December").split(/\s+/));
const RELATION = /\b(?:[Hh]er|[Hh]is|[Tt]heir|[Tt]he)\s+(estranged\s+|younger\s+|older\s+|late\s+|twin\s+|best\s+|former\s+|ex-)?(brother|sister|mother|father|son|daughter|wife|husband|fianc[ée]e?|lover|partner|mentor|boss|friend|cousin|uncle|aunt|grandmother|grandfather|rival|editor|lawyer|colleague)\s*,?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g;
const DESCRIBED = /\b((?:(?:Governor|Senator|Minister|President|General|Chief|Detective|Inspector|Captain|Professor|Doctor|Dr|Pastor|Judge|Commissioner|Alhaji|Oba|King|Queen)\s+)?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*(?:\((\d{1,3})\))?\s*,\s*(?:a|an|the)\s+([^,.;:]{3,80})/g;
const AGE_ONLY = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*\((\d{1,3})\)/g;
const GOAL = /\b(?:must|has to|needs to|wants to|tries to|sets out to|fights to|struggles to|races to|vows to|sets out on a quest to|determined to|desperate to|plans to|is forced to)\s+([^.;:]{4,160}?)(?=\s+(?:before|but|while|when|as|until|even|or else|or|despite|against)\b|[.;:,]|$)/i;
const OBSTACLE = /\b(?:but|against|despite|while|as)\s+([^.;:]{6,160}?)(?=[.;:]|$)/i;
const STAKES = /\b(?:or else|or|otherwise|before it'?s too late,?|if (?:she|he|they) fails?,?)\s+((?:the|her|his|their|everything|everyone|a|an)\b[^.;:]{4,140}?)(?=[.;:]|$)/i;
const DEADLINE = /\b(before|by|within|until)\s+((?:the|dawn|midnight|sunrise|sunset|election|polls|morning|nightfall|\d+)(?:(?!\s+(?:but|and|while)\b|\s+[—-]\s)[^.,;:—]){0,60})/i;
const INCITING = /\b(?:when|after|once)\s+([^.,;:]{6,140})/i;

const PLACE_WORDS: [RegExp, string][] = [
  [/\bnewsroom|newspaper|paper's office\b/i, "NEWSROOM"], [/\bharbou?r|port|docks?|jetty\b/i, "HARBOUR"], [/\bchurch|cathedral\b/i, "CHURCH"], [/\bmosque\b/i, "MOSQUE"],
  [/\bmarket\b/i, "MARKET"], [/\bhospital|clinic\b/i, "HOSPITAL"], [/\bpolice station|precinct\b/i, "POLICE STATION"], [/\bcourt(?:room| house)?\b/i, "COURTROOM"],
  [/\bprison|jail|cell\b/i, "PRISON"], [/\bschool|university|campus\b/i, "SCHOOL"], [/\bvillage\b/i, "VILLAGE"], [/\bfarm\b/i, "FARM"], [/\bwarehouse\b/i, "WAREHOUSE"],
  [/\bpolling (?:station|unit)|ballot\b/i, "POLLING STATION"], [/\bcampaign\b/i, "CAMPAIGN HEADQUARTERS"], [/\bgovernment house|state house|palace\b/i, "GOVERNMENT HOUSE"],
  [/\bbar|club|nightclub\b/i, "BAR"], [/\brestaurant|canteen|buka|cafe\b/i, "RESTAURANT"], [/\boffice\b/i, "OFFICE"], [/\bhotel\b/i, "HOTEL"], [/\bairport\b/i, "AIRPORT"],
  [/\bbeach|shore|coast\b/i, "BEACH"], [/\bforest|bush\b/i, "FOREST"], [/\bdesert\b/i, "DESERT"], [/\bmine\b/i, "MINE"], [/\bship|boat|ferry\b/i, "BOAT"],
  [/\bstadium|pitch\b/i, "STADIUM"], [/\blab(?:oratory)?\b/i, "LABORATORY"], [/\bstudio\b/i, "STUDIO"], [/\bbank\b/i, "BANK"], [/\bmansion|estate\b/i, "MANSION"],
];
const THEMES: [RegExp, string][] = [
  [/\bcorrupt|brib|rigg|fraud|embezzl/i, "Corruption and the price of truth"], [/\belection|vote|democra|power|govern/i, "Power and who holds it"],
  [/\bfamily|brother|sister|mother|father|son|daughter/i, "Family loyalty"], [/\blove|romance|marr|heart/i, "Love and what it costs"],
  [/\bjustice|law|court|innocent|guilty/i, "Justice"], [/\bsurviv|escape|war|disaster/i, "Survival"], [/\bbetray|secret|lie|deceiv/i, "Betrayal and trust"],
  [/\bidentity|who (?:she|he) is|roots|heritage|exile|home/i, "Identity and belonging"], [/\bgreed|money|rich|poor|debt/i, "Greed and class"],
  [/\bfaith|god|church|belief/i, "Faith and doubt"], [/\bfear|ghost|curse|haunt/i, "Fear and the past"], [/\bfreedom|oppress|protest|revolution/i, "Freedom"],
  [/\bambition|dream|success|fame/i, "Ambition"], [/\bgrief|loss|death|mourn/i, "Grief"], [/\brevenge|vengeance/i, "Revenge"],
];
const clean = (s: string) => s.replace(/\s+/g, " ").trim().replace(/[,;:]$/, "");

export function readPremise(text: string): Premise {
  const t = text.replace(/\s+/g, " ").trim();
  const people = new Map<string, PremisePerson>();
  const add = (rawName: string, p: Partial<PremisePerson>) => {
    const tm = clean(rawName).match(TITLES);
    const n = clean(rawName).replace(TITLES, "");
    if (tm) p = { ...p, title: tm[1] };
    const first = n.split(" ")[0];
    if (!n || STOP.has(first) || n.length < 2) return;
    const key = [...people.keys()].find((k) => k.split(" ")[0] === first || first === k) ?? n;
    const cur = people.get(key) ?? { name: n, descriptor: null, age: null, relation: null, relation_to: null, title: null, absent: false };
    if (n.length > cur.name.length && n.startsWith(cur.name.split(" ")[0])) cur.name = n;
    for (const [k, v] of Object.entries(p)) if (v != null && (cur as any)[k] == null) (cur as any)[k] = v;
    people.set(key, cur);
  };
  for (const m of t.matchAll(DESCRIBED)) add(m[1], { descriptor: clean(m[3]), age: m[2] ? Number(m[2]) : null });
  for (const m of t.matchAll(AGE_ONLY)) add(m[1], { age: Number(m[2]) });
  // "her brother Tunde": the relation is to the person the sentence is about (the nearest named person before it).
  for (const m of t.matchAll(RELATION)) {
    const before = [...people.values()].filter((p) => t.indexOf(p.name) >= 0 && t.indexOf(p.name) < (m.index ?? 0)).sort((a, b) => t.indexOf(b.name) - t.indexOf(a.name))[0];
    add(m[3], { relation: `${(m[1] ?? "").trim() ? `${m[1].trim()} ` : ""}${m[2]}`, relation_to: before?.name ?? null });
  }
  // Someone who vanishes, is taken or dies in the premise is what's at stake, not who walks beside the hero.
  for (const sen of t.split(/(?<=[.!?])\s+/)) if (ABSENT.test(sen)) for (const p of people.values()) {
    const at = sen.indexOf(p.name), v = sen.search(ABSENT);
    if (at >= 0 && at < v && v - at < 60) p.absent = true;
  }
  const pick = (re: RegExp, g = 1) => { const m = t.match(re); return m ? clean(m[g] ?? m[1]) : null; };
  const deadlineM = t.match(DEADLINE);
  return {
    people: [...people.values()].slice(0, 20),
    goal: pick(GOAL),
    obstacle: pick(OBSTACLE),
    stakes: pick(STAKES),
    deadline: deadlineM ? clean(`${deadlineM[1]} ${deadlineM[2]}`) : null,
    inciting: pick(INCITING),
    places: [...new Set(PLACE_WORDS.filter(([re]) => re.test(t)).map(([, p]) => p))],
    themes: [...new Set(THEMES.filter(([re]) => re.test(t)).map(([, th]) => th))].slice(0, 6),
    sentences: t.split(/(?<=[.!?])\s+/).filter(Boolean),
  };
}
