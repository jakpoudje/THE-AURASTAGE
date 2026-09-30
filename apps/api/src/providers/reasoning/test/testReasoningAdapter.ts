// apps/api/src/providers/reasoning/test/testReasoningAdapter.ts
// The labelled TestProvider for reasoning (directive §17). It does NOT understand language: it recognises a fixed set
// of production phrasings (time of day, weather, mood, age, wardrobe, subtle dialogue, annotating a whole scene, camera, story fields, describing a location or prop, titles & credits and credit names in Project Settings, quieter/louder/muted tracks in a scene's mix) and turns
// them into real tool calls against the canonical ids in the context, so the whole Ask AuraStage flow can be tested
// end to end without a paid model. Everything it returns is marked test_output and labelled in the UI.
import { ProviderError } from "../../types";
import type { ReasoningAdapter, ReasoningRequest, ReasoningResult } from "../types";
import * as writer from "./testWriter";
import { storyAccentEngine } from "@aurastage/engines";

type Item = { ref: { type: string; id: string; label: string }; data: Record<string, any> };
type Snapshot = {
  request: { text: string; module: string; object: { type: string; id: string } | null };
  context: { items: Item[]; focus: { type: string; id: string } | null };
  tools: string[];
};
type Call = { tool: string; input_json: string; reason: string };

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const TIME = /\b(late evening|early evening|evening|late night|night|midnight|dawn|dusk|early morning|morning|afternoon|midday|noon|sunset|sunrise|golden hour)\b/i;
const WEATHER = /\b(violent thunderstorm|thunderstorm|storm|torrential rain|heavy rain|light rain|drizzle|rain|thick fog|fog|mist|snow|blizzard|strong wind|wind|heatwave)\b/i;
// "rainy", "stormy", "foggy"… read as the weather itself.
const WEATHER_ADJ: Record<string, string> = { rainy: "rain", raining: "rain", stormy: "storm", foggy: "fog", misty: "mist", snowy: "snow", snowing: "snow", windy: "wind" };
const WEATHER_ADJ_RE = /\b(rainy|raining|stormy|foggy|misty|snowy|snowing|windy)\b/i;
const MOODS = ["threatening", "menacing", "tense", "cold", "colder", "claustrophobic", "dark", "darker", "warm", "warmer", "romantic", "eerie", "hopeful", "melancholic", "nervous", "intimate", "chaotic", "calm", "oppressive", "desperate"];
const WARDROBE = /\b(?:give|put|dress)\s+([A-Z][a-z]+)\s+(?:a |an |in |into )?([^.,;]*?\b(?:dress|wardrobe|jacket|coat|suit|outfit|uniform|shirt|clothes|gown|blazer|hoodie))\b/;


/** A deterministic reading of one line (development only — a real model reads the scene): punctuation and key words. */
export function readLine(text: string, paren = ""): { emotion: string; intensity: number; intention: string; why: string } {
  const t = `${paren} ${text}`;
  const rules: [RegExp, string, number, string][] = [
    [/\b(get out|how dare|liar|shut up|enough|damn|hate)\b/i, "anger", 8, "Confront them"],
    [/\b(afraid|scared|help|please|don'?t hurt|run)\b/i, "fear", 7, "Plead for safety"],
    [/\b(sorry|miss (you|him|her)|gone|lost|cry|forgive)\b/i, "sadness", 5, "Reach for comfort"],
    [/\b(love|darling|beautiful|my dear)\b/i, "love", 5, "Draw them closer"],
    [/\b(truth|have to|must|will not|won'?t|never|promise|always)\b/i, "determination", 6, "Hold their ground"],
    [/\b(whispers?|quietly|careful|watch)\b/i, "tension", 6, "Keep it hidden"],
    [/\b(ha|laughs?|great|wonderful|finally)\b/i, "joy", 5, "Share the moment"],
  ];
  for (const [re, emotion, intensity, intention] of rules) if (re.test(t)) return { emotion, intensity: /!/.test(text) ? Math.min(10, intensity + 1) : intensity, intention, why: `"${t.match(re)![0].trim()}"` };
  if (/\?\s*$/.test(text)) return { emotion: "anticipation", intensity: 4, intention: "Get an answer", why: "a question" };
  if (/!/.test(text)) return { emotion: "surprise", intensity: 6, intention: "Make them react", why: "an exclamation" };
  return { emotion: "neutral", intensity: 3, intention: "Keep the conversation going", why: "no strong signal in the words" };
}

function plan(snap: Snapshot) {
  const text = snap.request.text;
  const items = snap.context.items;
  const has = (t: string) => snap.tools.includes(t);
  const calls: Call[] = [];
  const not_possible: string[] = [];
  const questions: string[] = [];
  const done: string[] = [];
  const add = (tool: string, input: unknown, reason: string) => has(tool) && calls.push({ tool, input_json: JSON.stringify(input), reason });

  const byType = (t: string) => items.filter((i) => i.ref.type === t);
  const named = (t: string, name: string) => byType(t).find((i) => i.ref.label.toLowerCase().split(/\s+/).includes(name.toLowerCase()) || i.ref.label.toLowerCase() === name.toLowerCase());
  const focus = snap.context.focus;
  const sceneNum = text.match(/\bscene\s+(\d+)\b/i)?.[1];
  const scene = (focus?.type === "scene" ? byType("scene").find((i) => i.ref.id === focus.id) : undefined)
    ?? (sceneNum ? byType("scene").find((i) => String(i.data.number) === sceneNum) : undefined)
    ?? (byType("scene").length === 1 ? byType("scene")[0] : undefined);

  const profile = /\bdevelop\b[^.]*\bprofile\b/i.test(text);
  // ---- A character's whole profile: the test planner can only fill what the story states (accent, languages) ----
  if (profile) {
    const ch = (text.match(/\b[A-Z][a-z]+\b/g) ?? []).map((n) => named("character", n)).find(Boolean);
    if (!ch) questions.push("Which character? Open them in Casting and ask again.");
    else {
      const project = byType("project")[0];
      const d = ch.data as Record<string, any>;
      const s = storyAccentEngine({ character: { nationality: d.nationality ?? null, description: d.description ?? null, backstory: d.backstory ?? null },
        scene_locations: [], project: { setting: project?.data.setting ?? null, logline: project?.data.logline ?? null } }).suggestion;
      const changes: Record<string, string> = {};
      if (s && !d.accent) changes.accent = s.accent;
      if (s && !d.languages) changes.languages = s.languages.join(", ");
      if (Object.keys(changes).length) {
        add("updateCharacter", { character_id: ch.ref.id, changes }, `${ch.ref.label}: ${Object.keys(changes).join(" and ")} from the story (${s!.evidence[0]})`);
        done.push(`set ${ch.ref.label}'s ${Object.keys(changes).join(" and ")} from the story`);
      }
      const prose = ["personality", "backstory", "motivation", "fears", "strengths", "weaknesses", "arc", "description", "occupation"].filter((k) => !d[k]);
      if (prose.length) not_possible.push(`Writing ${prose.join(", ")} needs a connected writer (Claude, OpenAI or Gemini) — the built-in test planner doesn't invent character details.`);
    }
  }

  // ---- One pass over a whole scene: every spoken line's performance + the scene's DNA (only empty fields) ----
  const whole = !profile && /\b(annotate|one pass|in one go|every line|all (?:the |of the )?lines|develop (?:the |this )?(?:whole )?scene)\b/i.test(text);
  if (whole) {
    if (!scene) questions.push("Which scene? Open it in Dialogue Intelligence or Scene DNA and ask again.");
    else {
      const lines = byType("dialogue_line");
      let n = 0;
      for (const l of lines) {
        const read = readLine(String(l.data.text ?? ""), String(l.data.parenthetical ?? ""));
        const changes: Record<string, unknown> = {};
        if (!l.data.emotion) changes.emotion = read.emotion;
        if (l.data.intensity === null || l.data.intensity === undefined) changes.intensity = read.intensity;
        if (!l.data.intention) changes.intention = read.intention;
        if (Object.keys(changes).length && n < 38) {
          add("modifyDialogue", { line_id: l.ref.id, changes }, `${l.ref.label}: ${read.emotion}, ${read.intensity}/10 — ${read.why}`);
          n++;
        }
      }
      const dna = (scene.data.dna ?? {}) as Record<string, any>;
      const reads = lines.map((l) => readLine(String(l.data.text ?? ""), String(l.data.parenthetical ?? "")));
      const d: Record<string, unknown> = {};
      const moodOf: Record<string, string> = { tension: "tense", fear: "uneasy", sadness: "melancholic", love: "intimate", anger: "volatile", determination: "resolute", anticipation: "expectant", surprise: "unsettled", joy: "warm" };
      const moods = [...new Set(reads.map((r) => moodOf[r.emotion]).filter(Boolean))].slice(0, 3);
      if (!(dna.mood ?? []).length && moods.length) d.mood = moods;
      const act = String(scene.data.action ?? "");
      const sounds = [...act.matchAll(/\b(rain|thunder|wind|traffic|sirens?|footsteps|door|water|waves|crowd|phone|keyboard|engine|music|silence)\b/gi)].map((m) => m[1].toLowerCase());
      if (!dna.sound_intent && sounds.length) d.sound_intent = `Built from the action: ${[...new Set(sounds)].slice(0, 4).join(", ")}${moods.length ? `, under a ${moods[0]} mood` : ""}.`;
      const avg = reads.length ? reads.reduce((a, r) => a + r.intensity, 0) / reads.length : 4;
      if (!dna.camera_energy) d.camera_energy = avg >= 7 ? "dynamic" : avg >= 5 ? "measured" : "calm";
      if (!dna.atmosphere && act) d.atmosphere = act.split(/(?<=[.!?])\s/)[0].slice(0, 200);
      if (Object.keys(d).length) add("updateSceneDNA", { scene_id: scene.ref.id, changes: d }, `Scene DNA for ${scene.ref.label}: ${Object.keys(d).join(", ")}`);
      done.push(`annotate ${n} line(s) of ${scene.ref.label}${Object.keys(d).length ? ` and fill its Scene DNA (${Object.keys(d).join(", ")})` : ""}`);
      if (!n && !Object.keys(d).length) not_possible.push(`Every line and the Scene DNA of ${scene.ref.label} are already filled in — ask for a specific change instead.`);
    }
  }

  // ---- Scene DNA: time, weather, mood ----
  const changes: Record<string, unknown> = {};
  const time = text.match(TIME)?.[1];
  if (time) {
    changes.story_time = cap(time.toLowerCase());
    changes.lighting_intent = `${cap(time.toLowerCase())} light${/night|midnight/i.test(time) ? ", motivated practicals, deep shadows" : /evening|dusk|sunset|golden/i.test(time) ? ", low warm sun fading to practicals" : ""}`;
    not_possible.push(`The scene heading's time of day comes from the script — change it to ${time.toUpperCase()} in Scriptwriter so the heading matches.`);
  }
  const adj = text.match(WEATHER_ADJ_RE)?.[1];
  const weather = text.match(WEATHER)?.[1] ?? (adj ? WEATHER_ADJ[adj.toLowerCase()] : undefined);
  if (weather) changes.weather = cap(weather.toLowerCase());
  const moods = MOODS.filter((m) => new RegExp(`\\b${m}\\b`, "i").test(text));
  if (moods.length) {
    const current = Array.isArray(scene?.data.dna?.mood) ? (scene!.data.dna.mood as string[]) : [];
    changes.mood = [...new Set([...current, ...moods.map((m) => m.replace(/er$/, "").replace(/^colde?$/, "cold"))])].slice(0, 8);
  }
  if (Object.keys(changes).length) {
    if (scene) {
      add("updateSceneDNA", { scene_id: scene.ref.id, changes }, `Scene DNA for ${scene.ref.label}: ${Object.keys(changes).join(", ")}`);
      done.push(`update ${scene.ref.label}'s Scene DNA (${Object.keys(changes).join(", ")})`);
    } else questions.push("Which scene should this apply to? Open the scene in Scene DNA and ask again.");
  }

  // ---- Character age ----
  const ageNum = text.match(/\b(?:approximately|about|around|aged?|to be)\s+(\d{1,3})\b/)?.[1] ?? text.match(/\b(\d{1,3})\s*(?:years? old|-year-old)\b/)?.[1];
  // The character is the first capitalised word that names one in the context ("Make Amara about 45").
  const capWords = text.match(/\b[A-Z][a-z]+\b/g) ?? [];
  const age = ageNum ? ([null, capWords.find((n) => named("character", n)) ?? capWords.find((n) => !/^(Make|Set|Change|Please|Can|Could|Let)$/.test(n)) ?? "that", ageNum] as const) : null;
  if (age) {
    const ch = named("character", age[1]);
    if (ch) {
      add("updateCharacter", { character_id: ch.ref.id, changes: { age: age[2] } }, `${ch.ref.label}'s age to ${age[2]}`);
      done.push(`set ${ch.ref.label}'s age to ${age[2]}`);
    } else questions.push(`I couldn't find a character called ${age[1]}.`);
  }

  // ---- Wardrobe ----
  const w = text.match(WARDROBE);
  if (w) {
    const ch = named("character", w[1]);
    if (ch) {
      const desc = w[2].trim().replace(/^(more |a |an )/, "");
      add("changeWardrobe", { character_id: ch.ref.id, look_id: null, name: cap(desc).slice(0, 80), description: `${cap(desc)}. (From: "${text.slice(0, 300)}")`, scene_id: scene?.ref.id ?? null },
        `A new wardrobe look for ${ch.ref.label}${scene ? `, worn in ${scene.ref.label}` : ""}`);
      done.push(`add a "${desc}" look for ${ch.ref.label}${scene ? ` and use it in ${scene.ref.label}` : ""}`);
    } else questions.push(`I couldn't find a character called ${w[1]}.`);
  }

  // ---- Dialogue performance (subtext) ----
  if (!whole && /\b(subtle|less obvious|shouldn'?t admit|not admit|without saying|hint|indirect|subtext)\b/i.test(text)) {
    const who = (text.match(/\b([A-Z][a-z]+)\b/g) ?? []).map((n) => named("character", n)).find(Boolean);
    const lines = byType("dialogue_line").filter((l) => !who || l.data.character_id === who.ref.id);
    if (who && lines.length) {
      for (const l of lines.slice(0, 6)) {
        add("modifyDialogue", { line_id: l.ref.id, changes: { subtext: `${who.ref.label} knows more than they say and never states it directly.`, intention: "Deflect and conceal", notes: `Assistant: ${text.slice(0, 300)}` } },
          `Subtext for ${who.ref.label}'s line "${String(l.data.text ?? "").slice(0, 60)}"`);
      }
      done.push(`give ${who.ref.label}'s ${Math.min(lines.length, 6)} line(s) subtext and intention`);
      not_possible.push("The words of a line come from the approved script — to rewrite them, edit the scene in Scriptwriter.");
    } else questions.push("Which character's lines, in which scene? Open the scene in Dialogue Intelligence and ask again.");
  }

  // ---- Camera ----
  const shotChanges: Record<string, unknown> = {};
  if (/\b(close[- ]?up|closer|intimate)\b/i.test(text)) shotChanges.size = "CU";
  if (/\b(wide|establish)/i.test(text)) shotChanges.size = "WS";
  if (/\b(handheld|aggressive|chaotic)\b/i.test(text)) Object.assign(shotChanges, { movement: "handheld", support: "handheld" });
  if (/\b(push(es)? in|move(s)? (slowly )?towards|creep in)\b/i.test(text)) shotChanges.movement = "push_in";
  if (/\b(low angle)\b/i.test(text)) shotChanges.angle = "low";
  if (/\b(high angle)\b/i.test(text)) shotChanges.angle = "high";
  if (Object.keys(shotChanges).length) {
    const shot = (focus?.type === "shot" ? byType("shot").find((i) => i.ref.id === focus.id) : undefined) ?? byType("shot").slice(-1)[0];
    if (shot) {
      add("modifyShot", { shot_id: shot.ref.id, changes: shotChanges }, `${shot.ref.label}: ${Object.entries(shotChanges).map(([k, v]) => `${k} ${v}`).join(", ")}`);
      done.push(`change ${shot.ref.label} (${Object.values(shotChanges).join(", ")})`);
    } else questions.push("Which shot? Open the scene in Storyboard & Shots and ask again.");
  }

  // ---- A location or prop: the test planner writes only what the script states (interior/exterior, times, areas) ----
  const place = text.match(/\bdescribe\s+the\s+(location|prop)\s+["“]([^"”]+)["”]/i);
  if (place) {
    const kind = place[1].toLowerCase() as "location" | "prop";
    const it = byType(kind).find((i) => i.ref.label.toLowerCase() === place[2].trim().toLowerCase());
    if (!it) questions.push(`Which ${kind}? Pick it in Locations & Props and ask again.`);
    else {
      const d = it.data as Record<string, any>;
      const facts = kind === "location"
        ? [(d.int_ext ?? []).length ? (d.int_ext as string[]).map((x) => (x === "INT" ? "interior" : "exterior")).join(" and ") : "", (d.times_of_day ?? []).length ? `seen at ${(d.times_of_day as string[]).map((x) => x.toLowerCase()).join(", ")}` : "", (d.areas ?? []).length ? `areas: ${(d.areas as string[]).join(", ")}` : ""]
        : [d.category === "vehicle" ? "a vehicle" : "a prop"];
      const found = facts.filter(Boolean).join("; ");
      if (!d.description && found) {
        add("updateLocationOrProp", { kind, id: it.ref.id, changes: { description: `${it.ref.label} — ${found} (from the script).` } }, `${it.ref.label}: what the script says about it`);
        done.push(`describe ${it.ref.label} from what the script says`);
      }
      not_possible.push("Describing how it looks (materials, colour, condition, light) needs a connected writer (Claude, OpenAI or Gemini) — the built-in test planner doesn't invent details.");
    }
  }

  // ---- Audio Studio: quieter / louder / mute a family of tracks in the focus scene ----
  const tracks = byType("audio_track");
  if (tracks.length) {
    const FAM: [RegExp, string[]][] = [[/\b(music|score)\b/i, ["MX", "SCORE"]], [/\b(ambience|ambient|background|atmos)\b/i, ["BG"]], [/\b(foley|footsteps)\b/i, ["FOLEY"]],
      [/\b(effects|sfx|sound effects)\b/i, ["FX"]], [/\b(dialogue|voices?)\b/i, ["DX"]], [/\b(crowd|walla)\b/i, ["WALLA"]]];
    const fams = FAM.filter(([re]) => re.test(text)).flatMap(([, f]) => f);
    const change: Record<string, unknown> | null = /\bunmute\b/i.test(text) ? { mute: false } : /\bmute\b/i.test(text) ? { mute: true } : null;
    const delta = /\b(quieter|softer|lower|turn (?:it |them )?down)\b/i.test(text) ? (/\bmuch\b/i.test(text) ? -10 : -6) : /\b(louder|raise|turn (?:it |them )?up)\b/i.test(text) ? 3 : 0;
    for (const t of tracks.filter((x) => fams.includes(String(x.data.family)))) {
      const ch = change ?? (delta ? { gain_db: Math.max(-60, Math.min(12, Number(t.data.gain_db ?? 0) + delta)) } : null);
      if (ch) { add("adjustAudioTrack", { track_id: t.ref.id, changes: ch }, `${t.ref.label}: ${Object.entries(ch).map(([k, v]) => `${k} ${v}`).join(", ")}`); done.push(`change the ${t.ref.label} (${Object.entries(ch).map(([k, v]) => `${k.replace("_db", "")} ${v}`).join(", ")})`); }
    }
  }

  // ---- Project Settings: titles & credits switches, credit names, the visual style ----
  const settings = byType("settings")[0];
  if (settings) {
    const ch: Record<string, Record<string, unknown>> = {};
    const put = (s: string, k: string, v: unknown) => ((ch[s] ??= {})[k] = v);
    // "Turn on the end credits and the opening title": the verb covers every item listed after it.
    const on = /\b(?:turn on|switch on|add|show|include)\b/i.test(text), off = /\b(?:turn off|switch off|remove|hide|no)\b/i.test(text);
    if (on !== off) {
      if (/\bend credits\b/i.test(text)) put("titles", "end_credits", on);
      if (/\b(?:opening title|title card)\b/i.test(text)) put("titles", "opening_title", on);
    }
    if (/\b(?:with|play|use)\s+(?:the\s+)?(?:film'?s\s+)?theme(?: music| tune)?\b/i.test(text)) put("titles", "music", "theme");
    for (const m of text.matchAll(/\bset\s+the\s+(director|producer|composer|writer|production company|company)\s+(?:to|as)\s+["“]?([^"”\n.;]+)["”]?/gi)) put("production", m[1].toLowerCase().replace("production ", ""), m[2].trim());
    const look = text.match(/\bset\s+the\s+(?:visual style|look(?: of the film)?)\s+to\s+["“]?([^"”\n]+?)["”]?(?:[.;]|$)/i);
    if (look) put("style", "look", look[1].trim());
    if (Object.keys(ch).length) {
      add("updateSettings", { changes: ch }, `Project Settings: ${Object.entries(ch).flatMap(([s, f]) => Object.keys(f).map((k) => `${s}.${k}`)).join(", ")}`);
      done.push(`update Project Settings (${Object.values(ch).flatMap((f) => Object.keys(f)).join(", ").replace(/_/g, " ")})`);
    }
  }

  // ---- Story fields ----
  const story = [...text.matchAll(/\b(?:change|set|make)\s+the\s+(title|logline|tone|genre|setting|time period)\s+(?:to|into)\s+["“]?([^"”\n]+?)["”]?(?:[.;]|$)/gi)];
  if (story.length) {
    const project = byType("project")[0];
    const fields: Record<string, string> = {};
    for (const m of story) fields[m[1].toLowerCase().replace(" ", "_")] = m[2].trim();
    if (project) {
      add("updateStory", { changes: fields }, `Story setup: ${Object.keys(fields).join(", ")}`);
      done.push(`update the story setup (${Object.keys(fields).join(", ")})`);
    }
  }

  if (!calls.length && !questions.length) not_possible.push("The development test planner only recognises common production requests (time of day, weather, mood, age, wardrobe, subtle dialogue, annotating a whole scene, camera, story fields). Connect Claude for full understanding.");
  return {
    summary: calls.length ? `I'd ${done.join("; ")}.` : "I couldn't turn that into a change with the test planner.",
    operation: (calls[0] ? { updateSceneDNA: "MODIFY_SCENE", updateCharacter: "MODIFY_CHARACTER", changeWardrobe: "CHANGE_WARDROBE", modifyDialogue: "MODIFY_DIALOGUE", modifyShot: "MODIFY_SHOT", updateStory: "UPDATE_STORY", updateLocationOrProp: "MODIFY_WORLD", updateSettings: "UPDATE_SETTINGS", adjustAudioTrack: "MIX_AUDIO" }[calls[0].tool] : "UNSUPPORTED") ?? "UNSUPPORTED",
    calls, not_possible, questions,
  };
}

export const testReasoningAdapter: ReasoningAdapter = {
  id: "aurastage-test",
  name: "AuraStage test planner",
  execution: "test",
  note: "Deterministic development planner — no AI. Recognises common production requests so the flow can be tested without a paid API.",
  isConfigured: () => true,
  async complete<T>(req: ReasoningRequest<T>): Promise<ReasoningResult<T>> {
    // AuraScript tasks: the test writer arranges the structured task into the right shape (labelled TEST OUTPUT).
    if (req.task && req.task.kind !== "plan") {
      const snap = req.task.snapshot as Record<string, any>;
      const data = req.task.kind === "develop_story" ? writer.developStory(snap) : req.task.kind === "outline" ? writer.outline(snap)
        : req.task.kind === "write_scenes" ? writer.writeScenes(snap) : writer.rewrite(snap);
      const ok = req.schema.safeParse(data);
      if (!ok.success) throw new ProviderError(`The test writer produced an invalid ${req.task.kind}: ${ok.error.issues[0]?.message}`);
      return { data: ok.data, test_output: true, model: "aurastage-test-writer-1", provider_request_id: null, usage: { input_tokens: 0, output_tokens: 0 } };
    }
    if (req.task?.kind !== "plan") throw new ProviderError("The test planner only handles Ask AuraStage plans.");
    const out = req.schema.safeParse(plan(req.task.snapshot as Snapshot));
    if (!out.success) throw new ProviderError("The test planner produced an invalid plan (bug).");
    return { data: out.data, test_output: true, model: "aurastage-test-planner-1.0.0", provider_request_id: null, usage: { input_tokens: 0, output_tokens: 0 } };
  },
};
