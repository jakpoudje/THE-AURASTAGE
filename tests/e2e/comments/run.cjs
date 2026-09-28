// Browser test: comments, mentions, review requests, notifications and activity (offline, mock on :3911, web on :3902).
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
    try { await fn(); console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, e.message.split("\n")[0]); await page.screenshot({ path: `${OUT}/fail-comments-${name.replace(/\W+/g, "_")}.png`, fullPage: true }); }
  };
  const drawer = () => page.getByRole("complementary", { name: "Comments" });
  const openComments = async () => { if (!(await drawer().count())) await page.getByRole("button", { name: "Comments", exact: true }).click(); await drawer().waitFor(); };

  await page.goto(BASE + "/");
  await page.evaluate(() => localStorage.setItem("sb-localhost-auth-token", JSON.stringify({ access_token: "f", refresh_token: "f", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 36000, user: { id: "99999999-9999-4999-8999-999999999999", email: "you@aurastage.invalid", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "" } })));

  await step("comment in Scriptwriter mentioning a teammate; kept after reload", async () => {
    await page.goto(`${BASE}/projects/${P}/scriptwriter`);
    await openComments();
    await drawer().getByLabel("Write a comment").fill("Scene 1 needs a stronger button.");
    await drawer().getByLabel("Mention someone").selectOption({ label: "ada@aurastage.invalid" });
    await drawer().getByText("Will notify: ada@aurastage.invalid").waitFor();
    await drawer().getByRole("button", { name: "Comment", exact: true }).click();
    await drawer().getByText(/Scene 1 needs a stronger button\. @ada/).waitFor();
    await page.reload();
    await openComments();
    await drawer().getByText(/Scene 1 needs a stronger button/).waitFor();
  });
  await step("reply, then resolve: the thread moves to Resolved; kept after reload", async () => {
    await drawer().getByRole("button", { name: "Reply" }).first().click();
    await drawer().getByLabel("Write a comment").fill("Agreed — I'll punch it up.");
    await drawer().getByRole("button", { name: "Reply", exact: true }).last().click();
    await drawer().getByText("Agreed — I'll punch it up.").waitFor();
    await drawer().getByRole("button", { name: "Resolve" }).click();
    await drawer().getByText("No open comments here.").waitFor();
    await page.reload();
    await openComments();
    await drawer().getByText("No open comments here.").waitFor();
    await drawer().getByRole("tab", { name: "resolved" }).click();
    await drawer().getByText(/Resolved by you/).waitFor();
  });
  await step("request a review from the Comments panel; it shows in Tasks & reviews; mark done; kept after reload", async () => {
    await drawer().getByRole("button", { name: "Request review" }).click();
    await drawer().getByLabel("Reviewer").selectOption({ label: "ada@aurastage.invalid" });
    await drawer().getByLabel("Review title").fill("Review scene 1 punch-up");
    await drawer().getByRole("button", { name: "Send request" }).click();
    await drawer().getByRole("status").getByText(/Review requested/).waitFor();
    await page.goto(`${BASE}/projects/${P}/team`);
    const row = page.getByTestId("task-Review scene 1 punch-up");
    await row.getByText(/for ada@aurastage.invalid/).waitFor();
    await row.getByRole("checkbox").click();
    await row.getByText("Done").waitFor();
    await page.reload();
    await page.getByTestId("task-Review scene 1 punch-up").getByText("Done").waitFor();
  });
  await step("a task assigned to me shows on the dashboard", async () => {
    await page.getByLabel("Task title").fill("Lock the picture by Friday");
    await page.getByLabel("Assign to").selectOption({ label: "you@aurastage.invalid" });
    await page.getByLabel("Workspace").selectOption("editorial");
    await page.getByRole("button", { name: "Add task" }).click();
    await page.getByTestId("task-Lock the picture by Friday").waitFor();
    await page.goto(`${BASE}/dashboard`);
    await page.getByTestId("my-tasks").getByText("Lock the picture by Friday").waitFor();
  });
  await step("Editorial: a comment pinned to the playhead timecode; kept after reload", async () => {
    await page.goto(`${BASE}/projects/${P}/editorial`);
    await openComments();
    await drawer().getByText(/at 00:00:00:00/).waitFor();
    await drawer().getByLabel("Write a comment").fill("Trim the head of this shot.");
    await drawer().getByRole("button", { name: "Comment", exact: true }).click();
    await drawer().getByRole("button", { name: "⏱ 00:00:00:00" }).waitFor();
    await page.reload();
    await openComments();
    await drawer().getByText("Trim the head of this shot.").waitFor();
    await drawer().getByRole("button", { name: "⏱ 00:00:00:00" }).click();
  });
  await step("a teammate mentions me: the bell counts it, the link opens the comment; read after reload", async () => {
    await api("POST", "/__test/ada-mentions-you");
    await page.goto(`${BASE}/projects/${P}/team`);
    await page.getByTestId("unread-count").getByText("1").waitFor();
    await page.getByRole("button", { name: /Notifications, 1 unread/ }).click();
    await page.getByRole("dialog", { name: "Notifications" }).getByText(/ada@aurastage.invalid mentioned you in Scriptwriter/).click();
    await page.waitForURL(/\/scriptwriter\?comment=/);
    await drawer().getByText("Can you check scene 1?").waitFor();
    await page.reload();
    await page.getByRole("button", { name: "Notifications", exact: true }).waitFor();
    if (await page.getByTestId("unread-count").count()) throw new Error("still unread");
  });
  await step("the Team page shows recent activity in plain language", async () => {
    await page.goto(`${BASE}/projects/${P}/team`);
    const feed = page.getByRole("list", { name: "Recent activity" });
    await feed.getByText("commented in Editorial & Timeline at 00:00:00:00").waitFor();
    await feed.getByText("resolved a comment thread in Scriptwriter").waitFor();
    await feed.getByText(/asked for a review in Scriptwriter/).waitFor();
  });

  await browser.close();
  if (errors.length) { console.log("ERRORS:", errors); failed++; }
  console.log(failed ? `${failed} FAILED` : "ALL PASSED");
  process.exit(failed ? 1 : 0);
})();
