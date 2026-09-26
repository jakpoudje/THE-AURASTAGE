// Local stand-in for the AuraStage API so the web UI can be driven in a browser offline.
const http = require("http");
const eng = require(require("path").resolve(__dirname, "../../../engines/dist/index.js"));
const crypto = require("crypto");
const P = "11111111-1111-4111-8111-111111111111", ORG = "22222222-2222-4222-8222-222222222222", S = "33333333-3333-4333-8333-333333333333";
const now = () => new Date().toISOString();
let project = { id: P, org_id: ORG, title: "Shadows of Lagos", type: "feature_film", genre: "Thriller", target_runtime_minutes: 110, status: "draft", created_at: now(), updated_at: now() };
let script = null; const versions = []; let scenes = [];
const chars = [], aliases = [], apps = []; let lastSyncVersion = null, lastSyncAt = null;
const ws = () => {
  const cur = script && versions.find((v) => v.id === script.current_version_id);
  return { script, current_version: cur || null, versions: versions.map(({ id, version_number, note, parser_version, created_at }) => ({ id, version_number, note, parser_version, created_at })).reverse(), scenes, analysis: cur ? eng.sceneBoundaryEngine({ elements: cur.elements }).analysis : null };
};
http.createServer((req, res) => {
  let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => {
    res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Headers", "*"); res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
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
      return send(200, { characters: chars, aliases, appearances: apps, script: r ? { approved_version_id: r.v.id, version_number: r.v.version_number } : null,
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
    if ((m = u.match(/^\/api\/characters\/([^/]+)$/)) && req.method === "PATCH") {
      const c = chars.find((x) => x.id === m[1]);
      if (b.name) { const n = norm(b.name); if (aliases.some((a) => a.normalized === n && a.character_id !== c.id)) return send(409, { error: { code: "AURA-CHR-409", message: "another character already uses that name" } }); for (const a of aliases) if (a.character_id === c.id && a.source === "name") a.source = "user"; aliases.push({ id: crypto.randomUUID(), character_id: c.id, alias: b.name, normalized: n, source: "name" }); }
      Object.assign(c, b, { updated_at: now() }); return send(200, c);
    }
    send(404, { error: { code: "AURA-X-404", message: "not mocked " + u } });
  });
}).listen(3911, () => console.log("mock api on 3911"));
