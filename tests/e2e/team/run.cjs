// Browser test: Team & Collaboration (offline, against tests/e2e/scriptwriter/mock-api.cjs on :3911, web on :3902).
// Owner invites, changes roles and extra permissions; an invite link is accepted; a Reviewer then sees
// view-only workspaces and can't manage the team. Every saved state is checked again after a page reload.
const { chromium } = require("playwright");
const BASE = "http://localhost:3902", API = "http://localhost:3911", P = "11111111-1111-4111-8111-111111111111";
const OUT = process.env.E2E_OUT || require("os").tmpdir();
const api = async (method, p, body) => (await fetch(API + p, { method, headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) })).json();

(async () => {
  await api("POST", "/__test/as", { role: "owner", email: "you@aurastage.invalid" });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("dialog", (d) => d.accept());
  let failed = 0;
  const step = async (name, fn) => {
    try { await fn(); console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, e.message.split("\n")[0]); await page.screenshot({ path: `${OUT}/fail-team-${name.replace(/\W+/g, "_")}.png`, fullPage: true }); }
  };
  const reload = async () => { await page.reload(); await page.getByText("Make Films").waitFor(); };
  const ada = () => page.getByTestId("member-ada@aurastage.invalid");

  await page.goto(BASE + "/");
  await page.evaluate(() => localStorage.setItem("sb-localhost-auth-token", JSON.stringify({ access_token: "f", refresh_token: "f", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 36000, user: { id: "99999999-9999-4999-8999-999999999999", email: "you@aurastage.invalid", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "" } })));

  let link = "";
  await step("the sidebar opens Team & Collaboration; the owner sees everyone and their own role", async () => {
    await page.goto(`${BASE}/projects/${P}/scriptwriter`);
    await page.getByTestId("role-chip").getByText("Owner").waitFor();
    await page.getByRole("link", { name: "Team & Collaboration" }).click();
    await page.waitForURL(`**/projects/${P}/team`);
    await page.getByTestId("my-access").getByText("Your role: Studio owner").waitFor();
    await ada().getByRole("combobox").waitFor();
    if ((await ada().getByRole("combobox").inputValue()) !== "writer") throw new Error("Ada should be a Writer");
  });
  await step("invite someone as Editor: a private link is shown; the invite is kept after reload", async () => {
    await page.getByLabel("Email").fill("New.Editor@AuraStage.invalid");
    await page.getByLabel("Role on this project").selectOption("editor");
    await page.getByRole("button", { name: "Create invite link" }).click();
    await page.getByRole("status").getByText(/Invite ready for new.editor@aurastage.invalid/).waitFor();
    link = await page.getByLabel("Invite link").inputValue();
    if (!/\/invite#[0-9a-f]{48}$/.test(link)) throw new Error("bad link " + link);
    await reload();
    await page.getByTestId("invite-new.editor@aurastage.invalid").getByText(/Editor · expires/).waitFor();
  });
  await step("change a member's role; kept after reload", async () => {
    await ada().getByRole("combobox").selectOption("director");
    await ada().getByRole("button", { name: "Save" }).click();
    await page.getByRole("status").getByText("Role saved.").waitFor();
    await reload();
    if ((await ada().getByRole("combobox").inputValue()) !== "director") throw new Error("role not kept");
  });
  await step("give an extra permission on top of the role; role permissions are shown fixed; kept after reload", async () => {
    await ada().getByRole("button", { name: "Extra permissions" }).click();
    const grid = page.getByRole("table", { name: "Extra permissions" });
    if (!(await grid.getByLabel("Scriptwriter approve").isDisabled())) throw new Error("Director's own approve should be fixed");
    await grid.getByLabel("Audio approve").check();
    await ada().getByRole("button", { name: "Save" }).click();
    await page.getByRole("status").getByText("Role saved.").waitFor();
    await reload();
    await ada().getByText("audio · approve").waitFor();
  });
  await step("cancel an invite; gone after reload", async () => {
    await page.getByTestId("invite-new.editor@aurastage.invalid").getByRole("button", { name: "Cancel invite" }).click();
    await page.getByRole("status").getByText(/Invite for new.editor@aurastage.invalid cancelled/).waitFor();
    await reload();
    if (await page.getByTestId("invite-new.editor@aurastage.invalid").count()) throw new Error("invite still listed");
  });
  await step("an invite for another email can't be accepted by the wrong account", async () => {
    await page.getByLabel("Email").fill("someone.else@aurastage.invalid");
    await page.getByRole("button", { name: "Create invite link" }).click();
    link = await page.getByLabel("Invite link").inputValue();
    await page.goto(link);
    await page.getByText("You're signed in as you@aurastage.invalid. This invite is for someone.else@aurastage.invalid.").waitFor();
    if (await page.getByRole("button", { name: "Accept invite" }).count()) throw new Error("accept should not be offered");
  });
  await step("accepting an invite joins the project with that role", async () => {
    await page.goto(`${BASE}/projects/${P}/team`);
    await page.getByLabel("Email").fill("you@aurastage.invalid");
    await page.getByLabel("Role on this project").selectOption("reviewer");
    await page.getByRole("button", { name: "Create invite link" }).click();
    link = await page.getByLabel("Invite link").inputValue();
    await page.goto(link);
    await page.getByText(/invited you@aurastage.invalid to work on Shadows of Lagos as Reviewer/).waitFor();
    await page.getByRole("button", { name: "Accept invite" }).click();
    await page.waitForURL(`**/projects/${P}/team`);
    await page.getByTestId("my-access").getByText("Your role: Reviewer").waitFor();
  });
  await step("a Reviewer can't manage the team", async () => {
    await page.getByText("Only the project's producer or the studio's owners and admins can change the team.").waitFor();
    if (await page.getByRole("button", { name: "Create invite link" }).count()) throw new Error("reviewer sees invite form");
    if (await ada().getByRole("combobox").count()) throw new Error("reviewer can edit roles");
  });
  await step("workspaces show a Reviewer they're view-only (after reload too)", async () => {
    await page.goto(`${BASE}/projects/${P}/scriptwriter`);
    await page.getByTestId("view-only").getByText(/View only — as Reviewer/).waitFor();
    await page.getByTestId("role-chip").getByText("Reviewer").waitFor();
    await page.reload();
    await page.getByTestId("view-only").waitFor();
  });
  await step("the dashboard tells a member only producers start projects", async () => {
    await page.goto(`${BASE}/dashboard`);
    await page.getByTestId("member-note").waitFor();
    if (await page.getByRole("button", { name: /New Project/i }).count()) throw new Error("member sees New Project");
  });

  await api("POST", "/__test/as", { role: "owner" });
  await browser.close();
  if (errors.length) { console.log("ERRORS:", errors); failed++; }
  console.log(failed ? `${failed} FAILED` : "ALL PASSED");
  process.exit(failed ? 1 : 0);
})();
