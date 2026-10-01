// Browser test: Export & Deliver (offline, against tests/e2e/scriptwriter/mock-api.cjs on :3911, web on :3902).
// The mock runs the REAL render pipeline (workers/render-worker) with the local ffmpeg, so every deliverable here is
// an actual file that passed final QC. Every saved state is checked again after a page reload.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const BASE = "http://localhost:3902", API = "http://localhost:3911", P = "11111111-1111-4111-8111-111111111111";
const OUT = process.env.E2E_OUT || require("os").tmpdir();

const SCRIPT = `EXT. LAGOS HARBOUR - NIGHT

Rain lashes the jetty. TUNDE OKAFOR (35) waits under a lamp.

TUNDE
You came.
`;
function wav(seconds) {
  const sr = 48000, n = sr * seconds, data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(0.2 * 32767 * Math.sin((2 * Math.PI * 440 * i) / sr)), i * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8); h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
async function api(method, p, body) {
  const r = await fetch(API + p, { method, headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
  return r.json();
}

(async () => {
  // Upstream: script -> cast -> dialogue -> Scene DNA -> shots -> approved takes -> approved mix -> assembled + locked cut.
  const v1 = await api("POST", `/api/projects/${P}/script/versions`, { source_text: SCRIPT, base_version_id: null });
  await api("POST", `/api/projects/${P}/script/approve`, { version_id: v1.id });
  await api("POST", `/api/projects/${P}/characters/sync`, {});
  await api("POST", `/api/projects/${P}/dialogue/sync`, {});
  const s1 = (await api("GET", `/api/projects/${P}/dialogue`)).scenes[0].id;
  await api("POST", `/api/projects/${P}/dialogue/scenes/${s1}/approve`, {});
  await api("POST", `/api/projects/${P}/scene-dna/${s1}/approve`, {});
  await api("POST", `/api/projects/${P}/storyboard/scenes/${s1}/generate`, {});
  await api("POST", `/api/projects/${P}/storyboard/scenes/${s1}/approve`, {});
  const vis = await api("GET", `/api/projects/${P}/visual`);
  for (const sh of vis.scenes[0].shots) {
    const c = await api("POST", `/api/projects/${P}/visual/shots/${sh.shot.id}/compile`, { aspect_ratio: "16:9" });
    const q = await api("POST", `/api/visual/packages/${c.package_id}/takes`, { provider: "aurastage-sketch", model: "sketch-v1", capability: "image", variations: 1 });
    await api("GET", `/api/projects/${P}/visual`); await api("GET", `/api/projects/${P}/visual`);
    await api("POST", `/api/takes/${q.takes[0].id}/approve`, {});
  }
  const sp = await api("POST", `/api/projects/${P}/audio/scenes/${s1}/spot`, {});
  const up = await (await fetch(`${API}/api/projects/${P}/assets/audio?name=line.wav&duration=1&sample_rate=48000&channels=1`, { method: "POST", headers: { "Content-Type": "audio/wav" }, body: wav(1) })).json();
  let aws = await api("GET", `/api/projects/${P}/audio`);
  const cue = aws.scenes[0].clips.find((c) => c.source.dialogue_line_id);
  await api("PATCH", `/api/audio-clips/${cue.id}`, { asset_id: up.id, label: "line", duration_seconds: 1 });
  aws = await api("GET", `/api/projects/${P}/audio`);
  await api("POST", `/api/audio-sessions/${sp.session_id}/measurements`, { integrated_lufs: -23, true_peak_dbtp: -12, lra_lu: 0, duration_seconds: aws.scenes[0].session.scene_seconds, clip_count: 1, engine_version: "1.0.0", session_revision: aws.scenes[0].session.revision });
  await api("POST", `/api/projects/${P}/audio/scenes/${s1}/approve`, {});
  await api("POST", `/api/projects/${P}/editorial/assemble`, { base_revision: null });
  let ed = await api("GET", `/api/projects/${P}/editorial`);
  const lk = await api("POST", `/api/projects/${P}/editorial/lock`, { base_revision: ed.timeline.revision });
  if (lk.lock_number !== 1) throw new Error("setup: lock failed " + JSON.stringify(lk));

  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1200 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("dialog", (d) => d.accept());
  let failed = 0;
  const step = async (name, fn) => {
    try { await fn(); console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, e.message.split("\n")[0]); await page.screenshot({ path: `${OUT}/fail-delivery-${name.replace(/\W+/g, "_")}.png`, fullPage: true }); }
  };
  const reload = async () => { await page.reload(); await page.getByText("Every Screen").waitFor(); };
  const deliverable = (label) => page.getByRole("listitem", { name: `Deliverable ${label}` }).first();
  const selectPreset = (label) => page.getByRole("list", { name: "Presets" }).getByRole("button", { name: new RegExp(`^${label}`) }).first().click();
  const renderAndWait = async (label, button) => {
    await page.getByRole("button", { name: button ?? `Render ${label}` }).click();
    await page.getByText(new RegExp(`${label.replace(/[()]/g, "\\$&")} queued`)).waitFor();
    await deliverable(label).getByText(/QC (passed|failed)/).waitFor({ timeout: 120000 });
  };

  await page.goto(BASE + "/");
  await page.evaluate(() => localStorage.setItem("sb-localhost-auth-token", JSON.stringify({ access_token: "f", refresh_token: "f", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 36000, user: { id: "u1", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "" } })));

  await step("Editorial links to Export & Deliver; the Picture Lock is the source and pre-delivery QC is ready", async () => {
    await page.goto(`${BASE}/projects/${P}/editorial`);
    await page.getByRole("link", { name: "Next: Export & Deliver →" }).click();
    await page.waitForURL(`**/projects/${P}/export`);
    await page.getByText("Picture Lock 1 ✓").waitFor();
    await page.getByText("Ready to render").waitFor();
    await page.getByRole("list", { name: "Delivery checks" }).getByText("1 subtitle cue").waitFor();
  });
  await step("formats that can't be made honestly say why (DCP) and can't be rendered", async () => {
    await page.getByRole("tab", { name: "Cinema" }).click();
    await selectPreset("Theatrical Master");
    await page.getByLabel("Export settings").getByText(/DCP packaging .* isn't built yet/).waitFor();
    if (await page.getByRole("button", { name: /^Render Theatrical/ }).count()) throw new Error("DCP should not be renderable");
    await page.getByRole("tab", { name: "All" }).click();
  });
  await step("render the Streaming Master: queued, progress, real file with captions, QC passed; kept after reload", async () => {
    await selectPreset("Streaming Master");
    await page.getByRole("button", { name: "Render Streaming Master" }).click();
    await page.getByText(/Streaming Master queued — 2 files from the current Picture Lock/).waitFor();
    await page.getByText("Waiting for the render worker").waitFor();
    await reload();
    await page.getByRole("list", { name: "Render queue" }).getByText(/Streaming Master · Picture Lock 1/).waitFor();
    await deliverable("Streaming Master").getByText("QC passed").waitFor({ timeout: 120000 });
    await reload();
    const d = deliverable("Streaming Master");
    await d.getByText("QC passed").waitFor();
    await d.getByRole("cell", { name: "streaming_1080p24.mp4", exact: true }).waitFor();
    await d.getByRole("cell", { name: "captions.srt", exact: true }).waitFor();
    await page.getByLabel("Preview").waitFor();
  });
  await step("download the master and captions: a real MP4 and the dialogue as SRT", async () => {
    const d = deliverable("Streaming Master");
    const [mp4] = await Promise.all([page.waitForEvent("download"), d.getByRole("link", { name: "Download streaming_1080p24.mp4" }).click()]);
    const p = path.join(OUT, "master.mp4"); await mp4.saveAs(p);
    const b = fs.readFileSync(p);
    if (b.slice(4, 8).toString() !== "ftyp" || b.length < 5000) throw new Error("not an MP4");
    const [srt] = await Promise.all([page.waitForEvent("download"), d.getByRole("link", { name: "Download captions.srt" }).click()]);
    const sp = path.join(OUT, "captions.srt"); await srt.saveAs(sp);
    if (!/You came\./.test(fs.readFileSync(sp, "utf8"))) throw new Error("captions missing the line");
    await d.getByText(/QC report/).click();
    await page.getByRole("list", { name: "QC report Streaming Master" }).getByText(/Picture runs exactly as long as the locked cut/).waitFor();
  });
  await step("review copy with a watermark and burned-in timecode passes QC", async () => {
    await selectPreset("Review Copy");
    await page.getByLabel("Watermark").fill("FOR REVIEW");
    await renderAndWait("Review Copy");
    await deliverable("Review Copy").getByText("QC passed").waitFor();
  });
  await step("audio package: mix, stems and M&E", async () => {
    await selectPreset("Audio Package");
    await renderAndWait("Audio Package (mix, stems, M&E)");
    const d = deliverable("Audio Package (mix, stems, M&E)");
    await d.getByText("QC passed").waitFor();
    for (const f of ["mix.wav", "stem_DX.wav", "stem_FX.wav", "stem_BG.wav", "stem_MX.wav", "ME.wav"]) await d.getByRole("cell", { name: f, exact: true }).waitFor();
  });
  await step("item 13: a 30-second vertical social cut-down and a 60-second trailer, cut from the Picture Lock (free); real files; kept after reload", async () => {
    await selectPreset("Social Cut-down");
    await page.getByRole("group", { name: "Length" }).getByText("30 s").click();
    await renderAndWait("Social Cut-down (9:16)");
    const d = deliverable("Social Cut-down (9:16)");
    await d.getByRole("cell", { name: "social_9x16.mp4", exact: true }).waitFor();
    await selectPreset("Trailer");
    await page.getByRole("group", { name: "Length" }).getByText("60 s").click();
    await renderAndWait("Trailer");
    await deliverable("Trailer").getByRole("cell", { name: "trailer_1080p.mp4", exact: true }).waitFor();
    await page.reload();
    await deliverable("Trailer").getByRole("cell", { name: "trailer_1080p.mp4", exact: true }).waitFor();
  });
  await step("cancel a waiting render", async () => {
    await selectPreset("Mezzanine Master");
    await page.getByRole("button", { name: "Render Mezzanine Master (ProRes)" }).click();
    await page.getByRole("list", { name: "Render queue" }).getByRole("button", { name: "Cancel" }).click();
    await page.getByText("Render cancelled.").waitFor();
    await reload();
    await deliverable("Mezzanine Master (ProRes)").getByText("cancelled").waitFor();
  });
  await step("the render manifest names the Picture Lock and every source", async () => {
    const [dl] = await Promise.all([page.waitForEvent("download"), deliverable("Streaming Master").getByRole("button", { name: "Render manifest" }).click()]);
    const p = path.join(OUT, "manifest.json"); await dl.saveAs(p);
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    if (!/^[0-9a-f]{64}$/.test(j.manifest_sha256) || j.manifest.picture_lock.lock_number !== 1 || !j.manifest.sources.take_ids.length || !j.manifest.sources.asset_ids.length) throw new Error("manifest incomplete");
  });
  await step("breaking the Picture Lock marks deliverables out of date (files kept) and blocks new renders", async () => {
    ed = await api("GET", `/api/projects/${P}/editorial`);
    const take = ed.clips.find((c) => c.kind === "take");
    await api("POST", `/api/projects/${P}/editorial/edit`, { base_revision: ed.timeline.revision, operation: { op: "trim", clip_id: take.id, edge: "out", delta: -2, ripple: true }, break_lock: true });
    await reload();
    const d = deliverable("Streaming Master");
    await d.getByText("Out of date").waitFor();
    await d.getByText(/Made from Picture Lock 1, which is no longer the current lock/).waitFor();
    await d.getByRole("cell", { name: "streaming_1080p24.mp4", exact: true }).waitFor();
    await page.getByText("Not ready").waitFor();
    await selectPreset("Streaming Master");
    if (!(await page.getByRole("button", { name: "Render Streaming Master" }).isDisabled())) throw new Error("render should be blocked without a lock");
  });

  if (errors.length) { failed++; console.log("FAIL page errors", errors); }
  await browser.close();
  console.log(failed ? `${failed} FAILED` : "ALL PASSED");
  process.exit(failed ? 1 : 0);
})();
