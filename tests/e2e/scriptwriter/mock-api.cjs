// Local stand-in for the AuraStage API so the web UI can be driven in a browser offline.
const http = require("http");
const eng = require(require("path").resolve(__dirname, "../../../engines/dist/index.js"));
const crypto = require("crypto");
const P = "11111111-1111-4111-8111-111111111111", ORG = "22222222-2222-4222-8222-222222222222", S = "33333333-3333-4333-8333-333333333333";
const now = () => new Date().toISOString();
let project = { id: P, org_id: ORG, title: "Shadows of Lagos", type: "feature_film", genre: "Thriller", target_runtime_minutes: 110, status: "draft", created_at: now(), updated_at: now() };
let script = null; const versions = []; let scenes = [];
const ws = () => {
  const cur = script && versions.find((v) => v.id === script.current_version_id);
  return { script, current_version: cur || null, versions: versions.map(({ id, version_number, note, parser_version, created_at }) => ({ id, version_number, note, parser_version, created_at })).reverse(), scenes, analysis: cur ? eng.sceneBoundaryEngine({ elements: cur.elements }).analysis : null };
};
http.createServer((req, res) => {
  let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => {
    res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Headers", "*"); res.setHeader("Access-Control-Allow-Methods", "*");
    if (req.method === "OPTIONS") return res.end();
    const send = (code, obj) => { res.statusCode = code; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(obj)); };
    const b = body ? JSON.parse(body) : {}; const u = req.url.split("?")[0];
    console.log(req.method, u);
    if (u === "/api/organizations/bootstrap") return send(200, { id: ORG, name: "Test Studio", slug: "t", created_at: now() });
    if (u === "/api/projects" && req.method === "GET") return send(200, [project]);
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
    send(404, { error: { code: "AURA-X-404", message: "not mocked " + u } });
  });
}).listen(3911, () => console.log("mock api on 3911"));
