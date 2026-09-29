// Regression browser test: creating a project with a long pasted story (reported 2026-09-26).
// Needs tests/e2e/scriptwriter/mock-api.cjs on :3911 and the web app on :3902 (see scriptwriter/README.md).
const { chromium } = require("playwright");
const BASE = "http://localhost:3902";
const STORY = "Act I: The Heist. During a highly anticipated national election, the commission deploys a new system. ".repeat(18);

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage();
  let failed = 0;
  const step = async (name, fn) => {
    try { await fn(); console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, e.message.split("\n").slice(0, 3).join(" | ")); }
  };
  await page.goto(BASE + "/");
  await page.evaluate(() => localStorage.setItem("sb-localhost-auth-token", JSON.stringify({ access_token: "f", refresh_token: "f", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 36000, user: { id: "u1", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "" } })));
  await page.goto(BASE + "/dashboard");

  let body = null;
  page.on("request", (r) => { if (r.url().endsWith("/api/projects") && r.method() === "POST") body = JSON.parse(r.postData()); });

  await step("home page: headline, honest provider states, eight genres, sign-up links", async () => {
    await page.goto(BASE + "/");
    await page.getByRole("heading", { name: /Turn Your Ideas\s*Into Extraordinary Films/ }).waitFor();
    const prov = page.getByRole("region", { name: "Providers" });
    await prov.getByText("AuraStage Sketch").waitFor();
    if ((await prov.getByText("Built in", { exact: true }).count()) !== 2) throw new Error("sketch and neural voices are built in");
    await prov.getByText(/Runway · Google Veo · Luma · Kling · MiniMax/).waitFor();
    if (await prov.getByText(/Suno|CapCut|HeyGen/).count()) throw new Error("lists a provider with no integration");
    if ((await page.getByRole("list", { name: "Genres" }).getByRole("listitem").count()) !== 8) throw new Error("genres");
    if ((await page.locator("img").count()) !== 0) throw new Error("home page should not render <img> tags that can break");
    await page.getByRole("link", { name: "Get Started Free →" }).click();
    await page.waitForURL("**/sign-up");
    await page.goto(BASE + "/dashboard");
  });
  await step("long story pasted into the logline is saved as the synopsis", async () => {
    await page.getByRole("button", { name: "+ New Project" }).click();
    await page.getByPlaceholder("Project title").fill("The Abuja Covenant");
    await page.getByPlaceholder(/^Logline/).fill(STORY);
    await page.getByText(/longer than a logline, so it will be saved as your story synopsis/).waitFor();
    await page.getByRole("button", { name: "Create project" }).click();
    await page.getByRole("button", { name: "+ New Project" }).waitFor();
    if (!body || body.logline !== undefined || body.synopsis !== STORY.trim()) throw new Error("unexpected body " + JSON.stringify(body).slice(0, 200));
  });
  await step("an invalid runtime is explained, not silently ignored", async () => {
    await page.getByRole("button", { name: "+ New Project" }).click();
    await page.getByPlaceholder("Project title").fill("Short");
    await page.getByLabel("Target runtime (min)").fill("0");
    await page.getByRole("button", { name: "Create project" }).click();
    await page.getByText(/whole number of minutes between 1 and 600/).waitFor();
  });
  await step("overview: a new production waits honestly; the next step is the script", async () => {
    await page.goto(BASE + "/dashboard");
    await page.getByTestId("stages-complete").getByText("0 of 9 stages complete").waitFor();
    await page.getByTestId("stage-scriptwriter").getByText("Not started").waitFor();
    await page.getByTestId("stage-storyboard").getByText("Waiting for a locked scene in Scene DNA").waitFor();
    await page.getByRole("link", { name: "Next: Scriptwriter: Write or import the script →" }).waitFor();
  });
  await step("overview: after the script is approved, reload shows it complete with its checks", async () => {
    const api = async (m, p2, b) => (await fetch("http://localhost:3911" + p2, { method: m, headers: { "Content-Type": "application/json" }, body: b && JSON.stringify(b) })).json();
    const P = "11111111-1111-4111-8111-111111111111";
    const v1 = await api("POST", `/api/projects/${P}/script/versions`, { source_text: "INT. ROOM - DAY\n\nADA sits.\n\nADA\nHello.\n", base_version_id: null });
    await api("POST", `/api/projects/${P}/script/approve`, { version_id: v1.id });
    await page.reload();
    const card = page.getByTestId("stage-scriptwriter");
    await card.getByText("Complete").waitFor();
    await card.getByText("Version 1 approved · 1 scene").waitFor();
    await card.getByRole("button", { name: "Why?" }).click();
    await card.getByText(/A version is approved/).waitFor();
    await page.getByTestId("stages-complete").getByText("1 of 9 stages complete").waitFor();
    await page.getByLabel("Counts").getByText("Locations").waitFor();
  });
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
