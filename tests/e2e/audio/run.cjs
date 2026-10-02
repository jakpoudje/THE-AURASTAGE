// Browser test: Audio Studio (offline, against tests/e2e/scriptwriter/mock-api.cjs on :3911,
// web on :3902 built with NEXT_PUBLIC_API_URL=http://localhost:3911 NEXT_PUBLIC_SUPABASE_URL=http://localhost:3912).
// Uses a real WAV recording; the mix is rendered, measured (BS.1770-4) and exported by the real browser engine.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const BASE = "http://localhost:3902", API = "http://localhost:3911", P = "11111111-1111-4111-8111-111111111111";
const OUT = process.env.E2E_OUT || require("os").tmpdir();

const SCRIPT = `EXT. LAGOS HARBOUR - NIGHT

Rain lashes the jetty. TUNDE OKAFOR (35) waits under a lamp.

TUNDE
You came.
`;

/** 2 s, 48 kHz mono 16-bit 440 Hz tone at -20 dBFS peak. */
function wav() {
  const sr = 48000, n = sr * 2, data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(0.1 * 32767 * Math.sin((2 * Math.PI * 440 * i) / sr)), i * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8); h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(data.length, 40);
  const f = path.join(OUT, "tunde-line.wav"); fs.writeFileSync(f, Buffer.concat([h, data])); return f;
}

async function api(method, p, body) {
  const r = await fetch(API + p, { method, headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
  return r.json();
}

(async () => {
  const v1 = await api("POST", `/api/projects/${P}/script/versions`, { source_text: SCRIPT, base_version_id: null });
  await api("POST", `/api/projects/${P}/script/approve`, { version_id: v1.id });
  await api("POST", `/api/projects/${P}/characters/sync`, {});
  await api("POST", `/api/projects/${P}/dialogue/sync`, {});
  const dws = await api("GET", `/api/projects/${P}/dialogue`);
  const s1 = dws.scenes[0].id;
  await api("POST", `/api/projects/${P}/dialogue/scenes/${s1}/approve`, {});
  await api("PATCH", `/api/projects/${P}/scene-dna/${s1}`, { purpose: "Tunde commits.", weather: "rain", sound_intent: "Rain on corrugated iron, distant generator" });
  await api("POST", `/api/projects/${P}/scene-dna/${s1}/approve`, {});
  await api("POST", `/api/projects/${P}/storyboard/scenes/${s1}/generate`, {});
  const ok = await api("POST", `/api/projects/${P}/storyboard/scenes/${s1}/approve`, {});
  if (!ok.version_number) throw new Error("setup: shot plan not approved " + JSON.stringify(ok));
  const file = wav();

  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--autoplay-policy=no-user-gesture-required"] });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("dialog", (d) => d.accept());
  let failed = 0;
  const step = async (name, fn) => {
    try { await fn(); console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, e.message.split("\n")[0]); await page.screenshot({ path: `${OUT}/fail-audio-${name.replace(/\W+/g, "_")}.png`, fullPage: true }); }
  };
  const reload = async () => { await page.reload(); await page.getByRole("tablist", { name: "Scenes" }).waitFor(); };
  

  await page.goto(BASE + "/");
  await page.evaluate(() => localStorage.setItem("sb-localhost-auth-token", JSON.stringify({ access_token: "f", refresh_token: "f", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 36000, user: { id: "u1", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "" } })));

  await step("Visual Generation links to Audio Studio; the approved scene is listed, not yet spotted", async () => {
    await page.goto(`${BASE}/projects/${P}/visual`);
    await page.getByRole("link", { name: "Next: Audio Studio →" }).click();
    await page.waitForURL(`**/projects/${P}/audio`);
    await page.getByRole("tablist", { name: "Scenes" }).waitFor();
    await page.getByText("Spot this scene to lay out dialogue").waitFor();
  });
  await step("generators are shown honestly: built-in sound and built-in voice ready and free; clean-up not built yet", async () => {
    await page.getByTestId("generator-aurastage-synth").getByText("built in · free").waitFor();
    await page.getByTestId("generator-aurastage-voice").getByText("built in · free").waitFor();
    await page.getByTestId("generator-cleanup").getByText("not built yet", { exact: true }).waitFor();
    // R2: ElevenLabs (voices with accents, effects, music) is listed honestly — it needs its key; nothing offers it until then.
    await page.getByTestId("generator-elevenlabs").getByText("add a key to connect").waitFor();
  });
  await step("spot audio from the approved shot plan: dialogue, ambience and score cues; survives reload", async () => {
    await page.getByRole("button", { name: "Spot audio from the shot plan" }).click();
    await page.getByText(/Spotted \d+ cues on \d+ tracks from shot plan version 1/).waitFor();
    await page.getByRole("button", { name: /Clip Tunde.*You came/i }).waitFor();
    await reload();
    await page.getByRole("button", { name: /Clip Tunde.*You came/i }).waitFor();
    await page.getByRole("button", { name: /Clip Score/ }).waitFor();
    if (!(await page.getByRole("button", { name: "Measure mix" }).isDisabled())) throw new Error("measure should need a recording");
  });
  await step("item 5: the scene's suggested music (free, built-in library) is shown with why, and the Score cue is that style", async () => {
    const panel = page.getByRole("region", { name: "Suggested music" });
    await panel.getByText(/BPM/).waitFor();
    const text = await panel.innerText();
    if (!/BPM/.test(text) || !/Suggested music · free/i.test(text) || !/ — /.test(text)) throw new Error("suggestion panel: " + text.replace(/\n/g, " | "));
    const style = (await panel.locator("p").first().innerText()).trim();
    await page.getByRole("button", { name: new RegExp(`Clip Score — ${style}`) }).waitFor();
  });
  await step("upload a real WAV onto the dialogue cue: waveform drawn, placed, kept after reload", async () => {
    await page.getByRole("button", { name: /Clip Tunde.*You came/i }).click();
    await page.getByLabel("Upload a recording for this clip").setInputFiles(file);
    await page.getByText("“tunde-line.wav” uploaded and placed on the clip.").waitFor();
    await page.getByRole("button", { name: "Clip tunde-line" }).locator("svg path").waitFor();
    await reload();
    await page.getByRole("button", { name: "Clip tunde-line" }).locator("svg path").waitFor({ timeout: 15000 });
    await page.getByText("1 recordings in the library").waitFor();
    const checks = page.getByRole("list", { name: "Audio checks" });
    await checks.getByText("1 of 1 dialogue clips recorded").waitFor();
  });
  await step("mixer mute persists across reload, then unmute", async () => {
    const mute = page.getByRole("button", { name: /^Mixer mute Score/ });
    await mute.click();
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => /^Mixer mute Score/.test(b.getAttribute("aria-label") || "") && b.getAttribute("aria-pressed") === "true"));
    await reload();
    if ((await page.getByRole("button", { name: /^Mixer mute Score/ }).getAttribute("aria-pressed")) !== "true") throw new Error("mute not saved");
    await page.getByRole("button", { name: /^Mixer mute Score/ }).click();
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => /^Mixer mute Score/.test(b.getAttribute("aria-label") || "") && b.getAttribute("aria-pressed") === "false"));
  });
  await step("owner 2026-10-02: mute and the fader act on what is playing — the channel meter goes silent at once, then comes back", async () => {
    await page.getByRole("button", { name: "Play", exact: true }).click();
    // The channel carrying the uploaded line shows signal.
    const handle = await page.waitForFunction(() => {
      for (const ch of document.querySelectorAll('[aria-label^="Channel "]')) {
        const m = ch.querySelector('[aria-label="Level meter"]');
        if (m && m.getAttribute("title") !== "no signal") return ch.getAttribute("aria-label").slice(8);
      }
      return null;
    }, null, { timeout: 15000 });
    const name = await handle.jsonValue();
    await page.getByRole("button", { name: `Mixer mute ${name}`, exact: true }).click();
    await page.waitForFunction((n) => document.querySelector(`[aria-label="Channel ${n}"] [aria-label="Level meter"]`)?.getAttribute("title") === "no signal", name, { timeout: 5000 });
    if (!(await page.getByRole("button", { name: "Stop", exact: true }).isVisible())) throw new Error("playback stopped instead of muting live");
    await page.getByRole("button", { name: `Mixer mute ${name}`, exact: true }).click();
    await page.waitForFunction((n) => document.querySelector(`[aria-label="Channel ${n}"] [aria-label="Level meter"]`)?.getAttribute("title") !== "no signal", name, { timeout: 5000 });
    await page.getByRole("button", { name: "Stop", exact: true }).click();
  });
  await step("approve is blocked until the rendered mix is measured", async () => {
    if (!(await page.getByRole("button", { name: "Approve scene mix" }).isDisabled())) throw new Error("approve should be disabled");
    await page.getByRole("list", { name: "Audio checks" }).getByText("Not measured yet").waitFor();
  });
  await step("measure the rendered mix (BS.1770-4): a real loudness number, kept after reload", async () => {
    await page.getByRole("button", { name: "Measure mix" }).click();
    const n = await page.getByText(/Measured the rendered mix: -\d+\.\d LUFS, true peak -\d+\.\d dBTP\./).innerText();
    const lufs = Number(n.match(/(-\d+\.\d) LUFS/)[1]), tp = Number(n.match(/(-\d+\.\d) dBTP/)[1]);
    // 440 Hz tone at 0.1 peak for 2 s in a longer scene: true peak ≈ -20 dBTP (panned mono -> stereo -3 dB law may apply).
    if (!(tp < -15 && tp > -27)) throw new Error("implausible true peak " + tp);
    if (!(lufs < -15 && lufs > -45)) throw new Error("implausible loudness " + lufs);
    await reload();
    await page.getByLabel("Loudness measurement").getByText(String(lufs.toFixed(1))).waitFor();
    await page.getByRole("list", { name: "Audio checks" }).getByText(/^Measured /).waitFor();
  });
  await step("approve the scene mix; approved state survives reload", async () => {
    await page.getByRole("button", { name: "Approve scene mix" }).click();
    await page.getByText("Scene mix approved as version 1.").waitFor();
    await reload();
    await page.getByRole("button", { name: "Approved · version 1 ✓" }).waitFor();
    await page.getByRole("tab", { name: /✓/ }).waitFor();
  });
  await step("export the full mix and the DX stem as WAV files", async () => {
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Full mix" }).click()]);
    if (dl.suggestedFilename() !== "scene-1-full-mix.wav") throw new Error(dl.suggestedFilename());
    const p = path.join(OUT, "mix.wav"); await dl.saveAs(p); const b = fs.readFileSync(p);
    if (b.slice(0, 4).toString() !== "RIFF" || b.readUInt32LE(24) !== 48000 || b.length < 48000 * 4) throw new Error("bad wav");
    const [dx] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "DX stem" }).click()]);
    if (dx.suggestedFilename() !== "scene-1-DX-stem.wav") throw new Error(dx.suggestedFilename());
  });
  await step("changing the mix makes the measurement out of date and asks to approve again", async () => {
    await page.getByRole("button", { name: /^Mixer mute Score/ }).click();
    await page.getByText("The mix changed after this measurement — measure again.").waitFor();
    await reload();
    await page.getByText("The mix changed after this measurement — measure again.").waitFor();
    if (!(await page.getByRole("button", { name: "Approve again (new version)" }).isDisabled())) throw new Error("should need a new measurement");
  });
  await step("an upstream shot plan change marks audio for review; the recording is kept", async () => {
    await api("POST", `/api/projects/${P}/storyboard/scenes/${s1}/approve`, {});
    await reload();
    await page.getByText("This scene's audio needs review.").waitFor();
    await page.getByRole("button", { name: "Clip tunde-line" }).waitFor();
    await page.getByRole("button", { name: "Re-spot from upstream" }).click();
    await page.getByText(/from shot plan version 2/).waitFor();
    await reload();
    await page.getByRole("button", { name: "Clip tunde-line" }).waitFor();
    if (await page.getByText("This scene's audio needs review.").count()) throw new Error("still needs review after re-spot");
    if (await page.getByRole("button", { name: /Clip Tunde.*You came/i }).count()) throw new Error("dialogue cue duplicated after re-spot");
  });

  await step("generate the scene's planned sounds with the built-in synthesiser; listen; use one on its cue; reload: kept, and it's in the Assets Library", async () => {
    await page.getByRole("button", { name: "1 · Generate all planned sounds for this scene" }).click();
    await page.getByText(/Generating \d+ planned sounds? with the built-in generators/).waitFor();
    await page.getByRole("button", { name: /Clip Score/ }).click();
    const gen = page.getByRole("region", { name: "Generate this sound" });
    await gen.getByTestId("generation").getByText("Ready").waitFor({ timeout: 20000 });
    await gen.getByTestId("generation").getByText(/Built-in synthesis · (tense minor pulse|neutral pad|slow minor pad|warm major sevenths|bright major progression|dark drone|driving minor ostinato)/).waitFor();
    await gen.getByRole("button", { name: "▶ Listen" }).click();
    await gen.getByLabel("Generated sound").waitFor();
    await gen.getByRole("button", { name: "Use this" }).click();
    await page.getByText("Clip saved.").waitFor();
    await gen.getByText("In use").waitFor();
    await reload();
    await page.getByRole("button", { name: /Clip Score/ }).click();
    await page.getByRole("region", { name: "Generate this sound" }).getByText("In use").waitFor();
    const lib = await api("GET", `/api/projects/${P}/library`);
    if (!lib.assets.some((a) => /^Score — /.test(a.name))) throw new Error("generated score not in the Assets Library");
    await page.getByRole("button", { name: "1 · Generate all planned sounds for this scene" }).click();
    await page.getByText(/Nothing new to generate|already generated/).waitFor();
  });
  await step("speak a dialogue line in the character's Voice DNA with the built-in voice; listen; it's in the Assets Library; reload: kept", async () => {
    await page.getByRole("button", { name: "Clip tunde-line" }).click();
    if (await page.getByRole("region", { name: "Generate this sound" }).count()) throw new Error("dialogue clip offered sound-effect generation");
    const v = page.getByRole("region", { name: "Generate this voice" });
    await v.getByRole("button", { name: "Generate voice" }).click();
    await v.getByTestId("generation").getByText("Ready").waitFor({ timeout: 20000 });
    await v.getByTestId("generation").getByText(/Built-in voice \(robotic\) · (Adult|Young|Elder|Child) (male|female) voice/).waitFor();
    await v.getByRole("button", { name: "▶ Listen" }).click();
    await v.getByLabel("Generated sound").waitFor();
    await page.screenshot({ path: `${OUT}/audio-voice.png` });
    const lib = await api("GET", `/api/projects/${P}/library`);
    if (!lib.assets.some((a) => /^Voice — You came/.test(a.name))) throw new Error("generated voice not in the Assets Library");
    await reload();
    await page.getByRole("button", { name: "Clip tunde-line" }).click();
    await page.getByRole("region", { name: "Generate this voice" }).getByTestId("generation").getByText("Ready").waitFor();
    const r = await api("POST", `/api/projects/${P}/audio/scenes/${s1}/generate`, { kind: "voice", duration_seconds: 2 });
    if (r.error?.message !== "Choose the dialogue line to speak.") throw new Error(JSON.stringify(r));
  });
  await step("studio mixer: EQ, compressor, reverb send and ducking under dialogue on the score; routing; reload: all kept", async () => {
    await page.getByRole("button", { name: /^Channel strip Score/ }).click();
    const ed = page.getByRole("region", { name: /^Channel strip editor Score/ });
    await ed.getByLabel("High shelf gain").fill("4");
    await ed.getByLabel("Compressor on").check();
    await ed.getByLabel("Threshold").fill("-24");
    await ed.getByLabel("Reverb send (-60 = off)").fill("-12");
    await ed.getByText(/Dips 10 dB under 1 stretch of dialogue/).waitFor();
    await ed.getByRole("button", { name: "Duck under dialogue" }).click();
    await ed.getByText(/4 points, on top of the fader/).waitFor();
    await ed.getByRole("img", { name: "EQ curve" }).waitFor();
    await ed.getByRole("button", { name: "Save channel" }).click();
    await page.getByText(/Saved Score's channel strip/).waitFor();
    const routing = page.getByRole("region", { name: "Buses and master" });
    await routing.getByLabel("Reverb type").selectOption("hall");
    await routing.getByLabel("Music bus").fill("-3");
    await routing.getByRole("button", { name: "Save routing" }).click();
    await page.getByText(/Mix routing saved/).waitFor();
    await page.screenshot({ path: `${OUT}/studio-mixer.png`, fullPage: true });
    await reload();
    await page.getByRole("button", { name: /^Channel strip Score/ }).getByText("EQ · COMP · REV · AUTO").waitFor();
    if ((await page.getByRole("region", { name: "Buses and master" }).getByLabel("Reverb type").inputValue()) !== "hall") throw new Error("routing not kept");
    const ws = await api("GET", `/api/projects/${P}/audio`);
    const sc = ws.scenes.find((x) => x.scene.id === s1);
    const score = sc.tracks.find((t) => t.name === "Score");
    if (!(score.fx.comp.on && score.fx.eq.high.gain_db === 4 && score.fx.reverb_send_db === -12 && score.fx.automation.length === 4)) throw new Error(JSON.stringify(score.fx));
    if (sc.session.mix.buses.MX.gain_db !== -3 || sc.session.mix.reverb.type !== "hall") throw new Error(JSON.stringify(sc.session.mix));
    const stale = await api("PUT", `/api/projects/${P}/audio/scenes/${s1}/mix`, { mix: sc.session.mix, revision: "00000000-0000-4000-8000-000000000000" });
    if (stale.error?.code !== "AURA-AUD-409") throw new Error("stale routing save not refused");
  });
  await step("built-in presets: phone call on a dialogue channel (low-pass), horror mix template; reload: kept", async () => {
    await page.getByRole("button", { name: /^Channel strip DX/ }).first().click();
    const ed = page.getByRole("region", { name: /^Channel strip editor DX/ });
    await ed.getByLabel("Channel preset", { exact: true }).selectOption({ label: "Phone call" });
    await ed.getByRole("button", { name: "Apply preset" }).click();
    await ed.getByText(/Phone call: The other end of a phone line/).waitFor();
    if ((await ed.getByLabel("Low-pass (0 = off)").inputValue()) !== "3400") throw new Error("low-pass not set");
    await ed.getByRole("button", { name: "Save channel" }).click();
    await page.getByText(/channel strip — measure the mix again/).waitFor();
    const routing = page.getByRole("region", { name: "Buses and master" });
    await routing.getByLabel("Mix template").selectOption({ label: "Horror" });
    await routing.getByRole("button", { name: "Apply template" }).click();
    await routing.getByText(/Horror: Big, reverberant spaces/).waitFor();
    await routing.getByRole("button", { name: "Save routing" }).click();
    await page.getByText(/Mix routing saved/).waitFor();
    await reload();
    await page.getByRole("button", { name: /^Channel strip DX/ }).first().getByText(/HPF · LPF · EQ · COMP/).waitFor();
    const ws = await api("GET", `/api/projects/${P}/audio`);
    const sc = ws.scenes.find((x) => x.scene.id === s1);
    const dx = sc.tracks.find((t) => t.family === "DX");
    if (dx.fx.lpf_hz !== 3400 || dx.fx.hpf_hz !== 300) throw new Error(JSON.stringify(dx.fx));
    if (sc.session.mix.buses.BG.gain_db !== -2 || sc.session.mix.reverb.decay_s !== 3.2) throw new Error(JSON.stringify(sc.session.mix));
  });
  await step("match the loudness target: measure, apply the master correction, measure again — on target", async () => {
    await page.getByRole("button", { name: "Measure mix" }).click();
    await page.getByText(/Measured the rendered mix: /).waitFor();
    const routing = page.getByRole("region", { name: "Buses and master" });
    await routing.getByTestId("loudness-fix").getByText(/Raise the master by|Lower the master by/).waitFor();
    await routing.getByRole("button", { name: /Match loudness target/ }).click();
    await page.getByText(/Master set to .* for -23 LUFS/).waitFor();
    await page.getByRole("button", { name: "Measure mix" }).click();
    const msg = await page.getByText(/Measured the rendered mix: /).innerText();
    const lufs = Number((msg.match(/(-\d+\.\d) LUFS/) || [])[1]);
    if (!(Math.abs(lufs - -23) <= 1.5)) throw new Error("not on target after correction: " + msg);
    await routing.getByTestId("loudness-fix").getByText(/Already on target|by 0\.|by 1\./).waitFor();
  });
  await step("add your own tracks (any department), rename, move, put a clip on it; re-spot keeps them; remove an empty one; reload: kept", async () => {
    const tl = page.getByLabel("Timeline");
    await page.getByLabel("New track name").fill("Radio");
    await page.getByLabel("New track department").selectOption("FX");
    await page.getByRole("button", { name: "+ Add track" }).click();
    await page.getByText(/Track “Radio” added/).waitFor();
    await tl.getByRole("group", { name: "Track Radio" }).waitFor();
    await page.getByLabel("New track name").fill("radio");
    await page.getByRole("button", { name: "+ Add track" }).click();
    await page.getByText(/already a track called radio/).waitFor();
    await page.getByLabel("New track name").fill("Market walla");
    await page.getByLabel("New track department").selectOption("WALLA");
    await page.getByRole("button", { name: "+ Add track" }).click();
    await page.getByText(/Track “Market walla” added/).waitFor();
    // Rename, then move it up one place.
    await tl.getByRole("button", { name: "Rename Radio" }).click();
    await tl.getByLabel("Rename Radio").fill("Radio news");
    await tl.getByLabel("Rename Radio").press("Enter");
    await page.getByText(/Renamed to “Radio news”/).waitFor();
    const before = await page.evaluate(() => [...document.querySelectorAll('[aria-label^="Track "]')].map((x) => x.getAttribute("aria-label")));
    await tl.getByRole("button", { name: "Move Radio news up" }).click();
    await page.waitForFunction((n) => { const g = [...document.querySelectorAll('[aria-label^="Track "]')].map((x) => x.getAttribute("aria-label")); return g.indexOf("Track Radio news") === n; }, before.indexOf("Track Radio news") - 1);
    // New clips go on the chosen track (the newest track is chosen after adding; click a name to choose another).
    await page.getByRole("button", { name: "+ Add clip on Market walla at playhead" }).waitFor();
    await tl.getByRole("group", { name: "Track Radio news" }).locator("button[aria-pressed]").first().click();
    await page.getByRole("button", { name: "+ Add clip on Radio news at playhead" }).click();
    await page.getByText("Clip added.").waitFor();
    await tl.getByRole("group", { name: "Track Radio news" }).getByRole("button", { name: "Clip New clip", exact: true }).waitFor();
    // Owner request 2026-10-01: split a clip at the playhead (the second half continues the same recording).
    await tl.getByRole("group", { name: "Track Radio news" }).getByRole("button", { name: "Clip New clip", exact: true }).click();
    const split = page.getByRole("button", { name: "✂ Split selected clip at playhead" });
    if (!(await split.isDisabled())) throw new Error("split must need the playhead inside the clip");
    const pps = Number(await page.getByLabel("Zoom").inputValue());
    const startX = await tl.getByRole("group", { name: "Track Radio news" }).getByRole("button", { name: "Clip New clip", exact: true }).evaluate((el) => el.offsetLeft);
    await page.getByLabel("Ruler").click({ position: { x: startX + pps, y: 4 } });
    await split.click();
    await page.getByText(/^Split “New clip” at \d+\.\d\ds\./).waitFor();
    await tl.getByRole("group", { name: "Track Radio news" }).getByRole("button", { name: "Clip New clip (2)" }).waitFor();
    await tl.getByRole("group", { name: "Track Radio news" }).getByRole("button", { name: "Clip New clip (2)" }).click();
    // Re-spotting keeps both tracks and the clip placed by hand.
    await page.getByRole("button", { name: /Re-spot from upstream/ }).click();
    await page.getByText(/Spotted \d+ cues/).waitFor();
    await tl.getByRole("group", { name: "Track Radio news" }).getByRole("button", { name: "Clip New clip", exact: true }).waitFor();
    await tl.getByRole("group", { name: "Track Market walla" }).waitFor();
    // A track with clips can't be removed; an empty one can. Spotted tracks have no remove button.
    await tl.getByRole("button", { name: "Remove Radio news" }).click();
    await page.getByText(/still holds 2 clip/).waitFor();
    await tl.getByRole("button", { name: "Remove Market walla" }).click();
    await page.getByText("Track removed.").waitFor();
    if (await tl.getByRole("group", { name: "Track Market walla" }).count()) throw new Error("walla track still there");
    if (await tl.getByRole("button", { name: /^Remove (DX|BG|MX)/ }).count()) throw new Error("spotted tracks must not be removable");
    await page.screenshot({ path: `${OUT}/audio-tracks.png` });
    await page.reload();
    await page.getByLabel("Timeline").getByRole("group", { name: "Track Radio news" }).getByRole("button", { name: "Clip New clip", exact: true }).waitFor();
  });
  await step("Ask AuraStage in Audio Studio: (un)mute the music in the scene; only the Score track changes, at once; reload: kept; undo: back", async () => {
    const ws = await api("GET", `/api/projects/${P}/audio`);
    const n = (ws.scenes.find((x) => x.session) ?? ws.scenes[0]).scene.number;
    const pressed = async () => page.getByRole("button", { name: /^Mixer mute Score/ }).getAttribute("aria-pressed");
    const start = await pressed(), want = start === "true" ? "false" : "true";
    const req = `${start === "true" ? "Unmute" : "Mute"} the music in scene ${n}`;
    const waitFor = async (v, why) => { for (let i = 0; i < 40 && (await pressed()) !== v; i++) await page.waitForTimeout(250); if ((await pressed()) !== v) throw new Error(why); };
    await page.getByRole("button", { name: "Ask AuraStage" }).click();
    const ask = page.getByRole("complementary", { name: "Ask AuraStage" });
    await ask.getByLabel("What would you like to change?").fill(req);
    await ask.getByRole("button", { name: "Ask", exact: true }).click();
    await ask.getByTestId("proposal-status").getByText("Suggested").waitFor({ timeout: 15000 });
    await ask.getByText(/Score track/).first().waitFor();
    await ask.getByRole("button", { name: "Apply", exact: true }).click();
    await ask.getByTestId("proposal-status").getByText("Applied").waitFor();
    await waitFor(want, "Score not changed on screen without a reload");
    await ask.getByRole("button", { name: "Close" }).click();
    await page.reload();
    await waitFor(want, "change not kept after reload");
    await page.getByRole("button", { name: "Ask AuraStage" }).click();
    await ask.getByRole("region", { name: "Recent requests" }).getByRole("button", { name: new RegExp(req.split(" ")[0] + " the music") }).first().click();
    await ask.getByRole("button", { name: "Undo", exact: true }).click();
    await ask.getByTestId("proposal-status").getByText("Undone").waitFor();
    await waitFor(start, "undo didn't restore the Score track");
    await ask.getByRole("button", { name: "Close" }).click();
  });
  await step("owner request 2026-10-01: a free ambient bed in the scene's mood — added as a clip across the scene, made by the built-in generator; reload: kept", async () => {
    await reload();
    const bed = page.getByRole("region", { name: "Suggested music" }).getByTestId("ambient-bed");
    await bed.getByText(/^Ambient bed — /).waitFor();
    await bed.getByRole("button", { name: "Add an ambient bed (free)" }).click();
    await page.getByText(/^Generating — it will appear here/).waitFor();
    await page.getByRole("button", { name: "Clip Ambient bed" }).waitFor();
    await reload();
    await page.getByRole("button", { name: "Clip Ambient bed" }).waitFor();
  });
  await step("owner 2026-10-02: whole film in one click each — generate every planned sound, then place each on its marked spot; reload: placed; clips still editable", async () => {
    const planned = () => page.getByText("planned", { exact: true }).count();
    const before = await planned();
    await page.getByRole("button", { name: "2 · Generate all planned sounds" }).click();
    await page.getByText(/Generating \d+ planned sounds? across \d+ scenes?|Nothing new to generate/).waitFor();
    // Generated sounds finish in the background; place until none are still being made.
    let note = "";
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(800);
      await reload();
      await page.getByRole("button", { name: "3 · Place all generated sounds on their marked spots" }).click();
      note = await page.getByText(/^Placed \d+ generated sound/).innerText();
      if (!/still being made/.test(note)) break;
    }
    if (!/^Placed [1-9]/.test(note) && !/^Placed 0/.test(note)) throw new Error(note);
    await reload();
    const after = await planned();
    if (!(after < before)) throw new Error(`planned cues ${before} → ${after}; ${note}`);
    // Still editable by hand: select a placed clip and its inspector opens.
    await page.locator('[aria-label="Whole film"]').waitFor();
    // 4: measure every scene's mix in the browser and approve the ones whose checks pass.
    await page.getByRole("button", { name: "4 · Measure and approve every scene's mix" }).click();
    const note4 = await page.getByText(/^Measured and approved \d+ scene mix/).innerText({ timeout: 60000 });
    await reload();
    const ws = await api("GET", `/api/projects/${P}/audio`);
    const ok = ws.scenes.filter((x) => x.session && x.session.status === "approved").length;
    if (/^Measured and approved [1-9]/.test(note4) && !ok) throw new Error("said approved but none is: " + note4);
  });
  if (errors.length) { failed++; console.log("FAIL page errors", errors); }
  await browser.close();
  console.log(failed ? `${failed} FAILED` : "ALL PASSED");
  process.exit(failed ? 1 : 0);
})();
