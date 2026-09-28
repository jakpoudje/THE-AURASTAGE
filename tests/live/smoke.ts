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
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${tok}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
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
for (const path of ["/", "/sign-in", "/sign-up", "/dashboard", "/reset-password", "/projects/00000000-0000-4000-8000-000000000000/scene-dna", "/projects/00000000-0000-4000-8000-000000000000/storyboard", "/projects/00000000-0000-4000-8000-000000000000/visual", "/projects/00000000-0000-4000-8000-000000000000/audio", "/projects/00000000-0000-4000-8000-000000000000/editorial", "/projects/00000000-0000-4000-8000-000000000000/export", "/projects/00000000-0000-4000-8000-000000000000/team", "/invite"]) {
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
await check("storyboard: plan shots from locked Scene DNA; re-plan asks first (409)", async () => {
  const g = await api("POST", `/api/projects/${projectId}/storyboard/scenes/${s1}/generate`, {});
  assert(g.shots >= 2 && g.scene_dna_version_number === 2, `shots ${g.shots} from v${g.scene_dna_version_number}`);
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
  const v = await api("POST", `/api/projects/${projectId}/storyboard/scenes/${s1}/approve`, {});
  assert(v.version_number === 1 && v.coverage === 1, `v${v.version_number} coverage ${v.coverage}`);
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
  const shot = ws.scenes[0].shots[0].shot;
  const c = await api("POST", `/api/projects/${projectId}/visual/shots/${shot.id}/compile`, { aspect_ratio: "16:9" });
  assert(/Cinematic film still/.test(c.prompt), "no prompt");
  return ws.providers.map((p: any) => `${p.id}:${p.state}`).join(", ");
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
await check("visual: approve the take; unconnected providers are refused plainly (412)", async () => {
  const t = await api("POST", `/api/takes/${takeId}/approve`, {});
  assert(t.approval === "approved", "not approved");
  const ws = await api("GET", `/api/projects/${projectId}/visual`);
  const pkgId = ws.scenes[0].shots[0].package.id;
  for (const p of ws.providers.filter((x: any) => x.state === "not_configured")) {
    const r = await api("POST", `/api/visual/packages/${pkgId}/takes`, { provider: p.id, model: p.models[0].id, capability: "image" }, [412]);
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
  assert(ws.generators.every((g: any) => g.state === "not_connected"), "generators must be honest");
  return `${r.tracks} tracks, ${r.cues} cues from plan v${r.shot_plan_version_number}`;
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
await check("delivery: queue Streaming Master, Subtitles and Audio Package from the lock (checksummed manifests)", async () => {
  for (const id of ["streaming_master", "subtitles", "audio_package"]) {
    const r = await api("POST", `/api/projects/${projectId}/delivery/renders`, { profile_id: id });
    assert(/^[0-9a-f]{64}$/.test(r.manifest_sha256), "no manifest checksum");
    renderIds[id] = r.render_id;
  }
  const m = await api("GET", `/api/renders/${renderIds.streaming_master}/manifest`);
  assert(m.manifest.picture_lock.lock_number >= 1 && m.manifest.sources.take_ids.length > 0 && m.manifest.sources.asset_ids.length > 0, "manifest sources");
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
await check("security: other project ids are refused", async () => {
  await api("GET", `/api/projects/00000000-0000-4000-8000-000000000000/characters`, undefined, [403]);
  await api("GET", `/api/projects/00000000-0000-4000-8000-000000000000/scene-dna`, undefined, [403]);
  await api("GET", `/api/projects/00000000-0000-4000-8000-000000000000/storyboard`, undefined, [403]);
  await api("GET", `/api/projects/00000000-0000-4000-8000-000000000000/visual`, undefined, [403]);
  await api("GET", `/api/projects/00000000-0000-4000-8000-000000000000/audio`, undefined, [403]);
  await api("GET", `/api/projects/00000000-0000-4000-8000-000000000000/editorial`, undefined, [403]);
  await api("GET", `/api/projects/00000000-0000-4000-8000-000000000000/delivery`, undefined, [403]);
});

const failed = results.filter((r) => !r.ok).length;
console.log(`SUMMARY ${results.length - failed}/${results.length} passed${failed ? " — FAILURES: " + results.filter((r) => !r.ok).map((r) => r.check).join("; ") : ""}`);
