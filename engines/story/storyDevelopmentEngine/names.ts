// People the writer has already named in their own words (logline, synopsis), and name matching that treats
// "Justice Idongesit Bassey" and "Idongesit Bassey" as the same person. Deterministic; names are read as the writer
// wrote them — never invented, never judged by where they come from.

/** Titles and honorifics a writer may put before a name (they don't change who the person is). */
const TITLES = new Set([
  "mr", "mrs", "ms", "miss", "mx", "dr", "prof", "professor", "sir", "dame", "lady", "lord", "chief", "justice", "judge", "barrister",
  "hon", "honourable", "honorable", "senator", "governor", "president", "minister", "general", "gen", "colonel", "col", "major", "captain",
  "capt", "lieutenant", "lt", "sergeant", "sgt", "officer", "detective", "det", "inspector", "commissioner", "father", "fr", "pastor",
  "reverend", "rev", "bishop", "imam", "alhaji", "alhaja", "mallam", "oba", "obi", "emir", "sheikh", "king", "queen", "prince", "princess",
  "aunty", "auntie", "uncle", "mama", "papa", "baba", "nurse", "agent", "coach", "madam", "madame", "señor", "señora", "don", "doña",
]);
/** Capitalised words that start or belong to names of things, not people (organisations, places, sentence words). */
const NOT_PEOPLE = new Set([
  "the", "a", "an", "when", "after", "before", "as", "in", "on", "at", "during", "while", "but", "and", "or", "if", "with", "from", "to", "of",
  "national", "federal", "state", "independent", "electoral", "commission", "court", "supreme", "high", "appeal", "university", "college",
  "school", "hospital", "bank", "company", "corporation", "group", "party", "ministry", "department", "agency", "police", "army", "navy",
  "force", "street", "road", "avenue", "city", "island", "river", "lake", "mountain", "north", "south", "east", "west", "central", "new",
  "republic", "kingdom", "united", "nations", "union", "council", "assembly", "house", "senate", "office", "server", "system", "network",
  "day", "days", "night", "election", "elections", "act", "chapter", "part", "one", "two", "three", "christmas", "easter", "ramadan",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december", "internet", "wi-fi", "tv", "radio", "news", "times", "post",
]);

const WORD = /^[\p{Lu}][\p{L}\p{M}'’-]*$/u;
const norm = (w: string) => w.toLowerCase().replace(/[.’']/g, "").replace(/’/g, "");

/** The words of a name that identify the person (leading titles and punctuation dropped), lower case. "Obi" is a
 *  title before a name ("Obi of Onitsha") but a surname after one ("Emeka Obi"), so only leading titles are dropped. */
export function nameTokens(name: string): string[] {
  const words = name.split(/[\s,]+/).map((w) => norm(w.replace(/[.,;:!?()"]/g, ""))).filter(Boolean);
  let i = 0;
  while (i < words.length - 1 && TITLES.has(words[i])) i++;
  return words.slice(i);
}

/**
 * The same person: every identifying word of one name appears in the other, and the shorter one still has at least
 * two words (so "Bassey" alone never matches "Idongesit Bassey", but "Idongesit Bassey" matches "Justice Idongesit Bassey").
 */
export function samePerson(a: string, b: string): boolean {
  const x = nameTokens(a), y = nameTokens(b);
  if (!x.length || !y.length) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short.length < 2 && long.length >= 2) return short.join(" ") === long.join(" ");
  return short.every((w) => long.includes(w));
}

/**
 * Full names of people in a piece of the writer's text: an optional title, then two to four capitalised words
 * ("Justice Idongesit Bassey", "Preye Amakiri"). Names of organisations and places are left out.
 */
export function namedPeople(text: string | null | undefined): string[] {
  if (!text) return [];
  const words = text.replace(/[“”"()]/g, " ").split(/\s+/);
  const out: string[] = [];
  let run: string[] = [];
  let before = ""; // the word before the current run ("in Port Harcourt" is a place, not a person)
  const PLACE_WORDS = new Set(["in", "at", "from", "to", "across", "near", "into", "outside", "inside", "through", "around"]);
  const flush = () => {
    const titled = run.length > 1 && TITLES.has(norm(run[0]));
    const core = titled ? run.slice(1) : run;
    const place = !titled && PLACE_WORDS.has(before);
    if (!place && core.length >= 2 && core.length <= 4) out.push(run.join(" "));
    run = [];
  };
  for (const raw of words) {
    const endsClause = /[,.;:!?]$/.test(raw);
    const w = raw.replace(/[,.;:!?]+$/, "").replace(/['’]s$/, "");
    if (WORD.test(w) && w.length > 1 && !NOT_PEOPLE.has(norm(w))) {
      run.push(w);
      if (endsClause) { flush(); before = ""; }
    } else {
      flush();
      before = norm(w);
    }
  }
  flush();
  // Keep the fullest form of each person ("Justice Idongesit Bassey" over a later "Idongesit Bassey").
  const kept: string[] = [];
  for (const n of out.sort((a, b) => nameTokens(b).length + (b.length / 1000) - (nameTokens(a).length + a.length / 1000))) if (!kept.some((k) => samePerson(k, n))) kept.push(n);
  return kept.sort((a, b) => text.indexOf(a) - text.indexOf(b));
}
