// Local stand-in for the AuraStage API so the web UI can be driven in a browser offline.
const http = require("http");
const eng = require(require("path").resolve(__dirname, "../../../engines/dist/index.js"));
const crypto = require("crypto");
const P = "11111111-1111-4111-8111-111111111111", ORG = "22222222-2222-4222-8222-222222222222", S = "33333333-3333-4333-8333-333333333333";
const now = () => new Date().toISOString();
let project = { id: P, org_id: ORG, title: "Shadows of Lagos", type: "feature_film", genre: "Thriller", target_runtime_minutes: 110, status: "draft", created_at: now(), updated_at: now() };
let script = null; const versions = []; let scenes = [];
const chars = [], aliases = [], apps = [], rels = [], looks = [], dlines = []; let timeline = null, tclips = []; const renders = []; const tversions = [], locks = []; const assets = [], asessions = [], atracks = [], aclips = [], ameasures = [], aversions = []; const sdna = [], sdnaVersions = [], plans = [], shots = [], planVersions = [], packages = [], takes = []; let dlgSyncVersion = null, dlgSyncAt = null; let lastSyncVersion = null, lastSyncAt = null;
const ws = () => {
  const cur = script && versions.find((v) => v.id === script.current_version_id);
  return { script, current_version: cur || null, versions: versions.map(({ id, version_number, note, parser_version, created_at }) => ({ id, version_number, note, parser_version, created_at })).reverse(), scenes, analysis: cur ? eng.sceneBoundaryEngine({ elements: cur.elements }).analysis : null };
};
http.createServer((req, res) => {
  const chunks = []; req.on("data", (c) => chunks.push(c)); req.on("end", () => {
    const raw = Buffer.concat(chunks); const body = /^audio\//.test(req.headers["content-type"] || "") ? "" : raw.toString();
    res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Headers", "*"); res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    if (req.method === "OPTIONS") return res.end();
    const send = (code, obj) => { res.statusCode = code; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(obj)); };
    const b = body ? JSON.parse(body) : {}; const u = req.url.split("?")[0];
    console.log(req.method, u);
    // ---- Project Settings (mirrors apps/api/src/modules/settings + migration 0023) ----
    const cc0 = require(require("path").resolve(__dirname, "../../../packages/contracts/dist/index.js"));
    const ST = globalThis.__settings || (globalThis.__settings = { settings: cc0.DEFAULT_PROJECT_SETTINGS, revision: null, version_number: 0, updated_at: null, versions: [] });
    const settingsView = () => ({ ...ST, story: { title: project.title, type: project.type, genre: project.genre ?? null, subgenre: null, setting: null, time_period: null, logline: project.logline ?? null, tone: project.tone ?? null, target_runtime_minutes: project.target_runtime_minutes ?? null },
      facts: [{ id: "timebase", label: "Timebase", value: "24 fps", reason: "Editorial, subtitles and every deliverable are built on a 24 fps timeline." }],
      loudness_standards: Object.entries(cc0.LOUDNESS_STANDARDS).map(([id, v]) => ({ id, ...v })),
      providers: [{ id: "aurastage-sketch", name: "AuraStage Sketch", capabilities: ["image"], state: "configured" }, { id: "runway", name: "Runway", capabilities: ["image", "video"], state: "not_configured" }],
      delivery_profiles: eng.deliveryProfiles().filter((p) => p.available).map((p) => ({ id: p.id, name: p.label })), paid_takes_this_month: 0 });
    if (u === "/api/organizations/bootstrap") return send(200, { id: ORG, name: "Test Studio", slug: "t", created_at: now() });
    if (u === "/api/projects" && req.method === "GET") return send(200, [project]);
    if (u === "/api/projects" && req.method === "POST") {
      // Same validation as the real API (packages/contracts).
      const c = require(require("path").resolve(__dirname, "../../../packages/contracts/dist/index.js"));
      console.log("POST /api/projects body:", body);
      const r = c.CreateProjectInputSchema.safeParse(b);
      if (!r.success) return send(400, { error: { code: "AURA-SCR-001", message: "Invalid project input", issues: r.error.issues } });
      return send(201, { ...project, ...r.data, id: crypto.randomUUID() });
    }
    if (u === `/api/projects/${P}` && req.method === "GET") return send(200, project);
    if (u === `/api/projects/${P}` && req.method === "PATCH") { const { org_id, ...rest } = b; project = { ...project, ...rest, updated_at: now() }; return send(200, project); }
    if (u === `/api/projects/${P}/settings` && req.method === "GET") return send(200, settingsView());
    if (u === `/api/projects/${P}/settings/impact`) {
      const r = cc0.ProjectSettingsSchema.safeParse(b.settings);
      if (!r.success) return send(400, { error: { code: "AURA-SET-400", message: r.error.issues[0].message } });
      const changed = []; const walk = (a, c, pre) => { if (a && c && typeof a === "object" && !Array.isArray(a)) { for (const k of new Set([...Object.keys(a), ...Object.keys(c)])) walk(a[k], c[k], pre ? pre + "." + k : k); } else if (JSON.stringify(a ?? null) !== JSON.stringify(c ?? null)) changed.push(pre); };
      walk(ST.settings, r.data, "");
      const impact = []; if (changed.some((c) => c.startsWith("style"))) impact.push({ path: "style", label: "Visual style", effect: "New shot prompts will use it. Nothing compiled yet." });
      if (changed.includes("technical.loudness_standard")) { const t = cc0.loudnessTarget(r.data.technical.loudness_standard); impact.push({ path: "technical.loudness_standard", label: "Loudness standard", effect: `Audio Studio and deliverable QC will check ${t.integrated_lufs} LUFS ±${t.tolerance_lu}. 0 approved scene mixes stay approved — the check is advisory and mixes are never re-levelled automatically.` }); }
      if (changed.includes("generation.monthly_paid_take_limit")) impact.push({ path: "generation.monthly_paid_take_limit", label: "Monthly paid takes", effect: r.data.generation.monthly_paid_take_limit === null ? "No monthly cap on paid generations." : `0 of ${r.data.generation.monthly_paid_take_limit} paid takes used this month.` });
      if (changed.some((c) => c.startsWith("production"))) impact.push({ path: "production", label: "Credits", effect: "Written into files rendered from now on. Files already rendered keep what they have." });
      if (changed.includes("delivery.required_profiles")) impact.push({ path: "delivery.required_profiles", label: "Required deliverables", effect: `Export & Deliver will track ${r.data.delivery.required_profiles.length} required deliverables.` });
      return send(200, { changed, impact });
    }
    if (u === `/api/projects/${P}/settings` && req.method === "PUT") {
      const r = cc0.ProjectSettingsSchema.safeParse(b.settings);
      if (!r.success) return send(400, { error: { code: "AURA-SET-400", message: r.error.issues[0].message } });
      if ((ST.revision ?? null) !== (b.base_revision ?? null)) return send(409, { error: { code: "AURA-SET-409", message: "someone changed the settings since you opened them — reload to see their version" } });
      Object.assign(ST, { settings: r.data, revision: crypto.randomUUID(), version_number: ST.version_number + 1, updated_at: now() });
      ST.versions.unshift({ version_number: ST.version_number, changed: ["settings"], created_at: now() });
      return send(200, settingsView());
    }
    if (u === `/api/projects/${P}/script`) return send(200, ws());
    if (u === `/api/projects/${P}/scope-plan`) return send(200, { plan: project.target_runtime_minutes ? eng.runtimeScopeEngine({ target_runtime_minutes: project.target_runtime_minutes, genre: project.genre, type: project.type }) : null });
    if (u === `/api/projects/${P}/script/versions`) {
      if ((script?.current_version_id ?? null) !== b.base_version_id) return send(409, { error: { code: "AURA-SCR-409", message: "Someone saved a newer version since you opened this script. Reload to see it." } });
      if (!script) script = { id: S, org_id: ORG, project_id: P, status: "draft", current_version_id: null, approved_version_id: null, created_at: now(), updated_at: now() };
      const v = { id: crypto.randomUUID(), script_id: S, org_id: ORG, version_number: versions.length + 1, source_text: b.source_text, elements: eng.screenplayFormatEngine({ source_text: b.source_text }).elements, parser_version: "p", note: b.note ?? null, created_at: now() };
      versions.push(v); script = { ...script, current_version_id: v.id }; return send(201, v);
    }
    if (u === `/api/projects/${P}/script/approve`) {
      const v = versions.find((x) => x.id === b.version_id);
      const derived = eng.sceneBoundaryEngine({ elements: v.elements }).scenes;
      const hash = (s) => crypto.createHash("sha256").update(JSON.stringify(v.elements.slice(s.element_start, s.element_end + 1).map((e) => [e.type, e.text]))).digest("hex");
      const old = new Map(scenes.map((s) => [s.number, s]));
      scenes = derived.map((s) => { const o = old.get(s.number); const h = hash(s); return { id: o?.id ?? crypto.randomUUID(), org_id: ORG, project_id: P, script_id: S, ...s, content_hash: h, source_version_id: v.id, status: "active", review_state: o && o.content_hash !== h ? "review_required" : (o?.review_state ?? "current"), created_at: now(), updated_at: now() }; });
      for (const [n, o] of old) if (n > derived.length) scenes.push({ ...o, status: "omitted", review_state: "review_required" });
      script = { ...script, status: "approved", approved_version_id: v.id }; return send(200, script);
    }

    // ---- Casting (mirrors apps/api/src/modules/characters + migration 0006 semantics) ----
    const approved = () => script?.approved_version_id && versions.find((x) => x.id === script.approved_version_id);
    const resolve = (confirm = []) => {
      const v = approved(); if (!v) return null;
      const sc = eng.sceneBoundaryEngine({ elements: v.elements }).scenes;
      const { candidates } = eng.characterCandidateExtractionEngine({ elements: v.elements, scenes: sc });
      const existing = chars.map((c) => ({ id: c.id, name: c.name, merged_into: c.merged_into, aliases: aliases.filter((a) => a.character_id === c.id).map((a) => a.normalized) }));
      return { v, rs: eng.characterIdentityResolutionEngine({ candidates, existing, confirmed_keys: confirm }).resolutions };
    };
    const norm = (x) => require(require("path").resolve(__dirname, "../../../packages/contracts/dist/index.js")).normalizeCharacterName(x);
    const doSync = (confirm) => {
      const r = resolve(confirm); let created = 0, matched = 0; apps.length = 0;
      for (const x of r.rs.filter((y) => y.decision !== "confirm")) {
        let id = x.character_id;
        if (x.decision === "create") { id = crypto.randomUUID(); created++; chars.push({ id, org_id: ORG, project_id: P, name: x.candidate.display_name, role: x.candidate.suggested_role, kind: x.candidate.kind, status: "draft", age: x.candidate.age, description: x.candidate.introduction, merged_into: null, created_from_version_id: r.v.id, created_at: now(), updated_at: now() }); aliases.push({ id: crypto.randomUUID(), character_id: id, alias: x.candidate.display_name, normalized: x.candidate.key, source: "name" }); } else matched++;
        const target = chars.find((c) => c.id === id); if (target.merged_into) id = target.merged_into;
        for (const al of x.candidate.aliases) if (!aliases.some((a) => a.normalized === norm(al))) aliases.push({ id: crypto.randomUUID(), character_id: id, alias: al, normalized: norm(al), source: "script" });
        for (const ap of x.candidate.appearances) { const scene = scenes.find((s) => s.number === ap.scene_number); if (scene) apps.push({ id: crypto.randomUUID(), character_id: id, scene_id: scene.id, source_version_id: r.v.id, ...ap }); }
      }
      lastSyncVersion = r.v.id; lastSyncAt = now();
      return { summary: { created, matched, appearances: apps.length }, pending: r.rs.filter((y) => y.decision === "confirm").map((y) => y.candidate) };
    };
    if (u === `/api/projects/${P}/characters` && req.method === "GET") {
      const r = resolve();
      const newFromScript = r ? r.rs.filter((y) => y.decision === "create").length : 0;
      return send(200, { characters: chars, aliases, appearances: apps, relationships: rels, wardrobe_looks: looks, script: r ? { approved_version_id: r.v.id, version_number: r.v.version_number } : null,
        sync: { state: !r ? "no_script" : !lastSyncVersion ? "never" : lastSyncVersion === r.v.id && newFromScript === 0 ? "current" : "stale", synced_version_id: lastSyncVersion, synced_at: lastSyncAt, engine_version: "1.0.0", new_from_script: newFromScript },
        pending: r ? r.rs.filter((y) => y.decision === "confirm").map((y) => y.candidate) : [] });
    }
    if (u === `/api/projects/${P}/characters/sync`) return approved() ? send(200, doSync(b.confirm || [])) : send(412, { error: { code: "AURA-CHR-412", message: "Approve the script in Scriptwriter first — characters are built from the approved script." } });
    if (u === `/api/projects/${P}/characters/merge`) {
      const s = chars.find((c) => c.id === b.source_id), t = chars.find((c) => c.id === b.target_id);
      for (const a of aliases) if (a.character_id === s.id) { a.character_id = t.id; if (a.source === "name") { a.source = "merge"; s._nameAlias = a.id; } }
      for (const ap of apps) if (ap.character_id === s.id) ap.character_id = t.id;
      s.merged_into = t.id; return send(200, t);
    }
    let m;
    if ((m = u.match(/^\/api\/characters\/([^/]+)\/unmerge$/))) { const s = chars.find((c) => c.id === m[1]); const a = aliases.find((x) => x.id === s._nameAlias); if (a) { a.character_id = s.id; a.source = "name"; } s.merged_into = null; doSync([]); return send(200, s); }
    if ((m = u.match(/^\/api\/characters\/([^/]+)\/aliases$/))) { const a = { id: crypto.randomUUID(), character_id: m[1], alias: b.alias, normalized: norm(b.alias), source: "user" }; if (aliases.some((x) => x.normalized === a.normalized && x.character_id !== m[1])) return send(409, { error: { code: "AURA-CHR-409", message: "another character already uses that name — merge them instead" } }); aliases.push(a); return send(201, a); }

    if (u === `/api/projects/${P}/characters` && req.method === "POST") {
      const n = norm(b.name || "");
      if (!n) return send(400, { error: { code: "AURA-CHR-002", message: "Invalid character input" } });
      if (aliases.some((a) => a.normalized === n)) return send(409, { error: { code: "AURA-CHR-409", message: "a character with that name already exists" } });
      const c = { id: crypto.randomUUID(), org_id: ORG, project_id: P, name: b.name, role: b.role || "minor", kind: b.kind || "individual", status: "draft", merged_into: null, created_from_version_id: null, created_at: now(), updated_at: now() };
      chars.push(c); aliases.push({ id: crypto.randomUUID(), character_id: c.id, alias: b.name, normalized: n, source: "name" });
      return send(201, c);
    }
    if (u === `/api/projects/${P}/relationships`) {
      if (b.character_a === b.character_b) return send(400, { error: { code: "AURA-CHR-400", message: "a character cannot have a relationship with themselves" } });
      const [a2, b2] = [b.character_a, b.character_b].sort();
      let r = rels.find((x) => x.character_a === a2 && x.character_b === b2);
      if (!r) { r = { id: crypto.randomUUID(), project_id: P, character_a: a2, character_b: b2, created_at: now() }; rels.push(r); }
      Object.assign(r, { relationship: b.relationship, description: b.description ?? null, updated_at: now() });
      return send(200, r);
    }
    if ((m = u.match(/^\/api\/relationships\/([^/]+)$/)) && req.method === "DELETE") { const i = rels.findIndex((x) => x.id === m[1]); if (i >= 0) rels.splice(i, 1); return send(200, { deleted: true }); }
    if ((m = u.match(/^\/api\/characters\/([^/]+)\/looks$/))) {
      if (looks.some((l) => l.character_id === m[1] && l.name.toLowerCase() === b.name.toLowerCase() && l.id !== b.id)) return send(409, { error: { code: "AURA-CHR-409", message: "this character already has a look with that name" } });
      let l = b.id && looks.find((x) => x.id === b.id);
      if (!l) { l = { id: crypto.randomUUID(), project_id: P, character_id: m[1], created_at: now() }; looks.push(l); }
      Object.assign(l, { name: b.name, description: b.description ?? null, updated_at: now() });
      return send(200, l);
    }
    if ((m = u.match(/^\/api\/looks\/([^/]+)$/)) && req.method === "DELETE") { const i = looks.findIndex((x) => x.id === m[1]); if (i >= 0) looks.splice(i, 1); return send(200, { deleted: true }); }
    if ((m = u.match(/^\/api\/characters\/([^/]+)$/)) && req.method === "PATCH") {
      const c = chars.find((x) => x.id === m[1]);
      if (b.name) { const n = norm(b.name); if (aliases.some((a) => a.normalized === n && a.character_id !== c.id)) return send(409, { error: { code: "AURA-CHR-409", message: "another character already uses that name" } }); for (const a of aliases) if (a.character_id === c.id && a.source === "name") a.source = "user"; aliases.push({ id: crypto.randomUUID(), character_id: c.id, alias: b.name, normalized: n, source: "name" }); }
      Object.assign(c, b, { updated_at: now() }); return send(200, c);
    }

    // ---- Dialogue (mirrors apps/api/src/modules/dialogue + migration 0010 semantics) ----
    if (u === `/api/projects/${P}/dialogue` && req.method === "GET") {
      const v = approved();
      const active = dlines.filter((l) => l.status === "active").map((l) => ({ ...l, word_count: (l.text.match(/[\p{L}\p{N}'’-]+/gu) ?? []).length }));
      return send(200, {
        script: v ? { approved_version_id: v.id, version_number: v.version_number } : null,
        sync: { state: !v ? "no_script" : !dlgSyncVersion ? "never" : dlgSyncVersion === v.id ? "current" : "stale", synced_version_id: dlgSyncVersion, synced_at: dlgSyncAt },
        scenes: scenes.map((s) => ({ id: s.id, number: s.number, heading: s.heading, status: s.status, review_state: s.review_state })),
        characters: chars.filter((c) => !c.merged_into).map((c) => ({ id: c.id, name: c.name })),
        lines: dlines,
        analysis: {
          voiceprints: eng.dialogueVoiceprintEngine({ lines: active }).voiceprints,
          balance: eng.dialogueBalanceEngine({ lines: active }).scenes,
          unresolved_speakers: [...new Set(active.filter((l) => !l.character_id).map((l) => l.speaker_name))],
          review_required: dlines.filter((l) => l.review_state === "review_required").length,
        },
      });
    }
    if (u === `/api/projects/${P}/dialogue/sync`) {
      const v = approved();
      if (!v) return send(412, { error: { code: "AURA-DLG-412", message: "Approve the script in Scriptwriter first — dialogue is built from the approved script." } });
      const sc = eng.sceneBoundaryEngine({ elements: v.elements }).scenes;
      const { lines } = eng.dialogueExtractionEngine({ elements: v.elements, scenes: sc });
      const resolveChar = (key) => { const a = aliases.find((x) => x.normalized === key); if (!a) return null; let c = chars.find((x) => x.id === a.character_id); while (c && c.merged_into) c = chars.find((x) => x.id === c.merged_into); return c ? c.id : null; };
      const seen = new Set(); let created = 0, kept = 0, changed = 0, omitted = 0;
      for (const l of lines) {
        const scene = scenes.find((s) => s.number === l.scene_number && s.status === "active"); if (!scene) continue;
        const character_id = resolveChar(l.speaker_key);
        const listener_ids = [...new Set(apps.filter((a) => a.scene_id === scene.id && !a.voice_only).map((a) => a.character_id))].filter((x) => x !== character_id);
        const base = { scene_id: scene.id, scene_number: l.scene_number, ordinal: l.ordinal, character_id, speaker_name: l.speaker_name, speaker_key: l.speaker_key, extensions: l.extensions, parenthetical: l.parenthetical, listener_ids, estimated_seconds: l.estimated_seconds, element_index: l.element_index, source_version_id: v.id, updated_at: now() };
        let e = dlines.find((x) => x.scene_id === scene.id && x.text_hash === l.text_hash && !seen.has(x.id));
        if (e) { if (e.status === "omitted") e.review_state = "review_required"; Object.assign(e, base, { status: "active" }); seen.add(e.id); kept++; continue; }
        e = dlines.find((x) => x.scene_id === scene.id && x.speaker_key === l.speaker_key && x.ordinal === l.ordinal && x.status === "active" && !seen.has(x.id));
        if (e) { const annotated = e.approval === "approved" || e.intention || e.subtext || e.emotion || e.notes || e.intensity !== null; if (annotated) { e.previous_text = e.previous_text || e.text; e.review_state = "review_required"; } Object.assign(e, base, { text: l.text, text_hash: l.text_hash }); seen.add(e.id); changed++; continue; }
        const n = { id: crypto.randomUUID(), project_id: P, ...base, text: l.text, text_hash: l.text_hash, intention: null, subtext: null, emotion: null, intensity: null, notes: null, status: "active", approval: "draft", review_state: "current", previous_text: null, created_at: now() };
        dlines.push(n); seen.add(n.id); created++;
      }
      for (const x of dlines) if (x.status === "active" && !seen.has(x.id)) { x.status = "omitted"; if (x.approval === "approved" || x.intention || x.emotion) x.review_state = "review_required"; omitted++; }
      dlines.sort((a, b) => a.scene_number - b.scene_number || a.ordinal - b.ordinal);
      dlgSyncVersion = v.id; dlgSyncAt = now();
      return send(200, { version_id: v.id, created, kept, changed, omitted });
    }
    if ((m = u.match(/^\/api\/projects\/[^/]+\/dialogue\/scenes\/([^/]+)\/approve$/))) {
      let n = 0; for (const l of dlines) if (l.scene_id === m[1] && l.status === "active") { l.approval = "approved"; l.review_state = "current"; l.previous_text = null; n++; }
      return n ? send(200, { approved_lines: n }) : send(404, { error: { code: "AURA-DLG-404", message: "no dialogue in that scene" } });
    }
    if ((m = u.match(/^\/api\/dialogue-lines\/([^/]+)$/)) && req.method === "PATCH") {
      const l = dlines.find((x) => x.id === m[1]); if (!l) return send(404, { error: { code: "AURA-DLG-404", message: "line not found" } });
      const EMO = ["neutral","joy","sadness","anger","fear","surprise","disgust","trust","anticipation","tension","love","contempt","resignation","determination"];
      if (b.emotion && !EMO.includes(b.emotion)) return send(400, { error: { code: "AURA-DLG-002", message: "Invalid dialogue input" } });
      const annot = ["intention","subtext","emotion","intensity","notes"].some((k) => k in b);
      for (const k of ["intention","subtext","emotion","intensity","notes"]) if (k in b) l[k] = b[k] === "" ? null : b[k];
      if ("approval" in b) l.approval = b.approval; else if (annot) l.approval = "draft";
      if (b.acknowledge_review || b.approval === "approved") { l.review_state = "current"; l.previous_text = null; }
      l.updated_at = now();
      return send(200, l);
    }

    // ---- Scene DNA (mirrors apps/api/src/modules/scene-dna + migration 0011 semantics) ----
    const pg = require(require("path").resolve(__dirname, "../../../packages/production-graph/dist/index.js"));
    const follow = (id) => { let c = chars.find((x) => x.id === id); while (c && c.merged_into) c = chars.find((x) => x.id === c.merged_into); return c ? c.id : id; };
    const EDIT = { purpose: null, stakes: null, story_time: null, mood: [], weather: null, atmosphere: null, lighting_intent: null, sound_intent: null, camera_energy: null, silent_scene: false, wardrobe: {}, notes: null };
    const sdnaEntry = (scene) => {
      const v = approved(); const rec = sdna.find((r) => r.scene_id === scene.id);
      const editable = rec ? Object.fromEntries(Object.keys(EDIT).map((k) => [k, rec[k]])) : { ...EDIT };
      const act = scenes.filter((s) => s.status === "active"); const pos = act.indexOf(scene);
      const adj = (s) => (s ? { number: s.number, heading: s.heading, location: s.location, time_of_day: s.time_of_day, int_ext: s.int_ext } : null);
      const part = new Map();
      for (const a of apps.filter((x) => x.scene_id === scene.id)) { const id = follow(a.character_id); const pr = part.get(id); part.set(id, { voice_only: pr ? pr.voice_only && a.voice_only : a.voice_only, speaking: (pr?.speaking ?? false) || a.speaking, line_count: (pr?.line_count ?? 0) + (a.line_count ?? 0) }); }
      const participants = [...part.entries()].map(([id, x]) => { const c = chars.find((y) => y.id === id); return { character_id: id, name: c.name, kind: c.kind, status: c.status, ...x }; });
      const lines = dlines.filter((l) => l.scene_id === scene.id && l.status === "active");
      const ids = new Set(participants.map((x) => x.character_id));
      const avail = looks.filter((l) => ids.has(follow(l.character_id))).map((l) => ({ id: l.id, character_id: follow(l.character_id), name: l.name }));
      const { proposal, engine_version } = eng.sceneDnaAssemblyEngine({
        scene: { id: scene.id, number: scene.number, heading: scene.heading, int_ext: scene.int_ext, location: scene.location, time_of_day: scene.time_of_day, estimated_seconds: scene.estimated_seconds, status: scene.status },
        action: scene.status === "active" ? v.elements.filter((e) => e.index >= scene.element_start && e.index <= scene.element_end && e.type === "action").map((e) => ({ line: e.line, text: e.text })) : [],
        participants, dialogue: lines.map((l) => ({ id: l.id, speaker: l.speaker_name, character_id: l.character_id, emotion: l.emotion, intensity: l.intensity, approval: l.approval, review_state: l.review_state })),
        adjacent: { previous: adj(act[pos - 1]), next: pos >= 0 ? adj(act[pos + 1]) : null }, wardrobe_available: avail, editable,
      });
      const fp = (...x) => JSON.stringify(x);
      const deps = [{ type: "scene", id: scene.id, fingerprint: scene.content_hash, strength: "hard", label: `Scene ${scene.number}` },
        ...participants.map((x) => { const c = chars.find((y) => y.id === x.character_id); return { type: "character", id: c.id, fingerprint: fp(c.name, c.kind, c.status, c.role, c.age, c.gender, c.description, x.voice_only), strength: "soft", label: c.name }; }),
        ...lines.map((l) => ({ type: "dialogue_line", id: l.id, fingerprint: fp(l.text_hash, l.character_id, l.intention, l.subtext, l.emotion, l.intensity, l.approval), strength: "soft", label: `${l.speaker_name}: “${l.text.slice(0, 40)}”` })),
        ...proposal.participants.filter((x) => x.wardrobe_look_id).map((x) => { const lk = looks.find((l) => l.id === x.wardrobe_look_id); return { type: "wardrobe_look", id: lk.id, fingerprint: fp(lk.name, lk.description), strength: "soft", label: `${x.name} — ${lk.name}` }; })];
      const ver = rec && sdnaVersions.find((x) => x.id === rec.approved_version_id);
      if (rec && ver) { const drift = pg.computeDrift(ver.dependencies, deps); rec.review_state = pg.descendantState(drift); rec.drift = drift.map((d) => ({ type: d.ref.type, id: d.ref.id, label: d.ref.label, kind: d.kind, effect: d.effect, message: d.message })); }
      return { rec, ver, editable, proposal, engine_version, deps, avail };
    };
    if (u === `/api/projects/${P}/scene-dna` && req.method === "GET") {
      const v = approved();
      if (!v) return send(200, { script: null, scenes: [], summary: { scenes: 0, approved: 0, ready: 0, needs_review: 0 } });
      const out = scenes.filter((s) => s.status === "active" || sdna.some((r) => r.scene_id === s.id)).map((scene) => {
        const e = sdnaEntry(scene);
        return { scene: { id: scene.id, number: scene.number, heading: scene.heading, int_ext: scene.int_ext, location: scene.location, time_of_day: scene.time_of_day, estimated_seconds: scene.estimated_seconds, status: scene.status },
          record: e.rec ? { ...e.rec, approved_version_number: e.ver ? e.ver.version_number : null } : null, editable: e.editable, proposal: e.proposal,
          looks: e.avail.map((l) => ({ ...l, description: looks.find((x) => x.id === l.id).description ?? null })), engine_version: e.engine_version };
      });
      return send(200, { script: { approved_version_id: v.id, version_number: v.version_number }, scenes: out,
        summary: { scenes: out.filter((x) => x.scene.status === "active").length, approved: out.filter((x) => x.record?.status === "approved" && x.record.review_state === "current").length, ready: out.filter((x) => x.proposal.ready_for_approval).length, needs_review: out.filter((x) => x.record && x.record.review_state !== "current").length } });
    }
    if ((m = u.match(/^\/api\/projects\/[^/]+\/scene-dna\/([^/]+)$/)) && req.method === "PATCH") {
      const c = require(require("path").resolve(__dirname, "../../../packages/contracts/dist/index.js"));
      const r = c.UpdateSceneDnaInputSchema.strict().safeParse(b);
      if (!r.success) return send(400, { error: { code: "AURA-SDNA-002", message: `${r.error.issues[0].path[0]} isn't valid` } });
      let rec = sdna.find((x) => x.scene_id === m[1]);
      if (!rec) { rec = { id: crypto.randomUUID(), project_id: P, scene_id: m[1], ...EDIT, status: "draft", review_state: "current", approved_version_id: null, drift: [] }; sdna.push(rec); }
      Object.assign(rec, r.data, { status: "draft", updated_at: now() });
      return send(200, { ...rec, approved_version_number: null });
    }
    if ((m = u.match(/^\/api\/projects\/[^/]+\/scene-dna\/([^/]+)\/approve$/))) {
      const scene = scenes.find((s) => s.id === m[1]); const e = sdnaEntry(scene);
      if (!e.proposal.ready_for_approval) { const f = e.proposal.readiness.filter((x) => x.blocking && !x.ok); return send(412, { error: { code: "AURA-SDNA-412", message: `Not ready to lock yet: ${f.map((x) => x.label.toLowerCase()).join("; ")}.` } }); }
      let rec = e.rec; if (!rec) { rec = { id: crypto.randomUUID(), project_id: P, scene_id: m[1], ...EDIT, drift: [] }; sdna.push(rec); }
      const ver = { id: crypto.randomUUID(), scene_dna_id: rec.id, version_number: sdnaVersions.filter((x) => x.scene_dna_id === rec.id).length + 1, dependencies: e.deps, content: { editable: e.editable, proposal: e.proposal } };
      sdnaVersions.push(ver); Object.assign(rec, { status: "approved", review_state: "current", drift: [], approved_version_id: ver.id, updated_at: now() });
      return send(200, { version_id: ver.id, version_number: ver.version_number, dependencies: e.deps.length });
    }

    // ---- Storyboard & Shots (mirrors apps/api/src/modules/shots + migration 0012 semantics) ----
    const locked = (scene) => {
      const d = sdna.find((r) => r.scene_id === scene.id); if (d) sdnaEntry(scene);
      const v = d && sdnaVersions.find((x) => x.id === d.approved_version_id); if (!v) return null;
      const p = v.content.proposal; const lines = p.dialogue.line_ids.map((id) => dlines.find((l) => l.id === id)).filter(Boolean);
      return { d, v, current: d.status === "approved" && d.review_state === "current", duration: p.narrative.intended_duration_seconds || 1, editable: v.content.editable, participants: p.participants, lines, lineIds: p.dialogue.line_ids };
    };
    const label = (l) => `${l.speaker_name}: “${l.text.length > 40 ? l.text.slice(0, 37) + "…" : l.text}”`;
    const review = (plan, dna) => {
      if (!dna) return ["stale", "This scene's Scene DNA is no longer locked."];
      if (dna.d.approved_version_id !== plan.scene_dna_version_id) return ["stale", `Scene DNA was locked again (now version ${dna.v.version_number}) after these shots were planned.`];
      if (dna.d.review_state !== "current") return ["review_required", `Scene DNA needs review.${dna.d.drift[0] ? " " + dna.d.drift[0].message : ""}`];
      if (dna.d.status !== "approved") return ["review_required", "Scene DNA has edits that aren't locked yet."];
      return ["current", null];
    };
    const cover = (dna, list) => eng.coverageMathEngine({ scene_seconds: eng.planStoryTime(dna.duration, dna.lines.map((l) => l.estimated_seconds)), shots: list,
      line_ids: dna.lineIds, line_labels: Object.fromEntries(dna.lines.map((l) => [l.id, label(l)])), characters: dna.participants.filter((x) => x.presence === "on_screen").map((x) => ({ id: x.character_id, name: x.name })) });
    const planShots = (plan) => shots.filter((x) => x.plan_id === plan.id).sort((a, b) => a.ordinal - b.ordinal);
    const touch = (planId) => { const pl = plans.find((x) => x.id === planId); pl.status = "draft"; pl.updated_at = now(); };
    const renumber = (planId) => planShots({ id: planId }).forEach((x, i) => (x.ordinal = i + 1));
    if (u === `/api/projects/${P}/storyboard` && req.method === "GET") {
      const out = scenes.filter((x) => x.status === "active" || plans.some((p) => p.scene_id === x.id)).map((scene) => {
        const dna = locked(scene); const plan = plans.find((x) => x.scene_id === scene.id) || null;
        if (plan) { const [st, why] = review(plan, dna); plan.review_state = st; plan.review_reason = why; }
        const list = plan ? planShots(plan) : [];
        return { scene: { id: scene.id, number: scene.number, heading: scene.heading, int_ext: scene.int_ext, location: scene.location, time_of_day: scene.time_of_day, status: scene.status },
          dna: dna ? { state: dna.current ? "locked" : "needs_review", version_id: dna.v.id, version_number: dna.v.version_number, duration_seconds: dna.duration, mood: dna.editable.mood || [], camera_energy: dna.editable.camera_energy } : { state: "not_locked", version_id: null, version_number: null, duration_seconds: null, mood: [], camera_energy: null },
          characters: dna ? dna.participants.map((x) => ({ id: x.character_id, name: x.name, presence: x.presence })) : [],
          lines: dna ? dna.lines.map((l) => ({ id: l.id, label: label(l), character_id: l.character_id })) : [],
          plan: plan ? { ...plan, approved_version_number: plan.approved_version_id ? planVersions.find((v) => v.id === plan.approved_version_id).version_number : null } : null,
          shots: list, coverage: plan && dna ? cover(dna, list) : null };
      });
      const act = out.filter((x) => x.scene.status === "active");
      return send(200, { scenes: out, summary: { scenes: act.length, dna_locked: act.filter((x) => x.dna.state === "locked").length, planned: act.filter((x) => x.plan).length, approved: act.filter((x) => x.plan && x.plan.status === "approved" && x.plan.review_state === "current").length, shots: out.reduce((n, x) => n + x.shots.length, 0), needs_review: out.filter((x) => x.plan && x.plan.review_state !== "current").length } });
    }
    const newShot = (plan, ordinal, x) => ({ id: crypto.randomUUID(), project_id: P, scene_id: plan.scene_id, plan_id: plan.id, ordinal, angle: "eye", movement: "static", support: "tripod", focus: "deep", lens_mm: null, composition: null, lighting: null, transition_in: "cut", notes: null, character_ids: [], dialogue_line_ids: [], ...x, created_at: now(), updated_at: now() });
    if ((m = u.match(/^\/api\/projects\/[^/]+\/storyboard\/scenes\/([^/]+)\/generate$/))) {
      const scene = scenes.find((x) => x.id === m[1]); const dna = locked(scene);
      if (!dna || !dna.current) return send(412, { error: { code: "AURA-SHOT-412", message: "Lock this scene's Scene DNA first — shots are planned from a locked version." } });
      let plan = plans.find((x) => x.scene_id === scene.id);
      if (plan && planShots(plan).length && !b.replace) return send(409, { error: { code: "AURA-SHOT-409", message: `this scene already has ${planShots(plan).length} shots — confirm to replace them` } });
      if (!plan) { plan = { id: crypto.randomUUID(), project_id: P, scene_id: scene.id, approved_version_id: null }; plans.push(plan); }
      for (let i = shots.length - 1; i >= 0; i--) if (shots[i].plan_id === plan.id) shots.splice(i, 1);
      Object.assign(plan, { scene_dna_version_id: dna.v.id, status: "draft", review_state: "current", review_reason: null, engine_version: "1.0.0", updated_at: now() });
      const r = eng.shotPlanningEngine({ scene: { number: scene.number, heading: scene.heading, int_ext: scene.int_ext, location: scene.location, time_of_day: scene.time_of_day, duration_seconds: dna.duration },
        dna: { camera_energy: dna.editable.camera_energy, mood: dna.editable.mood || [], lighting_intent: dna.editable.lighting_intent },
        participants: dna.participants.map((x) => ({ character_id: x.character_id, name: x.name, presence: x.presence })),
        lines: dna.lines.map((l) => ({ id: l.id, character_id: l.character_id, speaker: l.speaker_name, text: l.text, estimated_seconds: l.estimated_seconds, intensity: l.intensity, listener_ids: l.listener_ids })) });
      r.shots.forEach(({ rationale, ...x }, i) => shots.push(newShot(plan, i + 1, { ...x, notes: x.notes ?? rationale })));
      return send(200, { plan_id: plan.id, shots: r.shots.length, scene_dna_version_number: dna.v.version_number });
    }
    if ((m = u.match(/^\/api\/projects\/[^/]+\/storyboard\/scenes\/([^/]+)\/shots$/))) {
      const c = require(require("path").resolve(__dirname, "../../../packages/contracts/dist/index.js"));
      const r = c.CreateShotInputSchema.safeParse(b.shot); if (!r.success) return send(400, { error: { code: "AURA-SHOT-002", message: r.error.issues[0].message } });
      const plan = plans.find((x) => x.scene_id === m[1]); const list = planShots(plan);
      const pos = b.after_ordinal != null && b.after_ordinal + 1 <= list.length ? b.after_ordinal + 1 : list.length + 1;
      list.forEach((x) => { if (x.ordinal >= pos) x.ordinal++; });
      const x = newShot(plan, pos, r.data); shots.push(x); touch(plan.id); return send(200, x);
    }
    if ((m = u.match(/^\/api\/projects\/[^/]+\/storyboard\/scenes\/([^/]+)\/approve$/))) {
      const scene = scenes.find((x) => x.id === m[1]); const plan = plans.find((x) => x.scene_id === scene.id); const dna = locked(scene);
      const [st, why] = review(plan, dna); if (st !== "current") return send(412, { error: { code: "AURA-SHOT-412", message: why } });
      const c = cover(dna, planShots(plan));
      if (!c.ready_for_approval) return send(412, { error: { code: "AURA-SHOT-412", message: `Not ready to approve yet: ${c.readiness.filter((x) => x.blocking && !x.ok).map((x) => x.label.toLowerCase()).join("; ")}.` } });
      const v = { id: crypto.randomUUID(), plan_id: plan.id, version_number: planVersions.filter((x) => x.plan_id === plan.id).length + 1, shots: JSON.parse(JSON.stringify(planShots(plan))) };
      v.scene_dna_version_id = plan.scene_dna_version_id; planVersions.push(v); Object.assign(plan, { status: "approved", review_state: "current", review_reason: null, approved_version_id: v.id });
      return send(200, { version_id: v.id, version_number: v.version_number, coverage: c.coverage });
    }
    if ((m = u.match(/^\/api\/shots\/([^/]+)\/move$/))) {
      const x = shots.find((y) => y.id === m[1]); const other = shots.find((y) => y.plan_id === x.plan_id && y.ordinal === x.ordinal + b.direction);
      if (other) { other.ordinal = x.ordinal; x.ordinal += b.direction; touch(x.plan_id); } return send(200, x);
    }
    if ((m = u.match(/^\/api\/shots\/([^/]+)$/)) && req.method === "PATCH") {
      const c = require(require("path").resolve(__dirname, "../../../packages/contracts/dist/index.js"));
      const r = c.UpdateShotInputSchema.strict().safeParse(b); if (!r.success) return send(400, { error: { code: "AURA-SHOT-002", message: "That value isn't valid" } });
      const x = shots.find((y) => y.id === m[1]); Object.assign(x, r.data, { updated_at: now() });
      if (x.story_end < x.story_start) return send(400, { error: { code: "AURA-SHOT-002", message: "A shot can't end before it starts" } });
      touch(x.plan_id); return send(200, x);
    }
    if ((m = u.match(/^\/api\/shots\/([^/]+)$/)) && req.method === "DELETE") {
      const i = shots.findIndex((y) => y.id === m[1]); const x = shots[i]; shots.splice(i, 1); renumber(x.plan_id); touch(x.plan_id);
      return send(200, { deleted_ordinal: x.ordinal });
    }

    // ---- Visual Generation (mirrors apps/api/src/modules/generation + migration 0013; a stand-in worker
    // finishes queued takes with the real AuraStage Sketch renderer from the Provider Gateway) ----
    const gw = require(require("path").resolve(__dirname, "../../../apps/api/dist/providers/index.js"));
    const runWorker = () => {
      for (const t of takes) {
        if (t.status === "running") {
          const pkg = packages.find((x) => x.id === t.package_id);
          const svg = gw.renderSketch({ capability: "image", model: t.model, package: pkg.content, aspect_ratio: t.params.aspect_ratio || "16:9", duration_seconds: null, seed: t.seed });
          Object.assign(t, { status: "succeeded", media_type: "image/svg+xml", media_url: "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64"), cost_actual: 0, completed_at: now() });
        } else if (t.status === "queued") { t.status = "running"; }
      }
    };
    if (u === `/api/projects/${P}/visual` && req.method === "GET") {
      runWorker();
      const out = [];
      for (const scene of scenes) {
        const plan = plans.find((x) => x.scene_id === scene.id); const version = plan && planVersions.find((v) => v.id === plan.approved_version_id);
        if (!plan || !version) continue;
        const usable = plan.status === "approved" && plan.review_state === "current";
        out.push({ scene: { id: scene.id, number: scene.number, heading: scene.heading },
          plan: { id: plan.id, version_number: version.version_number, usable, status: plan.status, review_state: plan.review_state, review_reason: plan.review_reason },
          shots: version.shots.map((shot) => {
            const pkg = [...packages].reverse().find((x) => x.shot_id === shot.id) || null;
            if (pkg) { if (pkg.shot_plan_version_id !== plan.approved_version_id) { pkg.review_state = "stale"; pkg.review_reason = `The shot plan was approved again (now version ${version.version_number}) after this was compiled.`; }
              else if (!usable) { pkg.review_state = "review_required"; pkg.review_reason = "The shot plan has edits that aren't approved yet."; } else { pkg.review_state = "current"; pkg.review_reason = null; } }
            const st = takes.filter((t) => t.shot_id === shot.id);
            return { shot, package: pkg, takes: st, approved_take_id: (st.find((t) => t.approval === "approved") || {}).id || null };
          }) });
      }
      const all = out.flatMap((x) => x.shots);
      return send(200, { providers: gw.providerStatuses({}, {}), media_ready: true,
        defaults: { aspect_ratio: ST.settings.technical.aspect_ratio, image_provider: ST.settings.generation.default_image_provider, video_provider: ST.settings.generation.default_video_provider },
        budget: { monthly_paid_take_limit: ST.settings.generation.monthly_paid_take_limit, used_this_month: 0 }, queue: { waiting: takes.filter((t) => t.status === "queued").length, running: takes.filter((t) => t.status === "running").length },
        scenes: out, summary: { scenes: out.length, shots: all.length, with_approved_take: all.filter((x) => x.approved_take_id).length, takes: takes.length } });
    }
    if ((m = u.match(/^\/api\/projects\/[^/]+\/visual\/shots\/([^/]+)\/compile$/))) {
      const plan = plans.find((pl) => { const v = planVersions.find((x) => x.id === pl.approved_version_id); return v && v.shots.some((x) => x.id === m[1]); });
      if (!plan || plan.status !== "approved" || plan.review_state !== "current") return send(412, { error: { code: "AURA-GEN-412", message: "Approve this scene's shot plan again first — it has changes." } });
      const version = planVersions.find((x) => x.id === plan.approved_version_id); const shot = version.shots.find((x) => x.id === m[1]);
      const scene = scenes.find((x) => x.id === plan.scene_id); const dv = sdnaVersions.find((x) => x.id === version.scene_dna_version_id); const ed = dv.content.editable;
      const look = (cid) => { const l = looks.find((x) => x.id === (ed.wardrobe || {})[cid]); return l ? [l.name, l.description].filter(Boolean).join(": ") : null; };
      const r = eng.promptCompilerEngine({ project: { title: project.title, genre: project.genre ?? null, tone: project.tone ?? null, setting: project.setting ?? null, time_period: project.time_period ?? null },
        scene: { number: scene.number, heading: scene.heading, location: scene.location, int_ext: scene.int_ext, time_of_day: scene.time_of_day, purpose: ed.purpose, mood: ed.mood || [], weather: ed.weather, atmosphere: ed.atmosphere, lighting_intent: ed.lighting_intent },
        shot: { ...shot, lighting: shot.lighting ?? null, composition: shot.composition ?? null },
        characters: chars.filter((c) => shot.character_ids.includes(c.id)).map((c) => ({ id: c.id, name: c.name, age: c.age ?? null, description: c.description ?? null, wardrobe: look(c.id) })),
        dialogue: dlines.filter((l) => shot.dialogue_line_ids.includes(l.id)).map((l) => ({ id: l.id, speaker: l.speaker_name, text: l.text, emotion: l.emotion })),
        aspect_ratio: b.aspect_ratio || "16:9", provenance: { shot_plan_version_id: version.id, scene_dna_version_id: dv.id, script_version_id: null } });
      const pkg = { id: crypto.randomUUID(), shot_id: shot.id, shot_plan_version_id: version.id, content: r.package, review_state: "current", review_reason: null, engine_version: r.engine_version, created_at: now() };
      packages.push(pkg); return send(200, { package_id: pkg.id, checks: r.package.checks, prompt: r.package.prompt });
    }
    if ((m = u.match(/^\/api\/visual\/packages\/([^/]+)\/takes$/))) {
      const pkg = packages.find((x) => x.id === m[1]); const a = gw.getAdapter(b.provider);
      if (!a.isConfigured({})) return send(412, { error: { code: "AURA-GEN-412", message: `${a.name} isn't connected yet — its API key hasn't been added to the server.` } });
      const n0 = takes.filter((t) => t.shot_id === pkg.shot_id).length; const out = [];
      for (let i = 1; i <= (b.variations || 1); i++) {
        const t = { id: crypto.randomUUID(), project_id: P, shot_id: pkg.shot_id, package_id: pkg.id, take_number: n0 + i, provider: b.provider, model: b.model, capability: b.capability || "image",
          params: { aspect_ratio: b.aspect_ratio || "16:9", duration_seconds: b.duration_seconds ?? null }, seed: b.seed == null ? null : b.seed + i - 1, status: "queued", approval: "pending",
          media_type: null, media_url: null, error: null, cost_actual: null, provider_request_id: null, created_at: now(), completed_at: null };
        takes.push(t); out.push(t);
      }
      return send(200, { takes: out });
    }
    if ((m = u.match(/^\/api\/takes\/([^/]+)\/(approve|reject|reopen|cancel)$/))) {
      const t = takes.find((x) => x.id === m[1]);
      if (m[2] === "cancel") { if (t.status !== "queued") return send(409, { error: { code: "AURA-GEN-409", message: "only a waiting take can be cancelled" } }); t.status = "cancelled"; return send(200, t); }
      if (m[2] === "approve") { if (t.status !== "succeeded") return send(409, { error: { code: "AURA-GEN-409", message: "only a finished take can be approved" } });
        for (const o of takes) if (o.shot_id === t.shot_id && o.approval === "approved") o.approval = "superseded"; t.approval = "approved"; }
      if (m[2] === "reject") t.approval = "rejected";
      if (m[2] === "reopen") t.approval = "pending";
      return send(200, t);
    }

    // ---- Audio Studio + Assets (mirrors apps/api/src/modules/{audio,assets} + migration 0015; readiness is the real module) ----
    const aud = require(require("path").resolve(__dirname, "../../../apps/api/dist/modules/audio/audio.readiness.js"));
    const aerr = (code, msg) => send(code, { error: { code: `AURA-AUD-${code}`, message: msg } });
    const atouch = (s) => { s.revision = crypto.randomUUID(); };
    if ((m = u.match(/^\/api\/projects\/[^/]+\/assets\/audio$/)) && req.method === "POST") {
      const q = new URL(req.url, "http://x").searchParams; const isWav = raw.slice(0, 4).toString() === "RIFF" && raw.slice(8, 12).toString() === "WAVE";
      if (!isWav && raw.slice(0, 3).toString() !== "ID3" && raw.slice(0, 4).toString() !== "OggS") return send(400, { error: { code: "AURA-AST-400", message: "That file isn't a supported audio format." } });
      const a = { id: crypto.randomUUID(), project_id: P, type: "audio", name: q.get("name"), bytes: raw, media_type: req.headers["content-type"], duration_seconds: Number(q.get("duration")), created_at: now() };
      assets.push(a); return send(201, { id: a.id, name: a.name, duration_seconds: a.duration_seconds, media_type: a.media_type, created_at: a.created_at });
    }
    if ((m = u.match(/^\/api\/assets\/([^/]+)\/content$/))) { const a = assets.find((x) => x.id === m[1]); res.statusCode = 200; res.setHeader("Content-Type", a.media_type); return res.end(a.bytes); }
    const clipDTO = (c) => ({ ...c });
    const audioReview = (s) => {
      const plan = plans.find((x) => x.scene_id === s.scene_id); const pv = plan && planVersions.find((v) => v.id === plan.approved_version_id);
      if (!plan || plan.approved_version_id !== s.shot_plan_version_id) { s.review_state = "stale"; s.review_reason = `The shot plan was approved again (now version ${pv && pv.version_number}) after this audio was spotted — re-spot to update the cues. Your recordings are kept.`; }
      else if (plan.status !== "approved" || plan.review_state !== "current") { s.review_state = "review_required"; s.review_reason = "The shot plan has edits that aren't approved yet."; }
      else { s.review_state = "current"; s.review_reason = null; }
    };
    if (u === `/api/projects/${P}/audio` && req.method === "GET") {
      const out = [];
      for (const scene of scenes) {
        const plan = plans.find((x) => x.scene_id === scene.id); const pv = plan && planVersions.find((v) => v.id === plan.approved_version_id);
        const s = asessions.find((x) => x.scene_id === scene.id) || null;
        if (!pv && !s) continue;
        if (s) audioReview(s);
        const st = s ? atracks.filter((t) => t.session_id === s.id) : []; const sc = s ? aclips.filter((c) => c.session_id === s.id) : [];
        const me = s ? [...ameasures].reverse().find((x) => x.session_id === s.id) || null : null; const r = s ? aud.audioReadiness(s, st, sc, me) : null;
        out.push({ scene: { id: scene.id, number: scene.number, heading: scene.heading },
          plan: pv ? { version_id: pv.id, version_number: pv.version_number, usable: plan.status === "approved" && plan.review_state === "current" } : null,
          session: s ? { id: s.id, status: s.status, review_state: s.review_state, review_reason: s.review_reason, revision: s.revision, scene_seconds: s.scene_seconds,
            approved_version_number: s.approved_version_id ? aversions.find((v) => v.id === s.approved_version_id).version_number : null } : null,
          tracks: st, clips: sc.map(clipDTO), measurement: me, readiness: r ? r.readiness : [], ready_for_approval: r ? r.ready : false });
      }
      return send(200, { target: { ...cc0.loudnessTarget(ST.settings.technical.loudness_standard), standard: ST.settings.technical.loudness_standard },
        generators: [{ id: "voice", label: "AI dialogue / voice (TTS)", note: "Needs a voice provider (e.g. OpenAI or ElevenLabs key).", state: "not_connected" }, { id: "music", label: "Music assistant", note: "Needs a music provider key.", state: "not_connected" }],
        assets: assets.map((a) => ({ id: a.id, name: a.name, duration_seconds: a.duration_seconds, media_type: a.media_type, created_at: a.created_at })),
        scenes: out, summary: { scenes: out.length, spotted: out.filter((x) => x.session).length, approved: out.filter((x) => x.session && x.session.status === "approved" && x.session.review_state === "current").length } });
    }
    if ((m = u.match(/^\/api\/projects\/[^/]+\/audio\/scenes\/([^/]+)\/spot$/))) {
      const scene = scenes.find((x) => x.id === m[1]); const plan = plans.find((x) => x.scene_id === m[1]); const pv = plan && planVersions.find((v) => v.id === plan.approved_version_id);
      if (!pv || plan.status !== "approved" || plan.review_state !== "current") return aerr(412, "Approve this scene's shot plan in Storyboard first — audio is spotted from the approved version.");
      const dv = sdnaVersions.find((x) => x.id === pv.scene_dna_version_id); const ed = dv.content.editable || {}; const pr = dv.content.proposal || {};
      const shotsIn = pv.shots.map((x) => ({ ordinal: x.ordinal, story_start: x.story_start, story_end: x.story_end, dialogue_line_ids: x.dialogue_line_ids || [] }));
      const seconds = Math.max(1, ...shotsIn.map((x) => x.story_end));
      const r = eng.audioSpottingEngine({ scene: { number: scene.number, heading: scene.heading, int_ext: scene.int_ext, location: scene.location, time_of_day: scene.time_of_day }, scene_seconds: seconds, shots: shotsIn,
        lines: (pr.dialogue ? pr.dialogue.line_ids : []).map((id) => dlines.find((l) => l.id === id)).filter(Boolean).map((l) => ({ id: l.id, speaker: l.speaker_name, character_id: l.character_id,
          character_name: (chars.find((c) => c.id === l.character_id) || {}).name || null, text: l.text, estimated_seconds: l.estimated_seconds, voice_over: (l.extensions || []).some((e) => /V\.?O/i.test(e)) })),
        dna: { sound_intent: ed.sound_intent ?? null, weather: ed.weather ?? null, atmosphere: ed.atmosphere ?? null, mood: ed.mood || [], sound_candidates: pr.sound_candidates || [] } });
      let s = asessions.find((x) => x.scene_id === m[1]);
      if (!s) { s = { id: crypto.randomUUID(), scene_id: m[1], status: "draft", review_state: "current", review_reason: null, approved_version_id: null }; asessions.push(s); }
      Object.assign(s, { shot_plan_version_id: pv.id, scene_seconds: seconds, status: "draft" }); atouch(s);
      const keyToId = {};
      r.tracks.forEach((t, i) => { let tr = atracks.find((x) => x.session_id === s.id && x.name === t.name && x.family === t.family);
        if (!tr) { tr = { id: crypto.randomUUID(), session_id: s.id, ordinal: i + 1, name: t.name, family: t.family, gain_db: 0, pan: 0, mute: false, solo: false }; atracks.push(tr); } keyToId[t.key] = tr.id; });
      for (let i = aclips.length - 1; i >= 0; i--) if (aclips[i].session_id === s.id && aclips[i].kind === "cue" && !aclips[i].source.added_by_hand) aclips.splice(i, 1);
      for (const c of r.clips) {
        if (c.source.dialogue_line_id && aclips.some((x) => x.session_id === s.id && x.kind === "asset" && x.source.dialogue_line_id === c.source.dialogue_line_id)) continue;
        aclips.push({ id: crypto.randomUUID(), session_id: s.id, track_id: keyToId[c.track_key], label: c.label, kind: "cue", asset_id: null, start_seconds: c.start_seconds, duration_seconds: c.duration_seconds,
          offset_seconds: 0, gain_db: 0, fade_in_seconds: 0, fade_out_seconds: 0, source: c.source, updated_at: now() });
      }
      return send(200, { session_id: s.id, tracks: r.tracks.length, cues: r.clips.length, shot_plan_version_number: pv.version_number });
    }
    if ((m = u.match(/^\/api\/projects\/[^/]+\/audio\/scenes\/([^/]+)\/approve$/))) {
      const s = asessions.find((x) => x.scene_id === m[1]); const r = aud.audioReadiness(s, atracks.filter((t) => t.session_id === s.id), aclips.filter((c) => c.session_id === s.id), [...ameasures].reverse().find((x) => x.session_id === s.id) || null);
      if (!r.ready) return aerr(412, `Not ready to approve yet: ${r.readiness.filter((x) => x.blocking && !x.ok).map((x) => x.label.toLowerCase()).join("; ")}.`);
      const v = { id: crypto.randomUUID(), version_number: aversions.filter((x) => x.session_id === s.id).length + 1, session_id: s.id,
        tracks: atracks.filter((t) => t.session_id === s.id).map((t) => ({ ...t })), clips: aclips.filter((c) => c.session_id === s.id).map((c) => ({ ...c })), measurement: { duration_seconds: s.scene_seconds } }; aversions.push(v);
      Object.assign(s, { status: "approved", approved_version_id: v.id }); return send(200, { version_id: v.id, version_number: v.version_number });
    }
    if ((m = u.match(/^\/api\/audio-tracks\/([^/]+)$/)) && req.method === "PATCH") {
      const t = atracks.find((x) => x.id === m[1]); Object.assign(t, b); const s = asessions.find((x) => x.id === t.session_id); atouch(s); s.status = "draft"; return send(200, t);
    }
    const saveClip = (s, c) => {
      if (b.asset_id) { c.asset_id = b.asset_id; c.kind = "asset"; } else if ("asset_id" in b) { c.asset_id = null; c.kind = "cue"; }
      for (const k of ["track_id", "label", "start_seconds", "duration_seconds", "offset_seconds", "gain_db", "fade_in_seconds", "fade_out_seconds"]) if (k in b) c[k] = b[k];
      c.updated_at = now(); atouch(s); s.status = "draft"; return c;
    };
    if ((m = u.match(/^\/api\/audio-sessions\/([^/]+)\/clips$/))) {
      const s = asessions.find((x) => x.id === m[1]);
      const c = { id: crypto.randomUUID(), session_id: s.id, track_id: b.track_id, label: "New clip", kind: "cue", asset_id: null, start_seconds: 0, duration_seconds: 1, offset_seconds: 0, gain_db: 0, fade_in_seconds: 0, fade_out_seconds: 0, source: { added_by_hand: true } };
      aclips.push(c); return send(200, saveClip(s, c));
    }
    if ((m = u.match(/^\/api\/audio-clips\/([^/]+)$/))) {
      const i = aclips.findIndex((x) => x.id === m[1]); const c = aclips[i]; const s = asessions.find((x) => x.id === c.session_id);
      if (req.method === "DELETE") { aclips.splice(i, 1); atouch(s); s.status = "draft"; return send(200, { deleted: true }); }
      return send(200, saveClip(s, c));
    }
    if ((m = u.match(/^\/api\/audio-sessions\/([^/]+)\/measurements$/))) {
      const s = asessions.find((x) => x.id === m[1]);
      if (b.session_revision !== s.revision) return aerr(409, "The mix changed while it was being measured — measure again.");
      const me = { id: crypto.randomUUID(), session_id: s.id, ...b, measured_at: now() }; ameasures.push(me); return send(200, me);
    }

    // ---- Editorial & Timeline (mirrors apps/api/src/modules/editorial + migration 0017, using the real engines) ----
    const FPS = 24, F = (x) => Math.round(x * FPS);
    const edScenes = () => scenes.map((scene) => {
      const plan = plans.find((x) => x.scene_id === scene.id); const pv = plan && planVersions.find((v) => v.id === plan.approved_version_id);
      const session = asessions.find((x) => x.scene_id === scene.id); if (session) audioReview(session);
      const mixCurrent = session && session.approved_version_id && session.status === "approved" && session.review_state === "current" ? aversions.find((v) => v.id === session.approved_version_id) : null;
      return { scene, plan, pv, usable: !!(plan && pv && plan.status === "approved" && plan.review_state === "current"), shots: pv ? [...pv.shots].sort((a, b) => a.ordinal - b.ordinal) : [], session, mixCurrent };
    });
    const approvedTake = (sid) => takes.find((t) => t.shot_id === sid && t.approval === "approved" && t.status === "succeeded") || null;
    const takeFrames = (t) => (t.capability === "video" && t.params.duration_seconds ? F(t.params.duration_seconds) : null);
    const shotLabel = (sc, sh) => `Scene ${sc.scene.number} · Shot ${sh.ordinal}${sh.size ? ` (${sh.size})` : ""}`;
    const findShot = (rows, id) => { for (const r of rows) { const sh = r.shots.find((x) => x.id === id); if (sh) return { r, sh }; } return null; };
    const edIssues = (rows) => tclips.flatMap((c) => {
      if (c.kind === "take") { const f = findShot(rows, c.shot_id); const at = approvedTake(c.shot_id);
        if (!f) return [{ clip_id: c.id, code: "shot_removed", message: `${c.label}: the shot is no longer in the approved shot plan` }];
        if (!f.r.usable) return [{ clip_id: c.id, code: "plan_changed", message: `${c.label}: Scene ${f.r.scene.number}'s shot plan has changes that aren't approved` }];
        if (!at) return [{ clip_id: c.id, code: "take_unapproved", message: `${c.label}: its take is no longer approved` }];
        if (at.id !== c.take_id) return [{ clip_id: c.id, code: "newer_take", message: `${c.label}: take V${at.take_number} is now the approved take` }]; }
      if (c.kind === "audio_mix") { const r = rows.find((x) => x.scene.id === c.scene_id);
        if (!r || !r.mixCurrent) return [{ clip_id: c.id, code: "mix_review", message: `${c.label}: the scene's sound needs review in Audio Studio` }];
        if (r.mixCurrent.id !== c.audio_session_version_id) return [{ clip_id: c.id, code: "newer_mix", message: `${c.label}: mix v${r.mixCurrent.version_number} is now approved` }]; }
      return [];
    });
    const edConform = (rows) => tclips.flatMap((c) => {
      if (c.track === "V1" && c.shot_id) { const f = findShot(rows, c.shot_id); if (!f) return []; const at = approvedTake(c.shot_id); const base = shotLabel(f.r, f.sh);
        if (at && at.id !== c.take_id) return [{ clip_id: c.id, kind: "take", take_id: at.id, audio_session_version_id: null, source_frames: takeFrames(at), label: base }];
        if (!at && c.kind === "take") return [{ clip_id: c.id, kind: "slug", take_id: null, audio_session_version_id: null, source_frames: null, label: `${base} — no approved take` }]; }
      if (c.kind === "audio_mix") { const r = rows.find((x) => x.scene.id === c.scene_id);
        if (r && r.mixCurrent && r.mixCurrent.id !== c.audio_session_version_id) return [{ clip_id: c.id, kind: "audio_mix", take_id: null, audio_session_version_id: r.mixCurrent.id, source_frames: F(r.mixCurrent.measurement.duration_seconds), label: `Scene ${r.scene.number} mix v${r.mixCurrent.version_number}` }]; }
      return [];
    });
    const edQC = (rows, clipsIn) => eng.editorialQCEngine({ fps: FPS, clips: clipsIn, issues: edIssues(rows), target_runtime_minutes: null, scenes: scenes.map((x) => ({ scene_id: x.id, number: x.number, heading: x.heading })) });
    const edErr = (code, msg, issues) => send(code, { error: { code: `AURA-EDT-${code}`, message: msg, issues } });
    const edPersist = (clipsIn, action, breakLock) => {
      const withIds = clipsIn.map((c) => ({ ...c, id: c.id || crypto.randomUUID() }));
      if (timeline && timeline.status === "locked") {
        const lock = locks.find((l) => l.id === timeline.current_lock_id); const v = tversions.find((x) => x.id === lock.version_id);
        const r = eng.pictureLockEngine({ fps: FPS, locked: v.clips, proposed: withIds, scenes: scenes.map((x) => ({ scene_id: x.id, number: x.number, heading: x.heading })) });
        if (!breakLock) { edErr(423, `The picture is locked. This change touches ${r.impact.map((i) => i.label).join(", ")} — confirm to break Picture Lock ${lock.lock_number}.`, r.impact); return false; }
        Object.assign(lock, { broken_at: now(), impact: r.impact }); Object.assign(timeline, { status: "draft", current_lock_id: null });
      }
      if (!timeline) timeline = { id: crypto.randomUUID(), status: "draft", current_lock_id: null, review_state: "current", review_reason: null };
      tclips = withIds; Object.assign(timeline, { revision: crypto.randomUUID(), updated_at: now() }); return true;
    };
    const edVersion = (label, kind, qc) => { const v = { id: crypto.randomUUID(), version_number: tversions.length + 1, label, kind, clips: tclips.map((c) => ({ ...c })), qc, duration_frames: tclips.reduce((mx, c) => Math.max(mx, c.record_in + c.duration), 0), created_at: now() }; tversions.push(v); return v; };
    if (u === `/api/projects/${P}/editorial` && req.method === "GET") {
      runWorker(); const rows = edScenes(); const issues = edIssues(rows);
      if (timeline) Object.assign(timeline, issues.length ? { review_state: "review_required", review_reason: `${issues.length} clip${issues.length === 1 ? " uses" : "s use"} a take or mix that changed upstream. Your cut is unchanged — Conform to update it.` } : { review_state: "current", review_reason: null });
      const media = {}; for (const t of takes) if (t.status === "succeeded") media[t.id] = { url: t.media_url, media_type: t.media_type, capability: t.capability, take_number: t.take_number };
      const mixes = {}; for (const v of aversions) { const ses = asessions.find((x) => x.id === v.session_id); mixes[v.id] = { id: v.id, scene_id: ses.scene_id, version_number: v.version_number, seconds: v.measurement.duration_seconds, tracks: v.tracks, clips: v.clips }; }
      const lock = timeline && timeline.current_lock_id ? locks.find((l) => l.id === timeline.current_lock_id) : null;
      return send(200, { fps: FPS, project: { title: project.title, target_runtime_minutes: null },
        timeline: timeline ? { ...timeline, lock: lock ? { lock_number: lock.lock_number, locked_at: lock.locked_at } : null } : null,
        clips: tclips, issues, conformable: edConform(rows).length, qc: edQC(rows, tclips),
        versions: [...tversions].reverse().map(({ clips, qc, ...v }) => v), locks: [...locks].reverse(),
        bin: rows.filter((r) => r.pv || r.session).map((r) => ({ scene_id: r.scene.id, number: r.scene.number, heading: r.scene.heading, plan: r.pv ? { version_number: r.pv.version_number, usable: r.usable } : null,
          shots: r.shots.map((sh) => { const at = approvedTake(sh.id); return { shot_id: sh.id, ordinal: sh.ordinal, size: sh.size || null, description: sh.description || "", seconds: sh.story_end - sh.story_start,
            take: at ? { take_id: at.id, take_number: at.take_number, capability: at.capability, source_frames: takeFrames(at) } : null }; }),
          mix: r.mixCurrent ? { version_id: r.mixCurrent.id, version_number: r.mixCurrent.version_number, seconds: r.mixCurrent.measurement.duration_seconds } : null,
          mix_note: r.mixCurrent ? null : r.session && r.session.approved_version_id ? "Sound needs review in Audio Studio" : "No approved mix yet" })),
        media, mixes });
    }
    if (u === `/api/projects/${P}/editorial/assemble`) {
      const rows = edScenes().filter((r) => r.pv);
      if (!rows.length) return edErr(412, "Approve at least one scene's shot plan in Storyboard first — the assembly is cut from approved shots.");
      if (timeline && timeline.revision !== b.base_revision) return edErr(409, "The timeline changed — reload and try again.");
      const r = eng.assemblyTimelineEngine({ fps: FPS, scenes: rows.map((x) => ({ scene_id: x.scene.id, number: x.scene.number, heading: x.scene.heading,
        shots: x.shots.map((sh) => { const at = approvedTake(sh.id); return { shot_id: sh.id, ordinal: sh.ordinal, size: sh.size || null, story_start: sh.story_start, story_end: sh.story_end, take: at ? { take_id: at.id, duration_seconds: takeFrames(at) === null ? null : at.params.duration_seconds } : null }; }),
        audio: x.mixCurrent ? { audio_session_version_id: x.mixCurrent.id, version_number: x.mixCurrent.version_number, scene_seconds: x.mixCurrent.measurement.duration_seconds } : null })) });
      if (timeline && timeline.status !== "locked" && tclips.length) edVersion("Before re-assembly", "auto", edQC(edScenes(), tclips));
      if (!edPersist(r.clips, "assemble", !!b.break_lock)) return;
      const on = r.clips.filter((c) => c.kind === "take").length, off = r.clips.filter((c) => c.kind === "slug").length;
      return send(200, { summary: `Assembled ${rows.length} scene${rows.length === 1 ? "" : "s"} from approved shots: ${on} picture clip${on === 1 ? "" : "s"}${off ? `, ${off} still offline (no approved take)` : ""}.`, rationale: r.rationale });
    }
    if (u === `/api/projects/${P}/editorial/edit`) {
      if (!timeline) return edErr(412, "Build the first assembly first.");
      if (timeline.revision !== b.base_revision) return edErr(409, "The timeline changed — reload and try again.");
      const rows = edScenes(); const op = b.operation; let new_clip;
      if (op.op === "insert" || op.op === "overwrite") {
        const base = { id: null, source_in: 0, record_in: op.at, grade: { exposure: 0, contrast: 0, saturation: 0, temperature: 0 }, take_id: null, audio_session_version_id: null, shot_id: null };
        if (op.source.kind === "shot") { const f = findShot(rows, op.source.shot_id); const at = approvedTake(op.source.shot_id); const fr = at ? takeFrames(at) : null;
          const want = op.duration || Math.max(1, F(f.sh.story_end - f.sh.story_start)); const duration = fr === null ? want : Math.min(want, fr);
          new_clip = at ? { ...base, track: "V1", kind: "take", duration, source_frames: fr, scene_id: f.r.scene.id, shot_id: f.sh.id, take_id: at.id, label: shotLabel(f.r, f.sh) }
            : { ...base, track: "V1", kind: "slug", duration, source_frames: null, scene_id: f.r.scene.id, shot_id: f.sh.id, label: `${shotLabel(f.r, f.sh)} — no approved take` };
        } else { const r = rows.find((x) => x.scene.id === op.source.scene_id); if (!r || !r.mixCurrent) return edErr(412, "Approve this scene's mix in Audio Studio first.");
          const fr = F(r.mixCurrent.measurement.duration_seconds); new_clip = { ...base, track: "A1", kind: "audio_mix", duration: Math.min(op.duration || fr, fr), source_frames: fr, scene_id: r.scene.id, audio_session_version_id: r.mixCurrent.id, label: `Scene ${r.scene.number} mix v${r.mixCurrent.version_number}` }; }
      }
      let r;
      try { r = eng.editDecisionEngine({ clips: tclips, operation: op, new_clip, replacements: op.op === "conform" ? edConform(rows) : undefined }); }
      catch (e) { return edErr(e.code === "AURA-EDT-409" ? 409 : 400, e.message); }
      if (!edPersist(r.clips, op.op, !!b.break_lock)) return;
      return send(200, { summary: r.summary });
    }
    if (u === `/api/projects/${P}/editorial/versions`) { const v = edVersion(b.label, "manual", edQC(edScenes(), tclips)); return send(200, { version_number: v.version_number, label: v.label }); }
    if ((m = u.match(/^\/api\/projects\/[^/]+\/editorial\/versions\/([^/]+)\/restore$/))) {
      if (timeline.revision !== b.base_revision) return edErr(409, "The timeline changed — reload and try again.");
      const v = tversions.find((x) => x.id === m[1]);
      if (timeline.status !== "locked") edVersion(`Before restoring v${v.version_number}`, "auto", edQC(edScenes(), tclips));
      if (!edPersist(v.clips.map((c) => ({ ...c })), "restore", !!b.break_lock)) return;
      return send(200, { summary: `Restored version ${v.version_number} (“${v.label}”). The cut before it was kept as a version.` });
    }
    if (u === `/api/projects/${P}/editorial/lock`) {
      if (timeline.revision !== b.base_revision) return edErr(409, "The timeline changed — reload and try again.");
      const qc = edQC(edScenes(), tclips);
      if (!qc.ready_for_lock) return edErr(412, `Not ready for Picture Lock: ${qc.checks.filter((c) => c.blocking && !c.ok).map((c) => c.label.toLowerCase()).join("; ")}.`);
      const n = locks.length + 1; const v = edVersion(`Picture Lock ${n}`, "picture_lock", qc);
      const l = { id: crypto.randomUUID(), lock_number: n, version_id: v.id, locked_at: now(), broken_at: null, impact: null }; locks.push(l);
      Object.assign(timeline, { status: "locked", current_lock_id: l.id }); return send(200, { lock_number: n });
    }
    if (u === `/api/projects/${P}/editorial/edl`) { res.statusCode = 200; res.setHeader("Content-Type", "text/plain"); return res.end(eng.edlExportEngine({ title: project.title, fps: FPS, clips: tclips }).edl); }

    // ---- Export & Deliver (mirrors apps/api/src/modules/rendering + migration 0018). Renders are REAL: the render
    // worker's own pipeline (workers/render-worker/dist/render.js) runs here with the local ffmpeg. ----
    const RW = require(require("path").resolve(__dirname, "../../../workers/render-worker/dist/render.js"));
    const fsx = require("fs"), osx = require("os"), pathx = require("path");
    const STORE = (globalThis.__renderStore ||= process.env.MOCK_RENDER_STORE || fsx.mkdtempSync(pathx.join(osx.tmpdir(), "mock-renders-")));
    const fetchMedia = async (key) => {
      const [kind, id] = key.split(":");
      if (kind === "take") { const t = takes.find((x) => x.id === id); const m = /^data:([^;]+);base64,(.*)$/.exec(t.media_url); return { bytes: Buffer.from(m[2], "base64"), contentType: m[1] }; }
      const a = assets.find((x) => x.id === id); return { bytes: a.bytes, contentType: a.media_type };
    };
    const lockNow = () => (timeline && timeline.status === "locked" ? locks.find((l) => l.id === timeline.current_lock_id) : null);
    const lockInput = (profileId, options) => {
      const l = lockNow(); const v = tversions.find((x) => x.id === l.version_id);
      const mixIds = [...new Set(v.clips.map((c) => c.audio_session_version_id).filter(Boolean))];
      const mixes = {}; for (const id of mixIds) { const mv = aversions.find((x) => x.id === id); const ses = asessions.find((x) => x.id === mv.session_id);
        mixes[id] = { scene_id: ses.scene_id, version_number: mv.version_number, seconds: mv.measurement.duration_seconds, tracks: mv.tracks, clips: mv.clips }; }
      const tk = {}; for (const c of v.clips) if (c.take_id) { const t = takes.find((x) => x.id === c.take_id); tk[t.id] = { storage_key: `take:${t.id}`, media_type: t.media_type, capability: t.capability, duration_seconds: null }; }
      const as = {}; for (const a of assets) as[a.id] = { storage_key: `asset:${a.id}`, media_type: a.media_type };
      const ln = {}; for (const d of dlines) ln[d.id] = { speaker: d.speaker_name, text: d.text };
      return { l, v, input: { project: { id: P, title: project.title }, profile: eng.getDeliveryProfile(profileId), options, picture_lock: { id: l.id, lock_number: l.lock_number, timeline_version_id: v.id }, fps: 24, clips: v.clips, takes: tk, mixes, assets: as, lines: ln } };
    };
    const outputsFor = (r) => r.outputs.map((o) => ({ ...o, download_name: `${project.title.replace(/[^a-z0-9]+/gi, "_")}_${o.name}`, url: `${API_BASE}/media/${r.id}/${o.name}?download=1`, stream_url: /video/.test(o.media_type) ? `${API_BASE}/media/${r.id}/${o.name}` : null }));
    const API_BASE = "http://localhost:3911";
    if (u === `/api/projects/${P}/delivery` && req.method === "GET") {
      const l = lockNow();
      let probe = null;
      if (l) probe = eng.renderManifestEngine(lockInput("streaming_master", { watermark: null, burn_timecode: false }).input);
      for (const r of renders) { const stale = !l || l.id !== r.picture_lock_id; r.review_state = stale ? "stale" : "current"; r.review_reason = stale ? `Made from Picture Lock ${r.lock_number}, which is no longer the current lock${l ? ` (now Picture Lock ${l.lock_number})` : ""}.` : null; }
      const v = l && tversions.find((x) => x.id === l.version_id);
      const media = probe ? probe.missing.filter((m) => /media|file|offline|mix is missing/.test(m)) : [];
      const cues = probe && probe.manifest && probe.manifest.subtitles ? probe.manifest.subtitles.cues.length : 0;
      const hasSound = !!v && v.clips.some((c) => c.track === "A1");
      const list = [...renders].reverse().map((r) => ({ ...r, manifest: undefined, outputs: outputsFor(r), profile_label: eng.getDeliveryProfile(r.profile_id).label }));
      const pv = list.find((r) => r.status === "succeeded" && r.review_state === "current" && r.outputs.some((o) => o.stream_url));
      return send(200, { project: { id: P, title: project.title },
        picture_lock: l ? { id: l.id, lock_number: l.lock_number, locked_at: l.locked_at, duration_frames: v.duration_frames, fps: 24 } : null,
        timeline_status: timeline ? timeline.status : null, profiles: eng.deliveryProfiles(), required_profiles: ST.settings.delivery.required_profiles,
        preflight: [
          { id: "picture_locked", label: "The picture is locked", ok: !!l, blocking: true, evidence: l ? `Picture Lock ${l.lock_number}` : timeline ? "The cut isn't locked — lock it in Editorial" : "No timeline yet — build it in Editorial" },
          { id: "lock_checks", label: "The locked cut passed the timeline checks", ok: !!l && !!(v.qc && v.qc.ready_for_lock), blocking: true, evidence: l ? "Recorded with the lock" : "—" },
          { id: "media_online", label: "Every picture and sound file is stored", ok: !!l && !media.length, blocking: true, evidence: l ? (media.join("; ") || "All stored") : "—" },
          { id: "storage_ready", label: "Delivery storage is set up", ok: true, blocking: true, evidence: "Private bucket connected" },
          { id: "sound_present", label: "The locked cut has sound", ok: hasSound, blocking: false, evidence: hasSound ? "Approved scene mixes on A1" : "No scene mixes on A1" },
          { id: "subtitles", label: "Dialogue is available for subtitles", ok: cues > 0, blocking: false, evidence: cues ? `${cues} subtitle cue${cues === 1 ? "" : "s"}` : "No dialogue" },
        ],
        renders: list, preview: pv ? { render_id: pv.id, label: pv.profile_label, url: pv.outputs.find((o) => o.stream_url).stream_url } : null,
        queue: { waiting: renders.filter((r) => r.status === "queued").length, running: renders.filter((r) => r.status === "running").length },
        destinations: [{ id: "download", label: "Download", state: "ready", note: "Signed links to every file, valid for an hour" }, { id: "youtube", label: "YouTube", state: "not_connected", note: "Needs a YouTube account connection" }] });
    }
    if (u === `/api/projects/${P}/delivery/renders`) {
      const l = lockNow();
      if (!l) return send(412, { error: { code: "AURA-EXP-412", message: "Lock the picture in Editorial first — deliverables are made from a Picture Lock." } });
      const prof = eng.getDeliveryProfile(b.profile_id);
      const { input } = lockInput(b.profile_id, { watermark: (b.options && b.options.watermark) || null, burn_timecode: !!(b.options && b.options.burn_timecode) });
      const out = eng.renderManifestEngine(input);
      if (!out.manifest) return send(412, { error: { code: "AURA-EXP-412", message: `Can't render yet: ${out.missing.join("; ")}.`, issues: out.missing } });
      const sha = crypto.createHash("sha256").update(JSON.stringify(out.manifest)).digest("hex");
      const r = { id: crypto.randomUUID(), picture_lock_id: l.id, lock_number: l.lock_number, profile_id: prof.id, profile_version: prof.version, options: out.manifest.options, manifest: out.manifest, manifest_sha256: sha,
        status: "queued", progress: 0, stage: null, error: null, cancel_requested: false, outputs: [], qc: null, qc_passed: null, review_state: "current", review_reason: null, created_at: now(), started_at: null, completed_at: null };
      renders.push(r);
      // Stand-in for the render worker: the real pipeline, started a moment later so "queued" is visible.
      setTimeout(() => {
        if (r.status !== "queued") return;
        Object.assign(r, { status: "running", started_at: now() });
        const dir = pathx.join(STORE, r.id); fsx.mkdirSync(dir, { recursive: true });
        RW.renderDeliverable({ render: { id: r.id, org_id: ORG, project_id: P, profile_id: r.profile_id, attempt: 1 }, manifest: r.manifest }, {
          fetchMedia, keyFor: (_x, name) => pathx.join(dir, name), putFile: async (key, file) => (fsx.copyFileSync(file, key), fsx.statSync(key).size),
          progress: async (pct, stage) => (Object.assign(r, { progress: pct, stage }), await new Promise((res) => setTimeout(res, Number(process.env.MOCK_RENDER_DELAY || 300))), r.cancel_requested),
          log: () => {}, fontDir: "/usr/share/fonts/truetype/dejavu",
        }).then(({ outputs, qc }) => Object.assign(r, { status: "succeeded", progress: 100, stage: qc.passed ? "QC passed" : "QC failed", outputs, qc, qc_passed: qc.passed, completed_at: now() }))
          .catch((e) => Object.assign(r, { status: r.cancel_requested ? "cancelled" : "failed", stage: r.cancel_requested ? "Cancelled" : "Failed", error: r.cancel_requested ? "Cancelled by request" : e.message, completed_at: now() }));
      }, Number(process.env.MOCK_RENDER_START || 1500));
      return send(200, { render_id: r.id, manifest_sha256: sha, files: out.manifest.files });
    }
    if ((m = u.match(/^\/api\/renders\/([^/]+)\/cancel$/))) {
      const r = renders.find((x) => x.id === m[1]);
      if (r.status === "queued") Object.assign(r, { status: "cancelled", stage: "Cancelled", completed_at: now() });
      else if (r.status === "running") Object.assign(r, { cancel_requested: true, stage: "Cancelling…" });
      else return send(409, { error: { code: "AURA-EXP-409", message: "only a waiting or running render can be cancelled" } });
      return send(200, { status: r.status, cancel_requested: r.cancel_requested });
    }
    if ((m = u.match(/^\/api\/renders\/([^/]+)\/manifest$/))) { const r = renders.find((x) => x.id === m[1]); return send(200, { manifest_sha256: r.manifest_sha256, manifest: r.manifest }); }
    // ---- Team & Collaboration (mirrors apps/api/src/modules/collaboration + migration 0019 semantics) ----
    const ME = "99999999-9999-4999-8999-999999999999", ADA = "88888888-8888-4888-8888-888888888888";
    //  POST /__test/as { role } switches them between the studio owner and a project role.
    const T = globalThis.__team || (globalThis.__team = {
      as: "owner", email: "you@aurastage.invalid",
      roles: [
        { id: "producer", label: "Producer", department: "Production", description: "Runs the project.", permissions: { "*": ["view", "comment", "create", "edit", "generate", "approve", "lock", "administer"] }, sort: 1 },
        { id: "director", label: "Director", department: "Creative", description: "Approves and locks.", permissions: { script: ["approve"], scene_dna: ["edit", "lock"], editorial: ["create", "edit", "lock"] }, sort: 2 },
        { id: "writer", label: "Writer", department: "Story", description: "Writes and revises the screenplay.", permissions: { script: ["create", "edit"], dialogue: ["edit"] }, sort: 3 },
        { id: "editor", label: "Editor", department: "Post", description: "Cuts the film.", permissions: { editorial: ["create", "edit"], delivery: ["create"] }, sort: 15 },
        { id: "reviewer", label: "Reviewer", department: "Review", description: "Views everything and leaves comments.", permissions: {}, sort: 19 },
      ],
      people: [{ user_id: ADA, email: "ada@aurastage.invalid", org_role: "member", project_role: "writer", grants: [], source: "project", joined_at: now(), last_sign_in_at: null }],
      invites: [],
    });
    const MODS = ["script", "casting", "dialogue", "scene_dna", "shots", "generation", "audio", "editorial", "delivery", "assets", "settings", "team"];
    const ACTS = ["view", "comment", "create", "edit", "generate", "approve", "lock", "administer"];
    const teamAccess = () => {
      const owner = T.as === "owner", r = T.roles.find((x) => x.id === T.as);
      const modules = Object.fromEntries(MODS.map((mo) => [mo, ACTS.filter((a) => owner || a === "view" || a === "comment" || (r.permissions["*"] || []).includes(a) || (r.permissions[mo] || []).includes(a))]));
      return { project_id: P, org_id: ORG, org_role: owner ? "owner" : "member", project_role: owner ? null : T.as, project_role_label: owner ? null : r.label, grants: [], source: owner ? "organization" : "project", modules };
    };
    const me = () => ({ user_id: ME, email: T.email, org_role: T.as === "owner" ? "owner" : "member", project_role: T.as === "owner" ? null : T.as, grants: [], source: T.as === "owner" ? "organization" : "project", joined_at: now(), last_sign_in_at: now() });
    const teamView = () => {
      const a = teamAccess(), manage = a.modules.team.includes("administer");
      return { project: { id: P, title: project.title, org_id: ORG }, access: a, can_manage: manage, can_manage_studio: T.as === "owner", roles: T.roles, members: [me(), ...T.people], invites: manage ? T.invites.filter((i) => !i.accepted_at && !i.revoked_at) : [] };
    };
    const refuse = (what) => send(403, { error: { code: "AURA-COL-403", message: `your role (${teamAccess().project_role_label}) can't administer in ${what}. Ask the project's producer for access.` } });
    if (u === "/__test/as") { T.as = b.role; if (b.email) T.email = b.email; return send(200, { ok: true }); }
    if (u === "/api/organizations" && req.method === "GET") return send(200, [{ org_id: ORG, role: T.as === "owner" ? "owner" : "member", organization: { id: ORG, name: "Test Studio", slug: "t", created_at: now() } }]);
    if (u === `/api/projects/${P}/access`) return send(200, teamAccess());
    if (u === `/api/projects/${P}/team`) return send(200, teamView());
    if (u === `/api/projects/${P}/team/members` && req.method === "POST") {
      if (!teamAccess().modules.team.includes("administer")) return refuse("Team & Collaboration");
      const pr = T.people.find((x) => x.user_id === b.user_id); Object.assign(pr, { project_role: b.role, grants: b.grants || [] }); return send(200, teamView());
    }
    if ((m = u.match(/^\/api\/projects\/[^/]+\/team\/members\/([^/]+)$/)) && req.method === "DELETE") {
      if (!teamAccess().modules.team.includes("administer")) return refuse("Team & Collaboration");
      T.people = T.people.filter((x) => x.user_id !== m[1]); return send(200, { ok: true });
    }
    if (u === `/api/organizations/${ORG}/team`) return send(200, { members: [me(), ...T.people].map((x) => ({ user_id: x.user_id, email: x.email, org_role: x.org_role, projects: x.org_role === "member" ? 1 : 0, joined_at: x.joined_at, last_sign_in_at: x.last_sign_in_at })), invites: T.invites.filter((i) => !i.accepted_at && !i.revoked_at && !i.project_id), projects: [{ id: P, title: project.title }] });
    if ((m = u.match(/^\/api\/organizations\/[^/]+\/members\/([^/]+)$/))) {
      const pr = T.people.find((x) => x.user_id === m[1]);
      if (req.method === "DELETE") { T.people = T.people.filter((x) => x.user_id !== m[1]); return send(200, { ok: true }); }
      pr.org_role = b.role; if (b.role !== "member") Object.assign(pr, { source: "organization", project_role: null }); return send(200, {});
    }
    if (u === `/api/organizations/${ORG}/invites`) {
      const c = require(require("path").resolve(__dirname, "../../../packages/contracts/dist/index.js"));
      const r = c.CreateInviteInputSchema.safeParse(b);
      if (!r.success) return send(400, { error: { code: "AURA-COL-400", message: r.error.issues[0].message } });
      const token = crypto.randomBytes(24).toString("hex");
      const inv = { id: crypto.randomUUID(), org_id: ORG, project_id: r.data.project_id ?? null, email: r.data.email, org_role: r.data.org_role, project_role: r.data.project_role ?? null, grants: r.data.grants, created_at: now(), expires_at: new Date(Date.now() + 14 * 864e5).toISOString(), accepted_at: null, revoked_at: null, token };
      T.invites.forEach((i) => { if (i.email === inv.email && !i.accepted_at) i.revoked_at = now(); });
      T.invites.push(inv); const { token: _t, ...pub } = inv; return send(200, { invite: pub, token });
    }
    if ((m = u.match(/^\/api\/invites\/([0-9a-f-]{36})$/)) && req.method === "DELETE") { T.invites.find((i) => i.id === m[1]).revoked_at = now(); return send(200, { ok: true }); }
    if (u === "/api/invites/preview" || u === "/api/invites/accept") {
      const inv = T.invites.find((i) => i.token === b.token);
      if (!inv) return send(404, { error: { code: "AURA-COL-404", message: "this invite link isn't valid" } });
      const status = inv.accepted_at ? "accepted" : inv.revoked_at ? "revoked" : "pending";
      if (u.endsWith("preview")) return send(200, { status, email: inv.email, org_role: inv.org_role, project_role: inv.project_role, project_role_label: T.roles.find((r) => r.id === inv.project_role)?.label ?? null, organization: "Test Studio", project: inv.project_id ? project.title : null, project_id: inv.project_id, invited_by: "owner@aurastage.invalid", expires_at: inv.expires_at, email_matches: inv.email === T.email });
      if (inv.email !== T.email) return send(403, { error: { code: "AURA-COL-403", message: `this invite is for ${inv.email}. Sign in with that email to accept it.` } });
      inv.accepted_at = now(); T.as = inv.project_role || "owner";
      return send(200, { org_id: ORG, project_id: inv.project_id });
    }
    // ---- Comments, tasks, notifications, activity (mirrors migration 0021) ----
    const C = globalThis.__collab || (globalThis.__collab = { comments: [], tasks: [], notes: [], events: [] });
    const people = () => [me(), ...T.people];
    const emailOf = (id) => people().find((x) => x.user_id === id)?.email ?? null;
    const MLABEL = { script: "Scriptwriter", editorial: "Editorial & Timeline", team: "Team & Collaboration" };
    const PATHS = { script: "scriptwriter", editorial: "editorial", team: "team" };
    const event = (action, metadata, actor = ME) => C.events.push({ id: crypto.randomUUID(), action, object_type: "Comment", object_id: null, metadata, actor_email: emailOf(actor), created_at: now() });
    const cview = (c) => ({ ...c, mention_emails: c.mentions.map(emailOf).filter(Boolean), author_email: emailOf(c.created_by), resolved_by_email: c.resolved_by ? emailOf(c.resolved_by) : null });
    const addC = (by, x) => {
      const parent = x.parent_id ? C.comments.find((c) => c.id === x.parent_id) : null;
      const c = { id: crypto.randomUUID(), parent_id: x.parent_id ?? null, module: parent?.module ?? x.module, object_type: parent?.object_type ?? x.object_type, object_id: parent?.object_id ?? x.object_id,
        object_version: x.object_version ?? parent?.object_version ?? null, anchor: x.anchor ?? {}, body: x.body.trim(), mentions: [...new Set(x.mentions ?? [])], created_by: by,
        created_at: now(), edited_at: null, resolved_at: null, resolved_by: null, deleted_at: null };
      C.comments.push(c);
      for (const uid of c.mentions) if (uid !== by) C.notes.push({ id: crypto.randomUUID(), user_id: uid, project_id: P, kind: "mention", title: `${emailOf(by)} mentioned you in ${MLABEL[c.module] ?? c.module}`, body: c.body, link: `/projects/${P}/${PATHS[c.module] ?? "team"}?comment=${c.parent_id ?? c.id}`, created_at: now(), read_at: null });
      event(c.parent_id ? "CommentReplied" : "CommentAdded", { module: c.module, anchor: c.anchor }, by);
      return c;
    };
    if (u === "/__test/ada-mentions-you") { addC(ADA, { module: "script", object_type: "Workspace", object_id: P, body: "Can you check scene 1?", mentions: [ME] }); return send(200, { ok: true }); }
    if (u === `/api/projects/${P}/comments` && req.method === "GET") {
      const q = new URL(req.url, "http://x").searchParams;
      return send(200, C.comments.filter((c) => (!q.get("module") || c.module === q.get("module")) && (!q.get("object_type") || c.object_type === q.get("object_type")) && (!q.get("object_id") || c.object_id === q.get("object_id"))).map(cview));
    }
    if (u === `/api/projects/${P}/comments` && req.method === "POST") {
      const cc = require(require("path").resolve(__dirname, "../../../packages/contracts/dist/index.js"));
      const r = cc.CreateCommentInputSchema.safeParse(b);
      if (!r.success) return send(400, { error: { code: "AURA-COL-400", message: r.error.issues[0].message } });
      return send(200, { id: addC(ME, r.data).id });
    }
    if ((m = u.match(/^\/api\/comments\/([^/]+)\/resolve$/))) {
      const c = C.comments.find((x) => x.id === m[1]); Object.assign(c, { resolved_at: b.resolved ? now() : null, resolved_by: b.resolved ? ME : null });
      event(b.resolved ? "CommentResolved" : "CommentReopened", { module: c.module }); return send(200, { ok: true });
    }
    if ((m = u.match(/^\/api\/comments\/([^/]+)$/))) {
      const c = C.comments.find((x) => x.id === m[1]);
      if (req.method === "DELETE") Object.assign(c, { deleted_at: now(), body: "(deleted)" }); else Object.assign(c, { body: b.body.trim(), edited_at: now() });
      return send(200, { ok: true });
    }
    const tview = (t) => ({ ...t, project_title: project.title, assignee_email: t.assignee ? emailOf(t.assignee) : null, creator_email: emailOf(t.created_by) });
    if (u === `/api/projects/${P}/tasks` && req.method === "GET") return send(200, C.tasks.map(tview));
    if (u === "/api/tasks/mine") return send(200, C.tasks.filter((t) => t.assignee === ME).map(tview));
    if (u === `/api/projects/${P}/tasks` && req.method === "POST") {
      const cc = require(require("path").resolve(__dirname, "../../../packages/contracts/dist/index.js"));
      const r = cc.CreateTaskInputSchema.safeParse(b);
      if (!r.success) return send(400, { error: { code: "AURA-COL-400", message: r.error.issues[0].message } });
      const t = { id: crypto.randomUUID(), project_id: P, module: r.data.module, object_type: r.data.object_type ?? null, object_id: r.data.object_id ?? null, kind: r.data.kind, title: r.data.title,
        assignee: r.data.assignee ?? null, status: "open", due_date: r.data.due_date ?? null, created_by: ME, created_at: now(), completed_at: null };
      C.tasks.push(t); event(t.kind === "review" ? "ReviewRequested" : "TaskCreated", { module: t.module, title: t.title }); return send(200, { id: t.id });
    }
    if ((m = u.match(/^\/api\/tasks\/([^/]+)$/)) && req.method === "PATCH") {
      const t = C.tasks.find((x) => x.id === m[1]); Object.assign(t, { status: b.status, completed_at: b.status === "done" ? now() : null });
      event("TaskStatusChanged", { status: b.status, title: t.title }); return send(200, { ok: true });
    }
    if (u === "/api/notifications") { const mine = C.notes.filter((n) => n.user_id === ME).reverse(); return send(200, { unread: mine.filter((n) => !n.read_at).length, items: mine }); }
    if (u === "/api/notifications/read") { C.notes.forEach((n) => { if (n.user_id === ME && !n.read_at && (!b.ids || b.ids.includes(n.id))) n.read_at = now(); }); return send(200, { marked: 1 }); }
    if (u === `/api/projects/${P}/activity`) return send(200, eng.activityFeedEngine({ events: [...C.events].reverse() }));
    // ---- Help & Support + account (mirrors apps/api/src/modules/help + migration 0022) ----
    const H = globalThis.__help || (globalThis.__help = { tickets: [], sessions: [
      { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", created_at: now(), last_active_at: now(), user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/140 Safari/537", ip: "203.0.113.5", current: true },
      { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", created_at: now(), last_active_at: now(), user_agent: "Mozilla/5.0 (iPhone) Safari/604", ip: "198.51.100.7", current: false },
    ] });
    const facts = { failed_jobs: [{ engine_id: "rendering.render", code: "AURA-EXP-500", at: now() }], review_required: { shot_plans: 1 } };
    if (u === "/api/help/status") return send(200, { checked_at: now(), checks: [
      { id: "api", label: "AuraStage API", state: "operational", evidence: "answered this request · up 3 min" },
      { id: "database", label: "Database", state: "operational", evidence: "query answered in 12 ms" },
      { id: "media", label: "Media storage", state: "not_configured", evidence: "no media bucket configured on the server" },
      { id: "worker:render-worker", label: "Render worker", state: "down", evidence: "last checked in 9 min ago" },
    ], jobs_24h: [{ engine_id: "rendering.render", completed: 2, failed: 1, cancelled: 0, running: 0, queued: 0, oldest_queued_seconds: null }],
      providers: [{ id: "aurastage-sketch", name: "AuraStage Sketch", state: "configured", capabilities: ["image"] }, { id: "runway", name: "Runway", state: "not_configured", capabilities: ["video"] }],
      not_connected: [{ id: "voice", name: "Voice / dialogue generation", note: "Not connected yet — needs a voice provider account" }] });
    if (u === "/api/help/guides") return send(200, { guides: eng.GUIDES, troubleshooting: eng.TROUBLESHOOTING });
    if (u === "/api/help/assistant") {
      const k = eng.knowledgeRetrievalEngine({ query: b.question, module: b.module ?? null, limit: 3 });
      return send(200, { mode: "guides", note: "Answers come from the AuraStage guides and your project's own status. No AI model is connected to the assistant yet.",
        guides: k.guides, troubleshooting: k.troubles, findings: b.project_id ? eng.supportDiagnosticEngine(facts).findings : [] });
    }
    if (u === `/api/projects/${P}/diagnostics`) return send(200, eng.supportDiagnosticEngine(facts));
    if (u === "/api/help/tickets" && req.method === "GET") return send(200, { staff: false, tickets: [...H.tickets].reverse() });
    if (u === "/api/help/tickets" && req.method === "POST") {
      if (!b.subject || b.subject.trim().length < 3) return send(400, { error: { code: "AURA-HLP-400", message: "Give the ticket a short subject" } });
      const t = { id: crypto.randomUUID(), user_email: "you@aurastage.invalid", project_id: b.project_id, module: b.module, subject: b.subject.trim(), status: "open",
        consent_diagnostics: !!b.include_diagnostics, diagnostics: b.include_diagnostics ? eng.supportDiagnosticEngine(facts) : null, created_at: now(), updated_at: now(),
        messages: [{ id: crypto.randomUUID(), from_staff: false, body: b.body.trim(), created_at: now() }] };
      H.tickets.push(t); return send(200, { id: t.id });
    }
    if ((m = u.match(/^\/api\/help\/tickets\/([^/]+)\/(reply|close)$/))) {
      const t = H.tickets.find((x) => x.id === m[1]);
      if (m[2] === "close") t.status = "closed"; else { t.messages.push({ id: crypto.randomUUID(), from_staff: false, body: b.body, created_at: now() }); t.status = "open"; }
      return send(200, { ok: true });
    }
    if (u === "/__test/staff-reply") { const t = H.tickets[H.tickets.length - 1]; t.messages.push({ id: crypto.randomUUID(), from_staff: true, body: b.body, created_at: now() }); t.status = "answered"; return send(200, { ok: true }); }
    if (u === "/api/account/sessions") return send(200, { sessions: H.sessions });
    if (u === "/api/account/sessions/revoke") { const before = H.sessions.length; H.sessions = H.sessions.filter((x) => x.current || (b.session_id && x.id !== b.session_id)); return send(200, { signed_out: before - H.sessions.length }); }
    if ((m = u.match(/^\/media\/([^/]+)\/([^/]+)$/))) {
      const file = pathx.join(STORE, m[1], m[2]);
      if (!fsx.existsSync(file)) return send(404, { error: { code: "AURA-X-404", message: "no such file" } });
      const ct = { mp4: "video/mp4", mov: "video/quicktime", wav: "audio/wav", srt: "application/x-subrip", vtt: "text/vtt", edl: "text/plain" }[m[2].split(".").pop()];
      res.statusCode = 200; res.setHeader("Content-Type", ct || "application/octet-stream");
      if (/download=1/.test(req.url)) res.setHeader("Content-Disposition", `attachment; filename="${m[2]}"`);
      return res.end(fsx.readFileSync(file));
    }
    send(404, { error: { code: "AURA-X-404", message: "not mocked " + u } });
  });
}).listen(3911, () => console.log("mock api on 3911"));
