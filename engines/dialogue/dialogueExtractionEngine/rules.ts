// Speech timing prior: ~2.5 spoken words per second for screen dialogue
// (≈150 wpm), plus a short beat for each parenthetical direction.
export const WORDS_PER_SECOND = 2.5;
export const PARENTHETICAL_BEAT_SECONDS = 0.5;

/** Deterministic 53-bit string hash (cyrb53). Pure JS so it runs in browser, API and workers alike. */
export function hash53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

export const normaliseSpeech = (s: string) => s.replace(/\s+/g, " ").trim();
export const wordCount = (s: string) => (s.match(/[\p{L}\p{N}'’-]+/gu) ?? []).length;
