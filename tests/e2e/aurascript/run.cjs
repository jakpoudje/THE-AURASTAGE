// Browser test: AuraScript — develop the story, build and edit the outline, write the full script in the background,
// open it as a draft, approve it, rework a scene, run the continuity check, and see the written characters reach
// Casting. Uses the labelled test writer (TEST OUTPUT), so it needs no paid model.
// Needs tests/e2e/scriptwriter/mock-api.cjs on :3911 (fresh) and the web app on :3902 (see one.sh).
const { chromium } = require("playwright");
const BASE = "http://localhost:3902", API = "http://localhost:3911", P = "11111111-1111-4111-8111-111111111111";
const OUT = process.env.E2E_OUT || require("os").tmpdir();
async function api(method, path, body) {
  const r = await fetch(API + path, { method, headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
  return r.json();
}

(async () => {
  await api("PATCH", `/api/projects/${P}`, { target_runtime_minutes: 12, setting: "Lagos", logline: "A journalist uncovers a buried election fraud." });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  let failed = 0;
  const step = async (name, fn) => {
    try { await fn(); console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, e.message.split("\n")[0]); await page.screenshot({ path: `${OUT}/fail-aurascript-${name.replace(/\W+/g, "_")}.png`, fullPage: true }); }
  };
  await page.goto(BASE + "/");
  await page.evaluate(() => localStorage.setItem("sb-localhost-auth-token", JSON.stringify({ access_token: "f", refresh_token: "f", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 36000, user: { id: "u1", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "" } })));
  const stepTab = (label) => page.locator("main nav button", { hasText: label }).click();

  await step("Story Development: develop the story from Project Setup; characters with name reasons; apply chosen fields; reload: applied", async () => {
    await page.goto(`${BASE}/projects/${P}/scriptwriter`);
    await stepTab("Story Development");
    await page.getByRole("button", { name: "Develop with the AI writer (paid)" }).click();
    await page.getByTestId("writing-status-develop_story").getByText("Done").waitFor({ timeout: 15000 });
    await page.getByTestId("writing-status-develop_story").getByText("TEST OUTPUT").waitFor();
    await page.getByRole("list", { name: "Proposed characters" }).getByText("Adaeze Okoro").waitFor();
    await page.getByRole("list", { name: "Story beats" }).getByText("Midpoint", { exact: true }).waitFor();
    await page.getByLabel("Apply Genre").check();
    await page.getByRole("button", { name: "Apply selected to Project Setup" }).click();
    await page.getByText(/Applied to Project Setup: logline, synopsis, genre/).waitFor();
    const p = await api("GET", `/api/projects/${P}`);
    if (!/TEST OUTPUT/.test(p.synopsis)) throw new Error("synopsis not applied");
    await page.screenshot({ path: `${OUT}/aurascript-development.png` });
    await page.reload();
    await stepTab("Story Development");
    await page.getByText(/Applied: logline, synopsis, genre/).waitFor();
  });
  await step("Outline: build it, edit a place, add a scene, save as your own version; reload: kept", async () => {
    await stepTab("Outline & Structure");
    await page.getByRole("button", { name: "Build with the AI writer (paid)" }).click();
    await page.getByTestId("outline-summary").getByText(/^6 scenes · 12 minutes/).waitFor({ timeout: 15000 });
    await page.getByLabel("Scene 1 place").fill("TUNDE'S FLAT");
    await page.getByRole("button", { name: "+ Scene" }).click();
    await page.getByLabel("Scene 7 place").fill("HARBOUR");
    await page.getByRole("button", { name: "Save outline" }).click();
    await page.getByTestId("outline-summary").getByText(/^7 scenes · 14 minutes · your edited version/).waitFor();
    await page.reload();
    await stepTab("Outline & Structure");
    await page.getByTestId("outline-summary").getByText(/7 scenes .* your edited version/).waitFor();
    if ((await page.getByLabel("Scene 1 place").inputValue()) !== "TUNDE'S FLAT") throw new Error("edit not kept");
  });
  await step("Generate Script: the full script is written in the background from the edited outline; open it as a draft; approve", async () => {
    await stepTab("Generate Script");
    await page.getByRole("button", { name: "Write the full script" }).click();
    await page.getByTestId("writing-status-write_script").getByText("Done").waitFor({ timeout: 20000 });
    await page.getByLabel("Script preview").getByText(/INT\. TUNDE'S FLAT - DAY/).first().waitFor();
    await page.screenshot({ path: `${OUT}/aurascript-generate.png` });
    await page.getByRole("button", { name: "Open as a new draft version" }).click();
    await page.getByText(/Opened as draft version 1/).waitFor();
    await page.getByRole("button", { name: "Approve script" }).click();
    await page.getByText(/Script approved/).waitFor();
    const ws = await api("GET", `/api/projects/${P}/script`);
    if (ws.scenes.length !== 7) throw new Error(`approved scenes: ${ws.scenes.length}`);
    if (!/AuraScript: full script/.test(ws.versions.at(-1)?.note ?? ws.current_version.note ?? "")) throw new Error("version note missing");
  });
  await step("Scene tools: expand scene 2, see before → after, use it as a new draft version; continuity check lists its findings", async () => {
    await page.getByLabel("Scene to rework").selectOption("2");
    await page.getByRole("button", { name: "Expand", exact: true }).click();
    const tools = page.getByRole("region", { name: "AI tools" });
    await tools.getByTestId("writing-status-rewrite_scene").getByText("Done").waitFor({ timeout: 15000 });
    await tools.getByLabel("After").getByText(/A pause\. Nobody moves\./).waitFor();
    await tools.getByLabel("Before").waitFor();
    await tools.getByRole("button", { name: "Use this (new draft version)" }).click();
    await page.getByText(/Opened as draft version 2/).waitFor();
    if (!(await page.locator("textarea").first().inputValue()).includes("A pause. Nobody moves.")) throw new Error("editor didn't load the new draft");
    await tools.getByRole("button", { name: "Continuity check" }).click();
    await tools.getByTestId("continuity-summary").getByText(/Version 2: \d+ warnings?, \d+ notes?\./).waitFor();
    await page.screenshot({ path: `${OUT}/aurascript-tools.png` });
  });
  await step("downstream: the written script's characters are found by Casting", async () => {
    await page.getByRole("button", { name: "Approve script" }).click();
    await page.getByText(/Script approved/).waitFor();
    const r = await api("POST", `/api/projects/${P}/characters/sync`, {});
    const cast = await api("GET", `/api/projects/${P}/characters`);
    const names = cast.characters.map((c) => c.name).join(", ");
    if (!/Adaeze/i.test(names) || !/Femi/i.test(names)) throw new Error("characters not found: " + names + " " + JSON.stringify(r).slice(0, 200));
  });
  await step("names stay the same everywhere: edit the story yourself (rename a character) → it becomes the current story; developing again keeps the name", async () => {
    await page.goto(`${BASE}/projects/${P}/scriptwriter`);
    await stepTab("Story Development");
    await page.getByRole("button", { name: "Edit this story" }).click();
    await page.getByLabel("Character 1 name").fill("Kemi Adeyemi");
    await page.getByRole("button", { name: "Save as my story" }).click();
    await page.getByText(/Saved as your story — Outline and Script now use it/).waitFor();
    await page.getByTestId("current-story").waitFor();
    await page.getByRole("list", { name: "Proposed characters" }).getByText("Kemi Adeyemi").waitFor();
    await page.getByTestId("decided-names").getByText(/Kemi Adeyemi/).waitFor();
    await page.getByRole("button", { name: "Develop with the AI writer (paid)" }).click();
    await page.getByTestId("writing-status-develop_story").getByText("Done").waitFor({ timeout: 15000 });
    await page.getByTestId("proposal-not-used").waitFor();
    await page.getByRole("list", { name: "Proposed characters" }).getByText("Kemi Adeyemi").waitFor();
    await page.getByRole("list", { name: "Checks" }).getByText(/Keeps the characters already decided/).waitFor();
    await page.reload();
    await stepTab("Story Development");
    await page.getByTestId("decided-names").getByText(/Kemi Adeyemi/).waitFor();
  });
  await step("the outline says when it was built from an earlier story and rebuilds from the current one (with a live working card)", async () => {
    await stepTab("Outline & Structure");
    await page.getByTestId("outline-story-mismatch").waitFor();
    await page.getByRole("button", { name: "Rebuild from the current story (free)" }).click();
    await page.getByTestId("writing-status-outline").first().waitFor();
    await page.getByTestId("outline-summary").waitFor({ timeout: 15000 });
    await page.waitForFunction(() => !document.querySelector('[data-testid="outline-story-mismatch"]'), null, { timeout: 15000 });
    const chars = await page.getByLabel("Scene 1 characters").inputValue();
    if (!/Kemi Adeyemi/.test(chars)) throw new Error("outline doesn't use the current story's names: " + chars);
  });
  await step("Scene Breakdown is interactive: totals against the target, Edit jumps to the scene in the editor", async () => {
    await stepTab("Scene Breakdown");
    await page.getByTestId("breakdown-total").getByText(/scenes · about/).waitFor();
    await page.getByRole("button", { name: "Open scene 2 in the editor" }).click();
    const sel = await page.getByLabel("Script text").evaluate((el) => el.value.slice(el.selectionStart, el.selectionEnd));
    if (!/^(INT|EXT)\./.test(sel)) throw new Error("editor didn't jump to scene 2's heading: " + sel);
  });
  await step("Character Extraction: checked against the story; rename a character everywhere in the script (then save a version)", async () => {
    await stepTab("Character Extraction");
    const card = page.getByRole("listitem", { name: "Character FEMI" });
    await card.getByText(/In your story|Not in your current story/).waitFor();
    await card.getByRole("button", { name: "Rename everywhere" }).click();
    await card.getByLabel("New name for FEMI").fill("Tayo");
    await card.getByRole("button", { name: "Rename", exact: true }).click();
    await page.getByText(/Renamed FEMI → Tayo: \d+ cues?, \d+ mentions?/).waitFor();
    await stepTab("Edit & Refine");
    const text = await page.getByLabel("Script text").inputValue();
    if (/\nFEMI\n/.test(text) || !/\nTAYO\n/.test(text)) throw new Error("rename not applied to the draft");
    await page.getByText("Unsaved changes", { exact: true }).waitFor();
    await page.screenshot({ path: `${OUT}/aurascript-names.png` });
  });
  await step("Built in and free (owner, 2026-10-01): develop the story and build the outline with AuraStage's own story engine — at once, no cost; reload: kept", async () => {
    await stepTab("Story Development");
    await page.getByRole("button", { name: /^Develop (the story|again) \(free\)$/ }).click();
    const st = page.getByTestId("writing-status-develop_story");
    await st.getByText("by AuraStage's built-in story engine (free)").waitFor({ timeout: 15000 });
    if (await st.getByText("TEST OUTPUT").count()) throw new Error("built-in story must not be labelled test output");
    const beats = page.getByRole("list", { name: "Story beats" });
    await beats.getByText(/Midpoint/).first().waitFor();
    await beats.getByText(/\(B-story\)/).first().waitFor();
    await page.reload();
    await stepTab("Story Development");
    await page.getByTestId("writing-status-develop_story").getByText("by AuraStage's built-in story engine (free)").waitFor();
    await stepTab("Outline & Structure");
    await page.getByRole("button", { name: /^Build (the scene outline|a new outline) \(free\)$/ }).click();
    await page.getByTestId("outline-summary").getByText(/scenes · \d+ minutes/).waitFor({ timeout: 15000 });
    const list = await api("GET", `/api/projects/${P}/script/writing`);
    const ol = list.results.find((r) => r.kind === "outline" && r.source === "builtin");
    if (!ol || !ol.output.scenes.length || ol.provider !== "aurastage") throw new Error("built-in outline not recorded");
    const total = ol.output.scenes.reduce((a, x) => a + x.est_minutes, 0);
    if (Math.abs(total - 12) > 0.05) throw new Error("outline should add up to the 12-minute runtime: " + total);
  });
  if (errors.length) { failed++; console.log("FAIL page errors", errors); }
  await browser.close();
  console.log(failed ? `${failed} FAILED` : "ALL PASSED");
  process.exit(failed ? 1 : 0);
})();
