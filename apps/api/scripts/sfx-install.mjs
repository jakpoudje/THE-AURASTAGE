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
  return /^File:(LL-Q\d|[A-Z][a-z]-[a-z]{2}-|[A-Z][a-z]-[A-ZÄÖÜ])|pronunc|lingua ?libre|spoken|speech|interview|lecture|lectio|reading|recitation|song\b|music|anthem|sings?\b|choir|orchestra|piano|guitar|symphony|concert|\bmidi\b|ringtone remix|podcast|news ?cast|wikipedia|audacity|noise reduction|tutorial|\bdemo\b|test tone|radio|dispatch|\batc\b|cockpit|\bcall\b|wilhelm|scream|festival|\bfolk\b|march\b|national anthem|sermon|poem|audiobook|librivox|episode/i.test(title);
}
/**
 * Commons' own filing decides whether a file is a recording of a sound (live build 2026-10-02: titles alone let through
 * an audiobook of "The Wind in the Willows" as wind, surf-rock songs as sea, a presidential speech as footsteps). A file
 * must sit in at least one sound category and in none for music, speech, books or broadcasts.
 */
export function soundCategories(categories) {
  const names = (categories ?? []).map((c) => String(c.title ?? c).replace(/^Category:/, ""));
  const good = names.filter((n) => /\bsounds?\b|field recordings?|ambien|soundscape|bird ?songs?|bird vocali|animal sounds|animal vocali|insect sounds|noises?\b|sound effects|audio files of (rain|thunder|wind|water|waves|the sea|birds|insects|animals|dogs|traffic|crowds|footsteps|doors|fire)/i.test(n));
  const bad = names.filter((n) => /music|album|librivox|audiobook|spoken|speech|speeches|poetry|poem|president|politic|news|radio|interview|lecture|podcast|\bband\b|musician|singer|orchestra|composer|discograph|anthem|hymn|opera|literature|novel|reading|sermon|broadcast|komiku|recordings by/i.test(n));
  return { ok: good.length > 0 && bad.length === 0, good, bad };
}

/** The title has to name this category's sound (and not one of its known look-alikes). */
export function relevantTitle(title, cat) {
  const t = String(title).replace(/^File:/, "");
  return new RegExp(cat.title, "i").test(t) && !(cat.not && new RegExp(cat.not, "i").test(t));
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
  const j = await api({ action: "query", generator: "search", gsrnamespace: "6", gsrsearch: `${query} filetype:audio`, gsrlimit: "50", prop: "imageinfo|categories", iiprop: "url|extmetadata|mime|size|mediatype", clshow: "!hidden", cllimit: "max" });
  return (j.query?.pages ?? []).map((p) => ({ title: p.title, info: p.imageinfo?.[0], categories: p.categories ?? [] })).filter((p) => p.info?.url);
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
        if (seen.has(c.title) || unsuitableTitle(c.title) || !relevantTitle(c.title, cat)) continue;
        const licence = freeLicence(c.info.extmetadata);
        if (!licence) continue;
        const filed = soundCategories(c.categories);
        if (!filed.ok) { if (filed.bad.length) console.log(`sfx ${cat.id}: refused ${c.title.replace(/^File:/, "")} — filed under ${filed.bad.slice(0, 2).join(", ")}`); continue; }
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
            description: clean(m.ImageDescription?.value), filed_under: filed.good.slice(0, 3),
          });
          kept++;
          console.log(`sfx ${cat.id}: ${c.title.replace(/^File:/, "")} — ${licence}, ${seconds.toFixed(1)} s [${filed.good.slice(0, 2).join(", ")}]`);
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
