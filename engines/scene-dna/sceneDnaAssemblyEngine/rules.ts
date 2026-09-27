// Keyword lexicons for evidence found in action lines. Each detection records the
// exact line it came from, so a person can check it; nothing is inferred beyond the text.

export const WEATHER: { value: string; re: RegExp }[] = [
  { value: "rain", re: /\b(rain|raining|rains|downpour|drizzle|rainfall)\b/i },
  { value: "storm", re: /\b(storm|stormy|thunder|lightning)\b/i },
  { value: "fog", re: /\b(fog|foggy|mist|misty|haze|hazy)\b/i },
  { value: "snow", re: /\b(snow|snowing|snowfall|sleet)\b/i },
  { value: "wind", re: /\b(wind|windy|gust|gusts|breeze)\b/i },
  { value: "heat", re: /\b(scorching|sweltering|heat|humid|humidity)\b/i },
  { value: "sun", re: /\b(sunny|sunlight|sunshine|blazing sun)\b/i },
];

export const ATMOSPHERE: { value: string; re: RegExp }[] = [
  { value: "crowded", re: /\b(crowd|crowds|crowded|packed|bustling|busy|market)\b/i },
  { value: "quiet", re: /\b(quiet|silent|silence|hushed|still|empty|deserted)\b/i },
  { value: "traffic", re: /\b(traffic|horns?|honking|gridlock|okada|danfo|keke)\b/i },
  { value: "dark", re: /\b(dark|darkness|shadows?|dim|dimly|pitch-black)\b/i },
  { value: "smoke", re: /\b(smoke|smoky|smoulder\w*|smolder\w*)\b/i },
  { value: "tense", re: /\b(tense|tension|uneasy|nervous|nervously)\b/i },
];

export const SOUND: { cue: string; re: RegExp }[] = [
  { cue: "Rain ambience", re: /\b(rain|raining|downpour|drizzle)\b/i },
  { cue: "Thunder", re: /\b(thunder|lightning)\b/i },
  { cue: "City traffic", re: /\b(traffic|horns?|honking|okada|danfo|keke)\b/i },
  { cue: "Phone ringing/buzzing", re: /\b(phone (rings|buzzes|vibrates)|ringing phone|ringtone)\b/i },
  { cue: "Door", re: /\b(door|slams|knock|knocks|knocking)\b/i },
  { cue: "Footsteps", re: /\b(footsteps|runs|running|walks|walking|paces|pacing|steps)\b/i },
  { cue: "Gunshot", re: /\b(gunshot|gunfire|shots? (ring|rings|fired)|fires)\b/i },
  { cue: "Crowd walla", re: /\b(crowd|crowds|market|chatter|murmur)\b/i },
  { cue: "Wind", re: /\b(wind|windy|gust|gusts)\b/i },
  { cue: "Keyboard typing", re: /\b(types|typing|keyboard)\b/i },
  { cue: "Car engine", re: /\b(car|engine|drives|driving|truck|van)\b/i },
  { cue: "Water lapping", re: /\b(water|waves|harbour|harbor|lagoon|river|shore)\b/i },
  { cue: "Siren", re: /\b(siren|sirens)\b/i },
  { cue: "TV/radio broadcast", re: /\b(tv|television|radio|broadcast|news anchor)\b/i },
];

/** Time-of-day words that imply the scene continues from the previous one. */
export const CONTINUOUS_TIME = /^(CONTINUOUS|MOMENTS LATER|SAME|LATER)$/;
