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
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
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
