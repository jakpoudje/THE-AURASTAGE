// Script cast check (owner report 2026-10-03: "why are there so many character mismatch"). The script's speaking cues
// are checked against the story's characters the way screenwriters write them: a cue may be the full name, the first
// name, the surname (NWOSU for Peter Nwosu), or carry a title (PROFESSOR BELLO, HON. TAFIDA). Cues that are roles
// rather than people (REPORTER, PRESIDING OFFICER, YOUNG MAN, OPPOSITION AGENT #1) are walk-on parts, and ALL/VOICES
// are lines said by a group — neither is a mismatch. The story's own list may name groups or places (a party, a region);
// they are shown apart, never as people missing from the script. Pure; never changes the script or the story.

export interface CastCue { name: string; lines: number; scenes: number }
export interface StoryCharacter { name: string; role?: string | null }
export type CueKind = "story" | "named" | "walk_on" | "group";
export interface CueMatch extends CastCue {
  kind: CueKind;
  /** The story character this cue is (kind "story"). */
  story_name: string | null;
  /** How it was matched: the full name, first name, surname, or a name after a title. */
  how: "full" | "first" | "surname" | null;
}
export interface CastMatch {
  cues: CueMatch[];
  /** Story people no cue speaks as yet. */
  silent: string[];
  /** Story entries that are groups or places (a party, a region, an organisation), not speaking parts. */
  not_people: string[];
}

/** Honorifics and titles a cue or a story name may carry; never part of the name itself. */
const TITLES = new Set(["MR", "MRS", "MS", "MISS", "DR", "DOCTOR", "PROF", "PROFESSOR", "HON", "HONOURABLE", "HONORABLE", "CHIEF", "ALHAJI", "ALHAJA",
  "MALLAM", "MALAM", "BARRISTER", "BARR", "SENATOR", "SEN", "GOVERNOR", "GOV", "PRESIDENT", "GENERAL", "GEN", "CAPTAIN", "CAPT", "COLONEL", "COL",
  "MAJOR", "SERGEANT", "SGT", "INSPECTOR", "OFFICER", "JUSTICE", "JUDGE", "PASTOR", "REVEREND", "REV", "FATHER", "BISHOP", "IMAM", "SHEIKH",
  "MAMA", "PAPA", "BABA", "IYA", "AUNTY", "AUNTIE", "UNCLE", "BROTHER", "SISTER", "MADAM", "SIR", "LADY", "LORD", "OBA", "EMIR", "SULTAN", "ENGR", "COMRADE"]);
/** Words that make a cue a role rather than a person (with numbers, #n and acronyms such as ADC or INEC). */
const ROLE_WORDS = new Set(("REPORTER JOURNALIST PRESENTER HOST ANCHOR NEWSREADER ANNOUNCER MODERATOR MC EMCEE PHOTOGRAPHER CAMERAMAN SPEECHWRITER "
  + "OFFICER PRESIDING COLLATION RETURNING POLLING ELECTORAL JUSTICE JUDGE COUNSEL LEAD LAWYER BARRISTER CLERK REGISTRAR ORDERLY CONSTABLE POLICEMAN POLICEWOMAN "
  + "POLICE GUARD SECURITY SOLDIER AGENT AIDE ASSISTANT SECRETARY SPOKESMAN SPOKESWOMAN SPOKESPERSON EMISSARY MESSENGER DRIVER CONDUCTOR CHAIRMAN CHAIRWOMAN "
  + "CHAIR SENATOR GOVERNOR MINISTER COMMISSIONER LEADER MEMBER OFFICIAL DELEGATE SUPPORTER MARCHER PROTESTER VOTER CITIZEN TRADER VENDOR SELLER "
  + "MARKET WOMAN WOMEN WOMEN'S MAN MEN BOY GIRL CHILD KID YOUNG OLD ELDERLY MOTHER FATHER WIFE HUSBAND SON DAUGHTER NEIGHBOUR NEIGHBOR STRANGER FRIEND "
  + "NURSE DOCTOR TEACHER STUDENT PRIEST PASTOR IMAM WAITER WAITRESS RECEPTIONIST ATTENDANT PORTER CHEF COOK FARMER WORKER MECHANIC TAILOR BARBER "
  + "SLICK NERVOUS ANGRY TALL SHORT FIRST SECOND THIRD FOURTH FIFTH OTHER ANOTHER PARTY GOVERNING OPPOSITION RULING PRESIDENTIAL CAMPAIGN NORTH SOUTH "
  + "EAST WEST NORTHERN SOUTHERN NORTH-CENTRAL NORTH-EAST NORTH-WEST SOUTH-EAST SOUTH-WEST SOUTHWEST SOUTHEAST NORTHWEST NORTHEAST CENTRAL IN CAP WITH "
  + "THE OF A AN AND ON AT TV RADIO NEWS STATION BUS TAXI DANFO OKADA RIDER VOICE CROWD").split(/\s+/));
/** Cues said by many at once. */
const GROUP_CUES = new Set(["ALL", "VOICES", "CROWD", "EVERYONE", "BOTH", "CHORUS", "TOGETHER", "OTHERS", "GROUP", "SUPPORTERS", "CHILDREN", "STUDENTS", "THEY"]);
/** Words that make a story entry a group or a place rather than a person. */
const NOT_PERSON = /\b(congress|party|alliance|commission|committee|council|assembly|senate|government|ministry|agency|corporation|company|bank|union|movement|front|coalition|federation|association|league|club|church|mosque|school|university|hospital|court|tribunal|police force|army|navy|state|region|belt|province|district|city|village|town|nation|republic|kingdom|empire|people|community|family|tribe|clan|media|press)\b/i;

const words = (s: string) => s.toUpperCase().replace(/[.,()]/g, " ").split(/\s+/).filter(Boolean);
const nameWords = (s: string) => words(s).filter((w) => !TITLES.has(w.replace(/\.$/, "")));
const isRoleWord = (w: string) => ROLE_WORDS.has(w) || /^#?\d+$/.test(w) || /^[A-Z]{2,4}$/.test(w) && !/[AEIOU]/.test(w.slice(1)) || /^#\d+$/.test(w);

/** Whether a story entry is a group or a place (from its name; its role is not used — a story may call a party "supporting"). */
export function isNotPerson(name: string) {
  return NOT_PERSON.test(name);
}

export function matchScriptCast(cues: CastCue[], story: StoryCharacter[]): CastMatch {
  const people = story.filter((s) => !isNotPerson(s.name));
  const not_people = story.filter((s) => isNotPerson(s.name)).map((s) => s.name);
  const taken = new Set<string>();
  const out: CueMatch[] = cues.map((c) => ({ ...c, kind: "named", story_name: null, how: null }));
  const assign = (m: CueMatch, s: StoryCharacter, how: CueMatch["how"]) => { m.kind = "story"; m.story_name = s.name; m.how = how; taken.add(s.name); };

  // 1. Full name, then first name (titles ignored on both sides).
  for (const m of out) {
    const cw = nameWords(m.name).join(" ");
    const s = people.find((p) => !taken.has(p.name) && nameWords(p.name).join(" ") === cw);
    if (s && cw) assign(m, s, "full");
  }
  for (const m of out.filter((x) => x.kind !== "story")) {
    const cw = nameWords(m.name);
    if (cw.length !== 1) continue;
    const hits = people.filter((p) => !taken.has(p.name) && nameWords(p.name)[0] === cw[0]);
    if (hits.length === 1) assign(m, hits[0], "first");
  }
  // 2. Surname — only when exactly one story person not already speaking under another cue has it (NWOSU is Peter
  //    Nwosu once CHIAMAKA is Chiamaka Nwosu). A titled cue counts too (PROFESSOR BELLO, GOVERNOR KAURA).
  for (const m of out.filter((x) => x.kind !== "story")) {
    const cw = nameWords(m.name);
    if (!cw.length || cw.length > 2) continue;
    const last = cw[cw.length - 1];
    const hits = people.filter((p) => { const pw = nameWords(p.name); return !taken.has(p.name) && pw.length > 1 && pw[pw.length - 1] === last; });
    if (hits.length === 1 && (cw.length === 1 || nameWords(hits[0].name)[0] === cw[0])) assign(m, hits[0], "surname");
  }
  // 3. What is left: lines said by a group, walk-on roles, or named people the story doesn't have.
  for (const m of out.filter((x) => x.kind !== "story")) {
    const w = words(m.name);
    if (w.length === 1 && GROUP_CUES.has(w[0])) m.kind = "group";
    else if (w.every(isRoleWord)) m.kind = "walk_on";
  }
  const spoken = new Set(out.filter((m) => m.story_name).map((m) => m.story_name));
  return { cues: out, silent: people.filter((p) => !spoken.has(p.name)).map((p) => p.name), not_people };
}
