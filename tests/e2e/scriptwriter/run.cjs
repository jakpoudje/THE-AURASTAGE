const { chromium } = require("playwright");
const SP = process.env.E2E_OUT || require("os").tmpdir(), BASE = "http://localhost:3902", P = "11111111-1111-4111-8111-111111111111";
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text()));
  page.on("dialog", (d) => d.accept());
  await page.goto(BASE + "/sign-in");
  const session = { access_token: "fake", refresh_token: "fake", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 36000, user: { id: "u1", email: "e2e@aurastage.invalid", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };
  await page.evaluate((s) => localStorage.setItem("sb-localhost-auth-token", JSON.stringify(s)), session);
  const step = async (name, fn) => { try { await fn(); console.log("PASS", name); } catch (e) { console.log("FAIL", name, e.message.split("\n")[0]); await page.screenshot({ path: `${SP}/fail-${name.replace(/\W+/g, "_")}.png` }); } };

  await step("dashboard lists project and opens Scriptwriter", async () => {
    await page.goto(BASE + "/dashboard");
    await page.getByText("Open Scriptwriter →").click();
    await page.waitForURL(`**/projects/${P}/scriptwriter`);
    await page.getByText("Powerful Screenplay").waitFor();
  });
  await step("project setup saves and runtime plan shows", async () => {
    await page.getByPlaceholder("Tense, grounded").fill("Tense");
    await page.getByRole("button", { name: "Save story setup" }).click();
    await page.getByText("Story setup saved.").waitFor();
    await page.getByText("Runtime plan").waitFor();
    await page.getByText(/Act 1/).first().waitFor();
  });
  await page.screenshot({ path: `${SP}/1-setup.png`, fullPage: true });
  await step("Generate Script is honest: it needs an outline first", async () => {
    await page.locator("main nav button", { hasText: "Generate Script" }).click();
    await page.getByText(/Build a scene outline first/).waitFor();
  });
  await step("write, save v1, approve", async () => {
    await page.locator("main nav button", { hasText: "Edit & Refine" }).click();
    await page.getByText("Insert a short example").click();
    await page.getByText("Unsaved changes", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Save version" }).click();
    await page.getByText("Saved as version 1.").waitFor();
    await page.getByRole("button", { name: "Approve script" }).click();
    await page.getByText(/Script approved/).waitFor();
    await page.getByRole("button", { name: "Approved ✓" }).waitFor();
  });
  await page.screenshot({ path: `${SP}/2-editor.png`, fullPage: true });
  await step("preview renders", async () => {
    await page.getByRole("button", { name: "preview" }).click();
    await page.getByText("They buried it. But not deep enough.").waitFor();
    await page.getByRole("button", { name: "write" }).click();
  });
  await step("import FDX, save v2, approve -> changed scene flagged, removed scene omitted", async () => {
    await page.setInputFiles('input[type="file"]', require("path").join(__dirname, "sample.fdx"));
    await page.getByText(/Imported sample.fdx: 1 scene found/).waitFor();
    if ((await page.getByPlaceholder("Version note (optional)").inputValue()) !== "Imported from sample.fdx") throw new Error("note not prefilled");
    await page.getByRole("button", { name: "Save version" }).click();
    await page.getByText("Saved as version 2.").waitFor();
    await page.getByRole("button", { name: "Approve script" }).click();
    await page.getByText(/Script approved/).waitFor();
    await page.locator("main nav button", { hasText: "Scene Breakdown" }).click();
    await page.getByText("Review required").waitFor();
    await page.getByText("Omitted").waitFor();
  });
  await page.screenshot({ path: `${SP}/3-breakdown.png`, fullPage: true });
  await step("character extraction", async () => {
    await page.locator("main nav button", { hasText: "Character Extraction" }).click();
    await page.getByText("TUNDE").first().waitFor();
    await page.getByText(/1 line · 1 scene/).waitFor();
  });
  await step("unsupported file shows plain error", async () => {
    await page.locator("main nav button", { hasText: "Edit & Refine" }).click();
    await page.setInputFiles('input[type="file"]', { name: "script.docx", mimeType: "application/octet-stream", buffer: Buffer.from("PK") });
    await page.getByText(/Unsupported file type/).waitFor();
  });
  await step("item 13: import a screenplay PDF — headings, action, cues and dialogue come back from the page layout; it opens in the editor to save", async () => {
    const lines = [[108, 700, "INT. NEWSROOM - NIGHT"], [108, 676, "Rain against the glass. AMARA types."], [266, 652, "AMARA"], [180, 640, "They buried it."], [108, 616, "EXT. HARBOUR - DAWN"], [108, 592, "Tunde waits."]];
    const esc = (t) => t.replace(/[\\()]/g, (m) => `\\${m}`);
    const content = lines.map(([x, y, t]) => `BT /F1 12 Tf ${x} ${y} Td (${esc(t)}) Tj ET`).join("\n");
    const objs = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
      `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`, "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>"];
    let pdf = "%PDF-1.4\n"; const offs = [];
    objs.forEach((o, i) => { offs.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = Buffer.byteLength(pdf);
    pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    await page.setInputFiles('input[type="file"]', { name: "shadows.pdf", mimeType: "application/pdf", buffer: Buffer.from(pdf, "latin1") });
    await page.getByTestId("pdf-import-note").getByText(/Read 1 page from the PDF/).waitFor();
    const text = await page.getByLabel("Script text").inputValue();
    if (!/^INT\. NEWSROOM - NIGHT\n\nRain against the glass\. AMARA types\.\n\nAMARA\nThey buried it\.\n\nEXT\. HARBOUR - DAWN/.test(text)) throw new Error("PDF text: " + text.slice(0, 200));
    await page.getByRole("button", { name: "Discard them" }).click().catch(() => null);
  });
  await step("item 13: compare two saved versions — what changed, scene by scene and line by line", async () => {
    const cmp = page.getByRole("region", { name: "Compare versions" });
    await cmp.getByLabel("Compare from").selectOption({ label: "v1" });
    await cmp.getByLabel("Compare to").selectOption({ label: "v2" });
    await cmp.getByRole("button", { name: "Compare" }).click();
    await cmp.getByTestId("compare-summary").getByText(/^v1 → v2: /).waitFor();
    await cmp.getByRole("list", { name: "Scene changes" }).locator("li").first().waitFor();
  });
  await step("stale save gets a clear conflict message", async () => {
    await page.evaluate(async () => { await fetch("http://localhost:3911/api/projects/11111111-1111-4111-8111-111111111111/script/versions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source_text: "INT. X - DAY\n", base_version_id: (await (await fetch("http://localhost:3911/api/projects/11111111-1111-4111-8111-111111111111/script")).json()).current_version.id }) }); });
    const ta = page.locator("textarea"); await ta.fill((await ta.inputValue()) + "\nMore.\n");
    await page.getByRole("button", { name: "Save version" }).click();
    await page.getByText(/Someone saved a newer version while you were editing/).waitFor();
    await page.getByRole("button", { name: "Save mine as the newest version" }).click();
    await page.getByText(/Saved as version 4\./).waitFor();
  });
  await step("unsaved typing survives a reload and can be discarded", async () => {
    const ta = page.locator("textarea");
    await ta.fill((await ta.inputValue()) + "\nUNSAVED LINE FOR RECOVERY.\n");
    await page.waitForTimeout(800);
    await page.reload();
    await page.getByText(/We kept your unsaved changes/).waitFor();
    await page.locator("main nav button", { hasText: "Edit & Refine" }).click();
    if (!(await page.locator("textarea").inputValue()).includes("UNSAVED LINE FOR RECOVERY")) throw new Error("text not recovered");
    await page.getByText("Unsaved changes", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Discard them" }).click();
    if ((await page.locator("textarea").inputValue()).includes("UNSAVED LINE FOR RECOVERY")) throw new Error("not discarded");
    await page.getByText("All changes saved").waitFor();
  });
  await step("regression (owner 2026-09-30): old unsaved typing never hides a newer saved script from steps 5–7", async () => {
    const ta = page.locator("textarea");
    await ta.fill("INT. OLD FLAT - NIGHT\n\nOLDIE\nOld draft line.\n");
    await page.waitForTimeout(800);
    // A newer version arrives from elsewhere (e.g. AuraScript finished the full script) while the old typing sits on this device.
    await page.evaluate(async () => { const api = "http://localhost:3911/api/projects/11111111-1111-4111-8111-111111111111/script"; await fetch(`${api}/versions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source_text: "INT. NEW HALL - DAY\n\nNEWCOMER\nFresh script line.\n\nEXT. NEW YARD - NIGHT\n\nNEWCOMER\nStill here.\n", base_version_id: (await (await fetch(api)).json()).current_version.id }) }); });
    await page.reload();
    await page.getByText(/Showing your latest saved script/).waitFor();
    await page.locator("main nav button", { hasText: "Edit & Refine" }).click();
    if (!(await page.locator("textarea").inputValue()).includes("NEW HALL")) throw new Error("editor did not show the newer script");
    await page.locator("main nav button", { hasText: "Scene Breakdown" }).click();
    await page.getByText(/NEW YARD/).first().waitFor();
    await page.locator("main nav button", { hasText: "Character Extraction" }).click();
    await page.getByText("NEWCOMER").first().waitFor();
    if (await page.getByText("OLDIE").count()) throw new Error("old draft leaked into Character Extraction");
    await page.getByRole("button", { name: "Discard them" }).click();
    await page.reload();
    await page.locator("main nav button", { hasText: "Edit & Refine" }).click();
    if (await page.getByText(/Showing your latest saved script/).count()) throw new Error("stale draft not discarded");
  });
  console.log("ERRORS:", errors.filter((e) => !/Failed to load resource.*(409|404)/.test(e)));
  await browser.close();
})();
