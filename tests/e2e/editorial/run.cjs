// Browser test: Editorial & Timeline (offline, against tests/e2e/scriptwriter/mock-api.cjs on :3911,
// web on :3902 built with NEXT_PUBLIC_API_URL=http://localhost:3911 NEXT_PUBLIC_SUPABASE_URL=http://localhost:3912).
// Every saved step is checked again after a page reload.
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
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(0.1 * 32767 * Math.sin((2 * Math.PI * 440 * i) / sr)), i * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8); h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
async function api(method, p, body) {
  const r = await fetch(API + p, { method, headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
  return r.json();
}
async function approveTakeFor(shotId) {
  const c = await api("POST", `/api/projects/${P}/visual/shots/${shotId}/compile`, { aspect_ratio: "16:9" });
  const q = await api("POST", `/api/visual/packages/${c.package_id}/takes`, { provider: "aurastage-sketch", model: "sketch-v1", capability: "image", variations: 1 });
  await api("GET", `/api/projects/${P}/visual`); await api("GET", `/api/projects/${P}/visual`);
  await api("POST", `/api/takes/${q.takes[0].id}/approve`, {});
}

(async () => {
  const v1 = await api("POST", `/api/projects/${P}/script/versions`, { source_text: SCRIPT, base_version_id: null });
  await api("POST", `/api/projects/${P}/script/approve`, { version_id: v1.id });
  await api("POST", `/api/projects/${P}/characters/sync`, {});
  await api("POST", `/api/projects/${P}/dialogue/sync`, {});
  const s1 = (await api("GET", `/api/projects/${P}/dialogue`)).scenes[0].id;
  await api("POST", `/api/projects/${P}/dialogue/scenes/${s1}/approve`, {});
  await api("PATCH", `/api/projects/${P}/scene-dna/${s1}`, { purpose: "Tunde commits.", weather: "rain" });
  await api("POST", `/api/projects/${P}/scene-dna/${s1}/approve`, {});
  await api("POST", `/api/projects/${P}/storyboard/scenes/${s1}/generate`, {});
  const ok = await api("POST", `/api/projects/${P}/storyboard/scenes/${s1}/approve`, {});
  if (!ok.version_number) throw new Error("setup: shot plan not approved");
  const vis = await api("GET", `/api/projects/${P}/visual`);
  const shots = vis.scenes[0].shots.map((x) => x.shot.id);
  if (shots.length < 2) throw new Error("setup: need at least 2 shots, got " + shots.length);
  await approveTakeFor(shots[0]); // the other shots stay without an approved take (offline in the assembly)
  // Audio: spot, place a real recording on the dialogue cue, measure, approve.
  const sp = await api("POST", `/api/projects/${P}/audio/scenes/${s1}/spot`, {});
  const up = await (await fetch(`${API}/api/projects/${P}/assets/audio?name=line.wav&duration=1&sample_rate=48000&channels=1`, { method: "POST", headers: { "Content-Type": "audio/wav" }, body: wav(1) })).json();
  let aws = await api("GET", `/api/projects/${P}/audio`);
  const cue = aws.scenes[0].clips.find((c) => c.source.dialogue_line_id);
  await api("PATCH", `/api/audio-clips/${cue.id}`, { asset_id: up.id, label: "line", duration_seconds: 1 });
  aws = await api("GET", `/api/projects/${P}/audio`);
  await api("POST", `/api/audio-sessions/${sp.session_id}/measurements`, { integrated_lufs: -24, true_peak_dbtp: -20, lra_lu: 0, duration_seconds: aws.scenes[0].session.scene_seconds, clip_count: 1, engine_version: "1.0.0", session_revision: aws.scenes[0].session.revision });
  const ap = await api("POST", `/api/projects/${P}/audio/scenes/${s1}/approve`, {});
  if (!ap.version_id) throw new Error("setup: mix not approved " + JSON.stringify(ap));

  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--autoplay-policy=no-user-gesture-required"] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1100 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("dialog", (d) => d.accept());
  let failed = 0;
  const step = async (name, fn) => {
    try { await fn(); console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, e.message.split("\n").slice(0, 6).join(" | ")); await page.screenshot({ path: `${OUT}/fail-editorial-${name.replace(/\W+/g, "_")}.png`, fullPage: true }); }
  };
  const reload = async () => { await page.reload(); await page.getByText("Perfect Your Film").waitFor(); };
  const v1Clips = () => page.getByRole("group", { name: "Track V1" }).getByRole("button", { name: /^Clip / });
  const notice = (re) => page.getByText(re).first().waitFor();

  await page.goto(BASE + "/");
  await page.evaluate(() => localStorage.setItem("sb-localhost-auth-token", JSON.stringify({ access_token: "f", refresh_token: "f", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 36000, user: { id: "u1", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "" } })));

  await step("Audio Studio links to Editorial; the bin lists approved takes and offline shots", async () => {
    await page.goto(`${BASE}/projects/${P}/audio`);
    await page.getByRole("link", { name: "Next: Editorial & Timeline →" }).click();
    await page.waitForURL(`**/projects/${P}/editorial`);
    await page.getByText("Perfect Your Film").waitFor();
    const bin = page.getByLabel("Media bin");
    await bin.getByText("Take V1 approved").waitFor();
    await bin.getByText("No approved take (offline)").first().waitFor();
    await bin.getByText(/Scene mix v1/).waitFor();
  });
  await step("owner request 2026-10-02 (test one scene): the One scene panel shows what the scene needs, builds a test cut of that scene only, and plays it", async () => {
    const panel = page.getByRole("region", { name: "One scene at a time" });
    await panel.getByRole("combobox", { name: "Scene to test" }).waitFor();
    const ready = panel.getByRole("list", { name: /Scene 1 readiness/ });
    await ready.getByText("Shot plan approved").waitFor();
    await ready.getByText(/1 of \d+ shots — the rest play as offline slugs/).waitFor();
    await ready.getByRole("link", { name: "Open Visual Generation →" }).waitFor();
    await ready.getByText("Not on the timeline yet").waitFor();
    await panel.getByText(/what Editorial calls/).waitFor();
    await panel.getByRole("button", { name: "Build a test cut of Scene 1 only" }).click();
    await notice(/Assembled a test cut of Scene 1 only from approved shots/);
    await panel.getByRole("button", { name: "▶ Play Scene 1" }).waitFor();
    await ready.getByText(/Picture and sound in the cut|Picture in the cut/).waitFor();
  });
  await step("build the first assembly: picture from approved takes, offline slugs, mix on A1; kept after reload", async () => {
    await page.getByRole("button", { name: "Re-assemble" }).click();
    await notice(/Assembled 1 scene from approved shots: 1 picture clip, \d+ still offline/);
    await reload();
    await page.getByRole("group", { name: "Track V1" }).getByRole("button", { name: /^Clip Scene 1 · Shot 1/ }).first().waitFor();
    await page.getByRole("group", { name: "Track V1" }).getByText("OFFLINE").first().waitFor();
    await page.getByRole("group", { name: "Track A1" }).getByRole("button", { name: "Clip Scene 1 mix v1" }).waitFor();
    await page.getByRole("img", { name: /Scene 1 · Shot 1/ }).waitFor();
    // Owner request 2026-10-01: Audio Studio's planned effects and ambience are marked on the picture timeline at their
    // moment, with their length and type; a planned one opens Audio Studio to choose, generate or upload the sound.
    const cues = page.getByRole("group", { name: "Sound cues" }).getByRole("link");
    await cues.first().waitFor();
    const first = cues.first();
    if (!/^Sound cue .+/.test((await first.getAttribute("aria-label")) || "")) throw new Error("cue label");
    if (!/\/audio$/.test((await first.getAttribute("href")) || "")) throw new Error("cue should open Audio Studio");
    if (!/(Effect|Foley|Ambience|Crowd) · .+\n\d\d:\d\d:\d\d:\d\d – \d\d:\d\d:\d\d:\d\d \(\d+\.\d s\)/.test((await first.getAttribute("title")) || "")) throw new Error("cue title: " + (await first.getAttribute("title")));
  });
  await step("checks block Picture Lock while shots are offline; the timecode link jumps to the problem", async () => {
    if (!(await page.getByRole("button", { name: "Lock picture" }).isDisabled())) throw new Error("lock should be disabled");
    const checks = page.getByRole("list", { name: "Timeline checks" });
    await checks.getByText("No offline media (every shot has an approved take)").waitFor();
    await checks.getByRole("button", { name: /^00:00:0\d:\d\d — Scene 1 · Shot 2/ }).click();
    await page.getByLabel("Clip details").getByText(/Scene 1 · Shot 2.*no approved take/).waitFor();
    await page.getByLabel("Viewer").getByText("OFFLINE").waitFor();
  });
  await step("an upstream approval flags the timeline without touching the cut; Conform brings it in; kept after reload", async () => {
    for (const s of shots.slice(1)) await approveTakeFor(s);
    await reload();
    await page.getByText("New approved takes or mixes are available.").waitFor();
    await page.getByRole("group", { name: "Track V1" }).getByText("OFFLINE").first().waitFor(); // the cut is untouched until you conform
    await page.getByRole("button", { name: "Bring the whole cut up to date (Conform)" }).click();
    await notice(/Updated \d+ clips? to the currently approved takes and mixes — the cut is unchanged/);
    await reload();
    if (await page.getByRole("group", { name: "Track V1" }).getByText("OFFLINE").count()) throw new Error("still offline after conform");
  });
  let before = 0;
  await step("blade at the playhead (B) splits the clip; kept after reload", async () => {
    before = await v1Clips().count();
    await page.getByLabel("Viewer").click();
    for (let i = 0; i < 1; i++) await page.keyboard.press("Shift+ArrowRight");
    await page.getByLabel("Playhead").getByText("00:00:01:00").waitFor();
    await page.keyboard.press("b");
    await notice(/Cut “Scene 1 · Shot 1.*” in two/);
    await reload();
    if ((await v1Clips().count()) !== before + 1) throw new Error(`expected ${before + 1} clips, got ${await v1Clips().count()}`);
  });
  await step("ripple trim by dragging an edge moves what follows on all tracks", async () => {
    await page.getByRole("radio", { name: "Ripple" }).click();
    const first = v1Clips().first();
    await page.getByLabel("Timeline", { exact: true }).scrollIntoViewIfNeeded();
    const box = await first.boundingBox();
    await page.mouse.move(box.x + box.width - 3, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 15, box.y + box.height / 2, { steps: 4 });
    await page.mouse.move(box.x + box.width - 27, box.y + box.height / 2, { steps: 4 });
    await page.mouse.up();
    await notice(/Ripple-trimmed the end of “Scene 1 · Shot 1.*” by -12 frames; later clips followed on all tracks/);
    await page.getByRole("radio", { name: "Select" }).click();
  });
  await step("grade a clip in the inspector; kept after reload", async () => {
    await v1Clips().first().click();
    await page.getByLabel("Exposure").fill("0.5");
    await page.getByRole("button", { name: "Apply grade" }).click();
    await notice(/Graded “Scene 1 · Shot 1/);
    await reload();
    await v1Clips().first().click();
    if ((await page.getByLabel("Exposure").inputValue()) !== "0.5") throw new Error("grade lost after reload");
  });
  await step("transitions: fade up from black and fade to black on a clip; a too-long one is refused; kept after reload", async () => {
    await v1Clips().first().click();
    await page.getByLabel("Transition in").selectOption("fade_from_black");
    await page.getByLabel("Transition out").selectOption("fade_to_black");
    await page.getByLabel("Transition length in frames").fill("96");
    await page.getByRole("button", { name: "Apply transition" }).click();
    await page.getByText(/too short for a 96-frame transition/).waitFor();
    await page.getByLabel("Transition length in frames").fill("6"); // the clip is 12 frames after the blade step
    await page.getByRole("button", { name: "Apply transition" }).click();
    await notice(/now fades up from black and fades out to black \(6 frames\)/);
    await reload();
    await v1Clips().first().click();
    if ((await page.getByLabel("Transition in").inputValue()) !== "fade_from_black" || (await page.getByLabel("Transition length in frames").inputValue()) !== "6") throw new Error("transition lost after reload");
  });
  await step("Ask AuraStage changes a transition through Editorial (before → after), apply; reload: kept", async () => {
    const panel = () => page.getByRole("complementary", { name: "Ask AuraStage" });
    await page.getByRole("button", { name: "Ask AuraStage" }).click();
    await panel().getByLabel("What would you like to change?").fill("Dissolve into the first clip over 4 frames");
    await panel().getByRole("button", { name: "Ask", exact: true }).click();
    await panel().getByTestId("proposal-status").getByText("Suggested").waitFor();
    await panel().getByText(/give Clip 1: .* a dissolve and fade to black \(4 frames\)/).waitFor();
    await panel().getByRole("button", { name: "Apply" }).click();
    await panel().getByTestId("proposal-status").getByText("Applied").waitFor();
    await panel().getByRole("button", { name: "Close" }).click();
    await reload();
    await v1Clips().first().click();
    if ((await page.getByLabel("Transition in").inputValue()) !== "dissolve" || (await page.getByLabel("Transition length in frames").inputValue()) !== "4") throw new Error("the AI transition wasn't kept after reload");
  });
  await step("item 9: an approved shot laid over the picture (V2) and music across scenes (A2) — the cut doesn't move; music level set; kept after reload", async () => {
    const before = (await api("GET", `/api/projects/${P}/editorial`)).clips.filter((c) => c.track === "V1").map((c) => [c.record_in, c.duration]);
    await page.getByRole("button", { name: "Over picture" }).first().click();
    await page.getByRole("group", { name: "Track V2" }).getByRole("button", { name: /^Clip / }).first().waitFor();
    const up = await (await fetch(`${API}/api/projects/${P}/assets/audio?name=Main%20theme.wav&duration=3&sample_rate=48000&channels=1`, { method: "POST", headers: { "Content-Type": "audio/wav" }, body: wav(3) })).json();
    if (!up.id) throw new Error("music upload failed");
    await reload();
    await page.getByRole("group", { name: "Music for the music track" }).getByText(/Main theme\.wav/).waitFor();
    await page.getByRole("group", { name: "Music for the music track" }).getByRole("button", { name: "Place Main theme.wav on A2" }).click();
    const music = page.getByRole("group", { name: "Track A2" }).getByRole("button", { name: /Clip Main theme\.wav/ });
    await music.waitFor();
    await music.click();
    await page.getByLabel("Music level (dB)").fill("-12");
    await page.getByRole("button", { name: "Set level" }).click();
    await page.getByText(/now plays at -12 dB/).waitFor();
    await reload();
    const ws = await api("GET", `/api/projects/${P}/editorial`);
    if (JSON.stringify(ws.clips.filter((c) => c.track === "V1").map((c) => [c.record_in, c.duration])) !== JSON.stringify(before)) throw new Error("the cut moved");
    const m = ws.clips.find((c) => c.track === "A2");
    if (!m || m.gain_db !== -12 || m.asset_id !== up.id) throw new Error("music not kept: " + JSON.stringify(m));
    if (!ws.clips.some((c) => c.track === "V2" && c.kind === "take")) throw new Error("insert not kept");
    await page.getByRole("group", { name: "Track A2" }).getByRole("button", { name: /Clip Main theme\.wav/ }).waitFor();
  });
  await step("save a named version; kept after reload", async () => {
    await page.getByLabel("Version name").fill("Director's cut");
    await page.getByRole("button", { name: "Save version" }).click();
    await notice(/Saved version \d+ — “Director's cut”/);
    await reload();
    await page.getByRole("list", { name: "Versions" }).getByText(/Director's cut/).waitFor();
  });
  await step("lock the picture; kept after reload", async () => {
    await page.getByRole("button", { name: "Lock picture" }).click();
    await notice(/Picture locked \(lock 1\)/);
    await reload();
    await page.getByText("Locked · Picture Lock 1 ✓").waitFor();
  });
  let clipsAtLock = 0;
  await step("editing a locked picture asks first and shows the impact; keeping the lock changes nothing", async () => {
    clipsAtLock = await v1Clips().count();
    await v1Clips().last().click();
    await page.keyboard.press("Delete");
    const dlg = page.getByRole("dialog", { name: "Break Picture Lock" });
    await dlg.getByText("The picture is locked").first().waitFor();
    await dlg.getByRole("list", { name: "Impact" }).getByText(/Scene 1 — EXT\. LAGOS HARBOUR - NIGHT/).waitFor();
    await dlg.getByText(/Sound mix \(re-conform\)/).waitFor();
    await dlg.getByRole("button", { name: "Keep the lock" }).click();
    await reload();
    await page.getByText("Locked · Picture Lock 1 ✓").waitFor();
    if ((await v1Clips().count()) !== clipsAtLock) throw new Error("the cut changed although the lock was kept");
  });
  await step("breaking the lock applies the edit and records it; kept after reload", async () => {
    await v1Clips().last().click();
    await page.keyboard.press("Delete");
    await page.getByRole("button", { name: "Break Picture Lock and apply" }).click();
    await notice(/Lifted “/);
    await reload();
    await page.getByRole("button", { name: "Lock picture" }).waitFor();
    if ((await v1Clips().count()) !== clipsAtLock - 1) throw new Error("lift not saved");
    await page.getByText("Lock history").click();
    await page.getByText(/Lock 1: .* · broken /).waitFor();
  });
  await step("restore the Picture Lock version; the current cut is kept as a version; kept after reload", async () => {
    const row = page.getByRole("list", { name: "Versions" }).getByRole("listitem").filter({ hasText: "Picture Lock 1" });
    await row.getByRole("button", { name: "Restore" }).click();
    await notice(/Restored version \d+ \(“Picture Lock 1”\)/);
    await reload();
    if ((await v1Clips().count()) !== clipsAtLock) throw new Error("restore not saved");
    await page.getByRole("list", { name: "Versions" }).getByText(/Before restoring v\d+/).waitFor();
  });
  await step("owner request 2026-10-02: Undo (button and Ctrl+Z) takes edits back one at a time; kept after reload", async () => {
    const undoFor = (re) => page.getByRole("button", { name: new RegExp(`^Undo: ${re}`) });
    await undoFor("Restored version \\d+").waitFor();
    await v1Clips().last().click();
    await page.keyboard.press("Delete");
    await notice(/Lifted “/);
    if ((await v1Clips().count()) !== clipsAtLock - 1) throw new Error("lift not applied");
    await undoFor("Lifted “").waitFor();
    await page.keyboard.press("Control+z");
    await notice(/Undid: Lifted “/);
    if ((await v1Clips().count()) !== clipsAtLock) throw new Error("Ctrl+Z didn't bring the clip back");
    await reload();
    if ((await v1Clips().count()) !== clipsAtLock) throw new Error("undo not kept after reload");
    // The edit before it (the restore) is next in line; the button takes it back too, then the restore is made again.
    await undoFor("Restored version \\d+").click();
    await notice(/Undid: Restored version \d+/);
    await reload();
    if ((await v1Clips().count()) !== clipsAtLock - 1) throw new Error("second undo not kept");
    await undoFor("Lifted “").waitFor();
    const row = page.getByRole("list", { name: "Versions" }).getByRole("listitem").filter({ hasText: "Picture Lock 1" });
    await row.getByRole("button", { name: "Restore" }).click();
    await notice(/Restored version \d+ \(“Picture Lock 1”\)/);
    if ((await v1Clips().count()) !== clipsAtLock) throw new Error("re-restore not applied");
  });
  const points = () => page.getByRole("application", { name: "Volume automation lane" }).getByRole("button", { name: /^Automation point / });
  await step("assembly overview: the finishing steps from the real cut, one card per scene; a card jumps to its scene", async () => {
    const guide = page.getByRole("region", { name: "Assembly overview" });
    await guide.getByRole("list", { name: "Finishing steps" }).getByText("Every scene has its approved mix").waitFor();
    await guide.getByText(/1 of 1 scene in the cut/).waitFor();
    const card = guide.getByRole("button", { name: "Scene 1 overview" });
    await card.getByText(/Picture: \d+ shots?/).waitFor();
    await card.getByText(/Sound: Scene 1 mix v1/).waitFor();
    await page.getByRole("group", { name: "Scenes in the cut" }).getByRole("button", { name: "Go to scene 1" }).waitFor();
    for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowRight");
    await card.click();
    await page.waitForFunction(() => document.querySelector('[aria-label="Playhead"]')?.textContent === "00:00:00:00");
    await page.screenshot({ path: `${OUT}/editorial-assembly.png` });
  });
  await step("draw volume on the Volume lane with the Draw tool; saved as a curve; kept after reload", async () => {
    await page.getByRole("radio", { name: "✎ Draw volume" }).click();
    const lane = page.getByRole("application", { name: "Volume automation lane" });
    await lane.scrollIntoViewIfNeeded();
    const box = await lane.boundingBox();
    await page.mouse.move(box.x + 30, box.y + 20);
    await page.mouse.down();
    for (let i = 1; i <= 20; i++) await page.mouse.move(box.x + 30 + i * 8, box.y + 20 + i * 2);
    await page.mouse.up();
    await notice(/Volume drawn — saved\./);
    const n = await points().count();
    if (n < 2) throw new Error(`expected a drawn curve, got ${n} points`);
    await reload();
    if ((await points().count()) !== n) throw new Error("drawn volume not kept");
    await page.getByRole("radio", { name: "Select" }).click();
    await page.screenshot({ path: `${OUT}/editorial-automation.png` });
  });
  await step("set a level at the playhead precisely; double-click removes a point; kept after reload", async () => {
    const panel = page.getByRole("region", { name: "Volume automation" });
    for (let i = 0; i < 36; i++) await page.keyboard.press("ArrowRight"); // 00:00:01:12
    await panel.getByLabel("Level at playhead (dB)").fill("-12");
    await panel.getByRole("button", { name: "Set at playhead" }).click();
    await notice(/Set -12\.0 dB at 00:00:01:12 — saved\./);
    await panel.getByTestId("automation-at-playhead").getByText("-12.0 dB").waitFor();
    const before = await points().count();
    await page.getByRole("application", { name: "Volume automation lane" }).getByRole("button", { name: "Automation point 00:00:01:12 -12.0 dB" }).dblclick();
    await notice(/Point at 00:00:01:12 removed — saved\./);
    await reload();
    if ((await points().count()) !== before - 1) throw new Error("removal not kept");
  });
  await step("after Picture Lock the volume can still change and the lock stays", async () => {
    await page.getByRole("button", { name: "Lock picture" }).click();
    await notice(/Picture locked \(lock 2\)/);
    const panel = page.getByRole("region", { name: "Volume automation" });
    await panel.getByLabel("Level at playhead (dB)").fill("-3");
    await panel.getByRole("button", { name: "Set at playhead" }).click();
    await notice(/Set -3\.0 dB at .* — saved\./);
    await reload();
    await page.getByText("Locked · Picture Lock 2 ✓").waitFor();
    if (await page.getByRole("dialog").count()) throw new Error("the lock should not be questioned for a sound change");
  });
  await step("export the cut as a CMX 3600 EDL", async () => {
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export EDL" }).click()]);
    const p = path.join(OUT, "cut.edl"); await dl.saveAs(p); const t = fs.readFileSync(p, "utf8");
    if (!t.includes("FCM: NON-DROP FRAME") || !/^001  /m.test(t)) throw new Error("bad EDL: " + t.slice(0, 120));
  });
  await step("play the timeline: the playhead advances with the scene mix", async () => {
    await page.getByRole("button", { name: "⏮" }).click();
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.waitForFunction(() => { const t = document.querySelector('[aria-label="Playhead"]')?.textContent || ""; return t > "00:00:00:12"; }, null, { timeout: 10000 });
    await page.getByRole("button", { name: "Stop", exact: true }).click();
  });

  await step("owner 2026-10-02: one click from everything approved to a Review Copy render (picture already locked: just renders); Export shows it", async () => {
    await page.getByRole("button", { name: "Make a watchable film from everything approved (one click)" }).click();
    await page.getByText(/queued a Review Copy of the whole film/).waitFor();
    await page.goto(`${BASE}/projects/${P}/export`);
    await page.getByText(/Review Copy/).first().waitFor();
  });
  if (errors.length) { failed++; console.log("FAIL page errors", errors); }
  await browser.close();
  console.log(failed ? `${failed} FAILED` : "ALL PASSED");
  process.exit(failed ? 1 : 0);
})();
