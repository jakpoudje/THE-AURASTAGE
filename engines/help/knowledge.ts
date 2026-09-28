// The AuraStage knowledge base (SRS §13.4): how each workspace works, written from the real
// behaviour of the product. Used by the Help page and the AuraStage Assistant. Keep in step
// with the workspaces when behaviour changes.

export type Guide = {
  id: string;
  /** Permission module the guide is about, or "general". */
  module: string;
  title: string;
  summary: string;
  steps: string[];
  keywords: string[];
};

export const GUIDES: Guide[] = [
  { id: "getting-started", module: "general", title: "Getting started: from idea to finished film",
    summary: "AuraStage works in nine stages. Each stage builds on what the previous one approved, so later work always matches your script.",
    steps: ["Create a project on the dashboard (title, type, runtime).", "Write or import the screenplay in Scriptwriter and approve it.",
      "Confirm the cast in Casting & Characters, then bring in and approve dialogue.", "Lock each scene's Scene DNA, plan and approve shots in Storyboard & Shots.",
      "Generate and approve takes in Visual Generation, build and approve scene sound in Audio Studio.",
      "Assemble and lock the picture in Editorial & Timeline, then render deliverables in Export & Deliver."],
    keywords: ["start", "begin", "new", "project", "workflow", "stages", "overview", "how"] },
  { id: "scriptwriter", module: "script", title: "Writing and approving the screenplay",
    summary: "Type in screenplay format or import Final Draft / Fountain. Every save is a version; approving a version creates the scenes every later stage uses.",
    steps: ["Fill in Project Setup (genre, runtime, logline) so the runtime plan can pace your acts.", "Write in Edit & Refine, or import a .fdx/.fountain file.",
      "Save versions as you go — you can always compare and go back.", "Approve the version you want to shoot. Scenes that change in a later approval are flagged for review downstream, never deleted."],
    keywords: ["script", "screenplay", "write", "import", "final draft", "fountain", "fdx", "approve", "version", "scene", "runtime"] },
  { id: "casting", module: "casting", title: "Finding and confirming characters",
    summary: "Characters are found in the approved script with evidence (the lines where they speak or appear). Confirm, merge duplicates, and add profiles, relationships and wardrobe.",
    steps: ["Press Find characters after approving the script.", "Confirm the ones AuraStage isn't sure about; merge aliases like 'TUNDE' and 'TUNDE (V.O.)'.",
      "Fill in each profile, relationships and wardrobe looks.", "Approve characters so Scene DNA and dialogue can use them."],
    keywords: ["character", "cast", "casting", "merge", "alias", "wardrobe", "relationship", "profile"] },
  { id: "dialogue", module: "dialogue", title: "Dialogue lines, annotations and approval",
    summary: "Every spoken line comes from the approved script with its speaker and listeners. Annotate intent and emotion, then approve scene by scene.",
    steps: ["Bring in dialogue from the approved script.", "Fix unresolved speakers (links take you to Casting).", "Annotate intent, emotion and subtext.", "Approve each scene's dialogue."],
    keywords: ["dialogue", "line", "speaker", "emotion", "intent", "subtext", "annotate"] },
  { id: "scene-dna", module: "scene_dna", title: "Scene DNA: the blueprint of each scene",
    summary: "Scene DNA combines the script, cast and dialogue into one blueprint per scene, with readiness checks that show exactly what's missing. Lock it to start planning shots.",
    steps: ["Open a scene and review what was detected, with the source lines.", "Fill mood, location, time and continuity notes.",
      "Clear the readiness checks — each one names its evidence.", "Lock the scene. If the script or cast changes later, the lock is marked for review, not thrown away."],
    keywords: ["scene dna", "blueprint", "lock", "readiness", "continuity", "mood", "location"] },
  { id: "storyboard", module: "shots", title: "Planning shots and storyboards",
    summary: "Shot plans are generated from locked Scene DNA with a reason for each shot, and coverage maths that makes sure every line is seen.",
    steps: ["Generate a shot plan for a locked scene.", "Edit sizes, angles, lenses and movement; add or reorder shots.", "Check coverage — every dialogue line must be covered.", "Approve the plan."],
    keywords: ["shot", "storyboard", "coverage", "camera", "lens", "angle", "plan"] },
  { id: "visual", module: "generation", title: "Generating takes",
    summary: "Prompts are compiled automatically from the approved shot, Scene DNA, cast and dialogue. The built-in Sketch provider always works; Runway and OpenAI switch on when the studio owner adds their keys.",
    steps: ["Compile a shot's prompt and read its provenance badges.", "Generate takes with a provider that says 'configured'.", "Compare variations and approve one per shot."],
    keywords: ["generate", "take", "image", "video", "runway", "openai", "prompt", "provider", "sketch"] },
  { id: "audio", module: "audio", title: "Scene sound and mixing",
    summary: "Sessions are spotted from the approved shot plan with a cue for every line. Upload recordings, mix with gain and pan, measure loudness and approve.",
    steps: ["Spot the scene to create tracks and cues.", "Upload WAV recordings onto cues (Assets Library keeps them).",
      "Mix: gain, pan, mute, solo — the meters are real.", "Measure the rendered mix, then approve. Export the mix or DX/FX/BG/MX stems as WAV."],
    keywords: ["audio", "sound", "mix", "loudness", "lufs", "stem", "wav", "record", "upload"] },
  { id: "editorial", module: "editorial", title: "Editing and Picture Lock",
    summary: "Build the first assembly from approved takes and scene mixes, edit with trim/roll/slip/slide/blade, then lock the picture. Breaking a lock asks first and records the impact.",
    steps: ["Build the first assembly.", "Edit on the timeline: Space plays, B cuts at the playhead, Delete lifts.", "Fix what editorial QC reports (offline shots, gaps).",
      "Lock the picture. Comments can be pinned to a timecode from the Comments panel."],
    keywords: ["edit", "timeline", "cut", "trim", "lock", "picture lock", "assembly", "conform", "edl", "timecode"] },
  { id: "export", module: "delivery", title: "Rendering deliverables",
    summary: "Deliverables are rendered from the current Picture Lock by the render worker and checked file by file (format, duration, loudness, checksum) before you download them.",
    steps: ["Lock the picture in Editorial.", "Choose a preset (Streaming Master, Review Copy, ProRes, Audio Package, Subtitles, EDL).",
      "Render and watch the queue — you can cancel.", "Download once QC passes. Deliverables from an older lock are marked out of date and kept."],
    keywords: ["export", "render", "deliver", "download", "mp4", "prores", "qc", "subtitle", "srt"] },
  { id: "team", module: "team", title: "Inviting your team and roles",
    summary: "Invite people with a private link and give each person their film role. Every workspace respects the role — checked on the server for every change.",
    steps: ["Open Team & Collaboration.", "Enter an email and choose a role (Director, Writer, Editor, Reviewer…).",
      "Copy the invite link and send it — it works once, only for that email, and expires in 14 days.", "Change roles or add extra permissions any time."],
    keywords: ["team", "invite", "role", "permission", "member", "access", "collaborate", "reviewer", "producer", "view only"] },
  { id: "comments", module: "team", title: "Comments, mentions and review requests",
    summary: "Every workspace has a Comments panel. Mention people to notify them, ask for a review, and resolve threads when done.",
    steps: ["Open Comments in the top bar.", "Write, and use @ Mention to notify someone on the project.", "Use Request review to assign a review with a due date.", "Resolve the thread when it's handled."],
    keywords: ["comment", "mention", "notify", "notification", "review", "task", "resolve", "bell"] },
  { id: "account", module: "general", title: "Your account and security",
    summary: "See where you're signed in, sign out other devices, change your password.",
    steps: ["Open Account & security from the Help page.", "Review devices; sign out any you don't recognise.", "Change your password if you think it's been seen by someone else."],
    keywords: ["account", "password", "security", "session", "device", "sign out", "login"] },
];

export type Trouble = { code: string; title: string; meaning: string; fix: string; module: string };

export const TROUBLESHOOTING: Trouble[] = [
  { code: "AURA-COL-403", module: "team", title: "“Your role can't … here”", meaning: "Your role on this project doesn't allow that action.", fix: "Ask the project's producer or a studio owner to change your role or add an extra permission on the Team page." },
  { code: "AURA-SCR-409", module: "script", title: "Someone saved a newer version", meaning: "Another save happened after you opened the script.", fix: "Reload to see the newer version; your unsaved text is kept in this browser." },
  { code: "AURA-SDNA-412", module: "scene_dna", title: "Scene isn't ready to lock", meaning: "A readiness check is failing.", fix: "Open the scene's checks — each names what's missing and links to the stage that owns it." },
  { code: "AURA-GEN-412", module: "generation", title: "Provider not connected", meaning: "That generation provider has no API key on the server.", fix: "Use AuraStage Sketch, or ask the studio owner to add the provider's key." },
  { code: "AURA-EDT-423", module: "editorial", title: "The picture is locked", meaning: "Editing would change a locked cut.", fix: "Confirm breaking the lock (the impact is shown first), or keep the lock." },
  { code: "AURA-EXP-412", module: "delivery", title: "No Picture Lock yet", meaning: "Deliverables are only made from the current Picture Lock.", fix: "Lock the picture in Editorial & Timeline first." },
  { code: "AURA-AUD-412", module: "audio", title: "Mix needs a fresh measurement", meaning: "The mix changed since it was last measured.", fix: "Press Measure, then approve." },
];
