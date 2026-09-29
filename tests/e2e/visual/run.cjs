// Browser test: Visual Generation (offline, against tests/e2e/scriptwriter/mock-api.cjs on :3911,
// web on :3902 built with NEXT_PUBLIC_API_URL=http://localhost:3911 NEXT_PUBLIC_SUPABASE_URL=http://localhost:3912).
const { chromium } = require("playwright");
const BASE = "http://localhost:3902", API = "http://localhost:3911", P = "11111111-1111-4111-8111-111111111111";
const OUT = process.env.E2E_OUT || require("os").tmpdir();

const SCRIPT = `EXT. LAGOS HARBOUR - NIGHT

Rain lashes the jetty. TUNDE OKAFOR (35) waits under a lamp.

TUNDE
You came.
`;

async function api(method, path, body) {
  const r = await fetch(API + path, { method, headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
  return r.json();
}

(async () => {
  const v1 = await api("POST", `/api/projects/${P}/script/versions`, { source_text: SCRIPT, base_version_id: null });
  await api("POST", `/api/projects/${P}/script/approve`, { version_id: v1.id });
  await api("POST", `/api/projects/${P}/characters/sync`, {});
  const cast = await api("GET", `/api/projects/${P}/characters`);
  const tunde = cast.characters.find((c) => c.name === "Tunde Okafor");
  await api("PATCH", `/api/characters/${tunde.id}`, { description: "Investigative journalist", status: "approved" });
  const look = await api("POST", `/api/characters/${tunde.id}/looks`, { name: "Field outfit", description: "Khaki jacket" });
  await api("POST", `/api/projects/${P}/dialogue/sync`, {});
  const dws = await api("GET", `/api/projects/${P}/dialogue`);
  const s1 = dws.scenes[0].id;
  await api("POST", `/api/projects/${P}/dialogue/scenes/${s1}/approve`, {});
  await api("PATCH", `/api/projects/${P}/scene-dna/${s1}`, { purpose: "Tunde commits.", lighting_intent: "Sodium lamp, hard shadows", wardrobe: { [tunde.id]: look.id } });
  await api("POST", `/api/projects/${P}/scene-dna/${s1}/approve`, {});
  await api("POST", `/api/projects/${P}/storyboard/scenes/${s1}/generate`, {});
  const ok = await api("POST", `/api/projects/${P}/storyboard/scenes/${s1}/approve`, {});
  if (!ok.version_number) throw new Error("setup: shot plan not approved " + JSON.stringify(ok));

  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("dialog", (d) => d.accept());
  let failed = 0;
  const step = async (name, fn) => {
    try { await fn(); console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, e.message.split("\n")[0]); await page.screenshot({ path: `${OUT}/fail-visual-${name.replace(/\W+/g, "_")}.png`, fullPage: true }); }
  };
  const reload = async () => { await page.reload(); await page.getByText("Stunning Visuals").waitFor(); };

  await page.goto(BASE + "/");
  await page.evaluate(() => localStorage.setItem("sb-localhost-auth-token", JSON.stringify({ access_token: "f", refresh_token: "f", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 36000, user: { id: "u1", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "" } })));

  await step("Storyboard links to Visual Generation; approved shots are listed", async () => {
    await page.goto(`${BASE}/projects/${P}/storyboard`);
    await page.getByRole("link", { name: "Next: Visual Generation →" }).click();
    await page.waitForURL(`**/projects/${P}/visual`);
    await page.getByText("Stunning Visuals").waitFor();
    await page.getByText(/Shots \(\d+\)/).waitFor();
    await page.getByText("No takes yet — compile the prompt and generate.").waitFor();
    await page.getByText("Compile the prompt first.").waitFor();
  });
  await step("provider status is honest: Runway and OpenAI not connected, sketch built in", async () => {
    const list = page.getByRole("list", { name: "Provider status" });
    await list.getByText("Runway", { exact: true }).waitFor();
    for (const name of ["Runway", "OpenAI Images", "Google (Imagen, Gemini, Veo)", "Kling AI", "Luma Dream Machine"]) {
      const row = list.getByRole("listitem").filter({ has: page.getByText(name, { exact: true }) });
      if (!/not connected/.test(await row.innerText())) throw new Error(name + " should say not connected");
    }
    if ((await list.getByText("connected", { exact: true }).count()) !== 1) throw new Error("only the built-in sketch is connected");
    await list.getByText(/Not AI/).waitFor();
  });
  await step("compile the prompt from the approved plan: prompt text and evidence badges", async () => {
    await page.getByRole("button", { name: "Compile prompt" }).click();
    await page.getByText("Prompt compiled from the approved shot plan.").waitFor();
    const prompt = await page.getByLabel("Compiled prompt").innerText();
    if (!/Cinematic film still/.test(prompt)) throw new Error("no prompt: " + prompt);
    await page.getByRole("list", { name: "Prompt checks" }).getByText("Location applied").waitFor();
  });
  await step("choosing an unconnected provider explains why generation is off", async () => {
    await page.getByLabel("Provider", { exact: true }).selectOption("runway");
    await page.getByText("Runway isn't connected yet — its API key hasn't been added.").waitFor();
    await page.getByLabel("Provider", { exact: true }).selectOption("aurastage-sketch");
  });
  await step("generate two sketch takes; they finish in the background and appear", async () => {
    await page.getByLabel("Variations").selectOption("2");
    await page.getByRole("button", { name: "Generate 2 takes" }).click();
    await page.getByText("Queued 2 takes. They appear here when ready.").waitFor();
    await page.getByRole("img", { name: "Take V2" }).waitFor({ timeout: 20000 });
    await page.getByRole("list", { name: "Takes" }).getByRole("button", { name: "V1" }).waitFor();
  });
  await step("the take says which reference images were sent (the sketch takes none, and says why)", async () => {
    const refs = page.getByLabel("References sent");
    await refs.getByText(/No reference images were sent · \d+ not sent/).waitFor();
    await refs.locator("summary").click();
    await refs.getByText(/draws from the prompt only/).first().waitFor();
  });
  await step("reload: takes and prompt are still there", async () => {
    await reload();
    await page.getByRole("img", { name: "Take V2" }).waitFor();
    await page.getByLabel("Compiled prompt").waitFor();
  });
  await step("approve a take; reload: still approved", async () => {
    await page.getByRole("button", { name: "Approve take" }).click();
    await page.getByText("Take V2 approved for this shot.").waitFor();
    await reload();
    await page.getByRole("button", { name: /shot 1/ }).getByText("Approved").waitFor();
    await page.getByRole("button", { name: "Un-approve" }).waitFor();
  });
  await step("compare two takes side by side", async () => {
    await page.getByRole("list", { name: "Takes" }).getByRole("button", { name: "V1" }).click({ modifiers: ["Shift"] });
    await page.getByRole("img", { name: "Take V1" }).waitFor();
    await page.getByRole("img", { name: "Take V2" }).waitFor();
  });
  await step("editing the approved shot plan stops generation until it's approved again", async () => {
    const sb = await api("GET", `/api/projects/${P}/storyboard`);
    await api("PATCH", `/api/shots/${sb.scenes[0].shots[0].id}`, { angle: "high" });
    await api("GET", `/api/projects/${P}/storyboard`);
    await reload();
    await page.getByText("The shot plan changed — approve it again in Storyboard before generating.").waitFor();
    await page.getByText("Approve the shot plan again first.").waitFor();
    await page.getByRole("img", { name: "Take V2" }).waitFor();
  });
  await page.screenshot({ path: `${OUT}/visual.png`, fullPage: true });
  console.log("ERRORS:", errors);
  await browser.close();
  process.exit(failed || errors.length ? 1 : 0);
})();
