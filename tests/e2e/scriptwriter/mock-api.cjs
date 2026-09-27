// Local stand-in for the AuraStage API so the web UI can be driven in a browser offline.
const http = require("http");
const eng = require(require("path").resolve(__dirname, "../../../engines/dist/index.js"));
const crypto = require("crypto");
const P = "11111111-1111-4111-8111-111111111111", ORG = "22222222-2222-4222-8222-222222222222", S = "33333333-3333-4333-8333-333333333333";
const now = () => new Date().toISOString();
let project = { id: P, org_id: ORG, title: "Shadows of Lagos", type: "feature_film", genre: "Thriller", target_runtime_minutes: 110, status: "draft", created_at: now(), updated_at: now() };
let script = null; const versions = []; let scenes = [];
const chars = [], aliases = [], apps = [], rels = [], looks = [], dlines = []; const sdna = [], sdnaVersions = [], plans = [], shots = [], planVersions = []; let dlgSyncVersion = null, dlgSyncAt = null; let lastSyncVersion = null, lastSyncAt = null;
const ws = () => {
  const cur = script && versions.find((v) => v.id === script.current_version_id);
  return { script, current_version: cur || null, versions: versions.map(({ id, version_number, note, parser_version, created_at }) => ({ id, version_number, note, parser_version, created_at })).reverse(), scenes, analysis: cur ? eng.sceneBoundaryEngine({ elements: cur.elements }).analysis : null };
};
http.createServer((req, res) => {
  let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => {
    res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Headers", "*"); res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    if (req.method === "OPTIONS") return res.end();
    const send = (code, obj) => { res.statusCode = code; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(obj)); };
    const b = body ? JSON.parse(body) : {}; const u = req.url.split("?")[0];
    console.log(req.method, u);
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
      planVersions.push(v); Object.assign(plan, { status: "approved", review_state: "current", review_reason: null, approved_version_id: v.id });
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
    send(404, { error: { code: "AURA-X-404", message: "not mocked " + u } });
  });
}).listen(3911, () => console.log("mock api on 3911"));
