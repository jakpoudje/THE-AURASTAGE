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
    try { await fn(); console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, e.message.split("\n")[0]); }
  };
  await page.goto(BASE + "/");
  await page.evaluate(() => localStorage.setItem("sb-localhost-auth-token", JSON.stringify({ access_token: "f", refresh_token: "f", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 36000, user: { id: "u1", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "" } })));
  await page.goto(BASE + "/dashboard");

  let body = null;
  page.on("request", (r) => { if (r.url().endsWith("/api/projects") && r.method() === "POST") body = JSON.parse(r.postData()); });

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
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
