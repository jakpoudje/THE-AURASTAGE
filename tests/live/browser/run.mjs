// Live browser check: signs in through the real web app with the throwaway
// account, uses each stage the way a person would, and RELOADS every page to
// prove the work was saved (the owner's rule: "always reload the page and verify").
// Env: WEB_URL, SMOKE_EMAIL, SMOKE_PASSWORD. Output: one JSON line per check,
// then "SUMMARY n/m passed". Never prints the password.
import { chromium } from "playwright";

const env = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`missing env ${k}`);
  return v;
};
const WEB = env("WEB_URL").replace(/\/$/, "");
const results = [];
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true })).newPage();
page.setDefaultTimeout(30000);
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));
const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && consoleErrors.push(m.text().slice(0, 300)));
page.on("dialog", (d) => d.accept());

async function check(name, fn) {
  try {
    const detail = (await fn()) ?? undefined;
    results.push({ check: name, ok: true });
    console.log(JSON.stringify({ check: name, ok: true, detail }));
  } catch (e) {
    let detail = (e instanceof Error ? e.message : String(e)).split("\n")[0];
    // Diagnostics: what the page actually showed, and any console errors (React logs render errors there).
    const text = await page.locator("body").innerText({ timeout: 3000 }).catch(() => "");
    detail += ` | page: ${text.replace(/\s+/g, " ").slice(0, 300)}${consoleErrors.length ? ` | console: ${consoleErrors.slice(-2).join(" || ")}` : ""}`;
    results.push({ check: name, ok: false });
    console.log(JSON.stringify({ check: name, ok: false, detail, url: page.url() }));
  }
}
const reload = async (marker) => {
  await page.reload();
  // Visible text only: the dashboard's project picker also contains every title as a hidden <option>.
  await page.getByText(marker).locator("visible=true").first().waitFor();
};

const TITLE = `Live check ${new Date().toISOString().slice(0, 16)}`;
let projectUrl = "";

await check("sign in through the real form", async () => {
  await page.goto(WEB + "/sign-in");
  await page.getByLabel("Email").fill(env("SMOKE_EMAIL"));
  await page.getByLabel("Password").fill(env("SMOKE_PASSWORD"));
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard");
  await page.getByRole("button", { name: "+ New Project" }).waitFor();
});
await check("create a project, reload: still listed", async () => {
  await page.getByRole("button", { name: "+ New Project" }).click();
  await page.getByPlaceholder("Project title").fill(TITLE);
  await page.getByRole("button", { name: "Create project" }).click();
  await page.getByText(TITLE).locator("visible=true").first().waitFor();
  await reload(TITLE);
});
await check("scriptwriter: save + approve, reload: still approved", async () => {
  await page.getByRole("link", { name: new RegExp(TITLE) }).first().click();
  await page.waitForURL("**/scriptwriter");
  projectUrl = page.url().replace(/\/scriptwriter$/, "");
  await page.locator("main nav button", { hasText: "Edit & Refine" }).click();
  await page.getByText("Insert a short example").click();
  await page.getByRole("button", { name: "Save version" }).click();
  await page.getByText("Saved as version 1.").waitFor();
  await page.getByRole("button", { name: "Approve script" }).click();
  await page.getByText(/Script approved/).waitFor();
  await page.reload();
  await page.getByText("Powerful Screenplay").waitFor();
  await page.locator("main nav button", { hasText: "Edit & Refine" }).click();
  await page.getByRole("button", { name: "Approved ✓" }).waitFor();
  if (!(await page.locator("textarea").inputValue()).includes("They buried it. But not deep enough.")) throw new Error("script text lost after reload");
});
await check("casting: find characters, reload: still there", async () => {
  await page.goto(projectUrl + "/casting");
  await page.getByRole("button", { name: "Find characters in script" }).click();
  await page.getByText(/Up to date with approved script version 1/).waitFor();
  await reload(/Up to date with approved script version 1/);
  await page.getByText("Tunde Okafor").first().waitFor();
});
await check("casting look panel: generate a character's reference views; images appear; reload: still there", async () => {
  await page.goto(projectUrl + "/casting");
  await page.getByRole("button", { name: /Tunde Okafor/ }).first().click();
  await page.getByRole("button", { name: "Look & References" }).click();
  const panel = page.getByRole("region", { name: "Look and references" });
  await panel.getByTestId("look-identity").getByText(/^Tunde Okafor/).waitFor();
  await panel.getByTestId("sketch-reads").getByText(/AuraSketch draws/).waitFor();
  await panel.getByRole("button", { name: /Generate look set \(8 views\)/ }).click();
  await panel.getByText("8 of 16 made").waitFor({ timeout: 90000 });
  await panel.getByTestId("look-front:CU").locator("img").waitFor();
  await page.reload();
  await page.getByRole("button", { name: /Tunde Okafor/ }).first().click();
  await page.getByTestId("character-portrait").waitFor();
  await page.getByRole("button", { name: "Look & References" }).click();
  await panel.getByText("8 of 16 made").waitFor();
  await panel.getByTestId("look-back:FULL").locator("img").waitFor();
});
await check("casting: one click makes the looks for the whole cast; a second click only fills gaps; reload: views there", async () => {
  await page.goto(projectUrl + "/casting");
  const bar = page.getByTestId("cast-looks");
  await bar.getByRole("button", { name: "Generate all character looks" }).click();
  // Tunde's views were made above, so only the rest of the cast (if any) is asked for.
  const first = await bar.getByText(/^(Making \d+ views? for \d+ characters?|Nothing new to make)/).textContent({ timeout: 60000 });
  await bar.getByRole("button", { name: "Generate all character looks" }).click();
  await bar.getByText(/^Nothing new to make/).waitFor({ timeout: 60000 });
  await page.reload();
  await page.getByTestId("cast-looks").waitFor();
  await page.getByRole("button", { name: /Tunde Okafor/ }).first().click();
  await page.getByRole("button", { name: "Look & References" }).click();
  await page.getByRole("region", { name: "Look and references" }).getByText("8 of 16 made").waitFor();
  return first.slice(0, 120);
});
await check("casting Voice DNA: the voice comes from the profile and says why; reload: same", async () => {
  await page.getByRole("button", { name: "Voice DNA" }).click();
  const d = await page.getByTestId("voice-description").innerText();
  if (!/voice, (low|mid|high) register, (slow|medium|quick) pace/.test(d)) throw new Error("no voice description: " + d);
  await page.getByRole("list", { name: "Why this voice" }).waitFor();
  await page.reload();
  await page.getByRole("button", { name: /Tunde Okafor/ }).first().click();
  await page.getByRole("button", { name: "Voice DNA" }).click();
  await page.getByTestId("voice-description").getByText(d).waitFor();
  return d;
});
await check("locations & props: find them in the script, describe one, make its views in the worker; reload: kept", async () => {
  await page.goto(projectUrl + "/world");
  await page.getByTestId("world-sync-state").waitFor();
  await page.getByRole("button", { name: "Find locations & props in the script" }).click();
  await page.getByText(/Found 2 locations and \d+ props? in script version 1/).waitFor();
  await page.getByRole("list", { name: "Locations" }).getByRole("button", { name: /Lagos Harbour/ }).click();
  await page.getByLabel("Description").fill("Rusting cranes and stacked containers at first light");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("status").getByText("Saved.").waitFor();
  await page.getByRole("button", { name: /Generate reference set \(3 views\)/ }).click();
  await page.getByTestId("world-summary").getByText("3 of 4 made").waitFor({ timeout: 90000 });
  await page.getByTestId("view-establishing:DAWN").locator("img").waitFor();
  await page.reload();
  await page.getByRole("list", { name: "Locations" }).getByRole("button", { name: /Lagos Harbour/ }).click();
  if ((await page.getByLabel("Description").inputValue()) !== "Rusting cranes and stacked containers at first light") throw new Error("description lost after reload");
  await page.getByTestId("world-summary").getByText("3 of 4 made").waitFor();
  await page.getByRole("tab", { name: /Props/ }).click();
  await page.getByRole("list", { name: "Props" }).getByRole("button", { name: /Laptop/ }).waitFor();
  return "harbour: 3 views; props include Laptop";
});
await check("locations & props: Describe with AI — Ask AuraStage suggests, apply shows it at once; reload: kept; undo: back", async () => {
  await page.goto(projectUrl + "/world");
  await page.getByRole("list", { name: "Locations" }).getByRole("button", { name: /Lagos Harbour/ }).click();
  const before = await page.getByLabel("Description").inputValue();
  await page.getByRole("button", { name: "Describe with AI" }).click();
  const ask = page.getByRole("complementary", { name: "Ask AuraStage" });
  // With a paid AI connected the request waits, with its cost shown, until Ask is pressed (owner: cost before spending).
  await ask.getByTestId("cost-note").waitFor({ timeout: 30000 });
  const cost = await ask.getByTestId("cost-total").textContent();
  if (await ask.getByText("Check the cost below, then press Ask.").count()) await ask.getByRole("button", { name: "Ask", exact: true }).click();
  await ask.getByRole("button", { name: /^Apply/ }).waitFor({ timeout: 120000 });
  await ask.getByRole("button", { name: /^Apply/ }).click();
  await ask.getByText("Applied", { exact: true }).first().waitFor({ timeout: 60000 });
  // The page re-reads by itself: the new description shows without a reload.
  await page.waitForFunction((b) => { const t = document.querySelector('textarea[aria-label="Description"]'); return t && t.value !== b && t.value.length > 0; }, before, { timeout: 15000 });
  const after = await page.getByLabel("Description").inputValue();
  await page.reload();
  await page.getByRole("list", { name: "Locations" }).getByRole("button", { name: /Lagos Harbour/ }).click();
  if ((await page.getByLabel("Description").inputValue()) !== after) throw new Error("AI description lost after reload");
  await page.getByRole("button", { name: "Ask AuraStage" }).click();
  await ask.getByRole("region", { name: "Recent requests" }).getByRole("button", { name: /Describe the location "Lagos Harbour"/ }).first().click();
  await ask.getByRole("button", { name: "Undo", exact: true }).click();
  await page.waitForFunction((b) => document.querySelector('textarea[aria-label="Description"]')?.value === b, before, { timeout: 15000 });
  await ask.getByRole("button", { name: "Close" }).click();
  return `cost shown before asking: ${cost} · ${after.slice(0, 80)}`;
});
await check("dialogue: bring in + approve scene, reload: still approved", async () => {
  await page.goto(projectUrl + "/dialogue");
  await page.getByRole("button", { name: "Bring in dialogue" }).click();
  await page.getByText(/Dialogue updated from the approved script/).waitFor();
  await page.getByRole("button", { name: /INT\. TUNDE'S APARTMENT/ }).click();
  await page.getByRole("button", { name: "Approve scene dialogue" }).click();
  await page.getByText(/Approved all 1 line/).waitFor();
  await reload("They buried it. But not deep enough.");
  await page.getByRole("button", { name: /INT\. TUNDE'S APARTMENT/ }).click();
  await page.getByRole("button", { name: "Scene approved ✓" }).waitFor();
});
await check("scene dna: save, reload: kept; lock, reload: still locked", async () => {
  await page.goto(projectUrl + "/scene-dna");
  await page.getByText("Production Blueprint").waitFor();
  await page.getByRole("button", { name: /INT\. TUNDE'S APARTMENT/ }).click();
  await page.getByLabel("Purpose").fill("Tunde decides to publish.");
  await page.getByRole("button", { name: "Save Scene DNA" }).click();
  await page.getByText("Scene DNA saved.").waitFor();
  await reload("Production Blueprint");
  if ((await page.getByLabel("Purpose").inputValue()) !== "Tunde decides to publish.") throw new Error("purpose lost after reload");
  await page.getByRole("button", { name: "Lock Scene DNA" }).click();
  await page.getByText(/Scene DNA locked as version 1/).waitFor();
  await reload("Production Blueprint");
  await page.getByRole("button", { name: "Locked · version 1 ✓" }).waitFor();
});
await check("storyboard: plan shots, reload: kept; edit, reload: kept; approve, reload: approved", async () => {
  await page.goto(projectUrl + "/storyboard");
  await page.getByText("Cinematic Precision").waitFor();
  await page.getByRole("button", { name: /INT\. TUNDE'S APARTMENT/ }).first().click();
  await page.getByRole("button", { name: "Plan shots from Scene DNA" }).click();
  await page.getByText(/Planned \d+ shots (?:\(\w+ coverage\) )?from Scene DNA version 1/).waitFor();
  await reload("Cinematic Precision");
  await page.getByRole("button", { name: "Shot 1", exact: true }).click();
  await page.getByLabel("Angle").selectOption({ label: "Low" });
  await page.getByRole("button", { name: "Save shot" }).click();
  await page.getByText("Shot 1 saved.").waitFor();
  await reload("Cinematic Precision");
  await page.getByRole("button", { name: "Shot 1", exact: true }).click();
  if ((await page.getByLabel("Angle").inputValue()) !== "low") throw new Error("shot edit lost after reload");
  await page.getByRole("button", { name: "Approve shot plan" }).click();
  await page.getByText(/Shot plan approved as version 1/).waitFor();
  await reload("Cinematic Precision");
  await page.getByRole("button", { name: "Approved · version 1 ✓" }).waitFor();
});
await check("visual: compile, generate a sketch take, approve; reload: still approved", async () => {
  await page.goto(projectUrl + "/visual");
  await page.getByText("Stunning Visuals").waitFor();
  await page.getByRole("button", { name: "Compile prompt" }).click();
  await page.getByText("Prompt compiled from the approved shot plan.").waitFor();
  await page.getByRole("button", { name: "Generate shot" }).click();
  await page.getByRole("img", { name: "Take V1" }).waitFor({ timeout: 90000 });
  await reload("Stunning Visuals");
  await page.getByRole("img", { name: "Take V1" }).waitFor();
  await page.getByRole("button", { name: "Approve take" }).click();
  await page.getByText("Take V1 approved for this shot.").waitFor();
  await reload("Stunning Visuals");
  await page.getByRole("button", { name: "Un-approve" }).waitFor();
});
await check("audio: spot, upload a WAV onto the line, measure, approve, export; reload after each: kept", async () => {
  const fs = await import("node:fs");
  const sr = 48000, n = sr * 2, data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(3277 * Math.sin((2 * Math.PI * 440 * i) / sr)), i * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8); h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(data.length, 40);
  const file = "/tmp/live-line.wav";
  fs.writeFileSync(file, Buffer.concat([h, data]));
  await page.goto(projectUrl + "/audio");
  await page.getByText("Professional Sound for").waitFor();
  await page.getByRole("button", { name: "Spot audio from the shot plan" }).click();
  await page.getByText(/Spotted \d+ cues on \d+ tracks from shot plan version 1/).waitFor();
  await reload("Professional Sound for");
  const cue = page.getByRole("button", { name: /^Clip .*They buried it/ });
  await cue.click();
  await page.getByLabel("Upload a recording for this clip").setInputFiles(file);
  await page.getByText("“live-line.wav” uploaded and placed on the clip.").waitFor();
  await reload("Professional Sound for");
  await page.getByRole("button", { name: "Clip live-line" }).locator("svg path").waitFor({ timeout: 30000 });
  await page.getByRole("button", { name: "Measure mix" }).click();
  const msg = await page.getByText(/Measured the rendered mix: /).innerText();
  const lufs = Number((msg.match(/(-\d+\.\d) LUFS/) || [])[1]);
  if (!(lufs < -15 && lufs > -50)) throw new Error("implausible loudness: " + msg);
  await reload("Professional Sound for");
  await page.getByLabel("Loudness measurement").getByText(lufs.toFixed(1)).waitFor();
  await page.getByRole("button", { name: "Approve scene mix" }).click();
  await page.getByText("Scene mix approved as version 1.").waitFor();
  await reload("Professional Sound for");
  await page.getByRole("button", { name: "Approved · version 1 ✓" }).waitFor();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Full mix" }).click()]);
  const out = "/tmp/live-mix.wav";
  await dl.saveAs(out);
  const b = fs.readFileSync(out);
  if (b.subarray(0, 4).toString() !== "RIFF" || b.readUInt32LE(24) !== 48000) throw new Error("export is not a 48 kHz WAV");
  return `${msg} · export ${b.length} bytes`;
});
await check("audio: speak the line in Tunde's Voice DNA with the built-in voice (worker); listen; reload: kept", async () => {
  await page.getByRole("button", { name: "Clip live-line" }).click();
  const v = page.getByRole("region", { name: "Generate this voice" });
  await v.getByRole("button", { name: "Generate voice" }).click();
  await v.getByTestId("generation").getByText("Ready").waitFor({ timeout: 90000 });
  const label = await v.getByTestId("generation").first().innerText();
  if (!/Built-in neural voice/.test(label)) throw new Error("not the built-in neural voice: " + label);
  await v.getByRole("button", { name: "▶ Listen" }).click();
  await v.getByLabel("Generated sound").waitFor();
  await reload("Professional Sound for");
  await page.getByRole("button", { name: "Clip live-line" }).click();
  await page.getByRole("region", { name: "Generate this voice" }).getByTestId("generation").getByText("Ready").waitFor();
  return label.replace(/\s+/g, " ");
});
await check("editorial: build the assembly, blade, lift offline shots, lock; reload after each: kept", async () => {
  const marker = "Perfect Your Film";
  const v1 = () => page.getByRole("group", { name: "Track V1" }).getByRole("button", { name: /^Clip / });
  await page.goto(projectUrl + "/editorial");
  await page.getByText(marker).waitFor();
  await page.getByRole("button", { name: "Build first assembly" }).click();
  await page.getByText(/Assembled 1 scene from approved shots/).waitFor();
  await reload(marker);
  await page.getByRole("group", { name: "Track A1" }).getByRole("button", { name: /^Clip Scene 1 mix v1/ }).waitFor();
  const n = await v1().count();
  await page.getByLabel("Viewer").click();
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("b");
  await page.getByText(/in two/).first().waitFor();
  await reload(marker);
  if ((await v1().count()) !== n + 1) throw new Error("blade lost after reload");
  for (let i = 0; i < 10; i++) {
    const slug = page.getByRole("group", { name: "Track V1" }).getByRole("button", { name: /no approved take|take too short|No shot covers/ }).first();
    if (!(await slug.count())) break;
    await slug.click();
    await page.keyboard.press("Delete");
    await page.getByText(/^Lifted “/).first().waitFor();
  }
  await page.getByRole("button", { name: "Lock picture" }).click();
  await page.getByText(/Picture locked \(lock 1\)/).waitFor();
  await reload(marker);
  await page.getByText("Locked · Picture Lock 1 ✓").waitFor();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export EDL" }).click()]);
  const fs = await import("node:fs");
  await dl.saveAs("/tmp/live.edl");
  const edl = fs.readFileSync("/tmp/live.edl", "utf8");
  if (!edl.includes("FCM: NON-DROP FRAME")) throw new Error("bad EDL");
  return `${n + 1} picture clips before lifting offline shots · EDL ${edl.split("\n").length} lines`;
});
await check("export: render the Streaming Master from the lock; QC passed; reload: kept; download is a real MP4", async () => {
  const marker = "Every Screen";
  await page.goto(projectUrl + "/export");
  await page.getByText(marker).waitFor();
  await page.getByText("Ready to render").waitFor();
  await page.getByRole("button", { name: "Render Streaming Master" }).click();
  await page.getByText(/Streaming Master queued/).waitFor();
  const d = page.getByRole("listitem", { name: "Deliverable Streaming Master" }).first();
  await d.getByText(/QC (passed|failed)/).waitFor({ timeout: 240000 });
  await reload(marker);
  await d.getByText("QC passed").waitFor();
  await d.getByRole("cell", { name: "streaming_1080p24.mp4", exact: true }).waitFor();
  const [dl] = await Promise.all([page.waitForEvent("download"), d.getByRole("link", { name: "Download streaming_1080p24.mp4" }).click()]);
  await dl.saveAs("/tmp/live-master.mp4");
  const fs = await import("node:fs");
  const b = fs.readFileSync("/tmp/live-master.mp4");
  if (b.subarray(4, 8).toString() !== "ftyp") throw new Error("download is not an MP4");
  await page.getByLabel("Preview").waitFor();
  return `master ${(b.length / 1024).toFixed(0)} KB`;
});
await check("team: invite someone as Editor, get a private link; reload: the invite waits; cancel it; reload: gone", async () => {
  const marker = "Make Films";
  await page.goto(projectUrl + "/team");
  await page.getByText(marker).waitFor();
  await page.getByTestId("my-access").getByText("Your role: Studio owner").waitFor();
  await page.getByLabel("Email").fill("invitee.live@aurastage.invalid");
  await page.getByLabel("Role on this project").selectOption("editor");
  await page.getByRole("button", { name: "Create invite link" }).click();
  const link = await page.getByLabel("Invite link").inputValue();
  if (!/\/invite#[0-9a-f]{48}$/.test(link)) throw new Error("bad invite link");
  await reload(marker);
  const row = page.getByTestId("invite-invitee.live@aurastage.invalid");
  await row.getByText(/Editor · expires/).waitFor();
  await row.getByRole("button", { name: "Cancel invite" }).click();
  await page.getByRole("status").getByText(/cancelled/).waitFor();
  await reload(marker);
  if (await page.getByTestId("invite-invitee.live@aurastage.invalid").count()) throw new Error("invite still listed after reload");
});
await check("comments: pin a comment to the timeline's timecode in Editorial; reload: still there; resolve it; reload: resolved", async () => {
  const marker = "Perfect Your Film";
  await page.goto(projectUrl + "/editorial");
  await page.getByText(marker).first().waitFor();
  const drawer = page.getByRole("complementary", { name: "Comments" });
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await drawer.getByLabel("Write a comment").fill("Live check: trim the head of this shot.");
  await drawer.getByRole("button", { name: "Comment", exact: true }).click();
  await drawer.getByText("Live check: trim the head of this shot.").waitFor();
  await drawer.getByRole("button", { name: /^⏱ / }).first().waitFor();
  await page.reload();
  await page.getByText(marker).first().waitFor();
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await drawer.getByText("Live check: trim the head of this shot.").waitFor();
  await drawer.getByRole("button", { name: "Resolve" }).first().click();
  await drawer.getByText("No open comments here.").waitFor();
  await page.reload();
  await page.getByText(marker).first().waitFor();
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await drawer.getByRole("tab", { name: "resolved" }).click();
  await drawer.getByText("Live check: trim the head of this shot.").waitFor();
});
await check("settings: open Project Settings from the sidebar, review and save; reload: kept; Export marks the required deliverable", async () => {
  await page.goto(projectUrl + "/scriptwriter");
  await page.getByRole("link", { name: "Project Settings" }).click();
  await page.waitForURL("**/settings");
  await page.getByRole("region", { name: "Story & Creative Summary" }).getByText("Inherited").waitFor();
  await page.getByLabel("Look").fill("Live check look: warm tungsten, soft contrast");
  await page.getByLabel("Director").fill("Live Check Director");
  await page.getByRole("region", { name: "Delivery targets" }).getByLabel("Streaming Master").click();
  await page.getByRole("button", { name: "Review changes" }).click();
  const dlg = page.getByRole("dialog", { name: "What this changes" });
  await dlg.getByText(/Written into files rendered from now on/).waitFor();
  await dlg.getByRole("button", { name: "Save settings" }).click();
  await page.getByRole("status").getByText(/Saved as settings version 1/).waitFor();
  await page.reload();
  await page.getByTestId("settings-version").getByText(/Version 1/).waitFor();
  if ((await page.getByLabel("Director").inputValue()) !== "Live Check Director") throw new Error("director not kept after reload");
  if ((await page.getByLabel("Look").inputValue()) !== "Live check look: warm tungsten, soft contrast") throw new Error("look not kept after reload");
  await page.goto(projectUrl + "/export");
  await page.getByRole("list", { name: "Presets" }).getByRole("button", { name: /Streaming Master/ }).first().getByText("Required").waitFor();
});
await check("settings: Ask AuraStage sets who wrote the music and turns on the end credits; shown at once; reload: kept; undo: back", async () => {
  await page.goto(projectUrl + "/settings");
  await page.getByLabel("Music by").waitFor();
  const before = await page.getByLabel("Music by").inputValue();
  const t = page.getByRole("group", { name: "Titles and credits" });
  const creditsBefore = await t.getByLabel("End credits").isChecked();
  await page.getByRole("button", { name: "Ask AuraStage" }).click();
  const ask = page.getByRole("complementary", { name: "Ask AuraStage" });
  await ask.getByLabel("What would you like to change?").fill('Set the composer to "Ama Mensah" and turn on the end credits.');
  await ask.getByRole("button", { name: "Ask", exact: true }).click();
  await ask.getByRole("button", { name: "Apply", exact: true }).waitFor({ timeout: 120000 });
  await ask.getByRole("button", { name: "Apply", exact: true }).click();
  await ask.getByTestId("proposal-status").getByText("Applied").waitFor({ timeout: 60000 });
  for (let i = 0; i < 60 && (await page.getByLabel("Music by").inputValue()) !== "Ama Mensah"; i++) await page.waitForTimeout(250);
  if ((await page.getByLabel("Music by").inputValue()) !== "Ama Mensah") throw new Error("composer not shown without a reload");
  if (!(await t.getByLabel("End credits").isChecked())) throw new Error("end credits not on");
  await ask.getByRole("button", { name: "Close" }).click();
  await page.reload();
  if ((await page.getByLabel("Music by").inputValue()) !== "Ama Mensah") throw new Error("not kept after reload");
  await page.getByRole("button", { name: "Ask AuraStage" }).click();
  await ask.getByRole("region", { name: "Recent requests" }).getByRole("button", { name: /Set the composer/ }).first().click();
  await ask.getByRole("button", { name: "Undo", exact: true }).click();
  await ask.getByTestId("proposal-status").getByText("Undone").waitFor({ timeout: 60000 });
  for (let i = 0; i < 60 && (await page.getByLabel("Music by").inputValue()) !== before; i++) await page.waitForTimeout(250);
  if ((await page.getByLabel("Music by").inputValue()) !== before || (await t.getByLabel("End credits").isChecked()) !== creditsBefore) throw new Error("undo didn't restore");
  await ask.getByRole("button", { name: "Close" }).click();
  return "composer + end credits, undone";
});
await check("assets: upload an image through the file picker, tag it, add it to a scene; reload: kept; replace makes v2; edit makes v3", async () => {
  const fs = await import("node:fs");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  const png2 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGPQqLgDAAJIAX2aqSu/AAAAAElFTkSuQmCC", "base64");
  fs.writeFileSync("/tmp/live-ref.png", png);
  fs.writeFileSync("/tmp/live-ref-v2.png", png2);
  await page.goto(projectUrl + "/scriptwriter");
  await page.getByRole("link", { name: "Assets Library" }).click();
  await page.waitForURL("**/assets");
  await page.getByText("Organised. Searchable. Ready.").waitFor();
  await page.getByRole("tab", { name: /Locations/ }).click();
  await page.getByLabel("File to upload").setInputFiles("/tmp/live-ref.png");
  await page.getByRole("dialog", { name: "Add asset" }).getByLabel("Asset name").fill("Live check reference");
  await page.getByRole("dialog", { name: "Add asset" }).getByRole("button", { name: "Add to library" }).click();
  await page.getByRole("status").getByText("Added “Live check reference”.").waitFor();
  const card = page.getByRole("list", { name: "Assets" }).getByRole("button", { name: /Live check reference/ });
  const detail = page.getByRole("complementary", { name: "Asset details" });
  await detail.getByLabel("Tags").fill("live, exterior");
  await detail.getByRole("button", { name: "Save details" }).click();
  await page.getByRole("status").getByText("Saved.").waitFor();
  await detail.getByRole("tab", { name: "Usage" }).click();
  await detail.getByLabel("Scene to add to").selectOption({ index: 1 });
  await detail.getByRole("button", { name: "Add to Scene" }).click();
  await page.getByRole("status").getByText("Linked.").waitFor();
  await page.reload();
  await card.getByText(/Used in Scene 1/).waitFor();
  if ((await detail.getByLabel("Tags").inputValue()) !== "exterior, live") throw new Error("tags not kept after reload");
  await detail.getByLabel("Replacement file").setInputFiles("/tmp/live-ref-v2.png");
  await page.getByRole("status").getByText(/Saved as a new version/).waitFor();
  await page.reload();
  await card.getByText("v2").waitFor();
  await detail.getByRole("tab", { name: "Versions" }).click();
  await detail.getByRole("list", { name: "Versions" }).getByText(/v1 · /).waitFor();
  // Edit in the browser: rotate, saved as v3 with a note of the edit; reload keeps it.
  await detail.getByRole("button", { name: "Edit…" }).click();
  const ed = page.getByRole("dialog", { name: /^Edit Live check reference/ });
  await ed.getByRole("button", { name: "⟳ Rotate right" }).click();
  await ed.getByRole("button", { name: "Save as new version" }).click();
  await page.getByRole("status").getByText(/Saved as a new version/).waitFor();
  await page.reload();
  await card.getByText("v3").waitFor();
  await detail.getByRole("tab", { name: "Versions" }).click();
  await detail.getByRole("list", { name: "Versions" }).getByText(/Edited in AuraStage from v2: rotated 90°/).waitFor();
});
await check("ask AuraStage: suggest a tone change, see before → after, apply; reload: kept; undo; reload: gone", async () => {
  await page.goto(projectUrl + "/scriptwriter");
  const panel = page.getByRole("complementary", { name: "Ask AuraStage" });
  const story = page.getByRole("region", { name: "Story & Creative Summary" });
  await page.getByRole("button", { name: "Ask AuraStage" }).click();
  await panel.getByLabel("What would you like to change?").fill("Change the tone to Tense and brooding");
  // The cost of asking is shown before anything is sent (owner request 2026-09-30).
  await panel.getByTestId("cost-note").waitFor({ timeout: 20000 });
  await panel.getByRole("button", { name: "Ask", exact: true }).click();
  // Planned by the generation worker; allow for its poll interval.
  await panel.getByTestId("proposal-status").getByText("Suggested").waitFor({ timeout: 90000 });
  await panel.getByTestId("change").getByRole("cell", { name: "Tense and brooding" }).waitFor();
  const label = (await panel.getByTestId("test-output").count()) ? "test output" : "AI";
  await panel.getByRole("button", { name: "Apply" }).click();
  await panel.getByTestId("proposal-status").getByText("Applied").waitFor();
  await page.goto(projectUrl + "/settings");
  await page.reload();
  await story.getByText("Tense and brooding").waitFor();
  await page.getByRole("button", { name: "Ask AuraStage" }).click();
  await panel.getByRole("region", { name: "Recent requests" }).getByRole("button", { name: /Change the tone to Tense and brooding/ }).first().click();
  await panel.getByRole("button", { name: "Undo", exact: true }).click();
  await panel.getByTestId("proposal-status").getByText("Undone").waitFor();
  await page.reload();
  await story.getByText("Inherited").waitFor();
  if (await story.getByText("Tense and brooding").count()) throw new Error("tone still shown after undo");
  return label;
});
await check("help: open Help from a workspace; live status and the assistant answer; account shows this device", async () => {
  await page.goto(projectUrl + "/export");
  await page.getByText("Every Screen").waitFor();
  await page.getByRole("link", { name: "Help & Support" }).click();
  await page.getByText("Every Step").waitFor();
  const status = page.getByRole("list", { name: "System status" });
  await status.getByText("AuraStage API").waitFor();
  const render = await status.getByTestId("status-worker:render-worker").innerText();
  await page.getByLabel("Ask the assistant").fill("How do I render an mp4?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await page.getByTestId("assistant-answer").getByText("Rendering deliverables").waitFor();
  await page.getByRole("link", { name: "Account & security" }).click();
  await page.getByTestId("session-current").waitFor();
  await page.reload();
  await page.getByTestId("session-current").waitFor();
  return render.replace(/\s+/g, " ");
});
await check("studio mixer: dialogue clean-up on the dialogue channel and hall reverb routing; reload: kept", async () => {
  await page.goto(projectUrl + "/audio");
  await page.getByText("Professional Sound for").waitFor();
  const strip = page.getByRole("button", { name: /^Channel strip DX/ }).first();
  await strip.click();
  const ed = page.getByRole("region", { name: /^Channel strip editor DX/ });
  await ed.getByRole("button", { name: /Dialogue clean-up preset/ }).click();
  await ed.getByRole("img", { name: "EQ curve" }).waitFor();
  await ed.getByRole("button", { name: "Save channel" }).click();
  await page.getByText(/channel strip — measure the mix again/).waitFor();
  const routing = page.getByRole("region", { name: "Buses and master" });
  await routing.getByLabel("Reverb type").selectOption("hall");
  await routing.getByRole("button", { name: "Save routing" }).click();
  await page.getByText(/Mix routing saved/).waitFor();
  await reload("Professional Sound for");
  await page.getByRole("button", { name: /^Channel strip DX/ }).first().getByText(/HPF · EQ/).waitFor();
  if ((await page.getByRole("region", { name: "Buses and master" }).getByLabel("Reverb type").inputValue()) !== "hall") throw new Error("routing lost after reload");
  return "HPF + presence EQ on dialogue, hall reverb";
});
await check("mixer presets: phone-call channel preset (low-pass 3.4 kHz) and the Horror genre template; reload: kept", async () => {
  await page.getByRole("button", { name: /^Channel strip DX/ }).first().click();
  const ed = page.getByRole("region", { name: /^Channel strip editor DX/ });
  await ed.getByLabel("Channel preset", { exact: true }).selectOption({ label: "Phone call" });
  await ed.getByRole("button", { name: "Apply preset" }).click();
  if ((await ed.getByLabel("Low-pass (0 = off)").inputValue()) !== "3400") throw new Error("low-pass not set");
  await ed.getByRole("button", { name: "Save channel" }).click();
  await page.getByText(/channel strip — measure the mix again/).waitFor();
  const routing = page.getByRole("region", { name: "Buses and master" });
  await routing.getByLabel("Mix template").selectOption({ label: "Horror" });
  await routing.getByRole("button", { name: "Apply template" }).click();
  await routing.getByRole("button", { name: "Save routing" }).click();
  await page.getByText(/Mix routing saved/).waitFor();
  await reload("Professional Sound for");
  await page.getByRole("button", { name: /^Channel strip DX/ }).first().getByText(/LPF/).waitFor();
  return "phone call on DX, horror template";
});
await check("AI & Generation page: every generator's state with proof from this project; reload: same", async () => {
  await page.goto(projectUrl + "/scriptwriter");
  await page.getByRole("link", { name: "AI & Generation" }).click();
  await page.waitForURL("**/generation");
  await page.getByTestId("cap-storyboard").getByText("Working — proven").waitFor();
  await page.getByTestId("cap-voice").getByText("Working — proven").waitFor();
  await page.getByTestId("cap-world_refs").getByText("Working — proven").waitFor();
  await page.reload();
  await page.getByTestId("cap-assistant").getByText(/Working — proven|Ready — not tried yet/).first().waitFor();
  return await page.getByTestId("readiness-summary").innerText();
});
await check("dashboard after reload still shows the project, with its production overview", async () => {
  await page.goto(WEB + "/dashboard");
  await reload(TITLE);
  const script = page.getByTestId("stage-scriptwriter");
  await script.waitFor();
  await script.getByText(/Version \d+ approved/).waitFor({ timeout: 15000 }).catch(async () => {
    throw new Error("scriptwriter card says: " + (await script.innerText()).replace(/\s+/g, " ").slice(0, 200));
  });
  await script.getByRole("button", { name: "Why?" }).click();
  await script.getByText(/A version is approved/).waitFor();
  return await page.getByTestId("stages-complete").innerText();
});
await check("no browser errors on any page", async () => {
  if (pageErrors.length) throw new Error(pageErrors.slice(0, 3).join(" | "));
});

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`SUMMARY ${results.length - failed.length}/${results.length} passed${failed.length ? " — FAILURES: " + failed.map((r) => r.check).join("; ") : ""}`);
