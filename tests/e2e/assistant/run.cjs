// Browser test: Ask AuraStage (offline, mock on :3911, web on :3902). Plans come from the real labelled test planner.
// Ask → preview (before → after, TEST OUTPUT label) → Apply → reload shows the change → Undo → reload shows it gone.
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
    try { await fn(); console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, e.message.split("\n")[0]); await page.screenshot({ path: `${OUT}/fail-assistant-${name.replace(/\W+/g, "_")}.png`, fullPage: true }); }
  };
  await page.goto(BASE + "/");
  await page.evaluate(() => localStorage.setItem("sb-localhost-auth-token", JSON.stringify({ access_token: "f", refresh_token: "f", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 36000, user: { id: "99999999-9999-4999-8999-999999999999", email: "you@aurastage.invalid", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "" } })));
  const panel = () => page.getByRole("complementary", { name: "Ask AuraStage" });
  const openPanel = async () => {
    await page.getByRole("button", { name: "Ask AuraStage" }).click();
    await panel().waitFor();
  };
  const ask = async (text) => {
    await panel().getByLabel("What would you like to change?").fill(text);
    await panel().getByRole("button", { name: "Ask", exact: true }).click();
  };
  const story = () => page.getByRole("region", { name: "Story & Creative Summary" });

  await step("ask from any workspace; the suggestion shows before → after, labelled as test output, and changes nothing yet", async () => {
    await page.goto(`${BASE}/projects/${P}/scriptwriter`);
    await openPanel();
    await ask("Change the tone to Tense and brooding");
    await panel().getByTestId("proposal-status").getByText("Suggested").waitFor();
    await panel().getByTestId("test-output").getByText("DEVELOPMENT / TEST OUTPUT").waitFor();
    await panel().getByText("I'd update the story setup (tone).").waitFor();
    const change = panel().getByTestId("change");
    await change.getByRole("cell", { name: "tone", exact: true }).waitFor();
    await change.getByRole("cell", { name: "Tense and brooding" }).waitFor();
    await panel().getByText("Scriptwriter story setup").waitFor();
    const s = await api("GET", `/api/projects/${P}`);
    if (s.tone) throw new Error("changed before applying: " + s.tone);
  });
  await step("apply; the change is kept after a reload, in another workspace", async () => {
    await panel().getByRole("button", { name: "Apply" }).click();
    await panel().getByTestId("proposal-status").getByText("Applied").waitFor();
    await panel().getByTestId("applied-change").getByText(/Shadows of Lagos updated/).waitFor();
    await page.goto(`${BASE}/projects/${P}/settings`);
    await page.reload();
    await story().getByText("Tense and brooding").waitFor();
  });
  await step("undo from Recent requests after a reload; the previous value is back", async () => {
    await openPanel();
    await panel().getByRole("region", { name: "Recent requests" }).getByRole("button", { name: /Change the tone to Tense and brooding.*Applied · test/ }).click();
    await panel().getByRole("button", { name: "Undo" }).click();
    await panel().getByTestId("proposal-status").getByText("Undone").waitFor();
    await page.reload();
    await story().waitFor();
    if (await story().getByText("Tense and brooding").count()) throw new Error("tone still shown after undo");
  });
  await step("a request the test planner can't do says so plainly; nothing to apply", async () => {
    await openPanel();
    await ask("Write me a poem about the sea");
    await panel().getByText("I couldn't turn that into a change with the test planner.").waitFor();
    await panel().getByText(/Connect Claude for full understanding/).waitFor();
    if (!(await panel().getByRole("button", { name: "Apply" }).isDisabled())) throw new Error("Apply enabled with no changes");
    await panel().getByRole("button", { name: "Discard" }).click();
    await panel().getByTestId("proposal-status").getByText("Discarded").waitFor();
  });
  await step("a role that can't edit sees why, and can't apply", async () => {
    await api("POST", "/__test/as", { role: "reviewer" });
    await page.goto(`${BASE}/projects/${P}/scriptwriter`);
    await openPanel();
    await ask("Change the logline to A fixer must choose between family and the sea.");
    await panel().getByText(/Your role can't edit in this workspace/).waitFor();
    if (!(await panel().getByRole("button", { name: "Apply" }).isDisabled())) throw new Error("Apply enabled for a reviewer");
    await api("POST", "/__test/as", { role: "owner" });
  });

  await step("no page errors", async () => { if (errors.length) throw new Error(errors.join(" | ")); });
  await browser.close();
  console.log(failed ? `${failed} FAILED` : "ALL PASSED");
  process.exit(failed ? 1 : 0);
})();
