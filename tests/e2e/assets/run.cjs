// Browser test: Assets Library (offline, mock on :3911, web on :3902). Real PNG files are uploaded through the
// page's file picker; every saved state is checked again after a page reload.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), zlib = require("zlib");
const BASE = "http://localhost:3902", API = "http://localhost:3911", P = "11111111-1111-4111-8111-111111111111";
const OUT = process.env.E2E_OUT || require("os").tmpdir();
const api = async (method, p, body) => (await fetch(API + p, { method, headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) })).json();

/** A real, decodable w×h RGB PNG filled with one colour. */
function png(file, w, h, rgb) {
  const crc = (buf) => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    let x = 0xffffffff; for (const b of buf) x = t[(x ^ b) & 0xff] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const rows = Buffer.concat(Array.from({ length: h }, () => Buffer.concat([Buffer.from([0]), Buffer.concat(Array.from({ length: w }, () => Buffer.from(rgb)))])));
  const f = path.join(OUT, file);
  fs.writeFileSync(f, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]));
  return f;
}
/** A real 16-bit mono WAV: `seconds` of a 440 Hz tone at 48 kHz. */
function wav(file, seconds) {
  const sr = 48000, n = sr * seconds, b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n * 2, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / sr) * 12000), 44 + i * 2);
  const f = path.join(OUT, file);
  fs.writeFileSync(f, b);
  return f;
}
/** Sets a range slider the way a person dragging it would (React sees the input event). */
const setRange = (loc, v) => loc.evaluate((el, val) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, String(val));
  el.dispatchEvent(new Event("input", { bubbles: true }));
}, v);
const SCRIPT = `EXT. LAGOS HARBOUR - DAWN

AMARA BELLO (32) waits by the water.

AMARA
You came.
`;

(async () => {
  await api("POST", "/__test/as", { role: "owner", email: "you@aurastage.invalid" });
  const v1 = await api("POST", `/api/projects/${P}/script/versions`, { source_text: SCRIPT, base_version_id: null });
  await api("POST", `/api/projects/${P}/script/approve`, { version_id: v1.id });
  await api("POST", `/api/projects/${P}/characters/sync`, {});
  const f1 = png("harbour-dawn.png", 32, 18, [200, 140, 60]), f2 = png("harbour-dawn-v2.png", 32, 18, [60, 140, 200]);

  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 1200 } })).newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => m.type() === "error" && /Warning:|key/.test(m.text()) && errors.push("console: " + m.text().slice(0, 200)));
  let failed = 0;
  const step = async (name, fn) => {
    try { await fn(); console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, e.message.split("\n")[0]); await page.screenshot({ path: `${OUT}/fail-assets-${name.replace(/\W+/g, "_").slice(0, 60)}.png`, fullPage: true }); }
  };
  const card = () => page.getByRole("list", { name: "Assets" }).getByRole("button", { name: /Harbour at dawn/ });
  const detail = () => page.getByRole("complementary", { name: "Asset details" });
  await page.goto(BASE + "/");
  await page.evaluate(() => localStorage.setItem("sb-localhost-auth-token", JSON.stringify({ access_token: "f", refresh_token: "f", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 36000, user: { id: "99999999-9999-4999-8999-999999999999", email: "you@aurastage.invalid", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "" } })));

  await step("open the Assets Library from the sidebar; empty library explains itself", async () => {
    await page.goto(`${BASE}/projects/${P}/scriptwriter`);
    await page.getByRole("link", { name: "Assets Library" }).click();
    await page.waitForURL(`**/projects/${P}/assets`);
    await page.getByText("Organised. Searchable. Ready.").waitFor();
    await page.getByText(/No assets yet/).waitFor();
    await page.getByText(/Searching inside images or audio isn't available yet/).waitFor();
  });
  await step("upload a real image into Locations; reload: still there with its specs", async () => {
    await page.getByRole("tab", { name: /Locations/ }).click();
    await page.getByLabel("File to upload").setInputFiles(f1);
    const dlg = page.getByRole("dialog", { name: "Add asset" });
    await dlg.getByText(/to Locations/).waitFor();
    await dlg.getByLabel("Asset name").fill("Harbour at dawn");
    await dlg.getByRole("button", { name: "Add to library" }).click();
    await page.getByRole("status").getByText("Added “Harbour at dawn”.").waitFor();
    await card().waitFor();
    await page.reload();
    // Regression (live 2026-09-28): the asset just uploaded stays open after a reload.
    await detail().getByRole("heading", { name: "Harbour at dawn" }).waitFor();
    await card().getByText(/32×18/).waitFor();
    await card().getByText("v1").waitFor();
    await page.getByRole("tab", { name: /Locations 1/ }).waitFor();
  });
  await step("edit details (tags, description); reload the asset's own link: kept; search finds it by tag", async () => {
    await card().click();
    await detail().getByLabel("Description").fill("Golden light over the jetty");
    await detail().getByLabel("Tags").fill("Exterior, Harbour");
    await detail().getByRole("button", { name: "Save details" }).click();
    await page.getByRole("status").getByText("Saved.").waitFor();
    await page.reload();
    if ((await detail().getByLabel("Tags").inputValue()) !== "exterior, harbour") throw new Error("tags not kept: " + (await detail().getByLabel("Tags").inputValue()));
    if ((await detail().getByLabel("Description").inputValue()) !== "Golden light over the jetty") throw new Error("description not kept");
    await page.getByLabel("Search assets").fill("jetty exterior");
    await card().waitFor();
    await page.getByLabel("Search assets").fill("spaceship");
    await page.getByText("Nothing matches these filters.").waitFor();
    await page.getByLabel("Search assets").fill("");
    await card().waitFor();
  });
  await step("Add to Scene and link a character; Usage shows them; reload: kept; scene filter finds it", async () => {
    await detail().getByRole("tab", { name: "Usage" }).click();
    await detail().getByText("Not used anywhere yet.").waitFor();
    await detail().getByLabel("Scene to add to").selectOption({ label: "Scene 1 — EXT. LAGOS HARBOUR - DAWN" });
    await detail().getByRole("button", { name: "Add to Scene" }).click();
    await detail().getByRole("list", { name: "Used in" }).getByText("Scene 1 — EXT. LAGOS HARBOUR - DAWN").waitFor();
    await detail().getByLabel("Character to link").selectOption({ label: "Amara Bello" });
    await detail().getByRole("button", { name: "Link", exact: true }).click();
    await detail().getByRole("list", { name: "Used in" }).getByText("Amara Bello · Casting").waitFor();
    await page.reload();
    await detail().getByRole("tab", { name: "Usage" }).click();
    await detail().getByRole("list", { name: "Used in" }).getByText("Amara Bello · Casting").waitFor();
    await card().getByText(/Used in Scene 1/).waitFor();
    await page.getByLabel("Usage").selectOption("unused");
    await page.getByText("Nothing matches these filters.").waitFor();
    await page.getByLabel("Usage").selectOption("any");
  });
  await step("Replace makes version 2 and keeps version 1; reload: both listed, v2 current", async () => {
    await detail().getByLabel("Version note").fill("Cooler grade");
    await detail().getByLabel("Replacement file").setInputFiles(f2);
    await page.getByRole("status").getByText("Saved as a new version. Earlier versions are kept.").waitFor();
    await page.reload();
    await card().getByText("v2").waitFor();
    await detail().getByRole("tab", { name: "Versions" }).click();
    const vs = detail().getByRole("list", { name: "Versions" });
    await vs.getByText(/v2 · current .* · Cooler grade/).waitFor();
    await vs.getByText(/v1 · .* Original upload/).waitFor();
    await detail().getByLabel("Replacement file").setInputFiles(f2);
    await page.getByRole("alert").getByText(/identical to the current version/).waitFor();
    await page.getByRole("alert").getByRole("button", { name: "Dismiss" }).click();
  });
  await step("Edit the image in the browser (crop 1:1, rotate, brighten); saved as version 3 with what was done; reload: kept; v2 untouched", async () => {
    await detail().getByRole("button", { name: "Edit…" }).click();
    const ed = page.getByRole("dialog", { name: /^Edit Harbour at dawn/ });
    await ed.getByText("Saving adds version 3. Version 2 stays in Versions, untouched.").waitFor();
    await ed.getByRole("button", { name: "1:1" }).click();
    await ed.getByRole("button", { name: "⟳ Rotate right" }).click();
    await setRange(ed.getByLabel("Brightness"), 120);
    await ed.getByTestId("edit-result").getByText("Result: 18×18").waitFor();
    await ed.getByRole("button", { name: "Save as new version" }).click();
    await page.getByRole("status").getByText("Saved as a new version. Earlier versions are kept.").waitFor();
    await page.reload();
    await card().getByText("v3").waitFor();
    await detail().getByRole("tab", { name: "Versions" }).click();
    const vs = detail().getByRole("list", { name: "Versions" });
    await vs.getByText(/v3 · current .* Edited in AuraStage from v2: cropped to 18×18, rotated 90°, brightness 120%/).waitFor();
    await vs.getByText(/v2 · .* Cooler grade/).waitFor();
    const id = new URL(page.url()).searchParams.get("asset");
    const v3 = Buffer.from(await (await fetch(`${API}/api/assets/${id}/content?version=3`)).arrayBuffer());
    if (v3.slice(1, 4).toString() !== "PNG" || v3.readUInt32BE(16) !== 18 || v3.readUInt32BE(20) !== 18) throw new Error("v3 isn't an 18×18 PNG");
    const v2 = Buffer.from(await (await fetch(`${API}/api/assets/${id}/content?version=2`)).arrayBuffer());
    if (!v2.equals(fs.readFileSync(f2))) throw new Error("version 2 changed");
  });
  await step("Edit a recording (trim, fade in, gain), preview it, save as version 2 WAV; reload: kept with the note", async () => {
    const w = wav("line-take.wav", 2);
    await page.getByRole("tab", { name: /^All/ }).click();
    await page.getByLabel("File to upload").setInputFiles(w);
    const dlg = page.getByRole("dialog", { name: "Add asset" });
    await dlg.getByLabel("Asset name").fill("Amara line take");
    await dlg.getByRole("button", { name: "Add to library" }).click();
    await page.getByRole("status").getByText("Added “Amara line take”.").waitFor();
    await detail().getByRole("heading", { name: "Amara line take" }).waitFor();
    await detail().getByRole("button", { name: "Edit…" }).click();
    const ed = page.getByRole("dialog", { name: /^Edit Amara line take/ });
    await ed.getByTestId("edit-result").getByText(/Result: 2 s/).waitFor();
    await setRange(ed.getByLabel("Start"), 0.5);
    await setRange(ed.getByLabel("Fade in"), 0.25);
    await setRange(ed.getByLabel("Gain"), 3);
    await ed.getByTestId("edit-result").getByText(/Result: 1\.5 s · peak -?\d/).waitFor();
    await ed.getByRole("button", { name: "▶ Preview" }).click();
    await ed.getByRole("button", { name: "Save as new version" }).click();
    await page.getByRole("status").getByText("Saved as a new version. Earlier versions are kept.").waitFor();
    await page.reload();
    await detail().getByRole("heading", { name: "Amara line take" }).waitFor();
    await detail().getByRole("tab", { name: "Versions" }).click();
    await detail().getByRole("list", { name: "Versions" }).getByText(/v2 · current .* Edited in AuraStage from v1: trimmed to 0\.5–2 s, gain \+3 dB, fade in 0\.25 s/).waitFor();
    const id = new URL(page.url()).searchParams.get("asset");
    const v2 = Buffer.from(await (await fetch(`${API}/api/assets/${id}/content?version=2`)).arrayBuffer());
    if (v2.slice(0, 4).toString() !== "RIFF" || v2.readUInt32LE(40) !== 1.5 * 48000 * 2) throw new Error(`v2 isn't a 1.5 s mono WAV (${v2.readUInt32LE(40)} data bytes)`);
    if (v2.readInt16LE(44) !== 0) throw new Error("fade in should start from silence");
    await page.getByRole("tab", { name: /Locations/ }).click();
    await card().click();
  });
  await step("archive hides it (kept, with every version); the Archived filter shows it; restore", async () => {
    await detail().getByRole("button", { name: "Archive" }).click();
    await page.getByRole("status").getByText(/Archived\. It's kept/).waitFor();
    await page.reload();
    await page.getByRole("list", { name: "Assets" }).getByRole("button", { name: /Amara line take/ }).waitFor();
    if (await card().count()) throw new Error("archived asset still listed");
    await page.getByLabel(/Archived \(1\)/).check();
    await card().waitFor();
    await detail().getByRole("button", { name: "Restore" }).click();
    await page.getByRole("status").getByText("Restored.").waitFor();
    await page.getByLabel(/Archived/).uncheck();
    await card().waitFor();
  });
  await step("a Reviewer can browse but not upload or change", async () => {
    await api("POST", "/__test/as", { role: "reviewer" });
    await page.goto(`${BASE}/projects/${P}/assets`);
    await page.getByText(/You can browse and download assets/).waitFor();
    if (await page.getByRole("button", { name: "+ Upload" }).count()) throw new Error("reviewer can upload");
    await card().click();
    if (!(await detail().getByLabel("Name").isDisabled())) throw new Error("reviewer can edit");
    if (await detail().getByRole("button", { name: "Replace…" }).count()) throw new Error("reviewer can replace");
    await api("POST", "/__test/as", { role: "owner" });
  });

  await browser.close();
  if (errors.length) { console.log("ERRORS:", errors); failed++; }
  console.log(failed ? `${failed} FAILED` : "ALL PASSED");
  process.exit(failed ? 1 : 0);
})();
