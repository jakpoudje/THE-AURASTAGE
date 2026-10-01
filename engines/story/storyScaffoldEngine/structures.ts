// Genre structures. Each beat sits at a share of the runtime, belongs to a thread — A (the protagonist's goal), B (the
// relationship that carries the theme) or C (the antagonist's own plan, which moves even when the hero doesn't) — and is
// written from the story's own facts. Set-ups planted early are paid off in the last act.

export interface Ctx {
  P: string; A: string; B: string; M: string;           // protagonist, antagonist, B-story person, mentor/ally
  goal: string; obstacle: string; stakes: string; deadline: string | null; inciting: string;
  place: string; flaw: string; need: string; theme: string; plant: string; lie: string;
}
export interface BeatDef { act: number; pct: number; title: string; thread: "A" | "B" | "C"; text: (c: Ctx) => string; night?: boolean }
export type Family = "thriller" | "romance" | "horror" | "comedy" | "drama";

const by = (c: Ctx) => (c.deadline ? ` — and the clock is running: ${c.deadline}` : "");

const THRILLER: BeatDef[] = [
  { act: 1, pct: 0, thread: "A", title: "Opening image", text: (c) => `${c.place}. ${c.P} at work, good at it and alone in it — the ${c.flaw} that will cost them later is already showing. We glimpse ${c.plant}, which seems to mean nothing yet.` },
  { act: 1, pct: 0.06, thread: "C", title: "The machine at work", text: (c) => `${c.A} in private: the plan is already in motion. We see how far ${c.A} will go — and that ${c.obstacle}.`, night: true },
  { act: 1, pct: 0.11, thread: "A", title: "Inciting incident", text: (c) => `${cap(c.inciting)}. For ${c.P} it is personal now: ${c.P} must ${c.goal}${by(c)}.` },
  { act: 1, pct: 0.17, thread: "B", title: "The relationship", text: (c) => `${c.B} pushes back — ${c.B} sees the ${c.flaw} in ${c.P} and says so. Their bond, and what it could cost, is set up here.` },
  { act: 1, pct: 0.22, thread: "A", title: "Point of no return", text: (c) => `${c.P} chooses to go after it, against ${c.M}'s advice. Crossing that line makes ${c.P} a target.` },
  { act: 2, pct: 0.28, thread: "A", title: "First lead", text: (c) => `${c.P} follows the first lead and gets a real piece of the truth — and a warning from someone too frightened to say more.` },
  { act: 2, pct: 0.34, thread: "C", title: "Counter-move", text: (c) => `${c.A} learns someone is digging and moves first: evidence disappears, a door closes, a friend of ${c.P}'s is leaned on.`, night: true },
  { act: 2, pct: 0.4, thread: "B", title: "Closer", text: (c) => `${c.P} and ${c.B} work together; a moment of trust. ${c.P} almost admits the ${c.flaw} — almost.` },
  { act: 2, pct: 0.5, thread: "A", title: "Midpoint reversal", text: (c) => `A false victory turns: ${c.P} gets what looked like proof — and learns the plan is bigger than imagined. What's at stake is now plain: ${c.stakes}.`, night: true },
  { act: 2, pct: 0.58, thread: "C", title: "The net tightens", text: (c) => `${c.A} turns ${c.P}'s own methods against them: ${c.P} is discredited, followed, made to look like the problem.` },
  { act: 2, pct: 0.65, thread: "B", title: "Betrayal or break", text: (c) => `Under the pressure, ${c.P}'s ${c.flaw} breaks the relationship: ${c.B} walks away — or is taken.` },
  { act: 2, pct: 0.73, thread: "A", title: "All is lost", text: (c) => `${c.P} loses the evidence, the ally and the cover. ${c.A} seems to have won. The lie ${c.P} has believed — "${c.lie}" — is exposed.`, night: true },
  { act: 2, pct: 0.78, thread: "A", title: "Dark night", text: (c) => `Alone, ${c.P} faces what ${c.M} said at the start, and understands the need: ${c.need}.`, night: true },
  { act: 3, pct: 0.83, thread: "A", title: "New plan", text: (c) => `${c.P} turns the flaw around — and remembers ${c.plant}. It was the key all along. ${c.P} goes back for ${c.B}.` },
  { act: 3, pct: 0.89, thread: "C", title: "Confrontation", text: (c) => `Face to face with ${c.A} at the worst possible moment. ${c.P} risks everything that was protected before.`, night: true },
  { act: 3, pct: 0.95, thread: "A", title: "Climax and pay-off", text: (c) => `${cap(c.plant)} pays off: the truth comes out where no one can bury it. ${c.A} falls — at a real cost to ${c.P}.` },
  { act: 3, pct: 0.98, thread: "B", title: "Final image", text: (c) => `${c.P} and ${c.B}, changed. ${c.place} looks the same, but ${c.P} doesn't stand in it the same way. The theme: ${c.theme.toLowerCase()}.` },
];
const ROMANCE: BeatDef[] = [
  { act: 1, pct: 0, thread: "A", title: "Opening image", text: (c) => `${c.place}. ${c.P}'s life is ordered and guarded; the ${c.flaw} keeps everyone at arm's length. ${cap(c.plant)} sits on the shelf, unexplained.` },
  { act: 1, pct: 0.09, thread: "B", title: "Meet", text: (c) => `${c.P} and ${c.B} collide — the wrong first impression, sparks either way.` },
  { act: 1, pct: 0.16, thread: "A", title: "The want", text: (c) => `${c.P} must ${c.goal}${by(c)}; ${c.B} is in the way of it, or the way to it.` },
  { act: 1, pct: 0.24, thread: "C", title: "The obstacle", text: (c) => `What stands between them: ${c.obstacle}. ${c.A} has their own reasons to keep them apart.` },
  { act: 2, pct: 0.32, thread: "B", title: "Forced together", text: (c) => `Circumstance throws ${c.P} and ${c.B} together; they find each other funny, then surprising.` },
  { act: 2, pct: 0.42, thread: "B", title: "Falling", text: (c) => `A night that changes things. ${c.P} lets ${c.B} see the real person.`, night: true },
  { act: 2, pct: 0.5, thread: "A", title: "Midpoint: together", text: (c) => `They are together — and it is better than ${c.P} imagined. What's at stake (${c.stakes}) seems far away.` },
  { act: 2, pct: 0.6, thread: "C", title: "The secret", text: (c) => `${c.A} brings out the thing ${c.P} has hidden; the ${c.flaw} comes back.` },
  { act: 2, pct: 0.72, thread: "B", title: "Break-up", text: (c) => `The relationship breaks. ${c.P} retreats into "${c.lie}".`, night: true },
  { act: 2, pct: 0.79, thread: "A", title: "Dark night", text: (c) => `${c.M} tells ${c.P} the truth about the ${c.flaw}. ${c.P} sees the need: ${c.need}.` },
  { act: 3, pct: 0.86, thread: "A", title: "Grand gesture", text: (c) => `${c.P} risks the thing protected all along — ${c.plant} finally explained — and goes to ${c.B}.` },
  { act: 3, pct: 0.94, thread: "B", title: "Together, changed", text: (c) => `${c.B} answers. The obstacle is still there; they face it together.` },
  { act: 3, pct: 0.98, thread: "A", title: "Final image", text: (c) => `${c.place} again — the same place, an open door this time. The theme: ${c.theme.toLowerCase()}.` },
];
const HORROR: BeatDef[] = [
  { act: 1, pct: 0, thread: "A", title: "Opening image", text: (c) => `${c.place}. Ordinary life — with something slightly wrong in it. ${cap(c.plant)} is noticed and dismissed.` },
  { act: 1, pct: 0.08, thread: "C", title: "First sign", text: (c) => `Something happens that can't be explained; ${c.A} is near, unseen.`, night: true },
  { act: 1, pct: 0.15, thread: "A", title: "Inciting incident", text: (c) => `${cap(c.inciting)}. ${c.P} must ${c.goal}${by(c)}.` },
  { act: 1, pct: 0.24, thread: "B", title: "Disbelief", text: (c) => `${c.B} doesn't believe ${c.P}; the ${c.flaw} makes ${c.P} easy to doubt.` },
  { act: 2, pct: 0.32, thread: "C", title: "Escalation", text: (c) => `The second sign is worse and leaves a mark. ${c.obstacle}.`, night: true },
  { act: 2, pct: 0.42, thread: "A", title: "Investigation", text: (c) => `${c.P} digs into the history with ${c.M}: it has happened before, and ${c.plant} was there then too.` },
  { act: 2, pct: 0.5, thread: "C", title: "Midpoint: it's real", text: (c) => `${c.A} shows itself. No one can deny it now — at risk: ${c.stakes}.`, night: true },
  { act: 2, pct: 0.62, thread: "B", title: "Taken", text: (c) => `${c.B} is taken or turned. The ${c.flaw} made ${c.P} too late.`, night: true },
  { act: 2, pct: 0.74, thread: "A", title: "All is lost", text: (c) => `${c.M} falls; ${c.P} is alone with it. The lie — "${c.lie}" — breaks.`, night: true },
  { act: 3, pct: 0.84, thread: "A", title: "Facing it", text: (c) => `${c.P} understands the need — ${c.need} — and uses ${c.plant}.` },
  { act: 3, pct: 0.93, thread: "C", title: "Final confrontation", text: (c) => `${c.P} against ${c.A}, at its source. A terrible price is paid.`, night: true },
  { act: 3, pct: 0.98, thread: "A", title: "Final image", text: (c) => `Morning in ${c.place}. Quiet — almost. The theme: ${c.theme.toLowerCase()}.` },
];
const COMEDY: BeatDef[] = [
  { act: 1, pct: 0, thread: "A", title: "Opening image", text: (c) => `${c.place}. ${c.P}'s ${c.flaw} on full display, causing a small disaster. ${cap(c.plant)} is introduced as a running joke.` },
  { act: 1, pct: 0.1, thread: "A", title: "The scheme", text: (c) => `${cap(c.inciting)}: ${c.P} must ${c.goal}${by(c)} — and has a terrible plan.` },
  { act: 1, pct: 0.2, thread: "B", title: "The partner", text: (c) => `${c.B} is dragged in; they want completely different things.` },
  { act: 2, pct: 0.3, thread: "C", title: "Complication", text: (c) => `${c.A} gets in the way: ${c.obstacle}.` },
  { act: 2, pct: 0.42, thread: "A", title: "Fun and games", text: (c) => `The plan almost works, spectacularly badly; the lies stack up.` },
  { act: 2, pct: 0.5, thread: "B", title: "Midpoint win", text: (c) => `A win that ${c.P} and ${c.B} earned together — and a real moment between them.`, night: true },
  { act: 2, pct: 0.62, thread: "C", title: "It all unravels", text: (c) => `${c.A} discovers the truth at the worst moment; everything is at risk: ${c.stakes}.` },
  { act: 2, pct: 0.74, thread: "B", title: "Falling out", text: (c) => `${c.B} walks; ${c.P}'s ${c.flaw} is to blame. "${c.lie}" stops being funny.` },
  { act: 3, pct: 0.84, thread: "A", title: "Owning it", text: (c) => `${c.P} sees the need — ${c.need} — and the running joke (${c.plant}) becomes the answer.` },
  { act: 3, pct: 0.94, thread: "A", title: "The big finish", text: (c) => `Everyone in one room; ${c.P} makes it right, publicly and badly, and it works.` },
  { act: 3, pct: 0.98, thread: "B", title: "Final image", text: (c) => `${c.P} and ${c.B} in ${c.place}, the same and different. The theme: ${c.theme.toLowerCase()}.` },
];
const DRAMA: BeatDef[] = [
  { act: 1, pct: 0, thread: "A", title: "Opening image", text: (c) => `${c.place}. ${c.P}'s everyday life, held together by the ${c.flaw}. ${cap(c.plant)} is there in the background.` },
  { act: 1, pct: 0.08, thread: "B", title: "The people", text: (c) => `${c.B} and ${c.P}: love with an old wound in it. ${c.M} sees more than they say.` },
  { act: 1, pct: 0.12, thread: "A", title: "Inciting incident", text: (c) => `${cap(c.inciting)}. ${c.P} must ${c.goal}${by(c)}.` },
  { act: 1, pct: 0.22, thread: "A", title: "The choice", text: (c) => `${c.P} decides, at a cost; ${c.A} — or what ${c.A} stands for — is the wall: ${c.obstacle}.` },
  { act: 2, pct: 0.3, thread: "A", title: "Trying", text: (c) => `${c.P} tries the old way. It half works.` },
  { act: 2, pct: 0.4, thread: "C", title: "Pressure", text: (c) => `${c.A} pushes back; the world doesn't bend to ${c.P}.` },
  { act: 2, pct: 0.5, thread: "B", title: "Midpoint truth", text: (c) => `${c.B} tells ${c.P} the thing no one says; what's at stake becomes real: ${c.stakes}.`, night: true },
  { act: 2, pct: 0.6, thread: "A", title: "Getting worse", text: (c) => `The ${c.flaw} makes it worse; ${c.P} pushes away the people trying to help.` },
  { act: 2, pct: 0.72, thread: "B", title: "The break", text: (c) => `${c.B} and ${c.P} break. "${c.lie}" — ${c.P} says it out loud and hears how it sounds.`, night: true },
  { act: 2, pct: 0.78, thread: "A", title: "Lowest point", text: (c) => `Alone. ${c.M}'s words come back; ${c.P} understands the need: ${c.need}.`, night: true },
  { act: 3, pct: 0.85, thread: "A", title: "The new way", text: (c) => `${c.P} acts differently — ${c.plant} finally means something — and goes to ${c.B}.` },
  { act: 3, pct: 0.93, thread: "C", title: "Climax", text: (c) => `${c.P} faces ${c.A} with nothing hidden. Not everything is won; what matters is.` },
  { act: 3, pct: 0.98, thread: "B", title: "Final image", text: (c) => `${c.P} and ${c.B} in ${c.place}, changed. The theme: ${c.theme.toLowerCase()}.` },
];

export const STRUCTURES: Record<Family, { name: string; beats: BeatDef[] }> = {
  thriller: { name: "Thriller structure: A-story investigation, B-story relationship, the antagonist's counter-plan, midpoint reversal, all-is-lost, plant and pay-off", beats: THRILLER },
  romance: { name: "Romance structure: meet, falling, midpoint together, the secret, break-up, grand gesture", beats: ROMANCE },
  horror: { name: "Horror structure: first sign, escalation, investigation, it's real, all is lost, final confrontation", beats: HORROR },
  comedy: { name: "Comedy structure: the scheme, complication, fun and games, unravelling, owning it, the big finish", beats: COMEDY },
  drama: { name: "Drama structure: the wound, the choice, pressure, midpoint truth, the break, the new way", beats: DRAMA },
};
export function familyOf(genre: string | null): Family {
  const g = (genre ?? "").toLowerCase();
  if (/thrill|crime|mystery|noir|action|war|heist|spy|political|science|sci-fi|adventure/.test(g)) return "thriller";
  if (/romance|romantic|love/.test(g)) return "romance";
  if (/horror|supernatural|ghost/.test(g)) return "horror";
  if (/comedy|satire|farce/.test(g)) return "comedy";
  return "drama";
}
export const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
