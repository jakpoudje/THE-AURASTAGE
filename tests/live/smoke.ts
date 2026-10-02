// Live signed-in smoke test (CLAUDE.md Working agreement, rule 4).
// Runs as the Railway Function "live-smoke" in the aurastage project (Bun), because
// Claude Code cloud sessions cannot reach *.railway.app / *.supabase.co directly.
// Env: SUPABASE_URL, SUPABASE_ANON_KEY, API_URL, WEB_URL, SMOKE_EMAIL, SMOKE_PASSWORD,
//      SMOKE2_EMAIL, SMOKE2_PASSWORD (a second throwaway account for the Team & permissions checks)
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
  return apiAs<T>(token, method, path, body, expect);
}
async function apiAs<T = any>(tok: string, method: string, path: string, body?: unknown, expect = [200, 201]): Promise<T> {
  const send = () => fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${tok}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let res = await send();
  // The API's per-person safety limit (120 changes a minute) answers 429 with Retry-After; wait as a real client
  // would, unless the check is about the limit itself.
  for (let i = 0; i < 2 && res.status === 429 && !expect.includes(429); i++) {
    await Bun.sleep((Number(res.headers.get("Retry-After")) || 10) * 1000 + 250);
    res = await send();
  }
  const text = await res.text();
  if (!expect.includes(res.status)) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : (undefined as T);
}

const SCRIPT = `INT. NEWSROOM - MORNING

TUNDE OKAFOR (35), an investigative journalist, reviews documents.

TUNDE
Someone has to tell the truth.

He types fast at the keyboard.

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
for (const path of ["/", "/sign-in", "/sign-up", "/dashboard", "/reset-password", "/projects/00000000-0000-4000-8000-000000000000/scene-dna", "/projects/00000000-0000-4000-8000-000000000000/storyboard", "/projects/00000000-0000-4000-8000-000000000000/visual", "/projects/00000000-0000-4000-8000-000000000000/audio", "/projects/00000000-0000-4000-8000-000000000000/editorial", "/projects/00000000-0000-4000-8000-000000000000/export", "/projects/00000000-0000-4000-8000-000000000000/team", "/projects/00000000-0000-4000-8000-000000000000/world", "/invite", "/help", "/account"]) {
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
await check("casting: a character named twice is pointed out; \"not the same\" is remembered (migration 0042); merging still works", async () => {
  const dup = await api("POST", `/api/projects/${projectId}/characters`, { name: "Adeyemi", role: "minor" }, [201]);
  const ws = await api("GET", `/api/projects/${projectId}/characters`);
  const pair = (ws.duplicates ?? []).find((p: any) => p.merge_id === dup.id || p.keep_id === dup.id);
  assert(pair && [pair.keep_name, pair.merge_name].includes("Chief Adeyemi"), "no duplicate suggested: " + JSON.stringify(ws.duplicates));
  await api("POST", `/api/projects/${projectId}/characters/distinct`, { a_id: pair.keep_id, b_id: pair.merge_id });
  const after = await api("GET", `/api/projects/${projectId}/characters`);
  assert(!(after.duplicates ?? []).some((p: any) => p.merge_id === dup.id || p.keep_id === dup.id), "the pair came back after 'not the same'");
  const chief = after.characters.find((c: any) => c.name === "Chief Adeyemi");
  await api("POST", `/api/projects/${projectId}/characters/merge`, { source_id: dup.id, target_id: chief.id });
  return pair.reason;
});
await check("casting: one click uses the suggested profiles for the whole cast — only empty fields, written ones untouched", async () => {
  const before = await api("GET", `/api/projects/${projectId}/characters`);
  const r = await api("POST", `/api/projects/${projectId}/characters/apply-suggestions`, {});
  const after = await api("GET", `/api/projects/${projectId}/characters`);
  for (const b of before.characters.filter((c: any) => !c.merged_into)) {
    const a = after.characters.find((c: any) => c.id === b.id);
    for (const k of ["age", "description", "accent", "languages", "nationality", "occupation"]) {
      if (b[k] && String(b[k]).trim()) assert(a[k] === b[k], `${b.name}: written ${k} changed`);
    }
  }
  for (const u of r.updated) {
    const a = after.characters.find((c: any) => c.id === u.id);
    assert(u.fields.every((k: string) => a[k] && String(a[k]).trim()), `${u.name}: ${u.fields} not saved`);
  }
  return r.updated.map((u: any) => `${u.name}: ${u.fields.join(", ")}`).join("; ") || "nothing empty to fill";
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
  // Item 12: the relationship map (who shares scenes, saved relationships) and the pronunciation guide (saved, read back).
  const edge = after.relationship_map?.edges.find((e: any) => [e.a, e.b].sort().join() === [tundeId, amaraId].sort().join());
  assert(edge && edge.relationship === "Partner" && edge.shared_scenes >= 1 && after.relationship_map.nodes.length >= 2, "relationship map: " + JSON.stringify(after.relationship_map?.edges ?? null).slice(0, 300));
  await api("PATCH", `/api/characters/${amaraId}`, { pronunciation: "ah-mah-rah beh-loh" });
  const pr = (await api("GET", `/api/projects/${projectId}/characters`)).characters.find((c: any) => c.id === amaraId);
  assert(pr.pronunciation === "ah-mah-rah beh-loh", "pronunciation not saved: " + pr.pronunciation);
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
let s1 = "", s2 = "";
await check("scene dna: every scene assembled from script, cast and dialogue", async () => {
  const ws = await api("GET", `/api/projects/${projectId}/scene-dna`);
  assert(ws.scenes.length === 2, `scenes ${ws.scenes.length}`);
  [s1, s2] = ws.scenes.map((e: any) => e.scene.id);
  const one = ws.scenes[0];
  assert(one.proposal.participants.some((p: any) => p.character_id === tundeId), "Tunde not in scene 1");
  assert(one.proposal.ready_for_approval === true, "scene 1 should be ready (its only line is approved)");
  assert(ws.scenes[1].proposal.ready_for_approval === false, "scene 2 has unapproved lines");
  return ws.scenes.map((e: any) => `${e.scene.number}: ${e.proposal.readiness.filter((r: any) => r.ok).length}/${e.proposal.readiness.length} checks`).join(", ");
});
await check("scene dna: save, bad value refused, not-ready lock refused (412)", async () => {
  const r = await api("PATCH", `/api/projects/${projectId}/scene-dna/${s1}`, { purpose: "Tunde decides to publish.", mood: ["tense"], camera_energy: "measured" });
  assert(r.status === "draft" && r.purpose === "Tunde decides to publish.", "not saved");
  await api("PATCH", `/api/projects/${projectId}/scene-dna/${s1}`, { camera_energy: "wild" }, [400]);
  const e = await api("POST", `/api/projects/${projectId}/scene-dna/${s2}/approve`, {}, [412]);
  assert(/dialogue approved/.test(e.error.message), e.error.message);
});
await check("scene dna: lock freezes upstream versions", async () => {
  const v = await api("POST", `/api/projects/${projectId}/scene-dna/${s1}/approve`, {});
  assert(v.version_number === 1 && v.dependencies >= 3, `v${v.version_number} deps ${v.dependencies}`);
  const ws = await api("GET", `/api/projects/${projectId}/scene-dna`);
  const rec = ws.scenes[0].record;
  assert(rec.status === "approved" && rec.review_state === "current" && rec.approved_version_number === 1, "not locked");
  return `${v.dependencies} upstream sources recorded`;
});
await check("scene dna: a Casting change flags the locked scene for review (and re-lock clears it)", async () => {
  await api("PATCH", `/api/characters/${tundeId}`, { description: "Now a disgraced reporter" });
  const ws = await api("GET", `/api/projects/${projectId}/scene-dna`);
  const rec = ws.scenes[0].record;
  assert(rec.review_state === "review_required", `state ${rec.review_state}`);
  assert(rec.drift.some((d: any) => d.id === tundeId && d.kind === "changed"), "no evidence for Tunde");
  const v2 = await api("POST", `/api/projects/${projectId}/scene-dna/${s1}/approve`, {});
  assert(v2.version_number === 2, `v${v2.version_number}`);
  const after = await api("GET", `/api/projects/${projectId}/scene-dna`);
  assert(after.scenes[0].record.review_state === "current", "still flagged");
  assert(after.scenes[0].record.purpose === "Tunde decides to publish.", "purpose lost");
});
await check("storyboard: only locked scenes can be planned (412 otherwise)", async () => {
  const ws = await api("GET", `/api/projects/${projectId}/storyboard`);
  assert(ws.scenes[0].dna.state === "locked" && ws.scenes[1].dna.state === "not_locked", `${ws.scenes[0].dna.state}/${ws.scenes[1].dna.state}`);
  await api("POST", `/api/projects/${projectId}/storyboard/scenes/${s2}/generate`, {}, [412]);
});
let shotId = "";
await check("storyboard: one click plans every locked scene (coverage style); unlocked ones are skipped; re-plan asks first (409)", async () => {
  await api("POST", `/api/projects/${projectId}/storyboard/generate-all`, { style: "wild" }, [400]);
  const all = await api("POST", `/api/projects/${projectId}/storyboard/generate-all`, { style: "intimate" });
  assert(all.planned.length === 1 && all.planned[0].scene_number === 1 && all.skipped.some((x: any) => x.scene_number === 2 && /isn.t locked/.test(x.reason)), JSON.stringify(all));
  const again = await api("POST", `/api/projects/${projectId}/storyboard/generate-all`, {});
  assert(again.planned.length === 0 && again.skipped.some((x: any) => x.scene_number === 1 && /kept as it is/.test(x.reason)), "an existing plan must never be replaced by plan-all");
  const first = (await api("GET", `/api/projects/${projectId}/storyboard`)).scenes[0];
  // Coverage styles arrived in 1.1.0; any later version records them too.
  const [maj, min] = String(first.plan.engine_version).split(".").map(Number);
  assert((maj > 1 || min >= 1) && /^Intimate coverage: /.test(first.shots[0].notes ?? ""), `style not recorded: ${first.plan.engine_version} ${first.shots[0].notes}`);
  // Back to the standard plan (the rest of the run builds on it), replacing on purpose.
  const g = await api("POST", `/api/projects/${projectId}/storyboard/scenes/${s1}/generate`, { replace: true, style: "standard" });
  assert(g.shots >= 2 && g.scene_dna_version_number === 2, `shots ${g.shots} from v${g.scene_dna_version_number}`);
  // Camera intelligence (shotPlanningEngine 1.3.0): the reply says which genre/scene grammar planned the camera.
  assert(g.camera && typeof g.camera.genre_family === "string" && typeof g.camera.scene_kind === "string", "no camera decisions: " + JSON.stringify(g.camera));
  await api("POST", `/api/projects/${projectId}/storyboard/scenes/${s1}/generate`, {}, [409]);
  const ws = await api("GET", `/api/projects/${projectId}/storyboard`);
  const sc = ws.scenes[0];
  shotId = sc.shots[0].id;
  assert(sc.coverage.ready_for_approval === true, "coverage not ready: " + JSON.stringify(sc.coverage.readiness.filter((r: any) => !r.ok)));
  return `${g.shots} shots, ${Math.round(sc.coverage.coverage * 100)}% covered`;
});
await check("storyboard: edit a shot (bad value refused), approve, persists", async () => {
  await api("PATCH", `/api/shots/${shotId}`, { size: "HUGE" }, [400]);
  const s = await api("PATCH", `/api/shots/${shotId}`, { angle: "low", composition: "Lamp top-left" });
  assert(s.angle === "low", "not saved");
  // Approve every ready plan in one click (owner report 2026-10-01); scenes without a plan are listed, never approved.
  const all = await api("POST", `/api/projects/${projectId}/storyboard/approve-all`, {});
  assert(all.approved.length === 1 && all.approved[0].version_number === 1, "approve-all " + JSON.stringify(all));
  assert(all.skipped.every((x: any) => typeof x.reason === "string"), "skipped without a reason");
  const again = await api("POST", `/api/projects/${projectId}/storyboard/approve-all`, {});
  assert(again.approved.length === 0, "approved twice");
  const ws = await api("GET", `/api/projects/${projectId}/storyboard`);
  const sc = ws.scenes[0];
  assert(sc.plan.status === "approved" && sc.shots[0].angle === "low" && sc.shots[0].composition === "Lamp top-left", "not persisted");
});
let takeId = "";
await check("visual: honest provider status; compile a prompt from the approved shot", async () => {
  const ws = await api("GET", `/api/projects/${projectId}/visual`);
  assert(ws.media_ready === true, "media storage not configured on the API");
  const sketch = ws.providers.find((p: any) => p.id === "aurastage-sketch");
  assert(sketch.state === "configured", "sketch should always be available");
  const ids = ws.providers.map((p: any) => p.id);
  for (const id of ["runway", "openai", "google", "stability", "bfl", "luma", "kling", "minimax"]) assert(ids.includes(id), `${id} missing from the gateway`);
  assert(ws.providers.find((p: any) => p.id === "runway").video_needs_frame === true && ws.providers.find((p: any) => p.id === "luma").video_needs_frame === false, "video_needs_frame");
  const shot = ws.scenes[0].shots[0].shot;
  const c = await api("POST", `/api/projects/${projectId}/visual/shots/${shot.id}/compile`, { aspect_ratio: "16:9" });
  assert(/Cinematic film still/.test(c.prompt), "no prompt");
  return ws.providers.map((p: any) => `${p.id}:${p.state}`).join(", ");
});
await check("realism R1: physicality saves (≤2000) and reaches the shot; the package carries a timed video prompt and ranked blocks; the still never quotes dialogue", async () => {
  const amara = async () => (await api("GET", `/api/projects/${projectId}/characters`)).characters.find((c: any) => c.id === amaraId);
  const before = (await amara()).physicality ?? null;
  await api("PATCH", `/api/characters/${amaraId}`, { physicality: "x".repeat(2001) }, [400]);
  await api("PATCH", `/api/characters/${amaraId}`, { physicality: "Taps her pen on the desk when she is thinking." });
  try {
    assert((await amara()).physicality === "Taps her pen on the desk when she is thinking.", "physicality not saved");
    const ws = await api("GET", `/api/projects/${projectId}/visual`);
    const all = ws.scenes.flatMap((sc: any) => sc.shots.map((x: any) => x.shot));
    const shot = all.find((x: any) => (x.character_ids ?? []).includes(amaraId)) ?? all[0];
    const r = await api("POST", `/api/projects/${projectId}/visual/shots/${shot.id}/compile`, { aspect_ratio: "16:9" });
    // The shot list stays light (2026-10-02); the prompt itself is read per package.
    const listed = (await api("GET", `/api/projects/${projectId}/visual`)).scenes.flatMap((sc: any) => sc.shots).find((x: any) => x.package?.id === r.package_id);
    assert(listed && listed.package.content === null, "the shot list should leave the prompt text out");
    const c = (await api("GET", `/api/visual/packages/${r.package_id}`)).content ?? {};
    assert(/-second cinematic video shot/.test(c.video_prompt ?? ""), "no timed video prompt: " + String(c.video_prompt).slice(0, 120));
    assert(Array.isArray(c.blocks) && c.blocks.length >= 4 && c.blocks.some((b: any) => b.id === "header" && b.rank === 1), "ranked blocks missing");
    assert(!/says "/.test(c.prompt), "still prompt quotes dialogue");
    const withAmara = (shot.character_ids ?? []).includes(amaraId);
    if (withAmara) assert(/Taps her pen/.test(c.prompt + c.video_prompt), "physicality not in the shot's prompts");
    return `${c.blocks.length} blocks; video prompt ${c.video_prompt.length} chars${withAmara ? "; Amara's physicality in the prompt" : " (no shot with Amara)"}`;
  } finally {
    await api("PATCH", `/api/characters/${amaraId}`, { physicality: before });
  }
});
await check("visual: the worker generates a sketch take in the background; media is private + signed", async () => {
  let ws = await api("GET", `/api/projects/${projectId}/visual`);
  const pkgId = ws.scenes[0].shots[0].package.id;
  const q = await api("POST", `/api/visual/packages/${pkgId}/takes`, { provider: "aurastage-sketch", model: "sketch-v1", capability: "image", variations: 1 });
  takeId = q.takes[0].id;
  let take: any;
  for (let i = 0; i < 30; i++) {
    await Bun.sleep(2000);
    ws = await api("GET", `/api/projects/${projectId}/visual`);
    take = ws.scenes[0].shots[0].takes.find((t: any) => t.id === takeId);
    if (take.status === "succeeded" || take.status === "failed") break;
  }
  assert(take.status === "succeeded", `take ${take.status} ${take.error ?? ""}`);
  const media = await fetch(take.media_url);
  const body = await media.text();
  assert(media.status === 200 && body.includes("AURASTAGE SKETCH"), `media ${media.status}`);
  return `take V${take.take_number} in ${Math.round((Date.parse(take.completed_at) - Date.parse(take.created_at)) / 1000)}s`;
});
await check("visual: 2, 4, 6, 8 or 13 variations to choose from (13 sketch takes queue); other counts are refused", async () => {
  const ws = await api("GET", `/api/projects/${projectId}/visual`);
  const pkgId = ws.scenes[0].shots[0].package.id;
  await api("POST", `/api/visual/packages/${pkgId}/takes`, { provider: "aurastage-sketch", model: "sketch-v1", capability: "image", variations: 3 }, [400]);
  const q = await api("POST", `/api/visual/packages/${pkgId}/takes`, { provider: "aurastage-sketch", model: "sketch-v1", capability: "image", variations: 13 });
  assert(q.takes.length === 13, `queued ${q.takes.length}`);
  return "13 queued";
});
await check("visual: approve the take; unconnected providers are refused plainly (412)", async () => {
  const t = await api("POST", `/api/takes/${takeId}/approve`, {});
  assert(t.approval === "approved", "not approved");
  const ws = await api("GET", `/api/projects/${projectId}/visual`);
  const pkgId = ws.scenes[0].shots[0].package.id;
  for (const p of ws.providers.filter((x: any) => x.state === "not_configured")) {
    // Each provider with its own first model and capability (video-only providers like Kling are asked for video).
    const r = await api("POST", `/api/visual/packages/${pkgId}/takes`, { provider: p.id, model: p.models[0].id, capability: p.models[0].capability }, [412]);
    assert(/isn't connected yet/.test(r.error.message), r.error.message);
  }
  assert(ws.scenes[0].shots[0].approved_take_id === takeId, "approval not persisted");
});
// ---- Audio Studio (Phase 8). The measurement posted here only exercises the API contract (revision check,
// approval gate); the real render + BS.1770-4 measurement runs in the browser check (live-browser). ----
function toneWav(seconds = 1, sr = 48000) {
  const n = sr * seconds, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const w = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVE"); w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(3277 * Math.sin((2 * Math.PI * 440 * i) / sr)), true);
  return new Uint8Array(buf);
}
let sessionId = "", assetId = "";
await check("audio: spot the approved scene into tracks and cues (unplanned scene refused 412)", async () => {
  await api("POST", `/api/projects/${projectId}/audio/scenes/${s2}/spot`, {}, [412]);
  const r = await api("POST", `/api/projects/${projectId}/audio/scenes/${s1}/spot`, {});
  sessionId = r.session_id;
  const ws = await api("GET", `/api/projects/${projectId}/audio`);
  const sc = ws.scenes.find((x: any) => x.scene.id === s1);
  assert(sc.session.id === sessionId && sc.tracks.length >= 2 && sc.clips.some((c: any) => c.source.dialogue_line_id), "no dialogue cue");
  // Sound cues from the action lines are placed where they happen in the script (audioSpottingEngine 1.1.0).
  const fx = sc.clips.filter((c: any) => c.source.cue && !["ambience", "score"].includes(c.source.cue));
  assert(fx.length >= 1 && fx.every((c: any) => /placed by its script position/.test(c.source.evidence)), `cues not placed by script: ${fx.map((c: any) => c.source.evidence).join(" | ") || "none"}`);
  const typing = fx.find((c: any) => c.label === "Keyboard typing"), said = sc.clips.find((c: any) => c.source.dialogue_line_id);
  assert(typing && typing.start_seconds >= said.start_seconds + said.duration_seconds - 0.01, `typing should follow the line it comes after (${typing?.start_seconds} vs ${said.start_seconds}+${said.duration_seconds})`);
  // Honest generators: the built-in synthesiser is ready; nothing unbuilt claims to be connected.
  assert(ws.generators.every((g: any) => ["aurastage-synth", "aurastage-voice", "aurastage-neural-voice"].includes(g.id) ? g.state === "configured" : g.state !== "configured"), "generators must be honest");
  // Item 5: the scene's music suggestion (built-in library, free); the Score cue, when there is one, is that style.
  const mu = sc.music_suggestion;
  assert(mu && mu.key && mu.tempo_bpm > 0 && mu.why.length > 0 && /^\d+\.\d+\.\d+$/.test(mu.engine_version), "music suggestion missing");
  const scoreCue = sc.clips.find((c: any) => c.source.cue === "score");
  assert(mu.needed ? scoreCue && scoreCue.label.startsWith(`Score — ${mu.style.name}`) : !scoreCue, `score cue should follow the suggestion (${mu.style.name}, needed ${mu.needed}): ${scoreCue?.label}`);
  return `${r.tracks} tracks, ${r.cues} cues from plan v${r.shot_plan_version_number}; ${fx.map((c: any) => `${c.label}@${c.start_seconds}s`).join(", ") || "no FX cues in this scene"}; music: ${mu.needed ? `${mu.style.name}, ${mu.key}, ${mu.tempo_bpm} BPM` : "none suggested"}`;
});
await check("audio: upload a WAV to the private library (non-audio refused); bytes round-trip", async () => {
  const bad = await fetch(`${API}/api/projects/${projectId}/assets/audio?name=x.wav&duration=1&sample_rate=48000&channels=1`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "audio/wav" }, body: new TextEncoder().encode("not audio at all"),
  });
  assert(bad.status === 400, `bad upload ${bad.status}`);
  const wav = toneWav();
  const up = await fetch(`${API}/api/projects/${projectId}/assets/audio?name=smoke-line.wav&duration=1&sample_rate=48000&channels=1`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "audio/wav" }, body: wav,
  });
  const a = await up.json();
  assert(up.status === 201, `upload ${up.status} ${JSON.stringify(a).slice(0, 200)}`);
  assetId = a.id;
  const back = new Uint8Array(await (await fetch(`${API}/api/assets/${assetId}/content`, { headers: { Authorization: `Bearer ${token}` } })).arrayBuffer());
  assert(back.length === wav.length && back.every((b, i) => b === wav[i]), "bytes differ");
  const anon = await fetch(`${API}/api/assets/${assetId}/content`);
  assert(anon.status === 401 || anon.status === 403, `anonymous read ${anon.status}`);
  return `${wav.length} bytes`;
});
await check("audio: place the recording on the dialogue cue; mixer change saved; approval needs a fresh measurement", async () => {
  let ws = await api("GET", `/api/projects/${projectId}/audio`);
  let sc = ws.scenes.find((x: any) => x.scene.id === s1);
  const cue = sc.clips.find((c: any) => c.source.dialogue_line_id);
  const c = await api("PATCH", `/api/audio-clips/${cue.id}`, { asset_id: assetId, label: "smoke-line", duration_seconds: 1 });
  assert(c.kind === "asset", "not placed");
  await api("PATCH", `/api/audio-tracks/${sc.tracks[0].id}`, { gain_db: 99 }, [400]);
  await api("PATCH", `/api/audio-tracks/${sc.tracks[0].id}`, { gain_db: -3, pan: 0.2 });
  await api("POST", `/api/projects/${projectId}/audio/scenes/${s1}/approve`, {}, [412]);
  ws = await api("GET", `/api/projects/${projectId}/audio`);
  sc = ws.scenes.find((x: any) => x.scene.id === s1);
  assert(sc.tracks[0].gain_db === -3 && sc.clips.find((x: any) => x.id === cue.id).asset_id === assetId, "not persisted");
  const m = { integrated_lufs: -24.1, true_peak_dbtp: -20.1, lra_lu: 0, duration_seconds: sc.session.scene_seconds, clip_count: 1, engine_version: "1.0.0" };
  await api("POST", `/api/audio-sessions/${sessionId}/measurements`, { ...m, session_revision: "an-old-revision" }, [409]);
  await api("POST", `/api/audio-sessions/${sessionId}/measurements`, { ...m, session_revision: sc.session.revision });
  const v = await api("POST", `/api/projects/${projectId}/audio/scenes/${s1}/approve`, {});
  assert(v.version_number === 1, `v${v.version_number}`);
  ws = await api("GET", `/api/projects/${projectId}/audio`);
  sc = ws.scenes.find((x: any) => x.scene.id === s1);
  assert(sc.session.status === "approved" && sc.session.approved_version_number === 1, "approval not persisted");
});
// ---- Completion pass 12b: Assets Library ----
const PNG_1PX = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
const rawPost = async (path: string, type: string, body: Uint8Array) => {
  const send = () => fetch(API + path, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": type }, body });
  let res = await send();
  for (let i = 0; i < 2 && res.status === 429; i++) { await Bun.sleep((Number(res.headers.get("Retry-After")) || 10) * 1000 + 250); res = await send(); }
  return res;
};
await check("assets: the recording is in the library with its real usage (Audio Studio clip)", async () => {
  const lib = await api("GET", `/api/projects/${projectId}/library?category=audio`);
  const a = lib.assets.find((x: any) => x.id === assetId);
  assert(a && a.current_version === 1 && a.versions === 1, `library entry ${JSON.stringify(a).slice(0, 200)}`);
  assert(a.usage.some((u: any) => u.kind === "audio_clip" && u.scene_id === s1), "usage missing: " + JSON.stringify(a.usage));
  assert(lib.categories.length === 12 && /isn't available yet/.test(lib.search_note), "categories / honest search note");
  return a.usage.map((u: any) => u.label).join("; ");
});
await check("assets: replacing the recording adds version 2; version 1's exact bytes are kept", async () => {
  const v1 = toneWav();
  const v2 = toneWav(2);
  await rawPost(`/api/assets/${assetId}/versions`, "image/png", PNG_1PX).then((r) => assert(r.status === 400, `other kind ${r.status}`));
  const same = await rawPost(`/api/assets/${assetId}/versions`, "audio/wav", v1);
  assert(same.status === 409, `identical file ${same.status}`);
  const r = await rawPost(`/api/assets/${assetId}/versions?note=Cleaner%20take&duration=2&sample_rate=48000&channels=1`, "audio/wav", v2);
  const d = await r.json();
  assert(r.status === 201 && d.asset.current_version === 2 && d.versions.length === 2, `replace ${r.status} ${JSON.stringify(d).slice(0, 200)}`);
  const old = new Uint8Array(await (await fetch(`${API}/api/assets/${assetId}/content?version=1`, { headers: { Authorization: `Bearer ${token}` } })).arrayBuffer());
  const cur = new Uint8Array(await (await fetch(`${API}/api/assets/${assetId}/content`, { headers: { Authorization: `Bearer ${token}` } })).arrayBuffer());
  assert(old.length === v1.length && old.every((b, i) => b === v1[i]), "version 1 bytes changed");
  assert(cur.length === v2.length, "current bytes are not version 2");
});
await check("assets → audio: the approved mix is flagged; approval waits for a new measurement, then goes through", async () => {
  let ws = await api("GET", `/api/projects/${projectId}/audio`);
  let sc = ws.scenes.find((x: any) => x.scene.id === s1);
  assert(sc.session.review_state === "review_required" && sc.session.recordings_replaced && /replaced in the Assets Library/.test(sc.session.review_reason), `session ${sc.session.review_state} ${sc.session.review_reason}`);
  const r = await api("POST", `/api/projects/${projectId}/audio/scenes/${s1}/approve`, {}, [412]);
  assert(/loudness measured after the last change/.test(r.error.message), r.error.message);
  const m = { integrated_lufs: -23.4, true_peak_dbtp: -19.8, lra_lu: 0, duration_seconds: sc.session.scene_seconds, clip_count: 1, engine_version: "1.0.0" };
  await api("POST", `/api/audio-sessions/${sessionId}/measurements`, { ...m, session_revision: sc.session.revision });
  const v = await api("POST", `/api/projects/${projectId}/audio/scenes/${s1}/approve`, {});
  ws = await api("GET", `/api/projects/${projectId}/audio`);
  sc = ws.scenes.find((x: any) => x.scene.id === s1);
  assert(v.version_number === 2 && sc.session.review_state === "current" && sc.session.approved_version_number === 2, `re-approve v${v.version_number} ${sc.session.review_state}`);
  return sc.session.review_reason ?? "current again";
});
await check("casting: an actor's photo replaces a view only under recorded consent; withdrawing consent stops it at once", async () => {
  const up = await rawPost(`/api/projects/${projectId}/library?name=Performer%20photo&category=characters&width=1&height=1`, "image/png", PNG_1PX);
  const photo = (await up.json()).asset.id;
  await api("POST", `/api/characters/${tundeId}/consents`, { performer_name: "Test Performer", statement: "Agrees to photos used as the reference." }, [400]);
  const k = await api("POST", `/api/characters/${tundeId}/consents`, { performer_name: "Test Performer", statement: "Agrees to photos used as this character's reference.", confirm: true });
  await api("POST", `/api/characters/${tundeId}/actor-photos`, { consent_id: k.id, asset_id: photo, view: "back:FULL" });
  let look = await api("GET", `/api/characters/${tundeId}/look`);
  let v = look.views.find((x: any) => x.key === "back:FULL");
  assert(v.image?.execution === "upload" && v.image.performer === "Test Performer" && v.image.asset_id === photo, "photo not used: " + JSON.stringify(v.image));
  const list = await api("GET", `/api/characters/${tundeId}/consents`);
  assert(list.consents[0].photos[0].in_use === true, "consent list");
  await api("POST", `/api/consents/${k.id}/withdraw`, {});
  look = await api("GET", `/api/characters/${tundeId}/look`);
  v = look.views.find((x: any) => x.key === "back:FULL");
  assert(v.image?.execution !== "upload" && v.latest?.status === "withdrawn", "withdrawn photo still used: " + JSON.stringify(v));
  await api("POST", `/api/characters/${tundeId}/actor-photos`, { consent_id: k.id, asset_id: photo, view: "back:FULL" }, [409]);
  return "consent recorded, photo used, withdrawn";
});
let imageId = "";
await check("assets: upload an image (fake refused), set details, link to a scene and a character, search, archive and restore", async () => {
  const fake = await rawPost(`/api/projects/${projectId}/library?name=x`, "image/png", new TextEncoder().encode("<svg/>"));
  assert(fake.status === 400, `fake ${fake.status}`);
  const up = await rawPost(`/api/projects/${projectId}/library?name=Harbour%20reference&category=locations&width=1&height=1`, "image/png", PNG_1PX);
  const d = await up.json();
  assert(up.status === 201 && d.asset.category === "locations" && d.asset.specs.width === 1, `upload ${up.status} ${JSON.stringify(d).slice(0, 200)}`);
  imageId = d.asset.id;
  await api("PATCH", `/api/assets/${imageId}`, { colour: "red" }, [400]);
  await api("PATCH", `/api/assets/${imageId}`, { tags: ["Exterior", " dawn "], description: "Golden light over the jetty" });
  await api("POST", `/api/assets/${imageId}/links`, { object_type: "scene", object_id: s1 });
  const linked = await api("POST", `/api/assets/${imageId}/links`, { object_type: "character", object_id: tundeId });
  assert(linked.links.length === 2, "links " + JSON.stringify(linked.links));
  await api("POST", `/api/assets/${imageId}/links`, { object_type: "scene", object_id: "00000000-0000-4000-8000-000000000000" }, [400]);
  const found = await api("GET", `/api/projects/${projectId}/library?q=jetty%20exterior&scene_id=${s1}`);
  assert(found.assets.length === 1 && found.assets[0].id === imageId && found.assets[0].tags.join() === "dawn,exterior", "search " + JSON.stringify(found.assets.map((a: any) => a.tags)));
  await api("PATCH", `/api/assets/${imageId}`, { archived: true });
  const active = await api("GET", `/api/projects/${projectId}/library`);
  assert(!active.assets.some((a: any) => a.id === imageId) && active.archived_count === 1, "archive");
  await api("PATCH", `/api/assets/${imageId}`, { archived: false });
  const detail = await api("GET", `/api/assets/${imageId}`);
  assert(detail.history.map((h: any) => h.action).includes("AssetRestored") && detail.versions.length === 1, "history");
  return `${detail.history.length} history entries`;
});
await check("assets: delete (migration 0043) — a recording in the mix is refused with its scene named; a linked image needs confirmation, then it and its files are gone", async () => {
  const blocked = await api("POST", `/api/assets/${assetId}/delete`, { confirm: true }, [409]);
  assert(/Audio Studio clips in Scene 1/.test(JSON.stringify(blocked)), "the refusal should name the scene: " + JSON.stringify(blocked));
  const detail = await api("GET", `/api/assets/${imageId}`);
  assert(detail.asset.usage.length === 2, "usage shown before deleting: " + JSON.stringify(detail.asset.usage));
  await api("POST", `/api/assets/${imageId}/delete`, {}, [409]);
  const r = await api("POST", `/api/assets/${imageId}/delete`, { confirm: true });
  assert(r.deleted === true && r.files_left === 0, "delete " + JSON.stringify(r));
  await api("GET", `/api/assets/${imageId}`, undefined, [403, 404]);
  const lib = await api("GET", `/api/projects/${projectId}/library`);
  assert(!lib.assets.some((a: any) => a.id === imageId), "still listed");
  return `${r.files_removed} file(s) removed`;
});
// ---- Editorial & Timeline (Phase 9) ----
let edRev = "";
const edWs = () => api("GET", `/api/projects/${projectId}/editorial`);
await check("editorial: first assembly from approved takes (offline slugs for the rest) with the approved mix on A1", async () => {
  const before = await edWs();
  assert(before.timeline === null && before.bin[0].shots.some((s: any) => s.take) && before.bin[0].mix, "bin not ready");
  const r = await api("POST", `/api/projects/${projectId}/editorial/assemble`, { base_revision: null });
  const ws = await edWs();
  edRev = ws.timeline.revision;
  const v1 = ws.clips.filter((c: any) => c.track === "V1"), a1 = ws.clips.filter((c: any) => c.track === "A1");
  assert(v1.some((c: any) => c.kind === "take") && a1.length === 1 && a1[0].record_in === 0, "assembly shape");
  assert(ws.qc.checks.find((c: any) => c.id === "audio_sync").ok, "sound out of sync after assembly");
  return r.summary;
});
await check("editorial: edits apply against the current revision (stale refused 409, impossible refused 409)", async () => {
  await api("POST", `/api/projects/${projectId}/editorial/edit`, { base_revision: "00000000-0000-4000-8000-000000000000", operation: { op: "blade", track: "V1", at: 6 } }, [409]);
  let ws = await edWs();
  const n = ws.clips.length;
  await api("POST", `/api/projects/${projectId}/editorial/edit`, { base_revision: edRev, operation: { op: "blade", track: "V1", at: 6 } });
  ws = await edWs();
  assert(ws.clips.length === n + 1, `blade: ${n} -> ${ws.clips.length}`);
  const first = ws.clips.find((c: any) => c.track === "V1" && c.record_in === 0);
  const e = await api("POST", `/api/projects/${projectId}/editorial/edit`, { base_revision: ws.timeline.revision, operation: { op: "trim", clip_id: first.id, edge: "out", delta: -500, ripple: false } }, [409]);
  assert(/no length left/.test(e.error.message), e.error.message);
  const pic = ws.clips.find((c: any) => c.kind === "take");
  await api("POST", `/api/projects/${projectId}/editorial/edit`, { base_revision: ws.timeline.revision, operation: { op: "grade", clip_id: pic.id, grade: { exposure: 0.5, contrast: 0, saturation: 0, temperature: 0 } } });
  ws = await edWs();
  assert(ws.clips.find((c: any) => c.id === pic.id).grade.exposure === 0.5, "grade not saved");
  // Transitions (migration 0041): a fade up from black on that shot, saved with the clip; an impossible one refused.
  await api("POST", `/api/projects/${projectId}/editorial/edit`, { base_revision: ws.timeline.revision, operation: { op: "transition", clip_id: pic.id, transition: { in: "fade_from_black", out: "fade_to_black", frames: 96 } } }, [409]);
  await api("POST", `/api/projects/${projectId}/editorial/edit`, { base_revision: ws.timeline.revision, operation: { op: "transition", clip_id: pic.id, transition: { in: "fade_from_black", out: "cut", frames: Math.min(6, ws.clips.find((c: any) => c.id === pic.id).duration) } } });
  ws = await edWs();
  assert(ws.clips.find((c: any) => c.id === pic.id).transition?.in === "fade_from_black", "transition not saved");
  edRev = ws.timeline.revision;
});
await check("editorial: Picture Lock refused while offline; lift the slugs, lock, and a locked picture refuses edits until the break is confirmed", async () => {
  let ws = await edWs();
  if (ws.clips.some((c: any) => c.kind === "slug")) {
    const e = await api("POST", `/api/projects/${projectId}/editorial/lock`, { base_revision: ws.timeline.revision }, [412]);
    assert(/offline/.test(e.error.message), e.error.message);
  }
  for (;;) {
    ws = await edWs();
    const slug = ws.clips.find((c: any) => c.kind === "slug");
    if (!slug) break;
    await api("POST", `/api/projects/${projectId}/editorial/edit`, { base_revision: ws.timeline.revision, operation: { op: "lift", clip_id: slug.id } });
  }
  ws = await edWs();
  const l = await api("POST", `/api/projects/${projectId}/editorial/lock`, { base_revision: ws.timeline.revision });
  assert(l.lock_number === 1, `lock ${l.lock_number}`);
  ws = await edWs();
  assert(ws.timeline.status === "locked", "not locked");
  const take = ws.clips.find((c: any) => c.kind === "take");
  const op = { op: "trim", clip_id: take.id, edge: "out", delta: -2, ripple: true };
  const refused = await api("POST", `/api/projects/${projectId}/editorial/edit`, { base_revision: ws.timeline.revision, operation: op }, [423]);
  assert(Array.isArray(refused.error.issues) && refused.error.issues.length > 0, "no impact analysis");
  await api("POST", `/api/projects/${projectId}/editorial/edit`, { base_revision: ws.timeline.revision, operation: op, break_lock: true });
  ws = await edWs();
  assert(ws.timeline.status === "draft" && ws.locks[0].broken_at && ws.locks[0].impact.length, "break not recorded");
  return refused.error.issues.map((i: any) => `${i.label}: ${i.change}`).join("; ");
});
await check("editorial: versions restore (current cut kept first) and the EDL exports", async () => {
  let ws = await edWs();
  const lockVersion = ws.versions.find((v: any) => v.kind === "picture_lock");
  await api("POST", `/api/projects/${projectId}/editorial/versions`, { label: "Smoke cut" });
  ws = await edWs();
  await api("POST", `/api/projects/${projectId}/editorial/versions/${lockVersion.id}/restore`, { base_revision: ws.timeline.revision });
  ws = await edWs();
  assert(ws.versions.some((v: any) => /^Before restoring/.test(v.label)) && ws.versions.some((v: any) => v.label === "Smoke cut"), "versions missing");
  const edl = await fetch(`${API}/api/projects/${projectId}/editorial/edl`, { headers: { Authorization: `Bearer ${token}` } });
  const text = await edl.text();
  assert(edl.status === 200 && text.includes("FCM: NON-DROP FRAME") && /^001  /m.test(text), `edl ${edl.status}`);
  return `${ws.versions.length} versions, EDL ${text.split("\n").length} lines`;
});
await check("editorial Undo (migration 0054): an edit is taken back exactly, revision included; nothing left → 404; stale → 409", async () => {
  let ws = await edWs();
  const before = { rev: ws.timeline.revision, clips: ws.clips.length };
  assert(ws.timeline.undo, "the restore just made should be undoable");
  const pic = ws.clips.find((c: any) => c.track === "V1" && c.duration >= 4);
  await api("POST", `/api/projects/${projectId}/editorial/edit`, { base_revision: ws.timeline.revision, operation: { op: "blade", track: "V1", at: pic.record_in + 2 } });
  ws = await edWs();
  assert(ws.clips.length === before.clips + 1 && ws.timeline.undo, `blade not applied (${ws.clips.length})`);
  await api("POST", `/api/projects/${projectId}/editorial/undo`, { base_revision: before.rev }, [409]);
  const u = await api("POST", `/api/projects/${projectId}/editorial/undo`, { base_revision: ws.timeline.revision });
  ws = await edWs();
  assert(ws.clips.length === before.clips && ws.timeline.revision === before.rev, `undo didn't restore the cut exactly (${ws.clips.length} clips)`);
  return `${u.summary}; next in line: ${ws.timeline.undo?.summary ?? "nothing"}`;
});
await check("editorial item 9: an approved shot laid over the picture (V2) and music across scenes (A2) — the cut doesn't move; level set; the recording can't be deleted while in use", async () => {
  let ws = await edWs();
  const v1Before = JSON.stringify(ws.clips.filter((c: any) => c.track === "V1").map((c: any) => [c.id, c.record_in, c.duration]));
  const shot = ws.bin.flatMap((b: any) => b.shots).find((s: any) => s.take);
  assert(shot && ws.music_library.some((m: any) => m.asset_id === assetId), "bin shot or music library missing");
  await api("POST", `/api/projects/${projectId}/editorial/edit`, { base_revision: ws.timeline.revision, operation: { op: "overwrite", at: 6, source: { kind: "insert_shot", shot_id: shot.shot_id }, duration: 12 } });
  ws = await edWs();
  await api("POST", `/api/projects/${projectId}/editorial/edit`, { base_revision: ws.timeline.revision, operation: { op: "overwrite", at: 0, source: { kind: "music", asset_id: assetId, gain_db: -12 } } });
  ws = await edWs();
  const v2 = ws.clips.filter((c: any) => c.track === "V2"), a2 = ws.clips.filter((c: any) => c.track === "A2");
  assert(v2.length === 1 && v2[0].record_in === 6 && v2[0].kind === "take", "insert on V2: " + JSON.stringify(v2));
  assert(a2.length === 1 && a2[0].kind === "music" && a2[0].asset_id === assetId && Number(a2[0].gain_db) === -12, "music on A2: " + JSON.stringify(a2));
  assert(JSON.stringify(ws.clips.filter((c: any) => c.track === "V1").map((c: any) => [c.id, c.record_in, c.duration])) === v1Before, "the picture moved");
  await api("POST", `/api/projects/${projectId}/editorial/edit`, { base_revision: ws.timeline.revision, operation: { op: "gain", clip_id: a2[0].id, gain_db: -15 } });
  ws = await edWs();
  assert(Number(ws.clips.find((c: any) => c.id === a2[0].id).gain_db) === -15, "level not saved");
  await api("POST", `/api/assets/${assetId}/delete`, { confirm: true }, [409]);
  const edl = await (await fetch(`${API}/api/projects/${projectId}/editorial/edl`, { headers: { Authorization: `Bearer ${token}` } })).text();
  return `insert at ${v2[0].record_in}f for ${v2[0].duration}f, music ${a2[0].duration}f at -15 dB; EDL ${/V2|A2/.test(edl) ? "lists them" : "—"}`;
});
// ---- Export & Deliver (Phase 10): real renders by the render worker ----
const dvWs = () => api("GET", `/api/projects/${projectId}/delivery`);
const renderIds: Record<string, string> = {};
await check("delivery: renders need the current Picture Lock; re-lock and the pre-delivery checks pass", async () => {
  let ws = await edWs();
  if (ws.timeline.status !== "locked") {
    await api("POST", `/api/projects/${projectId}/delivery/renders`, { profile_id: "streaming_master" }, [412]);
    for (;;) {
      ws = await edWs();
      const slug = ws.clips.find((c: any) => c.kind === "slug");
      if (!slug) break;
      await api("POST", `/api/projects/${projectId}/editorial/edit`, { base_revision: ws.timeline.revision, operation: { op: "lift", clip_id: slug.id } });
    }
    ws = await edWs();
    await api("POST", `/api/projects/${projectId}/editorial/lock`, { base_revision: ws.timeline.revision });
  }
  const d = await dvWs();
  const blocking = d.preflight.filter((c: any) => c.blocking && !c.ok);
  assert(d.picture_lock && blocking.length === 0, "preflight: " + JSON.stringify(blocking));
  assert(d.profiles.find((p: any) => p.id === "dcp_theatrical").available === false, "DCP must say it isn't available");
  await api("POST", `/api/projects/${projectId}/delivery/renders`, { profile_id: "dcp_theatrical" }, [400]);
  return `Picture Lock ${d.picture_lock.lock_number}, ${d.preflight.filter((c: any) => c.ok).length}/${d.preflight.length} checks`;
});
await check("editorial automation: draw/set the cut's volume after Picture Lock (lock stays); invalid 400, stale 409", async () => {
  const ws = await edWs();
  assert(ws.timeline.status === "locked" && ws.timeline.automation && typeof ws.timeline.automation_revision === "string", "automation not in the workspace");
  const url = `/api/projects/${projectId}/editorial/automation`;
  await api("PUT", url, { automation: { A1: [{ frame: 1.5, db: 0 }] }, base_revision: ws.timeline.automation_revision }, [400]);
  const saved = await api("PUT", url, { automation: { A1: [{ frame: 0, db: 0 }, { frame: 24, db: -6 }, { frame: 48, db: -3 }] }, base_revision: ws.timeline.automation_revision });
  assert(saved.points === 3 && saved.automation_revision !== ws.timeline.automation_revision, JSON.stringify(saved));
  await api("PUT", url, { automation: { A1: [] }, base_revision: ws.timeline.automation_revision }, [409]);
  const after = await edWs();
  assert(after.timeline.status === "locked" && after.timeline.lock.lock_number === ws.timeline.lock.lock_number, "the lock should stay");
  assert(after.timeline.automation.A1.length === 3, "not kept");
  return `3 points saved on Picture Lock ${after.timeline.lock.lock_number}`;
});
await check("delivery: queue Streaming Master, Subtitles, Audio Package, a social cut-down and a trailer from the lock (checksummed manifests)", async () => {
  // Item 13: a social cut-down (9:16) and a trailer are cut from the same lock (cutdownEngine) and rendered by the real worker.
  for (const id of ["streaming_master", "subtitles", "audio_package", "social_vertical", "trailer"]) {
    const r = await api("POST", `/api/projects/${projectId}/delivery/renders`, { profile_id: id, ...(id === "trailer" ? { options: { length_seconds: 60 } } : id === "social_vertical" ? { options: { length_seconds: 15 } } : {}) });
    assert(/^[0-9a-f]{64}$/.test(r.manifest_sha256), "no manifest checksum");
    renderIds[id] = r.render_id;
  }
  const m = await api("GET", `/api/renders/${renderIds.streaming_master}/manifest`);
  assert(m.manifest.picture_lock.lock_number >= 1 && m.manifest.sources.take_ids.length > 0 && m.manifest.sources.asset_ids.length > 0, "manifest sources");
  // Downstream: the approved mix's routing and channel strips, and the timeline's automation, reach the render.
  const mix: any = Object.values(m.manifest.mixes)[0];
  assert(mix && mix.mix && mix.mix.master && mix.tracks.every((t: any) => t.fx && t.fx.eq), "mix routing / channel strips missing from the manifest");
  assert(m.manifest.automation?.A1?.length === 3 && typeof m.manifest.sources.automation_revision === "string", "automation missing from the manifest");
  assert(m.manifest.picture.some((p: any) => p.kind === "take" && p.transition?.in === "fade_from_black"), "the transition didn't reach the manifest");
  const c = await api("POST", `/api/projects/${projectId}/delivery/renders`, { profile_id: "edit_decision_list" });
  const x = await api("POST", `/api/renders/${c.render_id}/cancel`, {});
  assert(x.status === "cancelled" || x.cancel_requested, "cancel");
});
await check("delivery: the render worker makes the files and final QC passes (real ffmpeg on Railway)", async () => {
  let d: any;
  for (let i = 0; i < 90; i++) {
    d = await dvWs();
    const mine = d.renders.filter((r: any) => Object.values(renderIds).includes(r.id));
    if (mine.every((r: any) => ["succeeded", "failed", "cancelled"].includes(r.status))) break;
    await Bun.sleep(3000);
  }
  const out: string[] = [];
  for (const [id, rid] of Object.entries(renderIds)) {
    const r = d.renders.find((x: any) => x.id === rid);
    assert(r.status === "succeeded", `${id}: ${r.status} ${r.error ?? r.stage ?? ""}`);
    const failing = (r.qc?.checks ?? []).filter((c: any) => c.blocking && !c.ok).map((c: any) => `${c.label}: ${c.evidence}`);
    assert(r.qc_passed === true, `${id} QC failed: ${failing.join("; ")}`);
    out.push(`${id}: ${r.outputs.length} files`);
  }
  return out.join(", ");
});
await check("delivery: signed downloads return the exact bytes (SHA-256 matches); captions contain the dialogue", async () => {
  const d = await dvWs();
  const master = d.renders.find((x: any) => x.id === renderIds.streaming_master);
  const mp4 = master.outputs.find((o: any) => o.name === "streaming_1080p24.mp4");
  const bytes = new Uint8Array(await (await fetch(mp4.url)).arrayBuffer());
  const sha = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
  assert(sha === mp4.sha256 && new TextDecoder().decode(bytes.slice(4, 8)) === "ftyp", `mp4 ${bytes.length} bytes sha ${sha === mp4.sha256}`);
  const subs = d.renders.find((x: any) => x.id === renderIds.subtitles);
  const srt = await (await fetch(subs.outputs.find((o: any) => o.name === "subtitles.srt").url)).text();
  assert(/Someone has to tell the truth\./.test(srt), "captions missing the line");
  assert(d.preview && d.preview.url, "no preview");
  return `master ${(bytes.length / 1024).toFixed(0)} KB`;
});
await check("assets: edit a video (trim, remove the sound, 2× speed) — the render worker saves it as a new version; v1 kept", async () => {
  const d = await dvWs();
  const mp4 = d.renders.find((x: any) => x.id === renderIds.streaming_master).outputs.find((o: any) => o.name === "streaming_1080p24.mp4");
  const bytes = new Uint8Array(await (await fetch(mp4.url)).arrayBuffer());
  const up = await rawPost(`/api/projects/${projectId}/library?name=Master%20for%20editing&category=visual_references`, "video/mp4", bytes);
  const a = (await up.json()).asset;
  assert(up.status === 201 && a.type === "video", `upload ${up.status}`);
  await api("POST", `/api/assets/${a.id}/video-edit`, {}, [400]);
  await api("POST", `/api/assets/${a.id}/video-edit`, { trim_start: 0, trim_end: 2, mute: true, speed: 2, note: "Live check edit" }, [201]);
  let det: any;
  for (let i = 0; i < 40; i++) {
    det = await api("GET", `/api/assets/${a.id}`);
    if (["succeeded", "failed"].includes(det.video_edits?.[0]?.status)) break;
    await Bun.sleep(3000);
  }
  const e = det.video_edits[0];
  assert(e.status === "succeeded" && e.result_version === 2, `edit ${e.status} ${e.error ?? ""}`);
  assert(det.asset.current_version === 2 && det.versions.length === 2, "versions " + det.versions.length);
  const v2 = new Uint8Array(await (await fetch(`${API}/api/assets/${a.id}/content`, { headers: { Authorization: `Bearer ${token}` } })).arrayBuffer());
  assert(new TextDecoder().decode(v2.slice(4, 8)) === "ftyp" && v2.length < bytes.length, `edited file ${v2.length} bytes vs ${bytes.length}`);
  return `v2 ${(v2.length / 1024).toFixed(0)} KB (from ${(bytes.length / 1024).toFixed(0)} KB)`;
});
// ---- Completion pass 12a: Project Settings drive the other workspaces ----
await check("settings: defaults first; the story is inherited from Scriptwriter", async () => {
  const st = await api("GET", `/api/projects/${projectId}/settings`);
  assert(st.version_number === 0 && st.settings.technical.loudness_standard === "ebu_r128" && st.story.title, `defaults ${JSON.stringify(st).slice(0, 200)}`);
  assert(st.facts.some((f: any) => f.value === "24 fps") && st.delivery_profiles.some((p: any) => p.id === "streaming_master"), "facts/profiles");
});
await check("settings: preview the impact, save a version; a stale save is refused (409) and nothing is overwritten", async () => {
  const st = await api("GET", `/api/projects/${projectId}/settings`);
  const next = {
    ...st.settings,
    style: { look: "Desaturated teal-and-amber, handheld", palette: ["#1f6f78", "#e0a458"] },
    generation: { ...st.settings.generation, monthly_paid_take_limit: 50 },
    delivery: { required_profiles: ["streaming_master", "subtitles"] },
    production: { ...st.settings.production, director: "Live Check Director", company: "AuraStage Live", year: 2026, copyright: "© 2026 AuraStage Live" },
  };
  await api("PUT", `/api/projects/${projectId}/settings`, { base_revision: st.revision, settings: { ...next, technical: { aspect_ratio: "5:4", loudness_standard: "ebu_r128" } } }, [400]);
  const imp = await api("POST", `/api/projects/${projectId}/settings/impact`, { settings: next });
  const labels = imp.impact.map((i: any) => i.label);
  assert(["Visual style", "Monthly paid takes", "Required deliverables", "Credits"].every((l) => labels.includes(l)), labels.join(","));
  assert(/compiled shot prompt/.test(imp.impact.find((i: any) => i.label === "Visual style").effect), "style impact should count compiled prompts");
  const saved = await api("PUT", `/api/projects/${projectId}/settings`, { base_revision: st.revision, settings: next });
  assert(saved.version_number === 1 && typeof saved.revision === "string" && saved.revision !== st.revision, `v${saved.version_number} revision changed: ${saved.revision !== st.revision}`);
  await api("PUT", `/api/projects/${projectId}/settings`, { base_revision: st.revision, settings: { ...next, production: { ...next.production, director: "Overwriter" } } }, [409]);
  const again = await api("GET", `/api/projects/${projectId}/settings`);
  assert(again.settings.production.director === "Live Check Director" && again.versions.length === 1, "overwritten or not persisted");
  return imp.impact.map((i: any) => i.label).join(", ");
});
await check("settings → visual: look flags the compiled prompt for review; defaults and budget come from settings", async () => {
  const ws = await api("GET", `/api/projects/${projectId}/visual`);
  const s = ws.scenes[0].shots[0];
  assert(s.package.review_state === "review_required" && /visual style changed/.test(s.package.review_reason ?? ""), `package ${s.package.review_state}`);
  assert(s.approved_take_id === takeId, "approved take must be kept");
  assert(ws.defaults.aspect_ratio === "16:9" && ws.budget.monthly_paid_take_limit === 50 && ws.budget.used_this_month === 0, JSON.stringify(ws.budget));
  const c = await api("POST", `/api/projects/${projectId}/visual/shots/${s.shot.id}/compile`, { aspect_ratio: ws.defaults.aspect_ratio });
  assert(/Look: Desaturated teal-and-amber/.test(c.prompt) && c.checks.some((k: any) => k.id === "style" && k.ok), "look missing from prompt");
  const after = await api("GET", `/api/projects/${projectId}/visual`);
  assert(after.scenes[0].shots[0].package.review_state === "current", "recompiled prompt should be current");
});
await check("settings → delivery: required deliverables tracked; credits written into the render manifest", async () => {
  const d = await dvWs();
  assert(JSON.stringify(d.required_profiles) === JSON.stringify(["streaming_master", "subtitles"]), "required_profiles");
  const req = d.preflight.find((c: any) => c.id === "required_deliverables");
  assert(req && req.blocking === false, "required_deliverables check");
  const r = await api("POST", `/api/projects/${projectId}/delivery/renders`, { profile_id: "edit_decision_list" });
  const m = await api("GET", `/api/renders/${r.render_id}/manifest`);
  await api("POST", `/api/renders/${r.render_id}/cancel`, {});
  const cr = m.manifest.project.credits;
  assert(cr?.director === "Live Check Director" && cr.company === "AuraStage Live" && cr.year === 2026, JSON.stringify(cr));
  return req.evidence;
});
// ---- Titles & credits (Project Settings → render worker): opening card and end-credits roll on video deliverables ----
await check("titles & credits: with them on, a review copy opens on the title card and ends on the credit roll; real ffmpeg render passes QC", async () => {
  const st = await api("GET", `/api/projects/${projectId}/settings`);
  await api("PUT", `/api/projects/${projectId}/settings`, { base_revision: st.revision, settings: { ...st.settings, titles: { ...st.settings.titles, opening_title: true, opening_seconds: 3, end_credits: true, credits_speed: "fast", music: "theme" } } });
  // On-screen text from Scene DNA (task 43): a caption on the locked scene keeps it locked and is burned into the render.
  const dna0 = (await api("GET", `/api/projects/${projectId}/scene-dna`)).scenes.find((x: any) => x.scene.id === s1);
  await api("PATCH", `/api/projects/${projectId}/scene-dna/${s1}`, { on_screen_text: "LAGOS — LIVE CHECK", on_screen_position: "lower_third" });
  const dna1 = (await api("GET", `/api/projects/${projectId}/scene-dna`)).scenes.find((x: any) => x.scene.id === s1);
  assert(dna1.record?.status === dna0.record?.status && dna1.record?.on_screen_text === "LAGOS — LIVE CHECK", `caption changed the lock: ${dna0.record?.status} → ${dna1.record?.status}`);
  // Continuity notes (migration 0044) save the same way and also keep the lock.
  await api("PATCH", `/api/projects/${projectId}/scene-dna/${s1}`, { continuity_notes: "Tunde's jacket stays on; same dawn light as the harbour." });
  const dna2 = (await api("GET", `/api/projects/${projectId}/scene-dna`)).scenes.find((x: any) => x.scene.id === s1);
  assert(dna2.record?.status === dna0.record?.status && /jacket stays on/.test(dna2.record?.continuity_notes ?? ""), `continuity notes: ${dna2.record?.status} ${dna2.record?.continuity_notes}`);
  const r = await api("POST", `/api/projects/${projectId}/delivery/renders`, { profile_id: "review_copy" });
  const m = (await api("GET", `/api/renders/${r.render_id}/manifest`)).manifest;
  assert(m.overlays?.length === 1 && m.overlays[0].text === "LAGOS — LIVE CHECK" && m.overlays[0].record_in === 72 && m.sources.scene_captions?.[0] === s1, `overlays ${JSON.stringify(m.overlays)}`);
  const kinds = m.picture.map((s: any) => s.kind);
  assert(kinds[0] === "title" && kinds.at(-1) === "credits" && m.picture[0].duration === 72, kinds.join(","));
  assert(m.title_music && /Main theme/.test(m.title_music.description), "the theme should play under the titles");
  assert(m.picture.at(-1).svg.includes("LIVE CHECK DIRECTOR") || m.picture.at(-1).svg.includes("Live Check Director"), "credits missing the director");
  let x: any;
  for (let i = 0; i < 80; i++) {
    x = (await dvWs()).renders.find((y: any) => y.id === r.render_id);
    if (["succeeded", "failed", "cancelled"].includes(x.status)) break;
    await Bun.sleep(3000);
  }
  assert(x.status === "succeeded" && x.qc_passed === true, `${x.status} ${x.error ?? ""} ${(x.qc?.checks ?? []).filter((c: any) => c.blocking && !c.ok).map((c: any) => c.evidence).join("; ")}`);
  return `${(m.duration_frames / m.fps).toFixed(1)}s incl. 3s title + ${(m.picture.at(-1).duration / m.fps).toFixed(1)}s credits; caption "${m.overlays[0].text}" ${(m.overlays[0].duration / m.fps).toFixed(1)}s; scene still ${dna1.record?.status}`;
});
await check("storyboard: a Casting change flows through Scene DNA and flags the shots", async () => {
  await api("PATCH", `/api/characters/${tundeId}`, { description: "Back on the story" });
  const ws = await api("GET", `/api/projects/${projectId}/storyboard`);
  assert(ws.scenes[0].plan.review_state === "review_required", `state ${ws.scenes[0].plan.review_state}`);
  return ws.scenes[0].plan.review_reason;
});
await check("visual: the upstream change reaches generation too (package needs review, new takes refused)", async () => {
  const ws = await api("GET", `/api/projects/${projectId}/visual`);
  const s = ws.scenes[0].shots[0];
  assert(s.package.review_state !== "current", `package ${s.package.review_state}`);
  await api("POST", `/api/visual/packages/${s.package.id}/takes`, { provider: "aurastage-sketch", model: "sketch-v1", capability: "image" }, [412]);
  assert(s.approved_take_id === takeId, "approved take must be kept");
});
await check("audio: the upstream change marks the scene mix for review; the recording is kept", async () => {
  const ws = await api("GET", `/api/projects/${projectId}/audio`);
  const sc = ws.scenes.find((x: any) => x.scene.id === s1);
  assert(sc.session.review_state !== "current", `session ${sc.session.review_state}`);
  assert(sc.clips.some((c: any) => c.asset_id === assetId), "recording lost");
  await api("POST", `/api/projects/${projectId}/audio/scenes/${s1}/approve`, {}, [412]);
  return sc.session.review_reason;
});
await check("editorial: the upstream change flags the timeline for review; the cut is untouched", async () => {
  const ws = await edWs();
  assert(ws.timeline.review_state === "review_required" && ws.issues.length > 0, `timeline ${ws.timeline.review_state}`);
  assert(ws.clips.some((c: any) => c.kind === "take"), "cut changed");
  return ws.issues[0].message;
});
await check("persistence: everything still there on re-read", async () => {
  const [p, s, c] = await Promise.all([
    api("GET", `/api/projects/${projectId}`),
    api("GET", `/api/projects/${projectId}/script`),
    api("GET", `/api/projects/${projectId}/characters`),
  ]);
  assert(p.tone === "Tense" && s.current_version.id === v1 && c.characters.find((x: any) => x.id === tundeId).status === "approved", "mismatch");
});

// ---- Completion pass 12c: Dashboard overview from each stage's own records ----
await check("overview: every stage reports real counts and its checks; flagged stages are listed for attention", async () => {
  const t0 = Date.now();
  const o = await api("GET", `/api/projects/${projectId}/overview`);
  const overviewMs = Date.now() - t0;
  const by = Object.fromEntries(o.stages.map((s: any) => [s.id, s]));
  assert(o.stages.length === 9 && o.engine_version === "1.0.0", "shape");
  console.log(JSON.stringify({ level: "info", timing: "overview", ms: overviewMs, stages: o.timings_ms ?? null }));
  assert(by.scriptwriter.state === "complete" && by.scriptwriter.checks.every((c: any) => c.ok), `script ${by.scriptwriter.state}`);
  assert(by.visual.done >= 1 && by.visual.total >= by.visual.done, `visual ${by.visual.done}/${by.visual.total}`);
  // The Casting change earlier flagged Scene DNA downstream: the overview must say so, not hide it.
  assert(o.attention.some((a: any) => a.stage === "scene-dna" || a.stage === "storyboard"), "attention: " + JSON.stringify(o.attention));
  assert(o.counts.scenes === 2 && o.counts.characters >= 2 && o.counts.assets >= 1 /* the image was deleted by the asset-delete check */, "counts " + JSON.stringify(o.counts));
  assert(o.stages.every((s: any) => (s.done === null) === (s.total === null) || s.id === "export"), "counts are paired");
  return o.stages.map((s: any) => `${s.number}:${s.state}`).join(" ");
});
// ---- Character look panel: reference views from the Casting profile, made in the worker, kept as Assets ----
await check("casting look: 8 reference views from the profile (one identity), real images in the Assets Library; a profile change marks them", async () => {
  const lk0 = await api("GET", `/api/characters/${amaraId}/look`);
  assert(lk0.views.length === 16 && lk0.identity.startsWith("Amara Bello") && lk0.backends.some((b: any) => b.id === "aurastage-sketch"), "look");
  assert(Array.isArray(lk0.sketch_reads?.evidence) && Array.isArray(lk0.sketch_reads?.unspecified), "AuraSketch should say what it reads from the profile");
  const g = await api("POST", `/api/characters/${amaraId}/look/generate`, {});
  assert(g.requested.length === 8 && g.provider === "aurastage-sketch", JSON.stringify(g).slice(0, 200));
  let lk: any;
  for (let i = 0; i < 40; i++) {
    lk = await api("GET", `/api/characters/${amaraId}/look`);
    if (lk.views.filter((v: any) => v.in_default_set).every((v: any) => v.latest && ["succeeded", "failed"].includes(v.latest.status))) break;
    await Bun.sleep(1500);
  }
  const made = lk.views.filter((v: any) => v.image);
  assert(made.length === 8 && made.every((v: any) => !v.image.stale), `made ${made.length}: ${JSON.stringify(lk.views.map((v: any) => v.latest?.error).filter(Boolean))}`);
  const bytes = new TextDecoder().decode(new Uint8Array(await (await fetch(`${API}/api/assets/${made[0].image.asset_id}/content`, { headers: { Authorization: `Bearer ${token}` } })).arrayBuffer()));
  assert(bytes.startsWith("<svg") && bytes.includes("Amara Bello") && bytes.includes("AURASKETCH (not AI)"), "not the labelled AuraSketch figure sheet");
  const lib = await api("GET", `/api/projects/${projectId}/library?category=characters`);
  assert(lib.assets.filter((a: any) => /^Amara Bello — .* reference$/.test(a.name)).length === 8, "not in the Assets Library under Characters");
  const before = await api("GET", `/api/projects/${projectId}/characters`);
  const age = before.characters.find((c: any) => c.id === amaraId).age;
  await api("PATCH", `/api/characters/${amaraId}`, { description: "Close-cropped hair, a thin scar over the left eyebrow" });
  const after = await api("GET", `/api/characters/${amaraId}/look`);
  assert(after.views.filter((v: any) => v.image).every((v: any) => v.image.stale), "a profile change should mark the views");
  return `${made.length} views · identity ${lk.identity_hash} · age ${age}`;
});
// ---- Whole cast in one click (owner request 2026-09-30) ----
await check("casting: one click makes the looks for the whole cast (only missing or outdated views); the worker makes them", async () => {
  const r = await api("POST", `/api/projects/${projectId}/characters/looks/generate`, {});
  const amara = r.characters.find((c: any) => c.id === amaraId);
  // Amara's views were made before her profile changed above, so all 8 are outdated and remade.
  assert(amara?.requested === 8 && r.provider === "aurastage-sketch", JSON.stringify(r).slice(0, 300));
  const others = r.characters.filter((c: any) => c.id !== amaraId && c.requested > 0);
  const again = await api("POST", `/api/projects/${projectId}/characters/looks/generate`, {});
  assert(again.requested === 0, `a second click should only fill gaps, asked for ${again.requested}`);
  let lk: any;
  for (let i = 0; i < 60; i++) {
    lk = await api("GET", `/api/characters/${amaraId}/look`);
    if (lk.views.filter((v: any) => v.in_default_set).every((v: any) => v.latest && ["succeeded", "failed"].includes(v.latest.status))) break;
    await Bun.sleep(1500);
  }
  const fresh = lk.views.filter((v: any) => v.in_default_set && v.image && !v.image.stale);
  assert(fresh.length === 8, `fresh views for Amara: ${fresh.length}`);
  return `${r.requested} views for ${r.characters.filter((c: any) => c.requested).length} characters (${[amara, ...others].map((c: any) => c.name).join(", ")}); second click: 0`;
});
// ---- Accent and languages (migration 0037): suggested from the story, never a name; saved; Voice DNA follows ----
await check("casting accent: suggested from where the character's scenes are set (with why); saved with languages; re-read keeps them", async () => {
  const ws = await api("GET", `/api/projects/${projectId}/characters`);
  const s = ws.accent_suggestions?.[amaraId]?.suggestion;
  assert(s && /Nigerian English/.test(s.accent) && s.evidence.some((e: string) => /Lagos/.test(e)), `suggestion ${JSON.stringify(s)}`);
  await api("PATCH", `/api/characters/${amaraId}`, { accent: s.accent, languages: s.languages.join(", ") });
  await api("PATCH", `/api/characters/${amaraId}`, { accent: "x".repeat(200) }, [400]);
  const c = (await api("GET", `/api/projects/${projectId}/characters`)).characters.find((x: any) => x.id === amaraId);
  assert(c.accent === s.accent && c.languages === s.languages.join(", "), "not saved");
  return `${s.accent} · ${c.languages} (${s.evidence[0]})`;
});
// ---- Ages (migration 0035): a flashback age with its own reference views, kept apart from today's ----
await check("casting ages: a flashback age (duplicate name 409); its reference view is made at that age in the worker and kept apart from today's views", async () => {
  const st = await api("POST", `/api/characters/${amaraId}/ages`, { label: "Flashback, 2004", age: "12", description: "Braided hair, no scar yet" });
  await api("POST", `/api/characters/${amaraId}/ages`, { label: "FLASHBACK, 2004", age: "13" }, [409]);
  const list = await api("GET", `/api/characters/${amaraId}/ages`);
  assert(list.age_states.length === 1 && list.age_states[0].id === st.id, JSON.stringify(list).slice(0, 200));
  const lk0 = await api("GET", `/api/characters/${amaraId}/look?age_state_id=${st.id}`);
  assert(/aged 12/.test(lk0.identity) && /At this point in the story \(Flashback, 2004\): Braided hair, no scar yet\./.test(lk0.identity) && lk0.views.every((v: any) => !v.image), lk0.identity);
  const today = (await api("GET", `/api/characters/${amaraId}/look`)).views.filter((v: any) => v.image).length;
  const g = await api("POST", `/api/characters/${amaraId}/look/generate`, { age_state_id: st.id, views: ["front:CU"] });
  assert(g.requested.length === 1, JSON.stringify(g).slice(0, 200));
  let lk: any;
  for (let i = 0; i < 40; i++) {
    lk = await api("GET", `/api/characters/${amaraId}/look?age_state_id=${st.id}`);
    if (lk.views.find((v: any) => v.key === "front:CU").latest?.status === "succeeded") break;
    await Bun.sleep(1500);
  }
  const v = lk.views.find((x: any) => x.key === "front:CU");
  assert(v.image && !v.image.stale && lk.views.filter((x: any) => x.image).length === 1, `age view ${v.latest?.status} ${v.latest?.error ?? ""}`);
  const bytes = new TextDecoder().decode(new Uint8Array(await (await fetch(`${API}/api/assets/${v.image.asset_id}/content`, { headers: { Authorization: `Bearer ${token}` } })).arrayBuffer()));
  assert(bytes.includes("Flashback, 2004"), "the view doesn't show the age");
  const todayAfter = (await api("GET", `/api/characters/${amaraId}/look`)).views.filter((x: any) => x.image).length;
  assert(todayAfter === today, `today's views changed ${today} -> ${todayAfter}`);
  await api("GET", `/api/characters/${amaraId}/look?age_state_id=00000000-0000-4000-8000-000000000000`, undefined, [400]);
  return `age ${st.age} · 1 view at that age · ${today} views today`;
});
// ---- Locations & Props (migration 0028): found in the approved script with evidence; views made in the worker ----
await check("locations & props: found in the approved script (names are never props); describe, stale edit refused (409); views in the worker land in the Assets Library", async () => {
  const sync = await api("POST", `/api/projects/${projectId}/world/sync`, {});
  assert(sync.locations === 2 && sync.props >= 1, JSON.stringify(sync));
  const ws = await api("GET", `/api/projects/${projectId}/world`);
  const harbour = ws.locations.find((l: any) => l.name === "Lagos Harbour");
  assert(harbour && harbour.times_of_day.includes("DAWN") && harbour.scenes[0]?.evidence.includes("LAGOS HARBOUR"), "harbour");
  const car = ws.props.find((p: any) => p.key === "car");
  assert(car && car.category === "vehicle" && car.scenes[0]?.evidence.includes("a car"), JSON.stringify(ws.props.map((p: any) => p.key)));
  assert(!ws.props.some((p: any) => /tunde|amara|ramos/i.test(p.name)), "a character was taken for a prop");
  // Item 12: set dressing and prop continuity (free) — every prop's scenes are dressed, with a state when the script gives one.
  assert(ws.continuity && /^\d+\.\d+\.\d+$/.test(ws.continuity.engine_version) && ws.continuity.set_dressing.some((d: any) => d.items.some((it: any) => it.prop_id === car.id)), "continuity: " + JSON.stringify(ws.continuity ?? null).slice(0, 300));
  const saved = await api("PATCH", `/api/world/location/${harbour.id}`, { revision: harbour.revision, description: "Rusting cranes, stacked containers", status: "confirmed" });
  await api("PATCH", `/api/world/location/${harbour.id}`, { revision: harbour.revision, description: "stale" }, [409]);
  const again = await api("POST", `/api/projects/${projectId}/world/sync`, {});
  const kept = (await api("GET", `/api/projects/${projectId}/world`)).locations.find((l: any) => l.id === harbour.id);
  assert(kept.description === "Rusting cranes, stacked containers" && kept.status === "confirmed" && again.new_locations === 0, "re-sync overwrote the person's work");
  const g = await api("POST", `/api/world/location/${harbour.id}/look/generate`, {});
  assert(g.requested.length === 3 && g.provider === "aurastage-sketch", JSON.stringify(g).slice(0, 200));
  let look: any;
  for (let i = 0; i < 40; i++) {
    look = await api("GET", `/api/world/location/${harbour.id}/look`);
    if (look.views.filter((v: any) => v.image).length >= 3) break;
    await Bun.sleep(1500);
  }
  const made = look.views.filter((v: any) => v.image);
  assert(made.length === 3 && made.every((v: any) => !v.image.stale), `made ${made.length}: ${JSON.stringify(look.views.map((v: any) => v.latest?.error).filter(Boolean))}`);
  const bytes = new Uint8Array(await (await fetch(`${API}/api/assets/${made[0].image.asset_id}/content`, { headers: { Authorization: `Bearer ${token}` } })).arrayBuffer());
  assert(new TextDecoder().decode(bytes.slice(0, 4)) === "<svg", "not an image");
  const lib = await api("GET", `/api/projects/${projectId}/library`);
  const a = lib.assets.find((x: any) => x.id === made[0].image.asset_id);
  assert(a && a.category === "locations" && a.usage.some((u: any) => /Lagos Harbour · Locations & Props/.test(u.label)), JSON.stringify(a).slice(0, 300));
  return `${sync.locations} locations, ${sync.props} props (${ws.props.map((p: any) => p.name).join(", ")}); ${made.length} views; rev ${saved.revision}`;
});
// ---- Built-in sound: generate the scene's planned ambience/effects/score in the worker, real WAV in the Assets Library ----
await check("audio: built-in generation makes real WAVs for the planned cues and speaks a line in the character's Voice DNA; use one on its cue", async () => {
  const ws0 = await api("GET", `/api/projects/${projectId}/audio`);
  assert(ws0.generators.some((g: any) => g.id === "aurastage-synth" && g.state === "configured") && ws0.generators.some((g: any) => g.id === "aurastage-neural-voice" && g.state === "configured"), "the neural voice isn't installed on the API");
  const r = await api("POST", `/api/projects/${projectId}/audio/scenes/${s1}/generate-cues`, {});
  assert(r.requested.length >= 1 && r.requested.every((g: any) => ["aurastage-synth", "aurastage-neural-voice"].includes(g.provider) && g.execution === "native"), JSON.stringify(r).slice(0, 300));
  // Voice: the dialogue cue's line, spoken in the speaker's Voice DNA (Casting profile + the line's emotion).
  const dx = ws0.scenes.find((x: any) => x.scene.id === s1).clips.find((c: any) => c.source?.dialogue_line_id);
  await api("POST", `/api/projects/${projectId}/audio/scenes/${s1}/generate`, { kind: "voice", duration_seconds: 2 }, [400]);
  const v = await api("POST", `/api/projects/${projectId}/audio/scenes/${s1}/generate`, { clip_id: dx.id, kind: "voice", duration_seconds: 2 });
  assert(v.provider === "aurastage-neural-voice" && v.description.length > 0, JSON.stringify(v).slice(0, 300));
  r.requested.push(v);
  let sc: any;
  for (let i = 0; i < 40; i++) {
    sc = (await api("GET", `/api/projects/${projectId}/audio`)).scenes.find((x: any) => x.scene.id === s1);
    if (sc.generations.filter((g: any) => r.requested.some((q: any) => q.id === g.id)).every((g: any) => g.status === "succeeded" || g.status === "failed")) break;
    await Bun.sleep(1500);
  }
  const done = sc.generations.filter((g: any) => r.requested.some((q: any) => q.id === g.id));
  assert(done.every((g: any) => g.status === "succeeded" && g.asset_id && g.layers.length), JSON.stringify(done.map((g: any) => [g.status, g.error])));
  const g = done.find((x: any) => x.kind !== "voice");
  const bytes = new Uint8Array(await (await fetch(`${API}/api/assets/${g.asset_id}/content`, { headers: { Authorization: `Bearer ${token}` } })).arrayBuffer());
  const txt = new TextDecoder().decode(bytes.slice(0, 12));
  assert(txt.startsWith("RIFF") && txt.endsWith("WAVE") && bytes.length > 44 + 48000, `not a real WAV (${bytes.length} bytes)`);
  const lib = await api("GET", `/api/projects/${projectId}/library?q=generated`);
  assert(lib.assets.some((a: any) => a.id === g.asset_id), "generated file not in the Assets Library");
  const clip = await api("PATCH", `/api/audio-clips/${g.clip_id}`, { asset_id: g.asset_id });
  assert(clip.kind === "asset" && clip.asset_id === g.asset_id, "not placed");
  const again = await api("POST", `/api/projects/${projectId}/audio/scenes/${s1}/generate-cues`, {});
  assert(!again.requested.some((x: any) => x.clip_id === g.clip_id), "regenerated a cue that already has a sound");
  const spoken = done.find((x: any) => x.id === v.id);
  const vb = new Uint8Array(await (await fetch(`${API}/api/assets/${spoken.asset_id}/content`, { headers: { Authorization: `Bearer ${token}` } })).arrayBuffer());
  assert(new TextDecoder().decode(vb.slice(0, 4)) === "RIFF" && vb.length > 44 + 8000, `voice not a real WAV (${vb.length} bytes)`);
  return `${done.length} sound(s): ${done.map((x: any) => `${x.kind} [${x.layers.map((l: any) => l.name).join(", ")}]`).join("; ")} · voice: ${spoken.layers[0]?.because ?? ""}`;
});
await check("voices: a Scottish accent in Casting is spoken by the free Scottish voice (CMU ARCTIC awb), or says plainly why not", async () => {
  const ws0 = await api("GET", `/api/projects/${projectId}/audio`);
  const dx = ws0.scenes.find((x: any) => x.scene.id === s1).clips.find((c: any) => c.source?.dialogue_line_id);
  const chars = (await api("GET", `/api/projects/${projectId}/characters`)).characters;
  const line = ws0.scenes.find((x: any) => x.scene.id === s1).lines?.find((l: any) => l.id === dx.source.dialogue_line_id);
  const who = chars.find((c: any) => c.id === line?.character_id) ?? chars.find((c: any) => c.id === tundeId);
  const before = { accent: who.accent ?? null, gender: who.gender ?? null };
  if (who.status === "approved") await api("PATCH", `/api/characters/${who.id}`, { status: "draft" });
  // A man's voice: the free Scottish voice in the catalogue (CMU ARCTIC awb) is male.
  await api("PATCH", `/api/characters/${who.id}`, { accent: "Scottish (Glasgow)", gender: "Male" });
  try {
    const v = await api("POST", `/api/projects/${projectId}/audio/scenes/${s1}/generate`, { clip_id: dx.id, kind: "voice", duration_seconds: 2 });
    let g: any;
    for (let i = 0; i < 40; i++) {
      g = (await api("GET", `/api/projects/${projectId}/audio`)).scenes.find((x: any) => x.scene.id === s1).generations.find((x: any) => x.id === v.id);
      if (g.status === "succeeded" || g.status === "failed") break;
      await Bun.sleep(1500);
    }
    assert(g.status === "succeeded", `voice ${g.status} ${g.error ?? ""}`);
    const why = g.layers[0]?.because ?? "";
    assert(/Scottish English speaker awb/.test(why), "Scottish voice not used: " + why);
    return why.split(";")[0];
  } finally {
    await api("PATCH", `/api/characters/${who.id}`, before);
  }
});
// ---- Studio mixing (migration 0029): channel strips and routing saved, validated, revision-checked ----
await check("studio mixer: a channel strip (HPF, EQ, compressor, send, automation) and routing (buses, reverb, master) save and read back; bad values 400, stale routing 409; the measurement goes stale", async () => {
  const ws = await api("GET", `/api/projects/${projectId}/audio`);
  const sc = ws.scenes.find((x: any) => x.scene.id === s1);
  const dx = sc.tracks.find((t: any) => t.family === "DX");
  assert(dx.fx && dx.fx.comp.on === false && sc.session.mix.master.limiter === true, "neutral defaults missing");
  const fx = { ...dx.fx, hpf_hz: 80, eq: { ...dx.fx.eq, mid: { freq: 3000, gain_db: 2, q: 1 } }, comp: { ...dx.fx.comp, on: true, threshold_db: -20 }, reverb_send_db: -18, automation: [{ t: 0, db: 0 }, { t: 1, db: -6 }] };
  const saved = await api("PATCH", `/api/audio-tracks/${dx.id}`, { fx });
  assert(saved.fx.hpf_hz === 80 && saved.fx.comp.on && saved.fx.automation.length === 2, JSON.stringify(saved.fx).slice(0, 200));
  await api("PATCH", `/api/audio-tracks/${dx.id}`, { fx: { ...fx, hpf_hz: 9000 } }, [400]);
  const ws2 = await api("GET", `/api/projects/${projectId}/audio`);
  const sc2 = ws2.scenes.find((x: any) => x.scene.id === s1);
  const mix = { ...sc2.session.mix, buses: { ...sc2.session.mix.buses, MX: { gain_db: -4, mute: false } }, reverb: { ...sc2.session.mix.reverb, type: "hall", decay_s: 2.2 }, master: { ...sc2.session.mix.master, gain_db: 1.5 } };
  const r = await api("PUT", `/api/projects/${projectId}/audio/scenes/${s1}/mix`, { mix, revision: sc2.session.revision });
  assert(r.mix.reverb.type === "hall" && r.mix.buses.MX.gain_db === -4 && r.revision !== sc2.session.revision, JSON.stringify(r).slice(0, 200));
  await api("PUT", `/api/projects/${projectId}/audio/scenes/${s1}/mix`, { mix, revision: sc2.session.revision }, [409]);
  const back = (await api("GET", `/api/projects/${projectId}/audio`)).scenes.find((x: any) => x.scene.id === s1);
  assert(back.session.mix.master.gain_db === 1.5 && back.tracks.find((t: any) => t.id === dx.id).fx.eq.mid.gain_db === 2, "not kept");
  assert(back.readiness.some((p: any) => /measure|Loudness/i.test(p.label) && !p.ok), "the old measurement should be stale after mixing changes");
  return "strip + routing kept; 400/409 refused";
});
// ---- Tracks added by hand (migration 0031) ----
await check("audio tracks: add your own track (any department), duplicate name 409, move it, a clip on it blocks removal (409), removed when empty", async () => {
  const sc = (await api("GET", `/api/projects/${projectId}/audio`)).scenes.find((x: any) => x.scene.id === s1);
  const sid = sc.session.id;
  const t = await api("POST", `/api/audio-sessions/${sid}/tracks`, { name: "Smoke radio", family: "FX" });
  assert(t.added_by_hand === true && t.family === "FX", JSON.stringify(t).slice(0, 200));
  await api("POST", `/api/audio-sessions/${sid}/tracks`, { name: "smoke RADIO", family: "BG" }, [409]);
  await api("POST", `/api/audio-sessions/${sid}/tracks`, { name: "x", family: "KAZOO" }, [400]);
  await api("POST", `/api/audio-tracks/${t.id}/move`, { direction: -1 });
  const order = (await api("GET", `/api/projects/${projectId}/audio`)).scenes.find((x: any) => x.scene.id === s1).tracks.map((x: any) => x.id);
  assert(order.indexOf(t.id) === order.length - 2, `not moved up: ${order.indexOf(t.id)} of ${order.length}`);
  const c = await api("POST", `/api/audio-sessions/${sid}/clips`, { track_id: t.id, label: "Radio news", start_seconds: 0.5, duration_seconds: 1 });
  // 2026-10-02 (migration 0053): a clip can be muted and brought back without deleting it.
  const muted = await api("PATCH", `/api/audio-clips/${c.id}`, { muted: true });
  assert(muted.muted === true, `mute not saved: ${JSON.stringify(muted).slice(0, 160)}`);
  const seen = (await api("GET", `/api/projects/${projectId}/audio`)).scenes.find((x: any) => x.scene.id === s1).clips.find((x: any) => x.id === c.id);
  assert(seen?.muted === true, "muted clip not read back");
  assert((await api("PATCH", `/api/audio-clips/${c.id}`, { muted: false })).muted === false, "unmute not saved");
  await api("DELETE", `/api/audio-tracks/${t.id}`, undefined, [409]);
  const spotted = sc.tracks.find((x: any) => !x.added_by_hand);
  await api("DELETE", `/api/audio-tracks/${spotted.id}`, undefined, [400]);
  await api("DELETE", `/api/audio-clips/${c.id}`);
  await api("DELETE", `/api/audio-tracks/${t.id}`);
  const after = (await api("GET", `/api/projects/${projectId}/audio`)).scenes.find((x: any) => x.scene.id === s1).tracks;
  assert(!after.some((x: any) => x.id === t.id), "track not removed");
  return `added, moved, guarded, removed (${after.length} tracks left)`;
});
// ---- Phase 13-1: Ask AuraStage (plans in the generation worker; test planner until a Claude key is set) ----
async function planned(tok: string, id: string) {
  for (let i = 0; i < 60; i++) {
    const p = await apiAs(tok, "GET", `/api/assistant/proposals/${id}`);
    if (!["queued", "planning"].includes(p.status)) return p;
    await Bun.sleep(1500);
  }
  throw new Error("the planning worker didn't pick the request up within 90 s");
}
let aiPlanner = "";
await check("assistant: capabilities come from configured keys (planner, twelve tools incl. Locations & Props, Project Settings, Audio Studio, Editorial, Assets, scene wardrobe)", async () => {
  const c = await api("GET", "/api/assistant/capabilities");
  assert(c.planner && c.tools.length === 12 && ["assignSceneWardrobe", "updateLocationOrProp", "updateSettings", "adjustAudioTrack", "setClipTransition", "updateAssetDetails"].every((n) => c.tools.some((t: any) => t.name === n)), JSON.stringify(c.tools.map((t: any) => t.name)));
  aiPlanner = c.planner.id;
  return `${c.planner.name}${c.planner.test_output ? " (test output)" : ""}`;
});
let aiId = "", amaraAgeBefore: string | null = null;
await check("assistant: ask in Casting; the worker plans it; the preview shows before → after with permission and no stale data", async () => {
  amaraAgeBefore = (await api("GET", `/api/projects/${projectId}/characters`)).characters.find((c: any) => c.id === amaraId).age ?? null;
  const q = await api("POST", `/api/projects/${projectId}/assistant`, { module: "casting", text: "Make Amara Bello approximately 45" });
  assert(q.status === "queued" && q.context_refs.some((r: any) => r.id === amaraId), "context missing Amara");
  aiId = q.id;
  const p = await planned(token, aiId);
  assert(p.status === "proposed", `${p.status} ${p.error ?? ""}`);
  // Built-in story intelligence answers by default (owner, 2026-09-30): free, not test output, no provider called.
  assert(p.provider === "aurastage" && p.test_output === false, `planner ${p.provider} test=${p.test_output}`);
  const call = p.preview.calls.find((c: any) => c.tool === "updateCharacter" && c.object.id === amaraId);
  assert(call && String(call.after.age).includes("45") && call.allowed && !call.stale, JSON.stringify(p.preview));
  assert(p.preview.can_apply, "can't apply: " + JSON.stringify(p.preview.issues));
  return `${p.provider} · ${p.plan.summary}`;
});
await check("assistant: apply changes Amara through Casting; re-read keeps it; undo restores it", async () => {
  const a = await api("POST", `/api/assistant/proposals/${aiId}/apply`, {});
  assert(a.status === "applied", a.status);
  const after = (await api("GET", `/api/projects/${projectId}/characters`)).characters.find((c: any) => c.id === amaraId);
  assert(String(after.age).includes("45"), `age ${after.age}`);
  const again = await api("GET", `/api/assistant/proposals/${aiId}`);
  assert(again.status === "applied" && again.results.results.length >= 1, "not recorded");
  await api("POST", `/api/assistant/proposals/${aiId}/apply`, {}, [409]);
  const u = await api("POST", `/api/assistant/proposals/${aiId}/undo`, {});
  assert(u.status === "undone", u.status);
  const back = (await api("GET", `/api/projects/${projectId}/characters`)).characters.find((c: any) => c.id === amaraId);
  assert((back.age ?? null) === amaraAgeBefore, `age ${back.age} vs ${amaraAgeBefore}`);
});
await check("assistant: a discarded suggestion changes nothing; recent requests list both; unknown ids are 404", async () => {
  const q = await api("POST", `/api/projects/${projectId}/assistant`, { module: "scene_dna", text: "Make scene 2 rainy and tense" });
  const p = await planned(token, q.id);
  assert(p.status === "proposed", p.status);
  const r = await api("POST", `/api/assistant/proposals/${q.id}/reject`, {});
  assert(r.status === "rejected", r.status);
  const list = await api("GET", `/api/projects/${projectId}/assistant`);
  assert(list.proposals.length >= 2 && list.proposals[0].id === q.id, "list");
  await api("GET", `/api/assistant/proposals/00000000-0000-4000-8000-000000000000`, undefined, [404]);
});
// ---- AI on every page (task 40): Ask AuraStage describes a place through Locations & Props ----
await check("assistant: on Locations & Props, describe a location; apply saves it through Locations & Props (revision bumps); undo restores it", async () => {
  const w0 = await api("GET", `/api/projects/${projectId}/world`);
  const h0 = w0.locations.find((l: any) => l.name === "Lagos Harbour");
  const q = await api("POST", `/api/projects/${projectId}/assistant`, { module: "scene_dna", text: 'Describe the location "Lagos Harbour" for its reference views: what it looks like (materials, age, colour, condition, light) as the script and the story suggest. Keep what is already written and add to it.', planner: "writer" });
  assert(q.context_refs.some((r: any) => r.id === h0.id), "the location wasn't in the context");
  const p = await planned(token, q.id);
  assert(p.status === "proposed", `${p.status} ${p.error ?? ""}`);
  const call = p.preview.calls.find((c: any) => c.tool === "updateLocationOrProp" && c.object.id === h0.id);
  assert(call && call.allowed && !call.stale && typeof call.after.description === "string" && call.after.description.length > 0, JSON.stringify(p.preview).slice(0, 400));
  assert(p.preview.can_apply, "can't apply: " + JSON.stringify(p.preview.issues));
  await api("POST", `/api/assistant/proposals/${q.id}/apply`, {});
  const h1 = (await api("GET", `/api/projects/${projectId}/world`)).locations.find((l: any) => l.id === h0.id);
  assert(h1.description === call.after.description && h1.revision > h0.revision, "not saved through Locations & Props");
  const u = await api("POST", `/api/assistant/proposals/${q.id}/undo`, {});
  assert(u.status === "undone", u.status);
  const h2 = (await api("GET", `/api/projects/${projectId}/world`)).locations.find((l: any) => l.id === h0.id);
  assert(h2.description === h0.description, `undo: ${h2.description}`);
  return `${p.provider} · "${String(call.after.description).slice(0, 90)}…"`;
});
// ---- Built-in story intelligence (owner, 2026-09-30: "only generation through a third party should cost money") ----
await check("built-in intelligence: filling is free — the estimate is Free and no paid provider plans it", async () => {
  const e = await api("POST", `/api/projects/${projectId}/assistant/estimate`, { module: "casting", text: "Develop every character's profile", task: "develop_cast" });
  assert(e.provider === "aurastage" && e.estimate.free === true, JSON.stringify(e));
  return "free";
});
await check("built-in intelligence: develop the whole cast from the script in one click — only empty fields; apply; re-read keeps it; undo restores it", async () => {
  const before = (await api("GET", `/api/projects/${projectId}/characters`)).characters.filter((c: any) => !c.merged_into);
  const q = await api("POST", `/api/projects/${projectId}/assistant`, { module: "casting", text: "Develop every character's profile: fill the empty fields from the script and the story.", task: "develop_cast" });
  const p = await planned(token, q.id);
  assert(p.status === "proposed" && p.provider === "aurastage" && !p.test_output, `${p.status} ${p.provider} ${p.error ?? ""}`);
  const upd = p.preview.calls.filter((c: any) => c.tool === "updateCharacter");
  assert(upd.length >= 1 && p.preview.can_apply, JSON.stringify(p.preview).slice(0, 500));
  // Nothing already written is in the plan.
  for (const c of upd) { const b = before.find((x: any) => x.id === c.object.id); for (const k of Object.keys(c.after)) assert(!String(b[k] ?? "").trim(), `${b.name}.${k} was already written`); }
  await api("POST", `/api/assistant/proposals/${q.id}/apply`, {});
  const after = (await api("GET", `/api/projects/${projectId}/characters`)).characters;
  const one = upd[0], got = after.find((c: any) => c.id === one.object.id);
  for (const [k, v] of Object.entries(one.after)) assert(got[k] === v, `${k} not saved`);
  const u = await api("POST", `/api/assistant/proposals/${q.id}/undo`, {});
  assert(u.status === "undone", u.status);
  const back = (await api("GET", `/api/projects/${projectId}/characters`)).characters.find((c: any) => c.id === one.object.id);
  for (const k of Object.keys(one.after)) assert((back[k] ?? null) === (before.find((x: any) => x.id === one.object.id)[k] ?? null), `undo: ${k}`);
  return `${upd.length} character(s): ${Object.keys(one.after).join(", ")} · ${p.plan.not_possible.length} note(s)`;
});
await check("built-in intelligence: a whole scene (every line's performance + Scene DNA) is proposed from the script, free — previewed, then discarded", async () => {
  const q = await api("POST", `/api/projects/${projectId}/assistant`, { module: "scene_dna", text: "Fill scene 1 from the script", task: "fill_scene", object: { type: "scene", id: s1 } });
  const p = await planned(token, q.id);
  assert(p.status === "proposed" && p.provider === "aurastage", `${p.status} ${p.error ?? ""}`);
  assert(p.preview.calls.every((c: any) => c.allowed && !c.stale && !c.problem), JSON.stringify(p.preview.calls).slice(0, 400));
  await api("POST", `/api/assistant/proposals/${q.id}/reject`, {});
  return `${p.preview.calls.length} change(s): ${[...new Set(p.preview.calls.map((c: any) => c.tool))].join(", ")}`;
});
// ---- AI on every page (task 40): Project Settings and Audio Studio ----
await check("assistant: on Project Settings, turn on the end credits and set who composed the music; a new settings version; undo restores; spending is never offered", async () => {
  const s0 = await api("GET", `/api/projects/${projectId}/settings`);
  const q = await api("POST", `/api/projects/${projectId}/assistant`, { module: "settings", text: 'Turn on the end credits with the film\'s theme music, and set the composer to "Ama Mensah".' });
  const p = await planned(token, q.id);
  assert(p.status === "proposed", `${p.status} ${p.error ?? ""}`);
  const call = p.preview.calls.find((c: any) => c.tool === "updateSettings");
  assert(call && call.allowed && call.after["titles.end_credits"] === true && call.after["production.composer"] === "Ama Mensah" && !Object.keys(call.after).some((k) => k.startsWith("generation.")), JSON.stringify(p.preview).slice(0, 500));
  assert(p.preview.can_apply, "can't apply: " + JSON.stringify(p.preview.issues));
  await api("POST", `/api/assistant/proposals/${q.id}/apply`, {});
  const s1v = await api("GET", `/api/projects/${projectId}/settings`);
  assert(s1v.settings.titles.end_credits === true && s1v.settings.production.composer === "Ama Mensah" && s1v.version_number === s0.version_number + 1, "not saved as a new settings version");
  const u = await api("POST", `/api/assistant/proposals/${q.id}/undo`, {});
  assert(u.status === "undone", u.status);
  const s2v = await api("GET", `/api/projects/${projectId}/settings`);
  assert(s2v.settings.titles.end_credits === s0.settings.titles.end_credits && s2v.settings.production.composer === s0.settings.production.composer, "undo didn't restore");
  return `${p.provider} · ${Object.entries(call.after).map(([k, v]) => `${k}=${v}`).join(", ")}`;
});
await check("assistant: in Audio Studio, turn the music down in scene 1; only music tracks change, through Audio Studio; undo restores", async () => {
  const ws0 = await api("GET", `/api/projects/${projectId}/audio`);
  const t0 = ws0.scenes.find((x: any) => x.scene.id === s1).tracks as any[];
  const q = await api("POST", `/api/projects/${projectId}/assistant`, { module: "audio", text: "Turn the music down by 6 dB in scene 1." });
  assert(q.context_refs.some((r: any) => r.type === "audio_track"), "the scene's tracks weren't in the context");
  const p = await planned(token, q.id);
  assert(p.status === "proposed", `${p.status} ${p.error ?? ""}`);
  const calls = p.preview.calls.filter((c: any) => c.tool === "adjustAudioTrack");
  const music = new Set(t0.filter((t) => ["MX", "SCORE"].includes(t.family)).map((t) => t.id));
  assert(calls.length >= 1 && calls.every((c: any) => music.has(c.object.id) && c.allowed && typeof c.after.gain_db === "number" && c.after.gain_db < c.before.gain_db), JSON.stringify(p.preview.calls).slice(0, 500));
  await api("POST", `/api/assistant/proposals/${q.id}/apply`, {});
  const t1 = (await api("GET", `/api/projects/${projectId}/audio`)).scenes.find((x: any) => x.scene.id === s1).tracks as any[];
  for (const c of calls) assert(Number(t1.find((t) => t.id === c.object.id).gain_db) === c.after.gain_db, "gain not saved");
  assert(t1.filter((t) => !music.has(t.id)).every((t) => Number(t.gain_db) === Number(t0.find((x) => x.id === t.id).gain_db)), "a non-music track changed");
  const u = await api("POST", `/api/assistant/proposals/${q.id}/undo`, {});
  assert(u.status === "undone", u.status);
  const t2 = (await api("GET", `/api/projects/${projectId}/audio`)).scenes.find((x: any) => x.scene.id === s1).tracks as any[];
  assert(t2.every((t) => Number(t.gain_db) === Number(t0.find((x) => x.id === t.id).gain_db)), "undo didn't restore the levels");
  return `${p.provider} · ${calls.map((c: any) => `${c.object.label} ${c.before.gain_db}→${c.after.gain_db} dB`).join(", ")}`;
});
await check("AI & Generation readiness: states come from real results in this project (Claude, sketches, references, sound, voice, renders proven)", async () => {
  const r = await api("GET", `/api/projects/${projectId}/generation-readiness`);
  const st = Object.fromEntries(r.capabilities.map((c: any) => [c.id, c.state]));
  assert(st.assistant === "proven" && st.storyboard === "proven" && st.character_refs === "proven" && st.sound === "proven" && st.delivery === "proven", JSON.stringify(st));
  assert(st.voice === "proven", `voice ${st.voice}`);
  assert(st.world_refs === "proven", `location & prop views ${st.world_refs}`);
  const video = r.capabilities.find((c: any) => c.id === "video");
  assert(st.video === "needs_key" ? video.headline.includes("RUNWAY_API_KEY") : st.video === "proven" || st.video === "ready", `video ${st.video}`);
  return Object.entries(st).map(([k, v]) => `${k}:${v}`).join(" ");
});
// ---- Phase 11: Team & permissions, with a second throwaway account ----
let token2 = "", user2 = "";
await check("team: owner invites a second person as Writer; only the hash is stored", async () => {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: env("SMOKE2_EMAIL"), password: env("SMOKE2_PASSWORD") }),
  });
  const j = await r.json();
  assert(j.access_token, `second sign-in failed: ${r.status}`);
  token2 = j.access_token;
  user2 = j.user.id;
  const inv = await api("POST", `/api/organizations/${orgId}/invites`, { email: env("SMOKE2_EMAIL").toUpperCase(), project_id: projectId, project_role: "writer" });
  assert(/^[0-9a-f]{48}$/.test(inv.token) && inv.invite.email === env("SMOKE2_EMAIL").toLowerCase(), "invite shape");
  (globalThis as any).inviteToken = inv.token;
});
await check("team: before accepting, the second person can't see the project", async () => {
  await apiAs(token2, "GET", `/api/projects/${projectId}/script`, undefined, [403, 404]);
});
await check("team: the invitee previews and accepts; access is Writer", async () => {
  const t = (globalThis as any).inviteToken;
  const pv = await apiAs(token2, "POST", "/api/invites/preview", { token: t });
  assert(pv.status === "pending" && pv.email_matches === true && pv.project_role_label === "Writer", JSON.stringify(pv));
  await apiAs(token2, "POST", "/api/invites/accept", { token: t });
  const a = await apiAs(token2, "GET", `/api/projects/${projectId}/access`);
  assert(a.project_role === "writer" && a.modules.script.includes("edit") && !a.modules.script.includes("approve"), JSON.stringify(a.modules.script));
  assert(!a.modules.editorial.includes("edit"), "writer should not edit the timeline");
});
await check("team: a Writer reads the script but can't approve it (plain-language 403)", async () => {
  const s = await apiAs(token2, "GET", `/api/projects/${projectId}/script`);
  assert(s.current_version?.id, "writer can't read the script");
  const r = await apiAs(token2, "POST", `/api/projects/${projectId}/script/approve`, { version_id: s.current_version.id }, [403]);
  assert(/your role \(Writer\) can't approve in Scriptwriter/.test(r.error.message), r.error.message);
  return r.error.message;
});
await check("assistant: a Writer can ask, but can't apply a Casting change (their own permissions apply)", async () => {
  const q = await apiAs(token2, "POST", `/api/projects/${projectId}/assistant`, { module: "casting", text: "Make Amara Bello approximately 50" });
  const p = await planned(token2, q.id);
  assert(p.status === "proposed" && p.preview.calls.length && !p.preview.calls[0].allowed && !p.preview.can_apply, JSON.stringify(p.preview));
  const r = await apiAs(token2, "POST", `/api/assistant/proposals/${q.id}/apply`, {}, [403]);
  const owner = await api("GET", `/api/projects/${projectId}/assistant`);
  assert(owner.proposals.some((x: any) => x.id === q.id), "the owner (admin) should see the Writer's request for audit");
  return r.error.message;
});
await check("team: a Writer can't lock the picture or start projects", async () => {
  const ed = await apiAs(token2, "GET", `/api/projects/${projectId}/editorial`);
  const r = await apiAs(token2, "POST", `/api/projects/${projectId}/editorial/lock`, { base_revision: ed.timeline?.revision ?? null }, [403, 409, 412]);
  assert(r.error.code.endsWith("403") || /lock/i.test(r.error.message), r.error.message);
  const p = await apiAs(token2, "POST", "/api/projects", { org_id: orgId, title: "Not allowed" }, [403]);
  assert(/owners, admins and producers/.test(p.error.message), p.error.message);
});
await check("team: the team page lists both; the Writer can't manage it", async () => {
  const t2 = await apiAs(token2, "GET", `/api/projects/${projectId}/team`);
  assert(t2.can_manage === false && t2.invites.length === 0 && t2.members.length === 2, JSON.stringify({ m: t2.members.length, c: t2.can_manage }));
  await apiAs(token2, "POST", `/api/projects/${projectId}/team/members`, { user_id: user2, role: "producer" }, [403]);
});
await check("team: an extra 'script:approve' permission is saved and applies", async () => {
  const t = await api("POST", `/api/projects/${projectId}/team/members`, { user_id: user2, role: "writer", grants: ["script:approve"] });
  assert(t.members.find((m: any) => m.user_id === user2).grants.includes("script:approve"), "grant not saved");
  const a = await apiAs(token2, "GET", `/api/projects/${projectId}/access`);
  assert(a.modules.script.includes("approve"), "grant not applied");
});
let ownerId = "";
await check("comments: the Writer comments on the script and mentions the owner; the owner is notified with a link", async () => {
  const t = await api("GET", `/api/projects/${projectId}/team`);
  ownerId = t.members.find((m: any) => m.org_role === "owner").user_id;
  const s = await apiAs(token2, "GET", `/api/projects/${projectId}/script`);
  const c = await apiAs(token2, "POST", `/api/projects/${projectId}/comments`, {
    module: "script", object_type: "Workspace", object_id: projectId, object_version: s.current_version.id, body: "Scene 1 needs a stronger button.", mentions: [ownerId],
  });
  (globalThis as any).commentId = c.id;
  const n = await api("GET", "/api/notifications");
  const hit = n.items.find((x: any) => x.kind === "mention" && x.link?.includes(c.id));
  assert(n.unread >= 1 && hit, `notifications ${JSON.stringify(n).slice(0, 200)}`);
  return hit.title;
});
await check("comments: the owner replies and resolves; the Writer hears about the reply; re-read keeps it", async () => {
  const id = (globalThis as any).commentId;
  await api("POST", `/api/projects/${projectId}/comments`, { module: "script", object_type: "Workspace", object_id: projectId, body: "Agreed.", parent_id: id });
  await api("POST", `/api/comments/${id}/resolve`, { resolved: true });
  const list = await apiAs(token2, "GET", `/api/projects/${projectId}/comments?module=script&object_type=Workspace&object_id=${projectId}`);
  const root = list.find((c: any) => c.id === id);
  assert(root.resolved_at && list.some((c: any) => c.parent_id === id && c.body === "Agreed."), "thread not kept");
  const n2 = await apiAs(token2, "GET", "/api/notifications");
  assert(n2.items.some((x: any) => x.kind === "reply"), "no reply notification");
});
await check("comments: a timecode comment on the timeline keeps its anchor; the Writer can't resolve it", async () => {
  const ed = await api("GET", `/api/projects/${projectId}/editorial`);
  const tid = ed.timeline?.id ?? projectId;
  const c = await api("POST", `/api/projects/${projectId}/comments`, {
    module: "editorial", object_type: "Timeline", object_id: tid, object_version: ed.timeline?.revision ?? null, anchor: { frame: 48, timecode: "00:00:02:00" }, body: "Trim here",
  });
  const list = await apiAs(token2, "GET", `/api/projects/${projectId}/comments?module=editorial&object_type=Timeline&object_id=${tid}`);
  assert(list.find((x: any) => x.id === c.id)?.anchor?.timecode === "00:00:02:00", "anchor lost");
  const r = await apiAs(token2, "POST", `/api/comments/${c.id}/resolve`, { resolved: true }, [403]);
  assert(/can't edit in Editorial/.test(r.error.message), r.error.message);
});
await check("tasks: the owner asks the Writer for a review; it's in their tasks; done notifies the owner", async () => {
  const t = await api("POST", `/api/projects/${projectId}/tasks`, { module: "script", kind: "review", title: "Review scene 1", assignee: user2, due_date: "2030-01-01" });
  const mine = await apiAs(token2, "GET", "/api/tasks/mine");
  assert(mine.some((x: any) => x.id === t.id && x.status === "open"), "not in writer's tasks");
  const n = await apiAs(token2, "GET", "/api/notifications");
  assert(n.items.some((x: any) => x.kind === "review_requested"), "no review notification");
  await apiAs(token2, "PATCH", `/api/tasks/${t.id}`, { status: "done" });
  const n2 = await api("GET", "/api/notifications");
  assert(n2.items.some((x: any) => x.kind === "task_done"), "owner not told");
  await api("POST", "/api/notifications/read", {});
  assert((await api("GET", "/api/notifications")).unread === 0, "still unread");
});
await check("activity: the project's audit trail reads in plain language", async () => {
  const a = await api("GET", `/api/projects/${projectId}/activity`);
  const lines = a.items.map((i: any) => i.summary);
  assert(lines.some((l: string) => l === "commented in Editorial & Timeline at 00:00:02:00") && lines.some((l: string) => l.startsWith("asked for a review")), lines.slice(0, 8).join(" | "));
  return `${a.items.length} events`;
});
await check("team: removing the person from the project removes their access", async () => {
  await api("DELETE", `/api/projects/${projectId}/team/members/${user2}`);
  await apiAs(token2, "GET", `/api/projects/${projectId}/script`, undefined, [403, 404]);
  const t = await api("GET", `/api/projects/${projectId}/team`);
  assert(!t.members.some((m: any) => m.user_id === user2), "still listed");
});
// ---- Phase 11c: Help & Support, account security, hardening ----
await check("help: system status reports live worker check-ins and a database ping", async () => {
  const st = await api("GET", "/api/help/status");
  const by = Object.fromEntries(st.checks.map((c: any) => [c.id, c]));
  assert(by.database?.state === "operational", `database ${JSON.stringify(by.database)}`);
  for (const w of ["worker:generation-worker", "worker:render-worker"]) assert(by[w] && by[w].state !== "down", `${w} ${JSON.stringify(by[w])}`);
  assert(st.providers.some((p: any) => p.id === "aurastage-sketch" && p.state === "configured"), "sketch provider");
  return st.checks.map((c: any) => `${c.id}:${c.state}`).join(", ");
});
await check("help: the assistant answers from the guides with this project's diagnostics", async () => {
  const a = await api("POST", "/api/help/assistant", { question: "How do I render an mp4?", project_id: projectId, module: "delivery" });
  assert(a.guides[0]?.id === "export" && /No AI model/.test(a.note), JSON.stringify(a).slice(0, 200));
  const d = await api("GET", `/api/projects/${projectId}/diagnostics`);
  assert(Array.isArray(d.findings) && d.facts && typeof d.facts.review_required === "object", "diagnostics shape");
  return `${d.findings.length} findings`;
});
await check("help: a ticket with consented diagnostics is saved; without consent none are kept; close it", async () => {
  const t1 = await api("POST", "/api/help/tickets", { subject: "Live check ticket", body: "Testing tickets.", project_id: projectId, module: "delivery", include_diagnostics: true });
  await api("POST", "/api/help/tickets", { subject: "Live check no diag", body: "No diagnostics please.", project_id: projectId, include_diagnostics: false });
  const list = await api("GET", "/api/help/tickets");
  const a = list.tickets.find((t: any) => t.id === t1.id), b = list.tickets.find((t: any) => t.subject === "Live check no diag");
  assert(a?.consent_diagnostics && a.diagnostics?.engine_version && b && b.diagnostics === null, "consent handling");
  await api("POST", `/api/help/tickets/${t1.id}/close`, {});
  const other = await apiAs(token2, "GET", "/api/help/tickets");
  assert(!other.tickets.some((t: any) => t.id === t1.id), "another person can see my ticket");
});
await check("security: signing out other devices ends that session for the API", async () => {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: env("SMOKE_EMAIL"), password: env("SMOKE_PASSWORD") }),
  });
  const other = (await r.json()).access_token as string;
  await apiAs(other, "GET", "/api/notifications");
  const before = await api("GET", "/api/account/sessions");
  assert(before.sessions.length >= 2 && before.sessions.filter((s: any) => s.current).length === 1, `sessions ${before.sessions.length}`);
  const out = await api("POST", "/api/account/sessions/revoke", {});
  assert(out.signed_out >= 1, "nothing signed out");
  await apiAs(other, "GET", "/api/notifications", undefined, [401]);
  await api("GET", "/api/notifications");
  return `${out.signed_out} other session(s) signed out`;
});
await check("security: API and web send protective headers", async () => {
  const a = await fetch(API + "/api/notifications", { headers: { Authorization: `Bearer ${token}` } });
  assert(a.headers.get("x-content-type-options") === "nosniff" && a.headers.get("x-frame-options") === "DENY", "api headers");
  const w = await fetch(WEB + "/help");
  assert(w.headers.get("x-frame-options") === "DENY", "web headers");
});
await check("security: other project ids are refused", async () => {
  await api("GET", `/api/projects/00000000-0000-4000-8000-000000000000/characters`, undefined, [403]);
  await api("GET", `/api/projects/00000000-0000-4000-8000-000000000000/scene-dna`, undefined, [403]);
  await api("GET", `/api/projects/00000000-0000-4000-8000-000000000000/storyboard`, undefined, [403]);
  await api("GET", `/api/projects/00000000-0000-4000-8000-000000000000/visual`, undefined, [403]);
  await api("GET", `/api/projects/00000000-0000-4000-8000-000000000000/audio`, undefined, [403]);
  await api("GET", `/api/projects/00000000-0000-4000-8000-000000000000/editorial`, undefined, [403]);
  await api("GET", `/api/projects/00000000-0000-4000-8000-000000000000/delivery`, undefined, [403]);
});

// ---- AuraScript (migration 0030): the real writer (Claude when its key is on the server) in the generation worker ----
async function written(id: string, minutes = 8) {
  for (let i = 0; i < minutes * 20; i++) {
    const g = await api("GET", `/api/script-writing/${id}`);
    if (g.status === "succeeded" || g.status === "failed") return g;
    await Bun.sleep(3000);
  }
  throw new Error(`writing job ${id} still running after ${minutes} minutes`);
}
let wProject = "";
await check("aurascript: develop a story from a brief with the built-in story engine (free); apply the logline and synopsis to the project", async () => {
  const p = await api("POST", "/api/projects", { org_id: orgId, title: "Smoke: The Last Ferry", genre: "Drama", setting: "Lagos lagoon", time_period: "Present day",
    logline: "Chief Adebayo Olumide, an old ferryman, makes his last crossing and is reunited with Kunle Olumide, the son he abandoned.", target_runtime_minutes: 3 }, [201]);
  wProject = p.id;
  const q = await api("POST", `/api/projects/${wProject}/script/writing`, { kind: "develop_story" }, [201]);
  const g = await written(q.id);
  assert(g.status === "succeeded", `${g.status}: ${g.error ?? ""}`);
  // Built in and free by default (owner, 2026-10-01): AuraStage's own story engine, finished at once.
  assert(g.source === "builtin" && g.provider === "aurastage" && g.test_output === false, `should be the built-in story engine: ${g.source} ${g.provider}`);
  assert(g.output.characters.length >= 1 && g.output.beats.length >= 3 && g.output.synopsis.length > 50, "thin development");
  // Regression (owner, 2026-09-30): people named in the logline are kept (a title like "Chief" doesn't make a new person).
  const keeps = g.checks.find((c: any) => c.id === "keeps_names");
  assert(keeps?.ok === true, `logline names: ${keeps?.evidence} — got ${g.output.characters.map((c: any) => c.name).join(", ")}`);
  const a = await api("POST", `/api/script-writing/${g.id}/apply-story`, { fields: ["synopsis"] });
  assert(a.applied.includes("synopsis"), "not applied");
  const proj = await api("GET", `/api/projects/${wProject}`);
  assert(proj.synopsis === g.output.synopsis, "synopsis not on the project");
  return `${g.test_output ? "TEST OUTPUT" : g.provider + " " + g.model}; ${g.output.characters.map((c: any) => c.name).join(", ")}; checks ${g.checks.filter((c: any) => c.ok).length}/${g.checks.length}`;
});
let wOutline: any = null;
await check("aurascript: outline the story scene by scene with the built-in engine (free), sized to the runtime", async () => {
  const q = await api("POST", `/api/projects/${wProject}/script/writing`, { kind: "outline" }, [201]);
  wOutline = await written(q.id);
  assert(wOutline.status === "succeeded", `${wOutline.status}: ${wOutline.error ?? ""}`);
  assert(wOutline.output.scenes.length >= 1 && wOutline.output.scenes.every((s: any, i: number) => s.number === i + 1), "bad outline");
  assert(wOutline.source === "builtin" && wOutline.checks.every((c: any) => c.ok), "built-in outline checks: " + wOutline.checks.filter((c: any) => !c.ok).map((c: any) => c.id).join(","));
  return `${wOutline.output.scenes.length} scenes; ${wOutline.checks.map((c: any) => `${c.id}:${c.ok ? "ok" : "!"}`).join(" ")}`;
});
await check("aurascript: write the full script in the worker; progress recorded; opens as a DRAFT version (not approved) that parses into scenes", async () => {
  const q = await api("POST", `/api/projects/${wProject}/script/writing`, { kind: "write_script", parent_id: wOutline.id }, [201]);
  const g = await written(q.id, 10);
  assert(g.status === "succeeded", `${g.status}: ${g.error ?? ""}`);
  assert(g.progress.done === wOutline.output.scenes.length, `progress ${JSON.stringify(g.progress)}`);
  const o = await api("POST", `/api/script-writing/${g.id}/open-draft`, { base_version_id: null }, [201]);
  const ws = await api("GET", `/api/projects/${wProject}/script`);
  assert(ws.current_version.id === o.version.id && !ws.script.approved_version_id, "should be a draft, not approved");
  assert(/AuraScript: full script/.test(ws.current_version.note ?? ""), "provenance note missing");
  assert((ws.analysis?.scene_count ?? 0) === wOutline.output.scenes.length, `scenes ${ws.analysis?.scene_count}`);
  await api("POST", `/api/script-writing/${g.id}/open-draft`, { base_version_id: null }, [409]);
  const words = (ws.current_version.source_text.match(/\S+/g) ?? []).length;
  return `${ws.analysis.scene_count} scenes, ${words} words; ${g.checks.map((c: any) => `${c.id}:${c.ok ? "ok" : "!"}`).join(" ")}`;
});
await check("aurascript: condense a scene and use it as a new draft version; continuity check runs", async () => {
  const ws0 = await api("GET", `/api/projects/${wProject}/script`);
  const q = await api("POST", `/api/projects/${wProject}/script/writing`, { kind: "rewrite_scene", scene: { mode: "condense", number: 1 } }, [201]);
  const g = await written(q.id);
  assert(g.status === "succeeded" && /^(INT|EXT)/.test(g.output.fountain.trim()), `${g.status}: ${g.error ?? ""}`);
  const o = await api("POST", `/api/script-writing/${g.id}/open-draft`, { base_version_id: ws0.current_version.id }, [201]);
  assert(o.version.version_number === ws0.current_version.version_number + 1, "not a new version");
  const c = await api("GET", `/api/projects/${wProject}/script/continuity`);
  return `v${o.version.version_number}; continuity ${c.summary.warnings} warnings, ${c.summary.notes} notes`;
});

// ---- One click per page (owner, 2026-10-02): every batch goes through the same gated per-item writes ----
await check("one click: Casting's whole-cast fill also reports the relationships the dialogue states (never replacing saved ones)", async () => {
  const before = (await api("GET", `/api/projects/${projectId}/characters`)).relationships ?? [];
  const r = await api("POST", `/api/projects/${projectId}/characters/apply-suggestions`, {});
  assert(Array.isArray(r.relationships_added), "relationships_added missing");
  const after = (await api("GET", `/api/projects/${projectId}/characters`)).relationships ?? [];
  for (const b of before) assert(after.some((a: any) => a.id === b.id && a.relationship === b.relationship), "a saved relationship changed");
  return `${r.relationships_added.length} added; ${after.length} saved in all`;
});
await check("one click: reference pictures for every location and prop (free built-in); a second click makes nothing new", async () => {
  const r = await api("POST", `/api/projects/${projectId}/world/looks/generate-all`, {});
  assert(typeof r.requested === "number" && Array.isArray(r.items), JSON.stringify(r).slice(0, 200));
  const again = await api("POST", `/api/projects/${projectId}/world/looks/generate-all`, {});
  assert(again.requested === 0, `second click requested ${again.requested}`);
  // Regression (owner 2026-10-02 "views.0: Invalid"): a view named with a two-word script time passes validation now.
  const loc = r.items.find((x: any) => x.kind === "location");
  if (loc) {
    const v = await api("POST", `/api/world/location/${loc.id}/look/generate`, { views: ["wide:SAME TIME"] }, [200, 400]);
    assert(!/views\.0: Invalid/.test(v?.error?.message ?? ""), "two-word times still refused: " + v?.error?.message);
  }
  return `${r.requested} pictures for ${r.items.length} places/props`;
});
await check("one click: Visual Generation compiles every prompt, sketches every shot (free) and approves a take for each — the whole film can be assembled before any paid provider", async () => {
  // Earlier checks deliberately flag the plan (a Casting change); bring it back the way a person would — re-lock the
  // scene's DNA and approve every ready plan in one click — so this check covers real shots, never zero.
  await api("POST", `/api/projects/${projectId}/scene-dna/${s1}/approve`, {}, [200, 409, 412]);
  // A re-locked scene's plan is stale (rule 11): re-plan it from the new lock, then approve every ready plan.
  await api("POST", `/api/projects/${projectId}/storyboard/scenes/${s1}/generate`, { replace: true, style: "standard" }, [200, 201, 409, 412]);
  const ap = await api("POST", `/api/projects/${projectId}/storyboard/approve-all`, {}, [200, 409, 412]);
  const t0 = Date.now();
  const c = await api("POST", `/api/projects/${projectId}/visual/compile-all`, {});
  const compileMs = Date.now() - t0;
  assert(c.remaining === 0, `compile-all left ${c.remaining} for another round on a 3-shot film`);
  const sk = await api("POST", `/api/projects/${projectId}/visual/sketch-all`, {});
  let ws: any;
  for (let i = 0; i < 45; i++) {
    ws = await api("GET", `/api/projects/${projectId}/visual`);
    if (!ws.queue.waiting && !ws.queue.running) break;
    await Bun.sleep(2000);
  }
  const a = await api("POST", `/api/projects/${projectId}/visual/approve-all`, {});
  const usable = ws.scenes.filter((s: any) => s.plan.usable).flatMap((s: any) => s.shots).length;
  const ws2 = await api("GET", `/api/projects/${projectId}/visual`);
  const approvedUsable = ws2.scenes.filter((s: any) => s.plan.usable).flatMap((s: any) => s.shots).filter((x: any) => x.approved_take_id).length;
  assert(usable > 0, "no shot plan is usable — the check would prove nothing: " + JSON.stringify(ap).slice(0, 300));
  assert(approvedUsable === usable, `${approvedUsable} of ${usable} usable shots approved (${JSON.stringify(a)})`);
  return `compiled ${c.compiled} in ${compileMs} ms, sketched ${sk.requested}, approved ${a.approved}; ${approvedUsable}/${usable} shots in usable plans approved`;
});
await check("one click: Audio Studio generates every planned sound in the film, then places each on its marked spot (recordings already placed are kept)", async () => {
  const before = await api("GET", `/api/projects/${projectId}/audio`);
  const recs = new Map(before.scenes.flatMap((s: any) => s.clips).filter((c: any) => c.kind === "asset").map((c: any) => [c.id, c.asset_id]));
  const g = await api("POST", `/api/projects/${projectId}/audio/generate-all`, {});
  let p: any = null;
  for (let i = 0; i < 30; i++) {
    await Bun.sleep(3000);
    p = await api("POST", `/api/projects/${projectId}/audio/place-generated`, {});
    if (!p.still_making) break;
  }
  const after = await api("GET", `/api/projects/${projectId}/audio`);
  const clips = after.scenes.flatMap((s: any) => s.clips);
  for (const [id, asset] of recs) assert(clips.find((c: any) => c.id === id)?.asset_id === asset, "a placed recording was replaced");
  assert(p && p.still_making === 0, `still making after waiting: ${JSON.stringify(p)}`);
  return `generated ${g.requested} across ${g.scenes} scene(s); placed ${p.placed}; ${p.not_generated} cue(s) without a generated sound`;
});

// ---- Production runs (migration 0056) and generation in batches (0055) — owner request 2026-10-02 ----
async function driveRun(id: string, max = 40) {
  let r: any = null;
  for (let i = 0; i < max; i++) {
    r = await api("POST", `/api/runs/${id}/step`, {});
    if (r.run.status !== "running") return r.run;
    await Bun.sleep(Math.max(500, r.wait_ms));
  }
  return r?.run;
}
await check("production runs: a whole-film sound run (spot → generate → place) is shared, joined instead of doubled, worked in rounds to the end; per-scene progress from the records", async () => {
  const s = await api("POST", `/api/projects/${projectId}/runs`, { kind: "audio.film" });
  assert(s.joined === false && s.run.status === "running" && s.run.phase === "spot", JSON.stringify(s).slice(0, 300));
  const j = await api("POST", `/api/projects/${projectId}/runs`, { kind: "audio.place" });
  assert(j.joined === true && j.run.id === s.run.id, "a second run in the same area should join the one already running");
  const end = await driveRun(s.run.id);
  assert(end?.status === "completed", `run ended ${end?.status}: ${end?.message}`);
  assert(end.log.some((l: any) => /^Finished —/.test(l.text)), "no finish line in the log");
  const prog = await api("GET", `/api/projects/${projectId}/audio/progress`);
  const sc = prog.scenes.find((x: any) => x.scene_id === s1);
  assert(sc && typeof sc.pct === "number" && sc.counts.total >= sc.counts.placed && sc.label, JSON.stringify(sc));
  const list = await api("GET", `/api/projects/${projectId}/runs`);
  assert(list.active.audio === null && list.runs[0].id === s.run.id, "finished run should no longer be active");
  return `${end.rounds} rounds; ${end.message.slice(0, 120)}; scene 1: ${sc.label} (${sc.pct}%) · generator ${JSON.stringify(prog.generator)}`;
});
await check("production runs: pause stops the rounds (no page drives it), resume carries on, stop keeps what's done; visual whole-film run completes; visual progress per scene", async () => {
  const s = await api("POST", `/api/projects/${projectId}/runs`, { kind: "audio.place" });
  const p = await api("POST", `/api/runs/${s.run.id}/control`, { action: "pause" });
  assert(p.run.status === "paused", "not paused");
  const idle = await api("POST", `/api/runs/${s.run.id}/step`, {});
  assert(idle.driving === false && idle.run.status === "paused", "a paused run must not be driven");
  assert((await api("POST", `/api/runs/${s.run.id}/control`, { action: "resume" })).run.status === "running", "not resumed");
  const st = await api("POST", `/api/runs/${s.run.id}/control`, { action: "stop" });
  assert(st.run.status === "cancelled" && /Everything already made is kept/.test(st.run.message), "not stopped");
  await api("POST", `/api/projects/${projectId}/runs`, { kind: "audio.everything" }, [400]);
  const v = await api("POST", `/api/projects/${projectId}/runs`, { kind: "visual.film" });
  const end = await driveRun(v.run.id);
  assert(end?.status === "completed", `visual run ended ${end?.status}: ${end?.message}`);
  const prog = await api("GET", `/api/projects/${projectId}/visual/progress`);
  const sc = prog.scenes.find((x: any) => x.scene_id === s1);
  assert(sc && sc.counts.shots > 0 && sc.pct === 100 && sc.stage === "approved", JSON.stringify(sc));
  return `visual: ${end.rounds} rounds — ${end.message.slice(0, 100)}; scene 1 ${sc.label}`;
});
await check("hand-offs (migration 0057): with the editor as owner of Editorial, a scene whose every shot is approved tells them (grouped, linked); the person who approved isn't told", async () => {
  await api("POST", `/api/projects/${projectId}/team/members`, { user_id: user2, role: "editor" });
  const so = await api("PUT", `/api/projects/${projectId}/stage-owners/editorial`, { user_ids: [user2] });
  assert(so.stages.find((x: any) => x.id === "editorial").owners[0]?.user_id === user2, "owner not saved");
  await api("PUT", `/api/projects/${projectId}/stage-owners/kazoo`, { user_ids: [] }, [400]);
  await apiAs(token2, "POST", "/api/notifications/read", { ids: null });
  const ws = await api("GET", `/api/projects/${projectId}/visual`);
  const shot = ws.scenes.find((x: any) => x.scene.id === s1).shots.find((x: any) => x.approved_take_id);
  await api("POST", `/api/takes/${shot.approved_take_id}/approve`, {});
  const n = await apiAs(token2, "GET", "/api/notifications");
  const h = n.items.find((x: any) => x.kind === "stage_ready");
  assert(h && /ready for Editorial & Timeline$/.test(h.title) && h.link === `/projects/${projectId}/editorial`, JSON.stringify(n.items.slice(0, 3)));
  const mine = await api("GET", "/api/notifications");
  assert(!mine.items.some((x: any) => x.kind === "stage_ready" && /Editorial/.test(x.title) && x.created_at > h.created_at), "the actor shouldn't hear about their own work");
  await api("PUT", `/api/projects/${projectId}/stage-owners/editorial`, { user_ids: [] });
  await api("DELETE", `/api/projects/${projectId}/team/members/${user2}`);
  return `${h.title} — ${h.body}`;
});

await check("ElevenLabs (R2): listed honestly; without its key it is never used (412, nothing queued); with it, a voice line is made by ElevenLabs", async () => {
  const ws = await api("GET", `/api/projects/${projectId}/audio`);
  const el = ws.generators.find((g: any) => g.id === "elevenlabs");
  assert(el && el.execution === "external" && el.kinds.includes("voice") && el.kinds.includes("score"), "ElevenLabs missing from the generators");
  if (el.state !== "configured") {
    const r = await api("POST", `/api/projects/${projectId}/audio/scenes/${s1}/generate`, { kind: "fx", description: "door slams", duration_seconds: 2, provider: "elevenlabs" }, [412]);
    assert(/isn't connected/.test(r.error.message), r.error.message);
    return "not connected yet (no key) — refused plainly";
  }
  const g = await api("POST", `/api/projects/${projectId}/audio/scenes/${s1}/generate`, { kind: "fx", description: "a wooden door slams shut", duration_seconds: 2, provider: "elevenlabs" });
  let row: any;
  for (let i = 0; i < 40; i++) {
    await Bun.sleep(3000);
    row = (await api("GET", `/api/projects/${projectId}/audio`)).scenes.flatMap((x: any) => x.generations).find((x: any) => x.id === g.id);
    if (row.status === "succeeded" || row.status === "failed") break;
  }
  assert(row.status === "succeeded", `${row.status}: ${row.error ?? ""}`);
  return `ElevenLabs effect made: ${row.layers.map((l: any) => l.because).join("; ").slice(0, 160)}`;
});

const failed = results.filter((r) => !r.ok).length;
console.log(`SUMMARY ${results.length - failed}/${results.length} passed${failed ? " — FAILURES: " + results.filter((r) => !r.ok).map((r) => r.check).join("; ") : ""}`);
