// The recorded sound library's categories — one list shared by the build step that fetches the recordings
// (apps/api/scripts/sfx-install.mjs reads `sfx-categories.json`, generated from this file by a test) and by the engine
// that chooses them for a cue. `words` decide which cue asks for the category; `search` is what the build looks for on
// Wikimedia Commons; `bed` categories are continuous backgrounds (looped under a scene), the rest are single events.

export interface SoundCategory {
  id: string;
  label: string;
  words: RegExp;
  search: string[];
  /** Continuous background (looped, crossfaded) rather than one event. */
  bed: boolean;
  /** Mix level relative to the loudest layer, in dB (backgrounds sit under each other). */
  level_db: number;
  /** Seconds kept from each recording at build time. */
  max_seconds: number;
}

export const SOUND_CATEGORIES: SoundCategory[] = [
  // ---- backgrounds (ambience) ----
  { id: "rain", label: "rain", words: /\brain(s|y|ing|fall|storm|drops?|water)?\b|drizzle|downpour/i, search: ["rain sound", "rain recording", "rainfall", "heavy rain"], bed: true, level_db: 0, max_seconds: 30 },
  { id: "thunder", label: "thunder", words: /thunder|lightning|storm/i, search: ["thunder", "thunderstorm"], bed: false, level_db: -2, max_seconds: 12 },
  { id: "wind", label: "wind", words: /\bwind(s|y|ing|swept|blown)?\b|gale|breeze|gust/i, search: ["wind sound", "wind blowing", "wind recording"], bed: true, level_db: -3, max_seconds: 30 },
  { id: "sea", label: "sea / waves", words: /harbou?r|\bsea\b|ocean|beach|shore|waves?\b|\bport\b|\bdocks?\b|lagoon|coast/i, search: ["ocean waves", "sea waves", "waves beach", "surf"], bed: true, level_db: -2, max_seconds: 30 },
  { id: "river", label: "stream / river", words: /river|stream|creek|brook|waterfall/i, search: ["stream water", "river sound", "creek"], bed: true, level_db: -3, max_seconds: 30 },
  { id: "traffic", label: "traffic / city", words: /\bcity\b|street|traffic|\broad\b|downtown|highway|motorway|junction|lagos|town/i, search: ["traffic", "street ambience", "city ambience", "city street"], bed: true, level_db: -4, max_seconds: 30 },
  { id: "market", label: "market", words: /market|bazaar|stall|vendors?/i, search: ["market ambience", "marketplace sound"], bed: true, level_db: -4, max_seconds: 30 },
  { id: "crowd", label: "crowd / walla", words: /crowd|\bbar\b|restaurant|newsroom|\boffice\b|party|\bclub\b|station|canteen|cafe|café|audience|rally|church|classroom/i, search: ["crowd", "crowd ambience", "people talking crowd", "restaurant ambience"], bed: true, level_db: -6, max_seconds: 30 },
  { id: "birds", label: "birds", words: /dawn|morning|sunrise|garden|\bpark\b|forest|woods|birds?|village|farm|countryside/i, search: ["birdsong", "dawn chorus", "birds singing", "bird song"], bed: true, level_db: -6, max_seconds: 30 },
  { id: "insects", label: "night insects", words: /\bnight\b|midnight|evening|crickets?|cicadas?/i, search: ["crickets", "cicadas", "night insects"], bed: true, level_db: -7, max_seconds: 30 },
  { id: "fire", label: "fire", words: /\bfire\b|fireplace|campfire|flames?|burning|bonfire/i, search: ["fire crackling", "campfire", "fireplace"], bed: true, level_db: -4, max_seconds: 30 },
  // ---- events (effects and Foley) ----
  { id: "footsteps", label: "footsteps", words: /footsteps?|\bsteps\b|walks?\b|walking|running|\bruns\b|paces/i, search: ["footsteps", "walking footsteps", "footsteps gravel"], bed: false, level_db: 0, max_seconds: 10 },
  { id: "knock", label: "door knock", words: /knock/i, search: ["knocking on door", "door knock"], bed: false, level_db: 0, max_seconds: 6 },
  { id: "door", label: "door", words: /\bdoors?\b|slam|creak/i, search: ["door closing", "door slam", "door opening", "creaking door"], bed: false, level_db: 0, max_seconds: 6 },
  { id: "gunshot", label: "gunshot", words: /\bguns?\b|gunshot|shots? (ring|fired)|shoots?\b|gunfire|pistol|rifle/i, search: ["gunshot", "gun shot", "rifle shot", "pistol shot"], bed: false, level_db: 0, max_seconds: 5 },
  { id: "glass", label: "glass breaking", words: /glass|smash|shatter/i, search: ["glass breaking", "glass shatter"], bed: false, level_db: 0, max_seconds: 5 },
  { id: "phone", label: "phone ringing", words: /\bphone\b|telephone|rings?\b|ringing|ringtone/i, search: ["telephone ringing", "phone ring"], bed: false, level_db: -2, max_seconds: 8 },
  { id: "car", label: "car / engine", words: /\bcars?\b|engine|truck|lorry|motor|drives? (off|away|up)|\bbus\b|okada|motorbike|motorcycle/i, search: ["car engine", "car passing", "engine start", "motorcycle"], bed: false, level_db: -2, max_seconds: 10 },
  { id: "typing", label: "typing", words: /typing|keyboard|\btypes\b|typewriter/i, search: ["typing keyboard", "typewriter", "computer keyboard typing"], bed: false, level_db: -4, max_seconds: 8 },
  { id: "paper", label: "paper", words: /paper|document|pages?\b|newspaper|envelope/i, search: ["paper rustling", "page turning", "crumpling paper"], bed: false, level_db: -6, max_seconds: 6 },
  { id: "impact", label: "punch / impact", words: /punch|\bhits?\b|slap|impact|crash|thud/i, search: ["punch sound", "impact thud", "crash sound"], bed: false, level_db: 0, max_seconds: 4 },
  { id: "explosion", label: "explosion", words: /explosion|explodes|blast|bomb/i, search: ["explosion", "explosion sound"], bed: false, level_db: 0, max_seconds: 8 },
  { id: "dog", label: "dog barking", words: /\bdogs?\b|bark(s|ing)?\b|puppy/i, search: ["dog barking", "dog bark"], bed: false, level_db: -2, max_seconds: 6 },
  { id: "siren", label: "siren", words: /siren|police car|ambulance|fire engine/i, search: ["siren", "police siren", "ambulance siren"], bed: false, level_db: -3, max_seconds: 10 },
  { id: "bell", label: "bell", words: /\bbells?\b|church bell|chimes?|toll(s|ing)?\b/i, search: ["church bell", "bell ringing"], bed: false, level_db: -3, max_seconds: 10 },
  { id: "clock", label: "clock ticking", words: /clock|tick(s|ing)?\b/i, search: ["clock ticking", "ticking clock"], bed: false, level_db: -6, max_seconds: 8 },
  { id: "water", label: "water pouring", words: /pours?\b|pouring|\btap\b|faucet|sink|splash/i, search: ["water pouring", "pouring water", "splash"], bed: false, level_db: -4, max_seconds: 6 },
  { id: "applause", label: "applause", words: /applau|clapping|claps?\b|cheer/i, search: ["applause", "clapping"], bed: false, level_db: -2, max_seconds: 10 },
  { id: "keys", label: "keys", words: /\bkeys?\b|keychain|unlock/i, search: ["keys jingling", "keys"], bed: false, level_db: -6, max_seconds: 5 },
];

export const categoryById = (id: string) => SOUND_CATEGORIES.find((c) => c.id === id);
