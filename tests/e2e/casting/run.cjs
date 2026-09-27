// Browser test: Casting & Characters + sign-in/sign-up messaging.
// Needs tests/e2e/scriptwriter/mock-api.cjs on :3911 (fresh) and the web app on :3902
// built with NEXT_PUBLIC_API_URL=http://localhost:3911 NEXT_PUBLIC_SUPABASE_URL=http://localhost:3912.
const http = require("http");
const { chromium } = require("playwright");
const BASE = "http://localhost:3902", API = "http://localhost:3911", P = "11111111-1111-4111-8111-111111111111";
const OUT = process.env.E2E_OUT || require("os").tmpdir();

const SCRIPT = `INT. NEWSROOM - MORNING

TUNDE OKAFOR (35), an investigative journalist, reviews documents.

TUNDE
Someone has to tell the truth.

EXT. LAGOS HARBOUR - DAWN

AMARA BELLO (32) waits by the water. DETECTIVE RAMOS watches from a car.

AMARA
You came.

DET. RAMOS
(into radio)
They're meeting.

TUNDE
I always do.
`;

// Minimal stand-in for Supabase Auth so the sign-up error path can be exercised offline.
const auth = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") return res.end();
  res.setHeader("Content-Type", "application/json");
  if (req.url.startsWith("/auth/v1/signup")) {
    res.statusCode = 422;
    return res.end(JSON.stringify({ code: 422, error_code: "user_already_exists", msg: "User already registered" }));
  }
  if (req.url.startsWith("/auth/v1/token")) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" }));
  }
  if (req.url.startsWith("/auth/v1/recover")) return res.end("{}");
  res.statusCode = 404;
  res.end("{}");
});

async function api(method, path, body) {
  const r = await fetch(API + path, { method, headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
  return r.json();
}

(async () => {
  await new Promise((r) => auth.listen(3912, r));
  // Seed: an approved script.
  const v = await api("POST", `/api/projects/${P}/script/versions`, { source_text: SCRIPT, base_version_id: null });
  await api("POST", `/api/projects/${P}/script/approve`, { version_id: v.id });

  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("dialog", (d) => d.accept());
  let failed = 0;
  const step = async (name, fn) => {
    try {
      await fn();
      console.log("PASS", name);
    } catch (e) {
      failed++;
      console.log("FAIL", name, e.message.split("\n")[0]);
      await page.screenshot({ path: `${OUT}/fail-casting-${name.replace(/\W+/g, "_")}.png` });
    }
  };

  await step("sign-up with an existing email explains and offers Sign in", async () => {
    await page.goto(BASE + "/sign-up");
    await page.getByLabel("Email").fill("julius@example.com");
    await page.getByLabel("Password").fill("secret123");
    await page.getByRole("button", { name: "Create account" }).click();
    await page.getByText("This email already has an account. Sign in instead.").waitFor();
    await page.getByRole("button", { name: "Go to Sign in" }).click();
    await page.getByRole("heading", { name: "Welcome back" }).waitFor();
  });
  await step("wrong password offers reset, reset link can be requested", async () => {
    await page.getByLabel("Email").fill("julius@example.com");
    await page.getByLabel("Password").fill("wrong-pass");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.getByText(/don't match/).waitFor();
    await page.getByRole("button", { name: "Reset password" }).click();
    await page.getByRole("heading", { name: "Reset your password" }).waitFor();
    await page.getByRole("button", { name: "Send reset link" }).click();
    await page.getByText(/reset link is on its way/).waitFor();
  });

  const session = { access_token: "f", refresh_token: "f", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 36000, user: { id: "u1", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "" } };
  await page.evaluate((s) => localStorage.setItem("sb-localhost-auth-token", JSON.stringify(s)), session);

  await step("signed-in visit to sign-in goes to dashboard", async () => {
    await page.goto(BASE + "/sign-in");
    await page.waitForURL("**/dashboard");
  });
  await step("scriptwriter points to Casting once approved", async () => {
    await page.goto(`${BASE}/projects/${P}/scriptwriter`);
    await page.getByRole("link", { name: /Next: Casting/ }).click();
    await page.waitForURL(`**/projects/${P}/casting`);
    await page.getByText("Bring Your").waitFor();
  });
  await step("find characters in the approved script", async () => {
    await page.getByRole("button", { name: "Find characters in script" }).click();
    await page.getByText(/Characters updated from the approved script: 3 new/).waitFor();
    await page.getByText("Characters (3)").waitFor();
    await page.getByText(/Up to date with approved script version 1/).waitFor();
  });
  await step("uncertain name waits for confirmation, then is added", async () => {
    await page.getByText("Needs your confirmation (1)").waitFor();
    await page.getByText("Detective Ramos").first().waitFor();
    await page.getByRole("button", { name: "Add as character" }).click();
    await page.getByText("Characters (4)").waitFor();
  });
  await step("profile shows script evidence and aliases", async () => {
    await page.getByRole("button", { name: /Tunde Okafor/ }).click();
    await page.getByRole("heading", { name: "Tunde Okafor" }).waitFor();
    await page.getByText("Age 35").waitFor();
    await page.getByRole("button", { name: "Scenes & Continuity" }).click();
    await page.getByText(/Line \d+: speaks/).first().waitFor();
    await page.getByRole("button", { name: "Names & Merges" }).click();
    await page.getByText("Tunde", { exact: true }).waitFor();
  });
  await step("edit and approve a character; checklist reflects it", async () => {
    await page.getByRole("button", { name: "Profile", exact: true }).click();
    await page.getByLabel("Occupation").fill("Investigative journalist");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByText("Character saved.").waitFor();
    await page.getByText("Investigative journalist").first().waitFor();
    await page.getByRole("button", { name: "Approve character" }).click();
    await page.getByRole("button", { name: "Reopen for edits" }).waitFor();
    await page.getByText(/checks passed/).waitFor();
  });
  await step("rename clash is refused with a clear message", async () => {
    await page.getByLabel("Name", { exact: true }).fill("Amara Bello");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByText("another character already uses that name").waitFor();
  });
  await step("merge a duplicate and undo it", async () => {
    await page.goto(`${BASE}/projects/${P}/casting`);
    await page.getByRole("button", { name: /Det\. Ramos/ }).click();
    await page.getByRole("button", { name: "Names & Merges" }).click();
    await page.locator("select").last().selectOption({ label: "Detective Ramos" });
    await page.getByRole("button", { name: "Merge", exact: true }).click();
    await page.getByText(/Merged\. You can undo/).waitFor();
    await page.getByText("Characters (3)").waitFor();
    await page.getByRole("button", { name: "Names & Merges" }).click();
    await page.getByText("“Detective Ramos” merged into this character").waitFor();
    await page.getByRole("button", { name: "Undo" }).click();
    await page.getByText(/Merge undone/).waitFor();
    await page.getByText("Characters (4)").waitFor();
  });
  await step("add a character by hand; duplicate names refused", async () => {
    await page.goto(`${BASE}/projects/${P}/casting`);
    await page.getByRole("button", { name: "+ Add Character" }).click();
    await page.getByPlaceholder("Character name").fill("Chief Adeyemi");
    await page.getByLabel("New character role").selectOption("supporting");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByText("Added Chief Adeyemi.").waitFor();
    await page.getByRole("heading", { name: "Chief Adeyemi" }).waitFor();
    await page.getByRole("button", { name: "+ Add Character" }).click();
    await page.getByPlaceholder("Character name").fill("tunde okafor");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByText("a character with that name already exists").waitFor();
  });
  await step("relationships: add, see shared scenes, update, remove", async () => {
    await page.goto(`${BASE}/projects/${P}/casting`);
    await page.getByRole("button", { name: /Tunde Okafor/ }).click();
    await page.getByRole("button", { name: "Relationships", exact: true }).click();
    await page.getByLabel("Other character").selectOption({ label: "Amara Bello" });
    await page.getByLabel("Relationship", { exact: true }).fill("Love interest");
    await page.getByRole("button", { name: "Save relationship" }).click();
    await page.getByText("Relationship saved.").waitFor();
    await page.getByRole("button", { name: "Relationships", exact: true }).click();
    await page.getByText("· Love interest").waitFor();
    await page.getByText(/Together in 1 scene/).waitFor();
    await page.getByRole("button", { name: "Remove", exact: true }).click();
    await page.getByText("Relationship removed.").waitFor();
  });
  await step("wardrobe: add, edit, duplicate refused", async () => {
    await page.getByRole("button", { name: "Wardrobe", exact: true }).click();
    await page.getByRole("button", { name: "+ Add look" }).click();
    await page.getByLabel("Look name").fill("Field outfit");
    await page.getByLabel("Look description").fill("Khaki jacket, press badge");
    await page.getByRole("button", { name: "Save look" }).click();
    await page.getByText('Look "Field outfit" saved.').waitFor();
    await page.getByRole("button", { name: "Wardrobe", exact: true }).click();
    await page.getByText("Khaki jacket, press badge").waitFor();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByLabel("Look description").fill("Khaki jacket, press badge, worn boots");
    await page.getByRole("button", { name: "Save look" }).click();
    await page.getByRole("button", { name: "Wardrobe", exact: true }).click();
    await page.getByText("worn boots").waitFor();
    await page.getByRole("button", { name: "+ Add look" }).click();
    await page.getByLabel("Look name").fill("FIELD OUTFIT");
    await page.getByRole("button", { name: "Save look" }).click();
    await page.getByText("this character already has a look with that name").waitFor();
  });
  await page.screenshot({ path: `${OUT}/casting.png` });
  console.log("ERRORS:", errors);
  await browser.close();
  auth.close();
  process.exit(failed || errors.length ? 1 : 0);
})();
