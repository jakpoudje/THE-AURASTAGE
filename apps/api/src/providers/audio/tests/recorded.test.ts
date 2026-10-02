import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assetEdit, recordedSound } from "@aurastage/engines";
import { audioBackendsFor, recordedSoundAdapter } from "..";
// @ts-expect-error — plain .mjs build script (runs before the source is copied into the image)
import { freeLicence, relevantTitle, soundCategories, unsuitableTitle } from "../../../../scripts/sfx-install.mjs";

function library() {
  const d = mkdtempSync(join(tmpdir(), "sfx-test-"));
  mkdirSync(join(d, "clips"));
  const tone = (hz: number, s: number) => { const n = 48000 * s, x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = 0.3 * Math.sin((2 * Math.PI * hz * i) / 48000); return x; };
  const clips = [
    { id: "rain-01", category: "rain", seconds: 10, hz: 300 }, { id: "traffic-01", category: "traffic", seconds: 10, hz: 120 },
    { id: "door-01", category: "door", seconds: 1, hz: 80 }, { id: "knock-01", category: "knock", seconds: 1, hz: 200 },
  ].map((c) => {
    const s = tone(c.hz, c.seconds);
    // Mono 16-bit, as the build writes them.
    writeFileSync(join(d, "clips", `${c.id}.wav`), Buffer.from(assetEdit.encodeWav16(48000, [s, s])).subarray(0, 44 + s.length * 2));
    return { id: c.id, category: c.category, file: `clips/${c.id}.wav`, seconds: c.seconds, title: `${c.category} recording.ogg`, author: "National Park Service", licence: "Public domain", source: `https://commons.wikimedia.org/wiki/File:${c.id}.ogg` };
  });
  writeFileSync(join(d, "catalogue.json"), JSON.stringify({ source: "test", clips }));
  return { SFX_DIR: d };
}

describe("recorded sound library (owner request 2026-10-02: real life prop sounds)", () => {
  it("is first for ambience, effects and Foley when installed; not configured (synthesiser used) when it isn't", () => {
    expect(recordedSoundAdapter.isConfigured({ SFX_DIR: "/nonexistent" })).toBe(false);
    expect(audioBackendsFor("fx", { SFX_DIR: "/nonexistent" })[0].id).toBe("aurastage-synth");
    const env = library();
    expect(audioBackendsFor("ambience", env)[0].id).toBe("aurastage-recorded-sound");
    expect(audioBackendsFor("score", env)[0].id).toBe("aurastage-synth");
  });
  it("an ambience cue is made from the recordings, credited (title, author, licence); words with no recording are synthesised underneath and labelled", async () => {
    const env = library();
    const r = await recordedSoundAdapter.generate({ kind: "ambience", model: "recorded-1", description: "Exterior Lagos street, rain, waves", duration_seconds: 25, mood: [], seed: 4, params: {} }, env);
    expect(r).toMatchObject({ media_type: "audio/wav", channels: 2, sample_rate: 48000, cost_usd: 0 });
    expect(r.duration_seconds).toBeCloseTo(25, 1);
    const names = (r.detail.layers as any[]).map((l) => l.name);
    expect(names).toEqual(expect.arrayContaining(["traffic / city (recording)", "rain (recording)", "sea / waves (synthesised)"]));
    expect((r.detail.layers as any[]).find((l) => l.name === "rain (recording)").because).toMatch(/“rain recording.ogg” by National Park Service, Public domain/);
    expect((r.detail.recordings as any[]).every((x) => x.licence === "Public domain" && /commons\.wikimedia\.org/.test(x.source))).toBe(true);
    expect(new TextDecoder().decode(r.bytes.slice(0, 4))).toBe("RIFF");
  });
  it("effects in cue order; no match → the synthesiser, said plainly", async () => {
    const env = library();
    const fx = await recordedSoundAdapter.generate({ kind: "fx", model: "recorded-1", description: "knocks, then the door slams; a dog barks", duration_seconds: 3, mood: [], seed: 1, params: {} }, env);
    expect((fx.detail.layers as any[]).map((l) => l.name)).toEqual(["door knock (recording)", "door (recording)", "not included"]);
    const none = await recordedSoundAdapter.generate({ kind: "fx", model: "recorded-1", description: "a strange hum", duration_seconds: 2, mood: [], seed: 1, params: {} }, env);
    expect(none.detail).toMatchObject({ recorded: false, note: expect.stringMatching(/synthesised/) });
  });
  it("the build only keeps recordings that need no attribution, and screens out pronunciations, speech and music", () => {
    expect(freeLicence({ LicenseShortName: { value: "Public domain" }, AttributionRequired: { value: "false" } })).toBe("Public domain");
    expect(freeLicence({ LicenseShortName: { value: "CC0" }, License: { value: "cc0" } })).toBe("CC0");
    expect(freeLicence({ LicenseShortName: { value: "CC BY-SA 4.0" }, AttributionRequired: { value: "true" } })).toBeNull();
    expect(freeLicence({ LicenseShortName: { value: "CC BY 3.0" } })).toBeNull();
    for (const t of ["File:En-us-door.ogg", "File:LL-Q1860 (eng)-Rain.wav", "File:De-Tür.ogg", "File:Rain song.ogg", "File:Spoken article rain.ogg"]) expect(unsuitableTitle(t)).toBe(true);
    // Live build 2026-10-02: what the first Commons searches wrongly kept, refused now.
    const cat = (id: string) => json.find((c: any) => c.id === id);
    const json = JSON.parse(readFileSync(join(__dirname, "../../../../scripts/sfx-categories.json"), "utf8"));
    const wrong: [string, string][] = [["traffic", "File:Korean Air Flight 801 crash, Guam air traffic control recording (August 1997).oga"], ["traffic", "File:18- 82449 - Officer Involved Shooting 7500 Block of 29th St - Radio Traffic (dispatch audio).oga"],
      ["market", "File:Noise reduction in Audacity (0, 5, 12, 30 dB) (150Hz) (0.15 sec).ogg"], ["crowd", "File:Group discussion 1.ogg"], ["fire", "File:Friendly Fire Iraq (audio).ogg"], ["fire", "File:Silvester fireworks from the street 02 cool stuff.ogg"],
      ["footsteps", "File:British Grenadiers & Here's to the Maiden.ogg"], ["footsteps", "File:Shampooing hair.ogg"], ["gunshot", "File:Wilhelm Scream.ogg"], ["dog", "File:Cynomys ludovicianus barking-audio.ogg"], ["phone", "File:Tone dialling phone germany.ogg"], ["phone", "File:Bachîn ringing Sark Folk Festival 2011.ogg"]];
    for (const [c, t] of wrong) expect(!unsuitableTitle(t) && relevantTitle(t, cat(c)), `${c}: ${t}`).toBe(false);
    const right: [string, string][] = [["rain", "File:Rain against the window.ogg"], ["wind", "File:Howling wind.ogg"], ["knock", "File:Knock on door.wav"], ["gunshot", "File:Gunshots 8.ogg"], ["birds", "File:Dawnchorus-uk.ogg"], ["insects", "File:Cicada orni.ogg"], ["siren", "File:American police siren i.ogg"], ["door", "File:Springlocked cellar door.ogg"]];
    for (const [c, t] of right) expect(!unsuitableTitle(t) && relevantTitle(t, cat(c)), `${c}: ${t}`).toBe(true);
    // Second live build: titles that pass but are songs, books or speeches — refused by how Commons files them.
    expect(soundCategories(["Category:LibriVox recordings", "Category:The Wind in the Willows"]).ok).toBe(false);
    expect(soundCategories(["Category:Komiku", "Category:Free music"]).ok).toBe(false);
    expect(soundCategories(["Category:Ronald Reagan speeches", "Category:Audio files of walking"]).ok).toBe(false);
    expect(soundCategories(["Category:Weather radio"]).ok).toBe(false);
    expect(soundCategories(["Category:Sounds of rain"]).ok).toBe(true);
    expect(soundCategories([{ title: "Category:Bird songs" }, { title: "Category:Erithacus rubecula" }]).ok).toBe(true);
    expect(soundCategories(["Category:Field recordings in Greece"]).ok).toBe(true);
    expect(soundCategories([]).ok).toBe(false);
    // Third live build: an unidentified sound proves nothing; drum patterns are instruments; look-alikes by title.
    expect(soundCategories(["Category:Unidentified sounds"]).ok).toBe(false);
    expect(soundCategories(["Category:Sounds of percussion instruments"]).ok).toBe(false);
    for (const [c, t] of [["traffic", "File:Street parade carnival people yelling kamelle kamelle.ogg"], ["traffic", "File:Silvester fireworks from the street 01.ogg"], ["car", "File:Car stereo tapedeck.ogg"], ["paper", "File:Sawing an empty toilet paper roll.ogg"], ["explosion", "File:Blast beat.ogg"], ["thunder", "File:Getting set to record thunder.ogg"]] as [string, string][])
      expect(relevantTitle(t, cat(c)), `${c}: ${t}`).toBe(false);
    for (const t of ["File:Car horn.ogg", "File:Rain on a tin roof.ogg", "File:Door slam.wav", "File:Yellowstone dawn chorus.ogg"]) expect(unsuitableTitle(t)).toBe(false);
  });
  it("the build's category list is the engine's (sfx-categories.json is generated from categories.ts)", () => {
    const json = JSON.parse(readFileSync(join(__dirname, "../../../../scripts/sfx-categories.json"), "utf8"));
    expect(json).toEqual(recordedSound.SOUND_CATEGORIES.map(({ id, label, search, bed, max_seconds, title, not }) => ({ id, label, search, bed, max_seconds, title: title.source, ...(not ? { not: not.source } : {}) })));
  });
});
