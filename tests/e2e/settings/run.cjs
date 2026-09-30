// Browser test: Project Settings (offline, mock on :3911, web on :3902). Settings drive other workspaces;
// every saved state is checked again after a page reload.
const { chromium } = require("playwright");
const BASE = "http://localhost:3902", API = "http://localhost:3911", P = "11111111-1111-4111-8111-111111111111";
const OUT = process.env.E2E_OUT || require("os").tmpdir();
const api = async (method, p, body) => (await fetch(API + p, { method, headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) })).json();

(async () => {
  await api("POST", "/__test/as", { role: "owner", email: "you@aurastage.invalid" });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 1200 } })).newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => m.type() === "error" && /Warning:|key/.test(m.text()) && errors.push("console: " + m.text().slice(0, 200)));
  let failed = 0;
  const step = async (name, fn) => {
    try { await fn(); console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, e.message.split("\n")[0]); await page.screenshot({ path: `${OUT}/fail-settings-${name.replace(/\W+/g, "_")}.png`, fullPage: true }); }
  };
  await page.goto(BASE + "/");
  await page.evaluate(() => localStorage.setItem("sb-localhost-auth-token", JSON.stringify({ access_token: "f", refresh_token: "f", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 36000, user: { id: "99999999-9999-4999-8999-999999999999", email: "you@aurastage.invalid", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "" } })));

  await step("open Project Settings from the sidebar; the story comes from Scriptwriter and is read-only", async () => {
    await page.goto(`${BASE}/projects/${P}/scriptwriter`);
    await page.getByRole("link", { name: "Project Settings" }).click();
    await page.waitForURL(`**/projects/${P}/settings`);
    const story = page.getByRole("region", { name: "Story & Creative Summary" });
    await story.getByText("Inherited").waitFor();
    await story.getByText("Shadows of Lagos").waitFor();
    await story.getByRole("link", { name: "Edit in Scriptwriter →" }).waitFor();
    await page.getByTestId("settings-version").getByText("Using the defaults").waitFor();
    await page.getByRole("list", { name: "Fixed pipeline facts" }).getByText("24 fps", { exact: true }).waitFor();
  });
  await step("change settings, review exactly what they change, save; kept after reload", async () => {
    await page.getByLabel("Loudness standard").selectOption("streaming");
    await page.getByLabel("Look").fill("Desaturated teal-and-amber, handheld");
    await page.getByRole("button", { name: "+ Add colour" }).click();
    await page.getByLabel("Monthly paid take limit").fill("5");
    await page.getByRole("region", { name: "Delivery targets" }).getByLabel("Streaming Master").check();
    await page.getByLabel("Director").fill("Ada Obi");
    await page.getByRole("button", { name: "Review changes" }).click();
    const dlg = page.getByRole("dialog", { name: "What this changes" });
    await dlg.getByText(/check -14 LUFS ±1/).waitFor();
    await dlg.getByText("0 of 5 paid takes used this month.").waitFor();
    await dlg.getByText(/Written into files rendered from now on/).waitFor();
    await dlg.getByRole("button", { name: "Save settings" }).click();
    await page.getByRole("status").getByText("Saved as settings version 1.").waitFor();
    await page.reload();
    await page.getByTestId("settings-version").getByText(/Version 1/).waitFor();
    if ((await page.getByLabel("Loudness standard").inputValue()) !== "streaming") throw new Error("loudness not kept");
    if ((await page.getByLabel("Look").inputValue()) !== "Desaturated teal-and-amber, handheld") throw new Error("look not kept");
    if ((await page.getByLabel("Director").inputValue()) !== "Ada Obi") throw new Error("director not kept");
    await page.getByLabel("Palette colour 1").waitFor();
    await page.getByTestId("paid-usage").getByText("0 used this month of 5").waitFor();
  });
  await step("titles & credits: turn on the opening card and end credits, see what they change, save; kept after reload", async () => {
    const t = page.getByRole("group", { name: "Titles and credits" });
    await t.getByLabel("Opening title card").check();
    await t.getByLabel("Title card seconds").fill("6");
    await t.getByLabel("Line under the title").fill("A story of the harbour");
    await t.getByLabel("End credits").check();
    await page.getByLabel("Written by").fill("Julius");
    await page.getByRole("button", { name: "Review changes" }).click();
    const dlg = page.getByRole("dialog", { name: "What this changes" });
    await dlg.getByText(/start with a 6-second title card and end with a credits roll/).waitFor();
    await dlg.getByRole("button", { name: "Save settings" }).click();
    await page.getByRole("status").getByText(/Saved as settings version 2/).waitFor();
    await page.reload();
    const t2 = page.getByRole("group", { name: "Titles and credits" });
    if (!(await t2.getByLabel("Opening title card").isChecked()) || !(await t2.getByLabel("End credits").isChecked())) throw new Error("titles not kept");
    if ((await t2.getByLabel("Title card seconds").inputValue()) !== "6") throw new Error("seconds not kept");
    if ((await page.getByLabel("Written by").inputValue()) !== "Julius") throw new Error("writer not kept");
  });
  await step("Export & Deliver marks the required deliverable", async () => {
    await page.goto(`${BASE}/projects/${P}/export`);
    await page.getByRole("list", { name: "Presets" }).getByRole("button", { name: /Streaming Master/ }).first().getByText("Required").waitFor();
  });
  await step("someone else saving first is refused, never overwritten", async () => {
    await page.goto(`${BASE}/projects/${P}/settings`);
    await page.getByLabel("Director").waitFor();
    const cur = await api("GET", `/api/projects/${P}/settings`);
    await api("PUT", `/api/projects/${P}/settings`, { base_revision: cur.revision, settings: { ...cur.settings, production: { ...cur.settings.production, producer: "Someone Else" } } });
    await page.getByLabel("Director").fill("Changed By Me");
    await page.getByRole("button", { name: "Review changes" }).click();
    await page.getByRole("dialog", { name: "What this changes" }).getByRole("button", { name: "Save settings" }).click();
    await page.getByRole("alert").getByText(/someone changed the settings since you opened them/).waitFor();
    await page.getByRole("alert").getByRole("button", { name: "Reload" }).click();
    await page.waitForFunction(() => [...document.querySelectorAll("input")].some((i) => i.value === "Someone Else"), null, { timeout: 15000 })
      .catch(() => { throw new Error("other save not shown"); });
    if ((await page.getByLabel("Producer").inputValue()) !== "Someone Else") throw new Error("other save not shown in Producer");
  });
  await step("Ask AuraStage on Project Settings: set the composer and turn off the end credits; applying shows at once; reload: kept; undo: back", async () => {
    await page.goto(`${BASE}/projects/${P}/settings`);
    await page.getByLabel("Music by").waitFor();
    const composer0 = await page.getByLabel("Music by").inputValue();
    await page.getByRole("button", { name: "Ask AuraStage" }).click();
    const ask = page.getByRole("complementary", { name: "Ask AuraStage" });
    await ask.getByLabel("What would you like to change?").fill('Set the composer to "Ama Mensah" and turn off the end credits');
    await ask.getByRole("button", { name: "Ask", exact: true }).click();
    await ask.getByTestId("proposal-status").getByText("Suggested").waitFor({ timeout: 15000 });
    await ask.getByRole("button", { name: "Apply", exact: true }).click();
    await ask.getByTestId("proposal-status").getByText("Applied").waitFor();
    // The settings page re-reads by itself.
    await page.waitForFunction(() => [...document.querySelectorAll("input")].some((i) => i.value === "Ama Mensah"), null, { timeout: 10000 });
    if (await page.getByRole("group", { name: "Titles and credits" }).getByLabel("End credits").isChecked()) throw new Error("end credits still on");
    await ask.getByRole("button", { name: "Close" }).click();
    await page.reload();
    if ((await page.getByLabel("Music by").inputValue()) !== "Ama Mensah") throw new Error("composer not kept after reload");
    await page.getByRole("button", { name: "Ask AuraStage" }).click();
    await ask.getByRole("region", { name: "Recent requests" }).getByRole("button", { name: /Set the composer/ }).first().click();
    await ask.getByRole("button", { name: "Undo", exact: true }).click();
    await ask.getByTestId("proposal-status").getByText("Undone").waitFor();
    for (let i = 0; i < 40 && (await page.getByLabel("Music by").inputValue()) !== composer0; i++) await page.waitForTimeout(250);
    if ((await page.getByLabel("Music by").inputValue()) !== composer0) throw new Error("composer not restored by undo");
    if (!(await page.getByRole("group", { name: "Titles and credits" }).getByLabel("End credits").isChecked())) throw new Error("end credits not back on after undo");
    await ask.getByRole("button", { name: "Close" }).click();
  });
  await step("a Reviewer sees the settings but can't change them", async () => {
    await api("POST", "/__test/as", { role: "reviewer" });
    await page.goto(`${BASE}/projects/${P}/settings`);
    await page.getByText("Only the project's producer or the studio's owners can change these.").waitFor();
    if (!(await page.getByLabel("Loudness standard").isDisabled())) throw new Error("reviewer can edit");
    if (await page.getByRole("button", { name: "Review changes" }).count()) throw new Error("reviewer sees save");
    await api("POST", "/__test/as", { role: "owner" });
  });

  await browser.close();
  if (errors.length) { console.log("ERRORS:", errors); failed++; }
  console.log(failed ? `${failed} FAILED` : "ALL PASSED");
  process.exit(failed ? 1 : 0);
})();
