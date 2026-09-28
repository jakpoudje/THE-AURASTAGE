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
await check("assets: upload an image through the file picker, tag it, add it to a scene; reload: kept; replace makes v2", async () => {
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
  await page.getByRole("button", { name: "Ask" }).click();
  await page.getByTestId("assistant-answer").getByText("Rendering deliverables").waitFor();
  await page.getByRole("link", { name: "Account & security" }).click();
  await page.getByTestId("session-current").waitFor();
  await page.reload();
  await page.getByTestId("session-current").waitFor();
  return render.replace(/\s+/g, " ");
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
