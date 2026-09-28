// Browser test: Help & Support and Account & security (offline, mock on :3911, web on :3902).
// Every saved state is checked again after a page reload.
const { chromium } = require("playwright");
const BASE = "http://localhost:3902", API = "http://localhost:3911", P = "11111111-1111-4111-8111-111111111111";
const OUT = process.env.E2E_OUT || require("os").tmpdir();
const api = async (method, p, body) => (await fetch(API + p, { method, headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) })).json();

(async () => {
  await api("POST", "/__test/as", { role: "owner", email: "you@aurastage.invalid" });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 1100 } })).newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("dialog", (d) => d.accept());
  let failed = 0;
  const step = async (name, fn) => {
    try { await fn(); console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, e.message.split("\n")[0]); await page.screenshot({ path: `${OUT}/fail-help-${name.replace(/\W+/g, "_")}.png`, fullPage: true }); }
  };
  await page.goto(BASE + "/");
  await page.evaluate(() => localStorage.setItem("sb-localhost-auth-token", JSON.stringify({ access_token: "f", refresh_token: "f", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 36000, user: { id: "99999999-9999-4999-8999-999999999999", email: "you@aurastage.invalid", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "" } })));

  await step("Help opens from a workspace with its context; status shows real evidence, not a blanket green", async () => {
    await page.goto(`${BASE}/projects/${P}/export`);
    await page.getByRole("link", { name: "Help & Support" }).click();
    await page.waitForURL(/\/help\?project=.*&module=delivery/);
    await page.getByText("Every Step").waitFor();
    const s = page.getByRole("list", { name: "System status" });
    await s.getByTestId("status-worker:render-worker").getByText("Not responding").waitFor();
    await s.getByText("last checked in 9 min ago").waitFor();
    await s.getByTestId("status-media").getByText("Not connected").waitFor();
    await page.getByRole("list", { name: "Provider status" }).getByText("Voice / dialogue generation").waitFor();
  });
  await step("search the guides and troubleshooting", async () => {
    await page.getByLabel("Search help").fill("invite");
    await page.getByRole("list", { name: "Guides" }).getByRole("button", { name: "Inviting your team and roles" }).click();
    await page.getByText(/works once, only for that email/).waitFor();
    await page.getByLabel("Search help").fill("AURA-EXP-412");
    await page.getByRole("list", { name: "Troubleshooting" }).getByText("No Picture Lock yet").waitFor();
  });
  await step("the assistant answers from the guides and this project's status, and says it isn't AI", async () => {
    await page.getByLabel("Ask the assistant").fill("Why did my render fail?");
    await page.getByRole("button", { name: "Ask" }).click();
    const a = page.getByTestId("assistant-answer");
    await a.getByText("1 render failed in the last 7 days").waitFor();
    await a.getByText("Rendering deliverables").waitFor();
    await a.getByText(/No AI model is connected/).waitFor();
  });
  await step("send a ticket with diagnostics after previewing them; a reply arrives; kept after reload; close it", async () => {
    await page.getByLabel("Subject").fill("Render failed twice");
    await page.getByLabel("What happened?").fill("The Streaming Master failed QC.");
    await page.getByLabel(/Attach this project's diagnostics/).check();
    await page.getByRole("list", { name: "Diagnostics that will be sent" }).getByText(/1 render failed/).waitFor();
    await page.getByRole("button", { name: "Send ticket" }).click();
    await page.getByRole("status").getByText(/Ticket sent/).waitFor();
    await api("POST", "/__test/staff-reply", { body: "We restarted the render worker — please try again." });
    await page.reload();
    const t = page.getByTestId("ticket-Render failed twice");
    await t.getByText("answered").waitFor();
    await t.getByText("We restarted the render worker — please try again.").waitFor();
    await t.getByText(/diagnostics attached/).waitFor();
    await t.getByRole("button", { name: "Close" }).click();
    await page.reload();
    await page.getByTestId("ticket-Render failed twice").getByText("closed").waitFor();
  });
  await step("Account & security: see devices, sign the other one out; kept after reload", async () => {
    await page.getByRole("link", { name: "Account & security" }).click();
    await page.getByTestId("session-current").getByText(/Chrome on Mac/).waitFor();
    await page.getByTestId("session-other").getByText(/Safari on iPhone/).waitFor();
    await page.getByTestId("session-other").getByRole("button", { name: "Sign out" }).click();
    await page.getByRole("status").getByText("That device was signed out.").waitFor();
    await page.reload();
    await page.getByTestId("session-current").waitFor();
    if (await page.getByTestId("session-other").count()) throw new Error("other device still listed");
  });

  await browser.close();
  if (errors.length) { console.log("ERRORS:", errors); failed++; }
  console.log(failed ? `${failed} FAILED` : "ALL PASSED");
  process.exit(failed ? 1 : 0);
})();
