// Browser test: Locations & Props — found in the approved script with evidence, described, confirmed, added by hand,
// reference views by time of day made in the background, saved in the Assets Library, kept after reload; a script
// change flags what's gone instead of deleting it.
// Needs tests/e2e/scriptwriter/mock-api.cjs on :3911 (fresh) and the web app on :3902 (see one.sh).
const { chromium } = require("playwright");
const BASE = "http://localhost:3902", API = "http://localhost:3911", P = "11111111-1111-4111-8111-111111111111";
const OUT = process.env.E2E_OUT || require("os").tmpdir();

const SCRIPT = `INT. TUNDE'S FLAT - KITCHEN - NIGHT

TUNDE OKAFOR (35) paces. He tears a page from a battered NOTEBOOK, then grabs his phone.

TUNDE
They buried it.

EXT. LAGOS HARBOUR - DAWN

AMARA BELLO (32) steps off a yellow danfo. She clutches the RED FILE.

AMARA
You came.

INT. TUNDE'S FLAT - DAY

The notebook lies open on the table.
`;

async function api(method, path, body) {
  const r = await fetch(API + path, { method, headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
  return r.json();
}

(async () => {
  const v = await api("POST", `/api/projects/${P}/script/versions`, { source_text: SCRIPT, base_version_id: null });
  await api("POST", `/api/projects/${P}/script/approve`, { version_id: v.id });
  await api("POST", `/api/projects/${P}/characters/sync`, {});

  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  let failed = 0;
  const step = async (name, fn) => {
    try { await fn(); console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, e.message.split("\n")[0]); await page.screenshot({ path: `${OUT}/fail-world-${name.replace(/\W+/g, "_")}.png`, fullPage: true }); }
  };
  await page.goto(BASE + "/");
  await page.evaluate(() => localStorage.setItem("sb-localhost-auth-token", JSON.stringify({ access_token: "f", refresh_token: "f", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 36000, user: { id: "u1", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "" } })));
  const list = (name) => page.getByRole("list", { name });
  const reload = async () => { await page.reload(); await page.getByTestId("world-sync-state").waitFor(); };

  await step("Locations & Props is in the sidebar; nothing found yet", async () => {
    await page.goto(`${BASE}/projects/${P}/scriptwriter`);
    await page.getByRole("link", { name: "Locations & Props" }).click();
    await page.waitForURL(`**/projects/${P}/world`);
    await page.getByTestId("world-sync-state").getByText("Not looked for yet.").waitFor();
  });
  await step("find them in the script: one location per place (with its times of day and areas), props with the line they come from; names are never props", async () => {
    await page.getByRole("button", { name: "Find locations & props in the script" }).click();
    await page.getByText(/Found 2 locations and \d+ props in script version 1/).waitFor();
    await list("Locations").getByRole("button", { name: /Tunde's Flat/ }).waitFor();
    await list("Locations").getByText(/2 scenes · night, day/).waitFor();
    await page.getByText(/areas: Kitchen/).waitFor();
    await page.getByRole("list", { name: "Scenes" }).getByText(/INT\. TUNDE'S FLAT - KITCHEN - NIGHT/).waitFor();
    await page.getByRole("tab", { name: /Props/ }).click();
    for (const n of ["Notebook", "Phone", "Red File", "Danfo"]) await list("Props").getByRole("button", { name: new RegExp(n) }).waitFor();
    if (await list("Props").getByRole("button", { name: /Tunde|Amara/ }).count()) throw new Error("a character was taken for a prop");
    await list("Props").getByRole("button", { name: /Notebook/ }).click();
    await page.getByRole("list", { name: "Scenes" }).getByText(/battered NOTEBOOK/).waitFor();
    await page.getByText(/Written in capitals/).waitFor();
  });
  await step("describe and confirm a location; reload: kept", async () => {
    await page.getByRole("tab", { name: /Locations/ }).click();
    await list("Locations").getByRole("button", { name: /Lagos Harbour/ }).click();
    await page.getByLabel("Description").fill("Rusting cranes, stacked containers, oily water");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("status").getByText("Saved.").waitFor();
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await page.getByRole("button", { name: "Confirmed ✓" }).waitFor();
    await reload();
    await list("Locations").getByRole("button", { name: /Lagos Harbour/ }).click();
    if ((await page.getByLabel("Description").inputValue()) !== "Rusting cranes, stacked containers, oily water") throw new Error("description not kept");
    await page.getByTestId("world-identity").getByText("Lagos Harbour — exterior. Rusting cranes, stacked containers, oily water.").waitFor();
  });
  await step("Describe from the script (free, built in): Ask AuraStage suggests a description from the script; applying shows it at once; reload: kept; undo restores it", async () => {
    await list("Locations").getByRole("button", { name: /Tunde's Flat/ }).click();
    if ((await page.getByLabel("Description").inputValue()) !== "") throw new Error("expected an empty description");
    await page.getByRole("button", { name: "Describe from the script (free)" }).click();
    const ask = page.getByRole("complementary", { name: "Ask AuraStage" });
    await ask.getByText(/Describe the location "Tunde's Flat"/).first().waitFor();
    await ask.getByTestId("proposal-provider").getByText(/built in · free/).waitFor({ timeout: 15000 });
    await ask.getByRole("button", { name: /^Apply/ }).click();
    await ask.getByText("Applied", { exact: true }).first().waitFor();
    // The page underneath re-reads at once — no manual reload.
    await page.waitForFunction(() => document.querySelector('textarea[aria-label="Description"]')?.value.includes("Tunde's Flat: interior"));
    const d = await page.getByLabel("Description").inputValue();
    if (!/^Tunde's Flat: interior.*Seen at .*(night|day).*Areas: Kitchen\./i.test(d)) throw new Error(`description: ${d}`);
    await reload();
    await list("Locations").getByRole("button", { name: /Tunde's Flat/ }).click();
    if (!(await page.getByLabel("Description").inputValue()).includes("Tunde's Flat: interior")) throw new Error("not kept after reload");
    await page.getByRole("button", { name: "Ask AuraStage" }).click();
    await ask.getByRole("region", { name: "Recent requests" }).getByRole("button", { name: /Describe the location "Tunde's Flat"/ }).click();
    await ask.getByRole("button", { name: "Undo", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('textarea[aria-label="Description"]')?.value === "");
    await ask.getByRole("button", { name: "Close" }).click();
    await list("Locations").getByRole("button", { name: /Lagos Harbour/ }).click();
  });
  await step("generate the reference set: views by time of day appear in the background; reload keeps them; they're in the Assets Library", async () => {
    await page.getByRole("button", { name: /Generate reference set \(3 views\)/ }).click();
    await page.getByText(/Making 3 views with AuraStage Sketch/).waitFor();
    await page.getByTestId("world-summary").getByText("3 of 4 made").waitFor({ timeout: 15000 });
    await page.getByTestId("view-establishing:DAWN").locator("img").waitFor();
    await page.screenshot({ path: `${OUT}/locations-props.png` });
    await reload();
    await list("Locations").getByRole("button", { name: /Lagos Harbour/ }).click();
    await page.getByTestId("world-summary").getByText("3 of 4 made").waitFor();
    await list("Locations").getByRole("button", { name: /Lagos Harbour/ }).locator("img").waitFor();
    const lib = await api("GET", `/api/projects/${P}/library`);
    if (lib.assets.filter((a) => /^Lagos Harbour — /.test(a.name)).length !== 3) throw new Error("views not in the Assets Library");
  });
  await step("a description change marks the views, never replaces them", async () => {
    await page.getByLabel("Description").fill("Rusting cranes at low tide");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByTestId("world-summary").getByText("3 of 4 made · 3 need a refresh").waitFor();
    await page.getByTestId("view-establishing:DAWN").getByText("Description changed").waitFor();
  });
  await step("props: add one by hand (duplicates refused), prop views include one in hand for scale", async () => {
    await page.getByRole("tab", { name: /Props/ }).click();
    await page.getByRole("button", { name: "+ Add prop" }).click();
    await page.getByLabel("New name").fill("Notebook");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByRole("alert").getByText(/already a prop called Notebook/).waitFor();
    await page.getByLabel("New name").fill("Brass key");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByText("Added “Brass key”.").waitFor();
    await list("Props").getByRole("button", { name: /Brass key/ }).click();
    await page.getByText("Added by hand").first().waitFor();
    await page.getByRole("button", { name: /Generate reference set \(4 views\)/ }).click();
    await page.getByTestId("view-in_hand").locator("img").waitFor({ timeout: 15000 });
    await page.screenshot({ path: `${OUT}/props.png` });
  });
  await step("describe every place and prop in one click (free, built in): only empty descriptions; reload: kept", async () => {
    await page.goto(`${BASE}/projects/${P}/world`);
    const w0 = await api("GET", `/api/projects/${P}/world`);
    const written = w0.locations.find((l) => l.description);
    await page.getByRole("button", { name: "Describe every place and prop (free)" }).click();
    const ask = page.getByRole("complementary", { name: "Ask AuraStage" });
    await ask.getByTestId("proposal-status").getByText(/Suggested/).waitFor();
    if (await ask.getByRole("button", { name: /^Apply/ }).isEnabled()) {
      await ask.getByRole("button", { name: /^Apply/ }).click();
      await ask.getByText("Applied", { exact: true }).first().waitFor();
    }
    await ask.getByRole("button", { name: "Close" }).click();
    await reload();
    const w1 = await api("GET", `/api/projects/${P}/world`);
    const empty = [...w1.locations, ...w1.props].filter((x) => !x.archived && !x.description);
    if (empty.length) throw new Error("still empty: " + empty.map((x) => x.name).join(", "));
    if (written && w1.locations.find((l) => l.id === written.id).description !== written.description) throw new Error("a written description was replaced");
  });
  await step("owner 2026-10-02: reference pictures for every place and prop in one click (free); a second click makes nothing new; reload: pictures there", async () => {
    await page.getByRole("button", { name: "Make reference pictures for every place and prop (free)" }).click();
    await page.getByText(/^Making \d+ reference pictures? for \d+ places?/).waitFor();
    await page.getByRole("button", { name: "Make reference pictures for every place and prop (free)" }).click();
    await page.getByText("Every place and prop already has its reference pictures from the current description.").waitFor();
    const w = await api("GET", `/api/projects/${P}/world`);
    const first = w.locations.find((l) => !l.archived);
    await api("GET", `/api/world/location/${first.id}/look`); // the mock "worker" draws on the second read
    const look = await api("GET", `/api/world/location/${first.id}/look`);
    if (!look.views.filter((v) => v.in_default_set).every((v) => v.image)) throw new Error("views not made for " + first.name);
    await reload();
  });
  await step("item 12: set dressing and prop continuity (free) — the notebook torn in scene 1 is flagged in scene 3; each scene's props with their state; reload: kept", async () => {
    await reload();
    const panel = page.getByRole("region", { name: "Set dressing and continuity" });
    await panel.getByText(/1 to check/).waitFor();
    await panel.getByRole("button", { name: /Set dressing & prop continuity/ }).click();
    await panel.getByRole("list", { name: "Continuity to check" }).getByText("Notebook was torn in scene 1 — keep it torn in scene 3, or show it repaired or replaced.").waitFor();
    const row1 = panel.locator("tr", { hasText: "Scene 1" });
    if (!/Notebook \(torn\)/.test(await row1.innerText()) || /Phone \(/.test(await row1.innerText())) throw new Error("scene 1 dressing: " + (await row1.innerText()));
    await panel.getByRole("button", { name: "Open prop" }).click();
    await page.getByRole("list", { name: "Scenes" }).getByText("torn").first().waitFor();
  });
  await step("a script change flags what's gone (kept, with its views) instead of deleting it", async () => {
    const v2 = await api("POST", `/api/projects/${P}/script/versions`, { source_text: SCRIPT.replace(/EXT\. LAGOS HARBOUR[\s\S]*?You came\.\n/, ""), base_version_id: v.id });
    await api("POST", `/api/projects/${P}/script/approve`, { version_id: v2.id });
    await reload();
    await page.getByTestId("world-sync-state").getByText("The approved script changed since the last look.").waitFor();
    await page.getByRole("button", { name: "Find locations & props in the script" }).click();
    await page.getByText(/no longer in the script — kept and flagged/).waitFor();
    await list("Locations").getByRole("button", { name: /Lagos Harbour.*NOT IN SCRIPT/ }).click();
    await page.getByText(/No longer found in the approved script/).waitFor();
    await page.getByTestId("world-summary").getByText(/3 of 4 made/).waitFor();
  });
  if (errors.length) { failed++; console.log("FAIL page errors", errors); }
  await browser.close();
  console.log(failed ? `${failed} FAILED` : "ALL PASSED");
  process.exit(failed ? 1 : 0);
})();
