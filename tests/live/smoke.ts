// Live signed-in smoke test (CLAUDE.md Working agreement, rule 4).
// Runs as the Railway Function "live-smoke" in the aurastage project (Bun), because
// Claude Code cloud sessions cannot reach *.railway.app / *.supabase.co directly.
// Env: SUPABASE_URL, SUPABASE_ANON_KEY, API_URL, WEB_URL, SMOKE_EMAIL, SMOKE_PASSWORD
// The throwaway account is created and deleted around each run (see tests/live/README.md).
// Output: one JSON line per check, then a SUMMARY line. Never prints tokens or passwords.

const env = (k: string) => {
  const v = Bun.env[k];
  if (!v) throw new Error(`missing env ${k}`);
  return v;
};
const SUPABASE_URL = env("SUPABASE_URL"), ANON = env("SUPABASE_ANON_KEY");
const API = env("API_URL").replace(/\/$/, ""), WEB = env("WEB_URL").replace(/\/$/, "");

const results: { check: string; ok: boolean; detail?: string }[] = [];
async function check(name: string, fn: () => Promise<string | void>) {
  try {
    const detail = (await fn()) ?? undefined;
    results.push({ check: name, ok: true, detail });
    console.log(JSON.stringify({ check: name, ok: true, detail }));
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    results.push({ check: name, ok: false, detail });
    console.log(JSON.stringify({ check: name, ok: false, detail }));
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

let token = "";
async function api<T = any>(method: string, path: string, body?: unknown, expect = [200, 201]): Promise<T> {
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!expect.includes(res.status)) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : (undefined as T);
}

const SCRIPT = `INT. NEWSROOM - MORNING

TUNDE OKAFOR (35), an investigative journalist, reviews documents.

TUNDE
Someone has to tell the truth.

EXT. LAGOS HARBOUR - DAWN

AMARA BELLO (32) waits by the water. DETECTIVE RAMOS watches from a car.

AMARA
You came.

TUNDE (V.O.)
I always do.
`;
const SYNOPSIS = "Act I: The Heist. During a national election the commission deploys a new transmission system. ".repeat(20);

await check("api health", async () => {
  const r = await fetch(API + "/health");
  const j = await r.json();
  assert(r.status === 200 && j.status === "ok", `health ${r.status}`);
  return `phase ${j.phase}`;
});
for (const path of ["/", "/sign-in", "/sign-up", "/dashboard", "/reset-password"]) {
  await check(`web ${path}`, async () => {
    const r = await fetch(WEB + path);
    assert(r.status === 200, `status ${r.status}`);
  });
}

await check("sign in (throwaway account)", async () => {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: env("SMOKE_EMAIL"), password: env("SMOKE_PASSWORD") }),
  });
  const j = await r.json();
  assert(j.access_token, `sign-in failed: ${r.status} ${j.error_code ?? j.msg ?? ""}`);
  token = j.access_token;
});

let orgId = "", projectId = "", v1 = "", tundeId = "";
await check("bootstrap studio", async () => {
  const o = await api("POST", "/api/organizations/bootstrap", { name: "Smoke Studio" });
  orgId = o.id;
});
await check("create project with long synopsis (regression)", async () => {
  const p = await api("POST", "/api/projects", { org_id: orgId, title: "Smoke: Shadows of Lagos", genre: "Thriller", synopsis: SYNOPSIS, target_runtime_minutes: 110 }, [201]);
  projectId = p.id;
  assert(p.synopsis === SYNOPSIS, "synopsis not stored");
});
await check("over-long logline gets a plain-language 400", async () => {
  const r = await api("POST", "/api/projects", { org_id: orgId, title: "x", logline: SYNOPSIS }, [400]);
  assert(/Logline must be 500 characters/.test(r.error.message), r.error.message);
});
await check("project persists and lists", async () => {
  const list = await api("GET", `/api/projects?org_id=${orgId}`);
  assert(list.some((p: any) => p.id === projectId), "project missing from list");
});
await check("edit story setup", async () => {
  const p = await api("PATCH", `/api/projects/${projectId}`, { org_id: orgId, tone: "Tense", ending_style: "Open" });
  assert(p.tone === "Tense", "tone not saved");
});
await check("runtime plan", async () => {
  const { plan } = await api("GET", `/api/projects/${projectId}/scope-plan`);
  assert(plan && plan.target_runtime_minutes === 110, "no plan");
  return `${plan.estimated_scene_count} scenes planned`;
});
await check("save script v1", async () => {
  const v = await api("POST", `/api/projects/${projectId}/script/versions`, { source_text: SCRIPT, base_version_id: null, note: "smoke" }, [201]);
  v1 = v.id;
  assert(v.version_number === 1 && v.elements.length > 5, "bad version");
});
await check("stale save is refused (409)", async () => {
  await api("POST", `/api/projects/${projectId}/script/versions`, { source_text: "x", base_version_id: null }, [409]);
});
await check("approve script -> scenes", async () => {
  await api("POST", `/api/projects/${projectId}/script/approve`, { version_id: v1 });
  const ws = await api("GET", `/api/projects/${projectId}/script`);
  assert(ws.script.approved_version_id === v1, "not approved");
  assert(ws.scenes.length === 2, `scenes ${ws.scenes.length}`);
  return ws.scenes.map((s: any) => s.heading).join(" | ");
});
await check("casting: sync characters from approved script", async () => {
  const before = await api("GET", `/api/projects/${projectId}/characters`);
  assert(before.sync.state === "never", `state ${before.sync.state}`);
  const r = await api("POST", `/api/projects/${projectId}/characters/sync`, {});
  assert(r.summary.created === 2, `created ${r.summary.created}`);
  const ws = await api("GET", `/api/projects/${projectId}/characters`);
  assert(ws.sync.state === "current", `state after ${ws.sync.state}`);
  const names = ws.characters.map((c: any) => c.name).sort();
  tundeId = ws.characters.find((c: any) => c.name === "Tunde Okafor")?.id;
  assert(tundeId, "Tunde missing");
  assert(ws.pending.some((c: any) => c.key === "DETECTIVE RAMOS"), "Ramos should await confirmation");
  return names.join(", ");
});
await check("casting: confirm pending candidate", async () => {
  await api("POST", `/api/projects/${projectId}/characters/sync`, { confirm: ["DETECTIVE RAMOS"] });
  const ws = await api("GET", `/api/projects/${projectId}/characters`);
  assert(ws.characters.length === 3, `characters ${ws.characters.length}`);
});
await check("casting: edit + approve character", async () => {
  const c = await api("PATCH", `/api/characters/${tundeId}`, { occupation: "Investigative journalist", status: "approved" });
  assert(c.status === "approved" && c.occupation === "Investigative journalist", "not saved");
});
await check("casting: rename clash refused (409)", async () => {
  await api("PATCH", `/api/characters/${tundeId}`, { name: "Amara Bello" }, [409]);
});
let amaraId = "";
await check("casting: add character by hand; duplicate refused", async () => {
  const c = await api("POST", `/api/projects/${projectId}/characters`, { name: "Chief Adeyemi", role: "supporting" }, [201]);
  assert(c.role === "supporting", "role not saved");
  await api("POST", `/api/projects/${projectId}/characters`, { name: "tunde okafor" }, [409]);
});
await check("casting: relationship + wardrobe look", async () => {
  const ws = await api("GET", `/api/projects/${projectId}/characters`);
  amaraId = ws.characters.find((c: any) => c.name === "Amara Bello")?.id;
  assert(amaraId, "Amara missing");
  await api("POST", `/api/projects/${projectId}/relationships`, { character_a: tundeId, character_b: amaraId, relationship: "Love interest" });
  await api("POST", `/api/projects/${projectId}/relationships`, { character_a: amaraId, character_b: tundeId, relationship: "Partner" });
  const look = await api("POST", `/api/characters/${tundeId}/looks`, { name: "Field outfit", description: "Khaki jacket" });
  const after = await api("GET", `/api/projects/${projectId}/characters`);
  assert(after.relationships.length === 1 && after.relationships[0].relationship === "Partner", "relationship not upserted");
  assert(after.wardrobe_looks.some((l: any) => l.id === look.id), "look missing");
  await api("DELETE", `/api/looks/${look.id}`);
  const final = await api("GET", `/api/projects/${projectId}/characters`);
  assert(!final.wardrobe_looks.some((l: any) => l.id === look.id), "look not deleted");
});
let lineId = "";
await check("dialogue: bring in lines from the approved script", async () => {
  const before = await api("GET", `/api/projects/${projectId}/dialogue`);
  assert(before.sync.state === "never", `state ${before.sync.state}`);
  const s = await api("POST", `/api/projects/${projectId}/dialogue/sync`, {});
  assert(s.created === 3, `created ${s.created}`);
  const ws = await api("GET", `/api/projects/${projectId}/dialogue`);
  assert(ws.sync.state === "current", `state after ${ws.sync.state}`);
  const first = ws.lines.find((l: any) => l.text === "Someone has to tell the truth.");
  assert(first && first.character_id === tundeId, "speaker not resolved to Tunde");
  lineId = first.id;
  return ws.lines.map((l: any) => l.speaker_name).join(", ");
});
await check("dialogue: annotate, approve, bad emotion refused", async () => {
  const l = await api("PATCH", `/api/dialogue-lines/${lineId}`, { intention: "confess", emotion: "tension", intensity: 7 });
  assert(l.emotion === "tension" && l.intensity === 7 && l.approval === "draft", "annotation not saved");
  await api("PATCH", `/api/dialogue-lines/${lineId}`, { emotion: "rage" }, [400]);
  const a = await api("PATCH", `/api/dialogue-lines/${lineId}`, { approval: "approved" });
  assert(a.approval === "approved", "not approved");
});
await check("persistence: everything still there on re-read", async () => {
  const [p, s, c] = await Promise.all([
    api("GET", `/api/projects/${projectId}`),
    api("GET", `/api/projects/${projectId}/script`),
    api("GET", `/api/projects/${projectId}/characters`),
  ]);
  assert(p.tone === "Tense" && s.current_version.id === v1 && c.characters.find((x: any) => x.id === tundeId).status === "approved", "mismatch");
});
await check("security: other project ids are refused", async () => {
  await api("GET", `/api/projects/00000000-0000-4000-8000-000000000000/characters`, undefined, [403]);
});

const failed = results.filter((r) => !r.ok).length;
console.log(`SUMMARY ${results.length - failed}/${results.length} passed${failed ? " — FAILURES: " + results.filter((r) => !r.ok).map((r) => r.check).join("; ") : ""}`);
