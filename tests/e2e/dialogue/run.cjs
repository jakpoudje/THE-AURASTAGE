// Browser test: Dialogue Intelligence (offline, against tests/e2e/scriptwriter/mock-api.cjs on :3911,
// web on :3902 built with NEXT_PUBLIC_API_URL=http://localhost:3911 NEXT_PUBLIC_SUPABASE_URL=http://localhost:3912).
const { chromium } = require("playwright");
const BASE = "http://localhost:3902", API = "http://localhost:3911", P = "11111111-1111-4111-8111-111111111111";
const OUT = process.env.E2E_OUT || require("os").tmpdir();

const V1 = `INT. NEWSROOM - MORNING

TUNDE OKAFOR (35) and AMARA BELLO (32) argue.

TUNDE
(quietly)
They buried it.

AMARA
Then we dig it up!

TUNDE
The truth will come out.

EXT. HARBOUR - DAWN

RADIO (V.O.)
Breaking news.
`;
const V2 = V1.replace("They buried it.", "They buried it deep.").replace("TUNDE\nThe truth will come out.\n\n", "") + "\nGUARD\nFreeze!\n";

async function api(method, path, body) {
  const r = await fetch(API + path, { method, headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
  return r.json();
}

(async () => {
  const v1 = await api("POST", `/api/projects/${P}/script/versions`, { source_text: V1, base_version_id: null });
  await api("POST", `/api/projects/${P}/script/approve`, { version_id: v1.id });
  await api("POST", `/api/projects/${P}/characters/sync`, {});

  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("dialog", (d) => d.accept());
  let failed = 0;
  const step = async (name, fn) => {
    try { await fn(); console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, e.message.split("\n")[0]); await page.screenshot({ path: `${OUT}/fail-dialogue-${name.replace(/\W+/g, "_")}.png` }); }
  };
  await page.goto(BASE + "/");
  await page.evaluate(() => localStorage.setItem("sb-localhost-auth-token", JSON.stringify({ access_token: "f", refresh_token: "f", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 36000, user: { id: "u1", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "" } })));

  await step("casting links to dialogue; bring in dialogue from the approved script", async () => {
    await page.goto(`${BASE}/projects/${P}/casting`);
    await page.getByRole("link", { name: "Next: Dialogue →" }).click();
    await page.waitForURL(`**/projects/${P}/dialogue`);
    await page.getByText("Authentic Voices").waitFor();
    await page.getByRole("button", { name: "Bring in dialogue" }).click();
    await page.getByText(/Dialogue updated from the approved script: 4 new/).waitFor();
    await page.getByText("Scenes (2)").waitFor();
  });
  await step("lines show speakers resolved through Casting, timing, directions and listeners", async () => {
    await page.getByText("They buried it.").waitFor();
    await page.getByText("(quietly)").waitFor();
    await page.getByText("Tunde Okafor").first().waitFor();
    await page.getByText(/0:00 · /).first().waitFor();
    await page.getByText("to Amara Bello").first().waitFor();
  });
  await step("annotate a line: intent, emotion, intensity, subtext", async () => {
    const card = page.locator("li", { hasText: "They buried it." }).first();
    await card.getByPlaceholder("e.g. confess").fill("confess");
    await card.locator("select").selectOption("tension");
    await card.getByLabel("Intensity").fill("7");
    await card.getByRole("button", { name: "Subtext & notes" }).click();
    await card.getByLabel("Subtext").fill("He is afraid they'll bury him too.");
    await card.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByText("Line saved.").waitFor();
    await page.getByText("Subtext: He is afraid they'll bury him too.").waitFor();
    await page.getByText(/1 of 3 lines annotated/).waitFor();
  });
  await step("quality checks and voice panel are computed from the lines", async () => {
    await page.getByText("Dialogue quality check").waitFor();
    await page.getByText("Share of this scene's words").waitFor();
    await page.getByText("Character voice & style").waitFor();
  });
  await step("approve the scene's dialogue", async () => {
    await page.getByRole("button", { name: "Approve scene dialogue" }).click();
    await page.getByText("Approved all 3 lines in this scene.").waitFor();
    await page.getByRole("button", { name: "Scene approved ✓" }).waitFor();
  });
  await step("script change: annotated line flagged with its old text, removed line kept aside", async () => {
    const v2 = await api("POST", `/api/projects/${P}/script/versions`, { source_text: V2, base_version_id: v1.id });
    await api("POST", `/api/projects/${P}/script/approve`, { version_id: v2.id });
    await page.reload();
    await page.getByText(/The approved script changed \(now version 2\)/).waitFor();
    await page.getByRole("button", { name: "Update from script" }).click();
    await page.getByText(/1 changed, 1 no longer in the script/).waitFor();
    await page.getByText(/lines? needs? review after script changes/).first().waitFor();
    await page.getByText("They buried it deep.").waitFor();
    await page.getByText(/Was: They buried it\./).waitFor();
    // Annotation survived the edit.
    const card = page.locator("li", { hasText: "They buried it deep." }).first();
    if ((await card.getByPlaceholder("e.g. confess").inputValue()) !== "confess") throw new Error("annotation lost");
    await page.getByRole("button", { name: /Show 1 line no longer in the script/ }).click();
    await page.getByText("The truth will come out.").waitFor();
  });
  await step("a speaker not yet in Casting is flagged with a link to Casting", async () => {
    await page.getByRole("button", { name: /EXT\. HARBOUR/ }).click();
    await page.getByText("Freeze!").waitFor();
    await page.getByText("not in Casting").waitFor();
    await page.getByText(/Not yet characters: GUARD/).waitFor();
    await page.getByRole("link", { name: "Open Casting" }).waitFor();
    await page.getByRole("button", { name: /INT\. NEWSROOM/ }).click();
  });
  await step("mark reviewed clears the flag", async () => {
    const card = page.locator("li", { hasText: "They buried it deep." }).first();
    await card.getByRole("button", { name: "Mark reviewed" }).click();
    await page.getByText("Marked as reviewed.").waitFor();
    if (await page.getByText(/Was: They buried it\./).count()) throw new Error("old text still shown");
  });
  await step("a cut line that was approved can be acknowledged; review banner clears", async () => {
    const show = page.getByRole("button", { name: /Show 1 line no longer in the script/ });
    if (await show.count()) await show.click();
    const cut = page.locator("li", { hasText: "The truth will come out." }).first();
    await cut.getByRole("button", { name: "Mark reviewed" }).click();
    await page.getByText("Marked as reviewed.").waitFor();
    if (await page.getByText(/needs? review after script changes/).count()) throw new Error("review banner still shown");
  });
  await step("analysis uses Casting names", async () => {
    await page.locator("text=Share of this scene's words").waitFor();
    await page.locator("li", { hasText: "Amara Bello" }).filter({ hasText: "%" }).first().waitFor();
  });
  await page.screenshot({ path: `${OUT}/dialogue.png` });
  console.log("ERRORS:", errors);
  await browser.close();
  process.exit(failed || errors.length ? 1 : 0);
})();
