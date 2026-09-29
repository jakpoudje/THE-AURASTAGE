// The labelled test writer (directive §17). It does NOT write: it arranges the brief, the outline and the scene it is
// given into correctly shaped story developments, outlines and Fountain pages, so the whole AuraScript flow (queue →
// worker → checks → open as draft → approve → Casting / Scene DNA downstream) can be exercised without a paid model.
// Everything it returns is marked test_output and labelled TEST OUTPUT in the UI.
type Row = Record<string, any>;

const NAMES = [["Adaeze", "Okoro", "F"], ["Femi", "Adebayo", "M"], ["Grace", "Mensah", "F"], ["Kola", "Balogun", "M"], ["Ngozi", "Eze", "F"], ["Tayo", "Ibekwe", "M"]] as const;
const WORDS = "light shifts across the room. A door closes somewhere below. Traffic hums beyond the window. Someone breathes out, slow. Papers stir. The clock keeps time.".split(". ");

export function developStory(snapshot: Row) {
  const b = snapshot.brief ?? {};
  const runtime = b.target_runtime_minutes ?? 20;
  const setting = b.setting || "the city";
  return {
    title_options: [b.title || "Untitled"],
    logline: b.logline || `TEST OUTPUT — A ${b.genre || "drama"} set in ${setting}, arranged from the brief by the test writer.`,
    synopsis: b.synopsis || `TEST OUTPUT. ${b.logline || "A story"} This synopsis was arranged from the brief by the AuraStage test writer, which does not write; connect Claude for a real story.`,
    themes: ["truth", "loyalty"], genre: b.genre || "Drama", tone: b.tone || "Grounded", setting, time_period: b.time_period || "Present day",
    characters: NAMES.slice(0, 3).map(([f, l], i) => ({ name: `${f} ${l}`, role: i === 0 ? "protagonist" : i === 1 ? "antagonist" : "supporting", age: 30 + i * 7,
      name_reasoning: "TEST OUTPUT: taken from a fixed list.", description: `TEST OUTPUT character ${i + 1}.`, want: "To be heard.", need: "To trust.", arc: "Learns to trust." })),
    beats: [["Setup", 0], ["Inciting incident", 0.12], ["Midpoint", 0.5], ["Crisis", 0.75], ["Resolution", 0.92]].map(([t, f], i) => ({ act: i < 2 ? 1 : i < 4 ? 2 : 3, title: String(t), summary: `TEST OUTPUT beat: ${t}.`, approx_minute: Math.round(Number(f) * runtime) })),
    assumptions: ["TEST OUTPUT — the test writer only arranges the brief."],
  };
}

export function outline(snapshot: Row) {
  const s = snapshot.story ?? {};
  const runtime = s.target_runtime_minutes ?? 10;
  const beats: Row[] = s.beats?.length ? s.beats : [{ title: "Setup" }, { title: "Turn" }, { title: "Resolution" }];
  const chars: string[] = (s.characters ?? []).map((c: Row) => c.name);
  const places = [String(s.setting || "HOME").toUpperCase().replace(/[^A-Z0-9' ]/g, "").slice(0, 40) || "HOME", "STREET", "OFFICE"];
  const n = Math.max(3, Math.min(60, Math.round(runtime / 2)));
  const each = Math.round((runtime / n) * 10) / 10;
  const scenes = Array.from({ length: n }, (_, i) => ({
    number: i + 1, int_ext: i % 3 === 1 ? "EXT" : "INT", location: places[i % places.length], time_of_day: i % 2 ? "NIGHT" : "DAY",
    purpose: "TEST OUTPUT scene.", beat: String(beats[Math.min(beats.length - 1, Math.floor((i / n) * beats.length))].title), summary: `Test output: scene ${i + 1} of ${n}.`,
    characters: chars.length ? [chars[i % chars.length], chars[(i + 1) % chars.length]].filter((x, k, a) => a.indexOf(x) === k) : [], est_minutes: each,
  }));
  return { scenes, notes: ["TEST OUTPUT — arranged by the test writer."] };
}

function sceneText(o: Row, story: Row) {
  const chars: Row[] = (story.characters ?? []).filter((c: Row) => (o.characters ?? []).includes(c.name));
  const lines = [`${o.int_ext}. ${o.location} - ${o.time_of_day}`, ""];
  // Marked in lower case: a line in CAPITALS would read as a character being introduced.
  lines.push(`(Test output) ${o.summary}`, "");
  for (const c of chars) {
    lines.push(`${c.name.toUpperCase()}${c.age ? ` (${c.age})` : ""} is here.`, "");
  }
  // Enough words for the scene's planned minutes (the checks measure length).
  const target = Math.ceil((o.est_minutes ?? 1) * 70);
  let words = 0, k = 0;
  while (words < target) {
    const a = `${WORDS[k % WORDS.length]}.`;
    lines.push(a[0].toUpperCase() + a.slice(1), "");
    words += a.split(/\s+/).length;
    if (chars.length) {
      const c = chars[k % chars.length];
      lines.push(c.name.split(/\s+/)[0].toUpperCase(), `Line ${k + 1} of the test writer.`, "");
      words += 6;
    }
    k++;
  }
  return lines.join("\n").trim();
}
export function writeScenes(snapshot: Row) {
  const want = (snapshot.outline ?? []).filter((o: Row) => (snapshot.numbers ?? []).includes(o.number));
  return { scenes: want.map((o: Row) => ({ number: o.number, fountain: sceneText(o, snapshot.story ?? {}) })) };
}

export function rewrite(snapshot: Row) {
  const text = String(snapshot.scene_text ?? "").trim();
  const mode = snapshot.mode;
  if (mode === "new_scene") {
    const loc = (String(snapshot.before ?? "").split("\n")[0].match(/^(?:INT|EXT)\.\s+(.*?)\s+-/)?.[1]) ?? "HOME";
    return { fountain: `INT. ${loc} - LATER\n\n(Test output) ${snapshot.instruction || "A new scene."}\n\nThe room is quiet.`, changes: ["TEST OUTPUT: new scene arranged from the instruction."] };
  }
  const lines = text.split("\n");
  const heading = lines[0];
  const body = lines.slice(1);
  if (mode === "expand") return { fountain: [heading, ...body, "", "(Test output) A pause. Nobody moves.", "", "The silence holds a moment longer."].join("\n"), changes: ["TEST OUTPUT: added two beats."] };
  if (mode === "condense") {
    const keep = body.filter((l, i) => l.trim() === "" || i % 3 !== 2);
    return { fountain: [heading, ...keep].join("\n").replace(/\n{3,}/g, "\n\n"), changes: ["TEST OUTPUT: removed every third line."] };
  }
  return { fountain: [heading, "", `(Test output: ${mode})`, ...body].join("\n"), changes: [`TEST OUTPUT: marked for ${mode}; the test writer doesn't rewrite.`] };
}
