// Browser test: Scene DNA (offline, against tests/e2e/scriptwriter/mock-api.cjs on :3911,
// web on :3902 built with NEXT_PUBLIC_API_URL=http://localhost:3911 NEXT_PUBLIC_SUPABASE_URL=http://localhost:3912).
const { chromium } = require("playwright");
const BASE = "http://localhost:3902", API = "http://localhost:3911", P = "11111111-1111-4111-8111-111111111111";
const OUT = process.env.E2E_OUT || require("os").tmpdir();

const V1 = `INT. NEWSROOM - NIGHT

Rain lashes the windows. TUNDE OKAFOR (35) and AMARA BELLO (32) argue.

TUNDE
They buried it.

AMARA
Then we dig it up!

EXT. HARBOUR - CONTINUOUS

Waves slap the jetty. Tunde walks alone.
`;
const V2 = V1.replace("Then we dig it up!", "Then we dig it up. Tonight.");

async function api(method, path, body) {
  const r = await fetch(API + path, { method, headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
  return r.json();
}

(async () => {
  const v1 = await api("POST", `/api/projects/${P}/script/versions`, { source_text: V1, base_version_id: null });
  await api("POST", `/api/projects/${P}/script/approve`, { version_id: v1.id });
  await api("POST", `/api/projects/${P}/characters/sync`, {});
  await api("POST", `/api/projects/${P}/dialogue/sync`, {});
  const cast = await api("GET", `/api/projects/${P}/characters`);
  const tunde = cast.characters.find((c) => c.name === "Tunde Okafor");
  await api("POST", `/api/characters/${tunde.id}/looks`, { name: "Field outfit", description: "Khaki jacket" });

  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("dialog", (d) => d.accept());
  let failed = 0;
  const step = async (name, fn) => {
    try { await fn(); console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, e.message.split("\n")[0]); await page.screenshot({ path: `${OUT}/fail-scenedna-${name.replace(/\W+/g, "_")}.png` }); }
  };
  const tab = (name) => page.getByRole("tab", { name, exact: true }).click();
  const readiness = () => page.getByRole("list", { name: "Readiness checks" });

  await page.goto(BASE + "/");
  await page.evaluate(() => localStorage.setItem("sb-localhost-auth-token", JSON.stringify({ access_token: "f", refresh_token: "f", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 36000, user: { id: "u1", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "" } })));

  await step("dialogue links to Scene DNA; every scene is listed", async () => {
    await page.goto(`${BASE}/projects/${P}/dialogue`);
    await page.getByRole("link", { name: "Next: Scene DNA →" }).click();
    await page.waitForURL(`**/projects/${P}/scene-dna`);
    await page.getByText("Production Blueprint").waitFor();
    await page.getByText("Scenes (2)").waitFor();
    await page.getByText(/0 of 2 scenes locked/).waitFor();
  });
  await step("lock is blocked until the scene's dialogue is approved, with evidence", async () => {
    await readiness().getByText("0 of 2 lines approved").waitFor();
    if (await page.getByRole("button", { name: "Lock Scene DNA" }).isEnabled()) throw new Error("lock should be disabled");
  });
  await step("fill the blueprint using what the script says, then save", async () => {
    await page.getByLabel("Purpose").fill("Tunde decides to publish.");
    await page.getByLabel("Add a mood").fill("tense");
    await page.getByLabel("Add a mood").press("Enter");
    await tab("Visual & Sound");
    await page.getByRole("button", { name: /\+ rain · line 3/ }).click();
    if ((await page.getByLabel("Weather").inputValue()) !== "rain") throw new Error("weather not applied");
    await page.getByRole("radio", { name: "Measured" }).click();
    await tab("Performance");
    await page.getByLabel("Wardrobe for Tunde Okafor").selectOption({ label: "Field outfit" });
    await page.getByRole("button", { name: "Save Scene DNA" }).click();
    await page.getByText("Scene DNA saved.").waitFor();
    await page.getByRole("button", { name: /INT\. NEWSROOM/ }).getByText("In progress").waitFor();
  });
  await step("saved Scene DNA persists across reloads", async () => {
    await page.reload();
    await page.getByText("Production Blueprint").waitFor();
    if ((await page.getByLabel("Purpose").inputValue()) !== "Tunde decides to publish.") throw new Error("purpose lost");
    await page.getByLabel("Remove tense").waitFor();
    await readiness().getByText("No look chosen: Amara Bello").waitFor();
  });
  await step("on-screen text (task 43): write \"LAGOS — 1995\" at the top of the frame, save; reload: kept", async () => {
    await tab("Notes");
    await page.getByLabel("On-screen text").fill("LAGOS — 1995");
    await page.getByLabel("Where the text sits").selectOption("top");
    await page.getByRole("button", { name: "Save Scene DNA" }).click();
    await page.getByText("Scene DNA saved.").waitFor();
    await page.reload();
    await page.getByText("Production Blueprint").waitFor();
    await tab("Notes");
    if ((await page.getByLabel("On-screen text").inputValue()) !== "LAGOS — 1995") throw new Error("on-screen text lost");
    if ((await page.getByLabel("Where the text sits").inputValue()) !== "top") throw new Error("position lost");
    await tab("Scene Overview");
  });
  await step("unsaved typing is kept on this device and can be discarded", async () => {
    await tab("Notes");
    await page.getByLabel("Notes & references").fill("Handheld feel");
    await page.waitForTimeout(200);
    await page.reload();
    await page.getByText("We kept your unsaved changes").waitFor();
    await tab("Notes");
    if ((await page.getByLabel("Notes & references").inputValue()) !== "Handheld feel") throw new Error("draft not restored");
    await page.getByRole("button", { name: "discard" }).click();
    if ((await page.getByLabel("Notes & references").inputValue()) !== "") throw new Error("draft not discarded");
  });
  await step("once dialogue is approved the scene can be locked", async () => {
    const ws = await api("GET", `/api/projects/${P}/dialogue`);
    await api("POST", `/api/projects/${P}/dialogue/scenes/${ws.scenes[0].id}/approve`, {});
    await page.reload();
    await readiness().getByText("2 of 2 lines approved").waitFor();
    await page.getByRole("button", { name: "Lock Scene DNA" }).click();
    await page.getByText(/Scene DNA locked as version 1, with 6 upstream sources recorded/).waitFor();
    await page.getByRole("button", { name: "Locked · version 1 ✓" }).waitFor();
    await page.getByRole("button", { name: /INT\. NEWSROOM/ }).getByText("DNA Complete").waitFor();
    await page.getByText(/1 of 2 scenes locked/).waitFor();
  });
  await step("a Casting change flags the locked scene for review with evidence (never deleted)", async () => {
    await api("PATCH", `/api/characters/${tunde.id}`, { description: "Now a disgraced reporter" });
    await page.reload();
    await page.getByText("Something this scene depends on changed since you locked version 1").waitFor();
    await page.getByText("Tunde Okafor (character) changed since approval.").waitFor();
    await page.getByRole("button", { name: /INT\. NEWSROOM/ }).getByText("Review").waitFor();
    await page.getByText("Locked version 1 is kept in history.").waitFor();
    await page.getByRole("button", { name: "Lock again (new version)" }).click();
    await page.getByText(/locked as version 2/).waitFor();
    if (await page.getByText(/depends on changed since you locked/).count()) throw new Error("review banner still shown");
  });
  await step("a silent scene shows continuity from the previous scene", async () => {
    await page.getByRole("button", { name: /EXT\. HARBOUR/ }).click();
    await readiness().getByText("The script has no dialogue in this scene.").waitFor();
    await tab("Continuity");
    await page.getByText(/Continues directly from scene 1/).waitFor();
    await tab("Performance");
    await page.getByText("This is a silent scene").waitFor();
  });
  await step("each section has AI help from the script (owner request 2026-09-30): Continuity notes are suggested from the scenes around it, applied, shown; reload: kept", async () => {
    await tab("Continuity");
    await page.getByTestId("section-ai").getByText("What must match the scenes before and after.").waitFor();
    await page.getByRole("button", { name: "Fill Continuity from the script" }).click();
    const panel = page.getByRole("complementary", { name: "Ask AuraStage" });
    await panel.getByTestId("proposal-status").getByText("Suggested").waitFor();
    // Built in and free (owner, 2026-09-30: only third-party generation costs money).
    await panel.getByTestId("proposal-provider").getByText(/built in · free/).waitFor();
    await panel.getByRole("button", { name: "Apply" }).click();
    await panel.getByTestId("proposal-status").getByText("Applied").waitFor();
    await panel.getByRole("button", { name: "Close" }).click();
    for (let i = 0; i < 40 && !/Scene 1/.test(await page.getByLabel("Continuity notes").inputValue()); i++) await page.waitForTimeout(250);
    if (!/Scene 1/.test(await page.getByLabel("Continuity notes").inputValue())) throw new Error("the applied notes didn't show without a reload");
    await page.reload();
    await page.getByText("Production Blueprint").waitFor();
    await page.getByRole("button", { name: /EXT\. HARBOUR/ }).click();
    await tab("Continuity");
    if (!/Scene 1/.test(await page.getByLabel("Continuity notes").inputValue())) throw new Error("continuity notes lost after reload");
    for (const t of ["Scene Overview", "Visual & Sound", "Performance"]) {
      await tab(t);
      await page.getByRole("button", { name: `Fill ${t} from the script` }).waitFor();
    }
  });
  await step("age for this scene: a flashback age is chosen, saved, kept after reload and locked; changing it in Casting flags the scene", async () => {
    const st = await api("POST", `/api/characters/${tunde.id}/ages`, { label: "Flashback, 1995", age: "12", description: "Skinny, school uniform" });
    await page.reload();
    await page.getByRole("button", { name: /INT\. NEWSROOM/ }).click();
    await tab("Performance");
    // "TUNDE OKAFOR (35)" is his introduction, not a time clue.
    if (await page.getByRole("note", { name: "Story time" }).count()) throw new Error("a character introduction was taken for a time clue");
    await page.getByLabel("Age of Tunde Okafor in this scene").selectOption({ label: "Flashback, 1995 (12)" });
    await page.getByRole("button", { name: "Save Scene DNA" }).click();
    await page.getByText("Scene DNA saved.").waitFor();
    await page.reload();
    await page.getByRole("button", { name: /INT\. NEWSROOM/ }).click();
    await tab("Performance");
    if ((await page.getByLabel("Age of Tunde Okafor in this scene").inputValue()) !== st.id) throw new Error("age not kept after reload");
    await page.getByRole("button", { name: "Lock again (new version)" }).click();
    await page.getByText(/locked as version 3/).waitFor();
    await api("POST", `/api/characters/${tunde.id}/ages`, { id: st.id, label: "Flashback, 1995", age: "13", description: "Skinny, school uniform" });
    await page.reload();
    await page.getByText("Tunde Okafor — Flashback, 1995 (age 13) (character age) changed since approval.").waitFor();
    await page.getByRole("button", { name: "Lock again (new version)" }).click();
    await page.getByText(/locked as version 4/).waitFor();
  });
  await step("changing the scene text in the script marks the locked scene stale", async () => {
    const v2 = await api("POST", `/api/projects/${P}/script/versions`, { source_text: V2, base_version_id: v1.id });
    await api("POST", `/api/projects/${P}/script/approve`, { version_id: v2.id });
    await page.reload();
    await page.getByRole("button", { name: /INT\. NEWSROOM/ }).getByText("Stale").waitFor();
    await page.getByRole("button", { name: /INT\. NEWSROOM/ }).click();
    await page.getByText(/The scene itself changed in the script since you locked version 4/).waitFor();
  });
  await step("whole film (owner, 2026-09-30: downstream pages too): every scene's DNA filled free in one click — only empty fields; reload keeps it; lock every ready scene in one click", async () => {
    const before = await api("GET", `/api/projects/${P}/scene-dna`);
    const written = before.scenes.find((e) => e.editable.purpose);
    await page.getByRole("group", { name: "Whole film" }).getByRole("button", { name: "1 · Fill every scene's Scene DNA (free)" }).click();
    const panel = page.getByRole("complementary", { name: "Ask AuraStage" });
    await panel.getByTestId("proposal-status").getByText("Suggested").waitFor();
    await panel.getByTestId("proposal-provider").getByText(/built in · free/).waitFor();
    await panel.getByRole("button", { name: "Apply" }).click();
    await panel.getByTestId("proposal-status").getByText("Applied").waitFor();
    await panel.getByRole("button", { name: "Close" }).click();
    await page.reload();
    const after = await api("GET", `/api/projects/${P}/scene-dna`);
    const active = after.scenes.filter((e) => e.scene.status === "active");
    if (!active.every((e) => e.editable.lighting_intent && e.editable.sound_intent && e.editable.purpose)) throw new Error("a scene was left empty");
    if (written && after.scenes.find((e) => e.scene.id === written.scene.id).editable.purpose !== written.editable.purpose) throw new Error("a written purpose was replaced");
    const lock = page.getByRole("group", { name: "Whole film" }).getByRole("button", { name: /^2 · Lock every ready scene/ });
    if (await lock.isEnabled()) {
      await lock.click();
      await page.getByText(/Locked \d+ of \d+ ready scene/).waitFor();
    }
  });
  await page.screenshot({ path: `${OUT}/scene-dna.png`, fullPage: true });
  console.log("ERRORS:", errors);
  await browser.close();
  process.exit(failed || errors.length ? 1 : 0);
})();
