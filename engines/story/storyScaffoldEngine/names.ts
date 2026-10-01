// Names for characters the writer hasn't named yet, chosen to fit where the story is set (never the other way round:
// nothing about a person is inferred from a name). Every name comes with why it fits; the writer renames freely.
import { REGIONS } from "../../character/storyAccentEngine/regions";

const BANKS: Record<string, { label: string; first: string[]; last: string[] }> = {
  "ng-lagos": { label: "Yoruba names, common in Lagos and the south-west", first: ["Adebayo", "Folake", "Kunle", "Yetunde", "Segun", "Bisola", "Tayo", "Morayo", "Dapo", "Iyabo", "Gbenga", "Remi"], last: ["Adeyemi", "Ogunleye", "Balogun", "Adewale", "Oyelaran", "Akinola", "Fashola", "Oduya"] },
  "ng-east": { label: "Igbo names, common in the south-east", first: ["Chidi", "Ngozi", "Emeka", "Adaeze", "Obinna", "Chiamaka", "Ikenna", "Uchenna", "Nnamdi", "Ifeoma", "Kelechi", "Amaka"], last: ["Okonkwo", "Eze", "Nwosu", "Okafor", "Obi", "Uzor", "Nnadi", "Chukwu"] },
  "ng-north": { label: "Hausa names, common in the north", first: ["Musa", "Aisha", "Ibrahim", "Zainab", "Sani", "Hauwa", "Bello", "Hadiza", "Usman", "Fatima", "Yusuf", "Halima"], last: ["Abubakar", "Danjuma", "Lawal", "Garba", "Shehu", "Yakubu", "Bala", "Umar"] },
  ng: { label: "names from across Nigeria", first: ["Tunde", "Ngozi", "Ibrahim", "Funmi", "Emeka", "Zainab", "Kunle", "Chiamaka", "Musa", "Bisi", "Obinna", "Halima"], last: ["Adeyemi", "Okonkwo", "Abubakar", "Balogun", "Eze", "Danjuma", "Ogunleye", "Nwosu"] },
  gh: { label: "Akan and Ga names, common in Ghana", first: ["Kwame", "Ama", "Kofi", "Akosua", "Yaw", "Abena", "Kwesi", "Efua", "Nii", "Adjoa", "Kojo", "Esi"], last: ["Mensah", "Owusu", "Boateng", "Asante", "Tetteh", "Quaye", "Addo", "Ofori"] },
  ke: { label: "names common in Kenya", first: ["Wanjiru", "Otieno", "Achieng", "Kamau", "Njeri", "Kipchoge", "Akinyi", "Mwangi", "Wambui", "Omondi", "Chebet", "Kiprono"], last: ["Odhiambo", "Kariuki", "Ochieng", "Mutua", "Wekesa", "Njoroge", "Kiplagat", "Waweru"] },
  za: { label: "names common in South Africa", first: ["Thabo", "Lerato", "Sipho", "Nomvula", "Themba", "Zanele", "Bongani", "Naledi", "Mandla", "Thandiwe", "Pieter", "Anele"], last: ["Nkosi", "Dlamini", "Mokoena", "Khumalo", "van der Merwe", "Ndlovu", "Mahlangu", "Botha"] },
  gb: { label: "names common in Britain", first: ["Oliver", "Grace", "Harry", "Eleanor", "Callum", "Priya", "Thomas", "Isla", "Jamal", "Freya", "George", "Zara"], last: ["Hughes", "Patel", "Clarke", "Walsh", "Okoro", "Bennett", "Harrison", "Shah"] },
  ie: { label: "names common in Ireland", first: ["Cian", "Aoife", "Darragh", "Siobhán", "Ciarán", "Niamh", "Eoin", "Saoirse", "Fionn", "Róisín", "Liam", "Clodagh"], last: ["Murphy", "O'Brien", "Byrne", "Kelly", "Doyle", "Quinn", "Walsh", "Gallagher"] },
  fr: { label: "names common in France", first: ["Camille", "Julien", "Léa", "Antoine", "Inès", "Mathieu", "Chloé", "Karim", "Manon", "Hugo", "Amina", "Théo"], last: ["Martin", "Bernard", "Dubois", "Moreau", "Laurent", "Haddad", "Girard", "Lefèvre"] },
  es: { label: "names common in Spain", first: ["Lucía", "Javier", "Carmen", "Diego", "Elena", "Pablo", "Marta", "Sergio", "Nuria", "Álvaro", "Inés", "Raúl"], last: ["García", "Fernández", "López", "Martínez", "Sánchez", "Romero", "Navarro", "Torres"] },
  it: { label: "names common in Italy", first: ["Giulia", "Marco", "Chiara", "Luca", "Francesca", "Matteo", "Sofia", "Davide", "Elena", "Alessandro", "Martina", "Paolo"], last: ["Rossi", "Russo", "Ferrari", "Esposito", "Bianchi", "Romano", "Colombo", "Ricci"] },
  default: { label: "names chosen to be distinct and easy to tell apart", first: ["Maya", "Daniel", "Rosa", "Samuel", "Leila", "Marcus", "Hana", "Victor", "Nadia", "Elias", "Iris", "Jonah"], last: ["Reyes", "Novak", "Okafor", "Brennan", "Haddad", "Lindqvist", "Moreau", "Tanaka"] },
};

/** The name bank that fits the setting text, and why. */
export function bankFor(setting: string | null): { id: string; label: string; first: string[]; last: string[]; place: string | null } {
  const r = setting ? REGIONS.find((x) => new RegExp(x.re.source, "i").test(setting)) : undefined;
  const id = r ? (BANKS[r.id] ? r.id : BANKS[r.id.split("-")[0]] ? r.id.split("-")[0] : "default") : "default";
  return { id, ...BANKS[id], place: r?.place ?? null };
}

/** A new name not sounding like any already used (different first three letters and initial+surname). */
export function pickName(bank: ReturnType<typeof bankFor>, used: string[], seed: number): { name: string; reasoning: string } {
  const taken = used.map((u) => u.toLowerCase());
  const firsts = taken.map((u) => u.split(/\s+/)[0]);
  // No new surname may match any word of a name already used (an accidental family is a story decision, not ours).
  const lasts = new Set(taken.flatMap((u) => u.split(/\s+/)).filter(Boolean));
  for (let k = 0; k < bank.first.length; k++) {
    const f = bank.first[(seed + k * 5) % bank.first.length];
    const fl = f.toLowerCase();
    if (firsts.some((x) => x === fl || x.slice(0, 3) === fl.slice(0, 3) || x[0] === fl[0])) continue;
    const l = bank.last.find((x, j) => !lasts.has(x.toLowerCase()) && (seed + j) % 2 === 0) ?? bank.last.find((x) => !lasts.has(x.toLowerCase())) ?? bank.last[0];
    return { name: `${f} ${l}`, reasoning: `Built-in naming: ${bank.label}${bank.place ? ` (the story is set in ${bank.place})` : ""}; distinct from the other names. Rename freely.` };
  }
  const f = bank.first[seed % bank.first.length];
  return { name: `${f} ${bank.last[(seed + 3) % bank.last.length]}`, reasoning: `Built-in naming: ${bank.label}. Rename freely.` };
}
