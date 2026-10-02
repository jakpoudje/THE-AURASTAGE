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
  /** The Commons file title must contain one of these (live build 2026-10-02: a search for "traffic" returned air-traffic
   * control recordings, "footsteps" a march, "dog" a prairie dog — the title has to name the sound itself). */
  title: RegExp;
  /** Titles to refuse for this category even when they match. */
  not?: RegExp;
}

export const SOUND_CATEGORIES: SoundCategory[] = [
  // ---- backgrounds (ambience) ----
  { id: "rain", label: "rain", words: /\brain(s|y|ing|fall|storm|drops?|water)?\b|drizzle|downpour/i, search: ["intitle:rain", "rainfall", "heavy rain"], bed: true, level_db: 0, max_seconds: 30, title: /\brain/i },
  { id: "thunder", label: "thunder", words: /thunder|lightning|storm/i, search: ["intitle:thunder", "thunderstorm"], bed: false, level_db: -2, max_seconds: 12, title: /thunder/i, not: /getting set|warning|radio/i },
  { id: "wind", label: "wind", words: /\bwind(s|y|ing|swept|blown)?\b|gale|breeze|gust/i, search: ["intitle:wind", "intitle:windy", "intitle:breeze", "sounds of wind", "wind in trees"], bed: true, level_db: -3, max_seconds: 30, title: /\bwind\b|breeze|gale|gust/i, not: /instrument|wind band|woodwind/i },
  { id: "sea", label: "sea / waves", words: /harbou?r|\bsea\b|ocean|beach|shore|waves?\b|\bport\b|\bdocks?\b|lagoon|coast/i, search: ["intitle:waves", "intitle:surf", "intitle:sea", "intitle:ocean", "intitle:beach", "sounds of the sea", "breaking waves"], bed: true, level_db: -2, max_seconds: 30, title: /wave|surf|\bsea\b|ocean|beach|shore|coast/i, not: /radio|brain|microwave|wavelet|sine|square wave/i },
  { id: "river", label: "stream / river", words: /river|stream|creek|brook|waterfall/i, search: ["intitle:stream water", "intitle:river", "intitle:creek", "waterfall"], bed: true, level_db: -3, max_seconds: 30, title: /stream|river|creek|brook|waterfall|riverbed/i, not: /live stream|streaming/i },
  { id: "traffic", label: "traffic / city", words: /\bcity\b|street|traffic|\broad\b|downtown|highway|motorway|junction|lagos|town/i, search: ["intitle:street ambience", "intitle:traffic noise", "intitle:city ambience", "intitle:road traffic", "street sounds"], bed: true, level_db: -4, max_seconds: 30, title: /traffic|street|\broad\b|city|cars? passing|urban|junction|intersection|highway/i, not: /air traffic|atc|tower|dispatch|radio|crash|police|scanner|cockpit|flight|parade|carnival|firework|cleaner|vacuum|gull/i },
  { id: "market", label: "market", words: /market|bazaar|stall|vendors?/i, search: ["intitle:market", "intitle:bazaar", "marketplace ambience"], bed: true, level_db: -4, max_seconds: 30, title: /market|bazaar|souk|fair\b/i, not: /stock market|noise reduction/i },
  { id: "crowd", label: "crowd / walla", words: /crowd|\bbar\b|restaurant|newsroom|\boffice\b|party|\bclub\b|station|canteen|cafe|café|audience|rally|church|classroom/i, search: ["intitle:crowd", "intitle:restaurant ambience", "intitle:shopping mall", "intitle:train station", "crowd murmur"], bed: true, level_db: -6, max_seconds: 30, title: /crowd|walla|murmur|babble|chatter|restaurant|cafe|café|mall|station|hall|canteen|pub\b|audience/i, not: /discussion|conversation|interview|speech|chant|protest/i },
  { id: "birds", label: "birds", words: /dawn|morning|sunrise|garden|\bpark\b|forest|woods|birds?|village|farm|countryside/i, search: ["intitle:birds", "intitle:dawn chorus", "intitle:birdsong", "intitle:bird song", "songs of birds", "forest birds"], bed: true, level_db: -6, max_seconds: 30, title: /bird|dawn chorus|dawnchorus|oiseaux|birdsong|songbird|forest ambience/i, not: /parrot talking|plane|aircraft|traffic|airport/i },
  { id: "insects", label: "night insects", words: /\bnight\b|midnight|evening|crickets?|cicadas?/i, search: ["intitle:crickets", "intitle:cricket", "intitle:cicada", "intitle:cicadas", "insect sounds"], bed: true, level_db: -7, max_seconds: 30, title: /cricket|cicada|zikade|insect|katydid|night ambience/i },
  { id: "fire", label: "fire", words: /\bfire\b|fireplace|campfire|flames?|burning|bonfire/i, search: ["intitle:fire crackling", "intitle:campfire", "intitle:fireplace", "intitle:burning", "sounds of fire"], bed: true, level_db: -4, max_seconds: 30, title: /fireplace|campfire|bonfire|crackl|burning|flames|log fire|wood fire/i, not: /firework|friendly fire|gunfire|alarm|bones|ice/i },
  // ---- events (effects and Foley) ----
  { id: "footsteps", label: "footsteps", words: /footsteps?|\bsteps\b|walks?\b|walking|running|\bruns\b|paces/i, search: ["intitle:footsteps", "intitle:footstep", "intitle:walking", "intitle:steps", "sounds of footsteps"], bed: false, level_db: 0, max_seconds: 10, title: /footstep|walking|steps|walk on|running on/i, not: /march|grenadier|song/i },
  { id: "knock", label: "door knock", words: /knock/i, search: ["intitle:knocking", "intitle:knock door"], bed: false, level_db: 0, max_seconds: 6, title: /knock/i },
  { id: "door", label: "door", words: /\bdoors?\b|slam|creak/i, search: ["intitle:door closing", "intitle:door slam", "intitle:door opening", "intitle:creaking door", "intitle:door"], bed: false, level_db: 0, max_seconds: 6, title: /\bdoors?\b/i, not: /tram|bus|train|chime|band|the doors/i },
  { id: "gunshot", label: "gunshot", words: /\bguns?\b|gunshot|shots? (ring|fired)|shoots?\b|gunfire|pistol|rifle/i, search: ["intitle:gunshot", "intitle:gunshots", "intitle:rifle shot", "intitle:pistol"], bed: false, level_db: 0, max_seconds: 5, title: /gun|shot|rifle|pistol|revolver|musket|firearm/i, not: /scream|photo|screenshot/i },
  { id: "glass", label: "glass breaking", words: /glass|smash|shatter/i, search: ["intitle:glass", "intitle:breaking glass", "intitle:bottle", "sounds of glass"], bed: false, level_db: 0, max_seconds: 5, title: /glass break|breaking glass|broken glass|shatter|smash|clink|wine glass|binging glass|bottle break/i, not: /harmonica|armonica|music/i },
  { id: "phone", label: "phone ringing", words: /\bphone\b|telephone|rings?\b|ringing|ringtone/i, search: ["intitle:telephone ringing", "intitle:phone ringing", "intitle:telephone ring", "intitle:telephone bell"], bed: false, level_db: -2, max_seconds: 8, title: /phone/i, not: /dial|tone dialling|dtmf|modem|ringtone remix/i },
  { id: "car", label: "car / engine", words: /\bcars?\b|engine|truck|lorry|motor|drives? (off|away|up)|\bbus\b|okada|motorbike|motorcycle/i, search: ["intitle:car passing", "intitle:car engine", "intitle:car horn", "intitle:vehicle passing", "intitle:motorcycle", "intitle:engine start"], bed: false, level_db: -2, max_seconds: 10, title: /\bcars?\b|engine|vehicle|motor|truck|lorry|horn|automobile|motorcycle|scooter/i, not: /jet engine|search engine|airplane|aircraft|stereo|radio|tape ?deck|cd player/i },
  { id: "typing", label: "typing", words: /typing|keyboard|\btypes\b|typewriter/i, search: ["intitle:typing", "intitle:typewriter", "intitle:keyboard typing"], bed: false, level_db: -4, max_seconds: 8, title: /typing|keyboard|typewriter|keystroke/i, not: /piano|synth|midi/i },
  { id: "paper", label: "paper", words: /paper|document|pages?\b|newspaper|envelope/i, search: ["intitle:paper", "intitle:page turn", "intitle:turning pages", "paper rustling", "crumpling paper"], bed: false, level_db: -6, max_seconds: 6, title: /paper|page|newspaper|book|rustl/i, not: /white paper|reading|sawing|toilet/i },
  { id: "impact", label: "punch / impact", words: /punch|\bhits?\b|slap|impact|crash|thud/i, search: ["intitle:thud", "intitle:punch", "intitle:impact", "intitle:slap", "intitle:bang"], bed: false, level_db: 0, max_seconds: 4, title: /thud|punch|hit|slap|impact|thump|bang|crash/i, not: /song|hit parade|car crash|plane|flight|atc/i },
  { id: "explosion", label: "explosion", words: /explosion|explodes|blast|bomb/i, search: ["intitle:explosion", "intitle:detonation", "intitle:blast"], bed: false, level_db: 0, max_seconds: 8, title: /explosion|explode|blast|detonation|bomb/i, not: /speech|atomic test footage|blast beat|beat/i },
  { id: "dog", label: "dog barking", words: /\bdogs?\b|bark(s|ing)?\b|puppy/i, search: ["intitle:dog barking", "intitle:dog bark", "intitle:barking dog", "intitle:dog"], bed: false, level_db: -2, max_seconds: 6, title: /\bdogs?\b|canis|puppy|bark/i, not: /prairie|cynomys|seal|sea lion|fox|bird/i },
  { id: "siren", label: "siren", words: /siren|police car|ambulance|fire engine/i, search: ["intitle:siren", "police siren", "ambulance siren"], bed: false, level_db: -3, max_seconds: 10, title: /siren/i, not: /song|music|mythology/i },
  { id: "bell", label: "bell", words: /\bbells?\b|church bell|chimes?|toll(s|ing)?\b/i, search: ["intitle:church bells", "intitle:church bell", "intitle:bells ringing", "intitle:bell"], bed: false, level_db: -3, max_seconds: 10, title: /bell|chime|carillon|toll/i, not: /telephone|doorbell song|bell pepper|campbell/i },
  { id: "clock", label: "clock ticking", words: /clock|tick(s|ing)?\b/i, search: ["intitle:clock ticking", "intitle:ticking clock", "intitle:clock", "intitle:tick tock"], bed: false, level_db: -6, max_seconds: 8, title: /clock|tick/i, not: /tick-borne|lyme/i },
  { id: "water", label: "water pouring", words: /pours?\b|pouring|\btap\b|faucet|sink|splash/i, search: ["intitle:pouring water", "intitle:water pouring", "intitle:splash", "intitle:dripping", "intitle:faucet", "intitle:tap water"], bed: false, level_db: -4, max_seconds: 6, title: /water|pour|faucet|\btap\b|splash|drip|sink/i, not: /waterfall|river|stream|rain|sea/i },
  { id: "applause", label: "applause", words: /applau|clapping|claps?\b|cheer/i, search: ["intitle:applause", "intitle:clapping"], bed: false, level_db: -2, max_seconds: 10, title: /applause|clapping|claps|cheer/i },
  { id: "keys", label: "keys", words: /\bkeys?\b|keychain|unlock/i, search: ["intitle:keys", "intitle:key", "sounds of keys", "keychain"], bed: false, level_db: -6, max_seconds: 5, title: /\bkeys\b|keychain|key ring|jingl/i, not: /piano|keyboard|music/i },
];

export const categoryById = (id: string) => SOUND_CATEGORIES.find((c) => c.id === id);
