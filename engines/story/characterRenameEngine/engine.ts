// engines/story/characterRenameEngine
// Renames a character across a Fountain screenplay so every page uses the same name: character cues (NAME, NAME (V.O.),
// NAME (CONT'D)), and the name in action and dialogue in the case it is written (AMARA / Amara). Whole words only, so
// "Ada" never touches "Adaeze". A two-part name also renames its first name on its own ("Amara Bello" → "Adaeze Okoro"
// renames "Amara" → "Adaeze"). The result is new text for the writer to save as a version; nothing is saved here.
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const title = (s: string) => s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase());

export interface RenameResult { text: string; cues: number; mentions: number }

export function renameCharacter(text: string, from: string, to: string): RenameResult {
  const f = from.trim(), t = to.trim();
  if (!f || !t || f.toLowerCase() === t.toLowerCase()) return { text, cues: 0, mentions: 0 };
  const pairs: [string, string][] = [[f, t]];
  const fp = f.split(/\s+/), tp = t.split(/\s+/);
  if (fp.length > 1 && tp.length > 0 && fp[0].toLowerCase() !== tp[0].toLowerCase()) pairs.push([fp[0], tp[0]]);
  let cues = 0, mentions = 0;
  const lines = text.split("\n").map((line) => {
    // Character cue: the whole line is the name in capitals, optionally with an extension in brackets.
    for (const [a, b] of pairs) {
      const m = new RegExp(`^(\\s*@?)${esc(a.toUpperCase())}(\\s*(\\([^)]*\\)\\s*)*\\^?\\s*)$`).exec(line);
      if (m) { cues++; return `${m[1]}${b.toUpperCase()}${m[2]}`; }
    }
    let out = line;
    for (const [a, b] of pairs) {
      for (const [x, y] of [[a.toUpperCase(), b.toUpperCase()], [title(a), title(b)], [a, b]] as [string, string][]) {
        out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${esc(x)}(?![\\p{L}\\p{N}])`, "gu"), () => (mentions++, y));
      }
    }
    return out;
  });
  return { text: lines.join("\n"), cues, mentions };
}
