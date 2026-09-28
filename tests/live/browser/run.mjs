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
page.on("dialog", (d) => d.accept());

async function check(name, fn) {
  try {
    const detail = (await fn()) ?? undefined;
    results.push({ check: name, ok: true });
    console.log(JSON.stringify({ check: name, ok: true, detail }));
  } catch (e) {
    const detail = (e instanceof Error ? e.message : String(e)).split("\n")[0];
    results.push({ check: name, ok: false });
    console.log(JSON.stringify({ check: name, ok: false, detail, url: page.url() }));
  }
}
const reload = async (marker) => {
  await page.reload();
  await page.getByText(marker).first().waitFor();
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
  await page.getByText(TITLE).first().waitFor();
  await reload(TITLE);
});
await check("scriptwriter: save + approve, reload: still approved", async () => {
  await page.getByText(TITLE).first().click();
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
  await page.getByText(/Planned \d+ shots from Scene DNA version 1/).waitFor();
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
await check("dashboard after reload still shows the project", async () => {
  await page.goto(WEB + "/dashboard");
  await reload(TITLE);
});
await check("no browser errors on any page", async () => {
  if (pageErrors.length) throw new Error(pageErrors.slice(0, 3).join(" | "));
});

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`SUMMARY ${results.length - failed.length}/${results.length} passed${failed.length ? " — FAILURES: " + failed.map((r) => r.check).join("; ") : ""}`);
