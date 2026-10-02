// Builds AuraStage's recorded sound library at image build time (owner request 2026-10-02: "real life prop sounds").
// For every category in sfx-categories.json (generated from engines/audio/recordedSoundEngine/categories.ts — a test
// keeps them equal) it searches Wikimedia Commons for audio files, keeps ONLY recordings whose licence needs no
// attribution (public domain or CC0, read from each file's own licence metadata), screens out pronunciation clips,
// speech and music, downloads the original, converts it to 48 kHz mono 16-bit WAV with ffmpeg (leading silence
// trimmed, loudness levelled), and writes catalogue.json with each recording's title, author, licence and page.
// Never fails the build: categories with nothing suitable are listed, and the synthesiser covers them at run time.
// Usage: node sfx-install.mjs <out dir> [categories json]
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// SFX_COMMONS_API: a stand-in for the build-script test only.
const API = process.env.SFX_COMMONS_API || "https://commons.wikimedia.org/w/api.php";
const UA = "AuraStageSoundLibraryBuild/1.0 (https://github.com/jakpoudje/the-aurastage; one-off build of a public-domain sound library)";
const PER_BED = 3, PER_EVENT = 4;

/** Licence metadata says no attribution is needed: public domain or CC0. */
export function freeLicence(meta) {
  const short = String(meta?.LicenseShortName?.value ?? ""), lic = String(meta?.License?.value ?? "").toLowerCase();
  const attribution = String(meta?.AttributionRequired?.value ?? "").toLowerCase();
  const ok = /^(cc0|public domain|pd\b|pd-)/i.test(short) || lic === "cc0" || lic === "pd" || lic.startsWith("pd-");
  return ok && attribution !== "true" ? (/cc0/i.test(short) || lic === "cc0" ? "CC0" : "Public domain") : null;
}
/** Titles that are not field recordings of the thing: pronunciations, speech, music, spoken articles. */
export function unsuitableTitle(title) {
  return /^File:(LL-Q\d|[A-Z][a-z]-[a-z]{2}-|[A-Z][a-z]-[A-ZÄÖÜ])|pronunc|lingua ?libre|spoken|speech|interview|lecture|reading|recitation|song\b|music|anthem|sings?\b|choir|orchestra|piano|guitar|symphony|concert|\bmidi\b|ringtone remix|podcast|news ?cast|wikipedia/i.test(title);
}
const clean = (html) => String(html ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 200);

async function api(params) {
  const url = `${API}?${new URLSearchParams({ format: "json", formatversion: "2", ...params })}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    if (r.ok) return r.json();
    await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
  }
  throw new Error(`Commons API failed for ${params.gsrsearch ?? ""}`);
}

async function candidates(query) {
  const j = await api({ action: "query", generator: "search", gsrnamespace: "6", gsrsearch: `${query} filetype:audio`, gsrlimit: "30", prop: "imageinfo", iiprop: "url|extmetadata|mime|size|mediatype" });
  return (j.query?.pages ?? []).map((p) => ({ title: p.title, info: p.imageinfo?.[0] })).filter((p) => p.info?.url);
}

function probeSeconds(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file], { encoding: "utf8" });
  return Number(r.stdout.trim()) || 0;
}

async function main() {
  const out = process.argv[2] || "/opt/sfx";
  const here = dirname(fileURLToPath(import.meta.url));
  const cats = JSON.parse(readFileSync(process.argv[3] || join(here, "sfx-categories.json"), "utf8"));
  mkdirSync(join(out, "clips"), { recursive: true });
  const tmp = join(out, "tmp");
  mkdirSync(tmp, { recursive: true });
  const catalogue = [], empty = [];
  const seen = new Set();
  for (const cat of cats) {
    const want = cat.bed ? PER_BED : PER_EVENT;
    let kept = 0;
    for (const q of cat.search) {
      if (kept >= want) break;
      let list = [];
      try { list = await candidates(q); } catch (e) { console.log(`sfx ${cat.id}: search "${q}" failed (${e.message})`); continue; }
      for (const c of list) {
        if (kept >= want) break;
        if (seen.has(c.title) || unsuitableTitle(c.title)) continue;
        const licence = freeLicence(c.info.extmetadata);
        if (!licence) continue;
        if ((c.info.size ?? 0) > 60e6) continue;
        seen.add(c.title);
        const id = `${cat.id}-${String(kept + 1).padStart(2, "0")}`;
        const raw = join(tmp, "src"), wav = join(out, "clips", `${id}.wav`);
        try {
          const r = await fetch(c.info.url, { headers: { "User-Agent": UA } });
          if (!r.ok) continue;
          writeFileSync(raw, Buffer.from(await r.arrayBuffer()));
          const full = probeSeconds(raw);
          // A background needs some length to loop well; an event must be short enough to be one event.
          if (cat.bed ? full < 8 : full < 0.3 || full > 90) { continue; }
          const f = spawnSync("ffmpeg", ["-v", "error", "-y", "-i", raw, "-t", String(cat.max_seconds + 2), "-ac", "1", "-ar", "48000",
            "-af", `${cat.bed ? "" : "silenceremove=start_periods=1:start_threshold=-45dB,"}atrim=0:${cat.max_seconds},loudnorm=I=${cat.bed ? -24 : -18}:TP=-2:LRA=15`,
            "-c:a", "pcm_s16le", wav], { encoding: "utf8" });
          if (f.status !== 0 || !existsSync(wav)) { console.log(`sfx ${cat.id}: could not convert ${c.title}`); continue; }
          const seconds = probeSeconds(wav);
          if (seconds < (cat.bed ? 6 : 0.25)) { rmSync(wav, { force: true }); continue; }
          const m = c.info.extmetadata ?? {};
          catalogue.push({
            id, category: cat.id, file: `clips/${id}.wav`, seconds: Math.round(seconds * 100) / 100,
            title: c.title.replace(/^File:/, ""), author: clean(m.Artist?.value) || "unknown", licence, source: c.info.descriptionurl ?? c.info.url,
            description: clean(m.ImageDescription?.value),
          });
          kept++;
          console.log(`sfx ${cat.id}: ${c.title.replace(/^File:/, "")} — ${licence}, ${seconds.toFixed(1)} s`);
        } catch (e) {
          console.log(`sfx ${cat.id}: ${c.title} failed (${e.message})`);
        } finally {
          rmSync(raw, { force: true });
        }
      }
    }
    if (!kept) empty.push(cat.id);
  }
  rmSync(tmp, { recursive: true, force: true });
  writeFileSync(join(out, "catalogue.json"), JSON.stringify({ source: "Wikimedia Commons (public domain and CC0 only)", built_at: new Date().toISOString(), clips: catalogue, empty }, null, 1));
  const mb = catalogue.reduce((n, c) => n + statSync(join(out, c.file)).size, 0) / 1e6;
  console.log(`sfx library: ${catalogue.length} recordings in ${cats.length - empty.length}/${cats.length} categories, ${mb.toFixed(1)} MB${empty.length ? `; none suitable for: ${empty.join(", ")}` : ""}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.log(`sfx library build failed: ${e.message} — the synthesiser will be used`); process.exit(0); });
}
