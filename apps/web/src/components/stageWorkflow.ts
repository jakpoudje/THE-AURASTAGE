// How to work on each production page (owner request 2026-10-02: "a clear workflow for users in every page … both bulk
// request and also individual hands on click … scene by scene, character by character, clips by clips"). Shown in the
// workflow strip under every stage's header together with that stage's own checks from the production overview. The
// button names here are the page's real buttons; whole-film work runs in rounds/batches in the background (production
// runs, the generator's run queue — migration 0055), so a big request never overloads the system.
export interface StageWorkflow { all: string; one: string }

export const STAGE_WORKFLOW: Record<string, StageWorkflow> = {
  scriptwriter: {
    all: "Develop the story, outline and full script with AuraScript (scenes are written in parallel batches), then Approve the script.",
    one: "Write or edit any stage yourself — Setup, Story, Outline, Script — or condense one scene; nothing changes until you save or apply.",
  },
  casting: {
    all: "1 · Find characters in the script, 2 · Profiles for the whole cast, 3 · Character looks for the whole cast (only empty fields and missing views).",
    one: "Open a character to fill or edit their profile, make their looks, age them, and approve them one by one.",
  },
  world: {
    all: "“1 · Find locations & props in the script”, “2 · Describe every place and prop (free)”, then “3 · Make reference pictures for every place and prop (free)”.",
    one: "Open a location or prop to describe it and make its views (time of day, areas) one at a time.",
  },
  dialogue: {
    all: "Bring in the lines, then “1 · Fill every line in the film (free)” (you see every change first) and “2 · Approve every scene's dialogue”.",
    one: "Pick a scene, edit each line's emotion, intensity and delivery, then approve that scene.",
  },
  "scene-dna": {
    all: "“1 · Fill every scene's Scene DNA (free)” (you see every change first), then “2 · Lock every ready scene”.",
    one: "Pick a scene, work through its four sections (or fill them from the script), then lock that scene.",
  },
  storyboard: {
    all: "“▶ Do 1–2 for the whole film”: every locked scene is planned one after another in the background, then every ready plan approved (or press 1 and 2 yourself; “↻ Re-plan flagged scenes” redoes scenes a Scene DNA change flagged).",
    one: "Pick a scene, then on the right: 1 choose a coverage style, 2 plan its shots, 3 check and edit any shot, 4 approve that plan.",
  },
  visual: {
    all: "Whole film, in order: compile every prompt, sketch every shot (free), approve a take for each — worked in batches in the background.",
    one: "Pick a shot: compile its prompt, generate or sketch takes (choose how many variations) and approve the one you want.",
  },
  audio: {
    all: "Whole film, in order: spot every scene, “Generate all planned sounds”, place them, then measure and approve each mix — worked in batches.",
    one: "Pick a scene: generate or upload each clip (voice, effect, ambience, music), mix it, measure and approve that scene.",
  },
  editorial: {
    all: "“Build first assembly” (or Re-assemble), “Bring the whole cut up to date (Conform)”, then Lock picture.",
    one: "“One scene at a time”: build a test cut of one scene, bring just that scene up to date and play it; edit any clip on the timeline.",
  },
  export: {
    all: "Render every required deliverable from the current Picture Lock.",
    one: "Choose one deliverable (review copy, streaming master, subtitles, audio package, a cut-down) and render it on its own.",
  },
};
