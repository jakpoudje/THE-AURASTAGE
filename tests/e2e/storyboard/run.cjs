// Browser test: Storyboard & Shots (offline, against tests/e2e/scriptwriter/mock-api.cjs on :3911,
// web on :3902 built with NEXT_PUBLIC_API_URL=http://localhost:3911 NEXT_PUBLIC_SUPABASE_URL=http://localhost:3912).
const { chromium } = require("playwright");
const BASE = "http://localhost:3902", API = "http://localhost:3911", P = "11111111-1111-4111-8111-111111111111";
const OUT = process.env.E2E_OUT || require("os").tmpdir();

const SCRIPT = `EXT. LAGOS HARBOUR - NIGHT

Rain lashes the jetty. TUNDE OKAFOR (35) and AMARA BELLO (32) meet under a lamp.

TUNDE
You came.

AMARA
They know everything.

INT. NEWSROOM - DAY

Empty desks. A phone rings.
`;

async function api(method, path, body) {
  const r = await fetch(API + path, { method, headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
  return r.json();
}

(async () => {
  const v1 = await api("POST", `/api/projects/${P}/script/versions`, { source_text: SCRIPT, base_version_id: null });
  await api("POST", `/api/projects/${P}/script/approve`, { version_id: v1.id });
  await api("POST", `/api/projects/${P}/characters/sync`, {});
  await api("POST", `/api/projects/${P}/dialogue/sync`, {});
  const dws = await api("GET", `/api/projects/${P}/dialogue`);
  const s1 = dws.scenes[0].id;
  const amaraLine = dws.lines.find((l) => l.text === "They know everything.");
  await api("PATCH", `/api/dialogue-lines/${amaraLine.id}`, { emotion: "fear", intensity: 9 });
  await api("POST", `/api/projects/${P}/dialogue/scenes/${s1}/approve`, {});
  await api("PATCH", `/api/projects/${P}/scene-dna/${s1}`, { purpose: "They join forces.", camera_energy: "measured", lighting_intent: "Sodium lamp" });
  const lock = await api("POST", `/api/projects/${P}/scene-dna/${s1}/approve`, {});
  if (!lock.version_number) throw new Error("setup: could not lock Scene DNA " + JSON.stringify(lock));

  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("dialog", (d) => d.accept());
  let failed = 0;
  const step = async (name, fn) => {
    try { await fn(); console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, e.message.split("\n")[0]); await page.screenshot({ path: `${OUT}/fail-storyboard-${name.replace(/\W+/g, "_")}.png`, fullPage: true }); }
  };
  const reload = async () => { await page.reload(); await page.getByText("Cinematic Precision").waitFor(); };
  const checks = () => page.getByRole("list", { name: "Coverage checks" });
  const sceneBtn = (re) => page.getByRole("button", { name: re }).first();

  await page.goto(BASE + "/");
  await page.evaluate(() => localStorage.setItem("sb-localhost-auth-token", JSON.stringify({ access_token: "f", refresh_token: "f", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 36000, user: { id: "u1", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "" } })));

  await step("Scene DNA links to Storyboard; scenes show whether they can be planned", async () => {
    await page.goto(`${BASE}/projects/${P}/scene-dna`);
    await page.getByRole("link", { name: "Next: Storyboard →" }).click();
    await page.waitForURL(`**/projects/${P}/storyboard`);
    await page.getByText("Cinematic Precision").waitFor();
    await page.getByText("Scenes (2)").waitFor();
    await sceneBtn(/EXT\. LAGOS HARBOUR/).getByText("Ready to plan").waitFor();
    await sceneBtn(/INT\. NEWSROOM/).getByText("Lock DNA first").waitFor();
  });
  await step("an unlocked scene points to Scene DNA and cannot be planned", async () => {
    await sceneBtn(/INT\. NEWSROOM/).click();
    await page.getByRole("link", { name: "Lock this scene in Scene DNA →" }).waitFor();
    if (await page.getByRole("button", { name: "Plan shots from Scene DNA" }).isEnabled()) throw new Error("should be disabled");
    await sceneBtn(/EXT\. LAGOS HARBOUR/).click();
  });
  await step("one click plans every locked scene (standard coverage); the unlocked one is left for later", async () => {
    await page.getByText("1 locked scene(s) have no shots yet.").waitFor();
    await page.getByRole("button", { name: "Plan every locked scene (Standard)" }).click();
    await page.getByText(/Planned 1 scene with standard coverage \(\d+ shots\)\. 1 not locked in Scene DNA yet\./).waitFor();
    if (await page.getByText("locked scene(s) have no shots yet.").count()) throw new Error("the plan-all bar should go once every locked scene has shots");
  });
  await step("plan shots from the locked Scene DNA: storyboard, checks and timeline", async () => {
    await page.getByRole("button", { name: "Shot 1", exact: true }).waitFor();
    await checks().getByText("2 of 2 lines covered").waitFor();
    await page.getByRole("list", { name: "Shot timeline" }).waitFor();
    await page.getByText("From Scene DNA version 1 · measured camera").waitFor();
  });
  await step("reload: the planned shots are still there", async () => {
    await reload();
    await page.getByRole("button", { name: "Shot 1", exact: true }).waitFor();
    await sceneBtn(/EXT\. LAGOS HARBOUR/).getByText("In progress").waitFor();
  });
  await step("edit a shot, reload: the change is kept", async () => {
    await page.getByRole("button", { name: "Shot 2", exact: true }).click();
    await page.getByLabel("Angle").selectOption({ label: "Low" });
    await page.getByLabel("Composition").fill("Lamp top-left, harbour behind");
    await page.getByRole("button", { name: "Save shot" }).click();
    await page.getByText("Shot 2 saved.").waitFor();
    await reload();
    await page.getByRole("button", { name: "Shot 2", exact: true }).click();
    if ((await page.getByLabel("Angle").inputValue()) !== "low") throw new Error("angle lost after reload");
    if ((await page.getByLabel("Composition").inputValue()) !== "Lamp top-left, harbour behind") throw new Error("composition lost after reload");
  });
  await step("shot list tab shows the same shots as a table", async () => {
    await page.getByRole("tab", { name: "Shot List" }).click();
    await page.getByRole("cell", { name: "Low" }).waitFor();
    await page.getByRole("tab", { name: "Storyboard" }).click();
  });
  await step("add, move and remove shots", async () => {
    const before = await page.getByRole("list", { name: "Storyboard" }).getByRole("listitem").count();
    await page.getByRole("button", { name: "+ Add shot after 2" }).click();
    await page.getByText("Shot 3 added.").waitFor();
    await page.getByRole("button", { name: "Move later" }).click();
    await page.getByText("Moved to position 4.").waitFor();
    await page.getByRole("button", { name: "Shot 4", exact: true }).click();
    await page.getByRole("button", { name: "Remove" }).click();
    await page.getByText("Shot 4 removed.").waitFor();
    const after = await page.getByRole("list", { name: "Storyboard" }).getByRole("listitem").count();
    if (after !== before) throw new Error(`count ${before} -> ${after}`);
  });
  await step("uncovering a line blocks approval and says which line", async () => {
    await page.getByRole("tab", { name: "Shot List" }).click();
    await page.getByRole("row", { name: /They know everything/ }).first().click();
    await page.getByRole("checkbox", { name: /AMARA: “They know everything\.”/ }).uncheck();
    await page.getByRole("button", { name: "Save shot" }).click();
    await page.getByText(/saved\./).waitFor();
    await checks().getByText(/Not covered: AMARA: “They know everything\.”/).waitFor();
    if (await page.getByRole("button", { name: "Approve shot plan" }).isEnabled()) throw new Error("approve should be disabled");
  });
  await step("re-plan with a different coverage style asks before replacing, then approval works; reload keeps it approved", async () => {
    await page.getByLabel("Coverage style").selectOption("intimate");
    await page.getByText("Closer singles with shallow focus and more reactions, for emotional scenes.").waitFor();
    await page.getByRole("button", { name: "Re-plan shots from Scene DNA" }).click();
    await page.getByText(/Planned \d+ shots \(intimate coverage\) from Scene DNA version 1/).waitFor();
    await page.getByRole("tab", { name: "Storyboard" }).click();
    await page.getByRole("button", { name: "Shot 1", exact: true }).click();
    if (!(await page.getByLabel("Notes").inputValue()).startsWith("Intimate coverage: ")) throw new Error("the shot's note should say which coverage style planned it");
    await page.getByRole("button", { name: "Approve shot plan" }).click();
    await page.getByText(/Shot plan approved as version 1 \(100% of the scene covered\)/).waitFor();
    await reload();
    await page.getByRole("button", { name: "Approved · version 1 ✓" }).waitFor();
    await sceneBtn(/EXT\. LAGOS HARBOUR/).getByText("Approved").waitFor();
  });
  await step("a Dialogue change flows through Scene DNA and flags the shots for review", async () => {
    await api("PATCH", `/api/dialogue-lines/${amaraLine.id}`, { intensity: 4 });
    await reload();
    await page.getByText("These shots need review.").waitFor();
    await page.getByText(/Scene DNA needs review\./).waitFor();
    await sceneBtn(/EXT\. LAGOS HARBOUR/).getByText("Review").waitFor();
    await page.getByText(/Nothing was deleted/).waitFor();
  });
  await page.screenshot({ path: `${OUT}/storyboard.png`, fullPage: true });
  console.log("ERRORS:", errors);
  await browser.close();
  process.exit(failed || errors.length ? 1 : 0);
})();
