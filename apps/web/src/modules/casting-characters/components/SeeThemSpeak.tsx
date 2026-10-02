"use client";

// See them speak (owner request 2026-10-02: "the ability to animate their speech"). Pick one of the character's lines:
// AuraSketch draws them in the film's genre style with a mouth that speaks the line and natural blinks, timed to the
// line's voice from Audio Studio when there is one (it plays alongside), otherwise to an estimate from the words.
import { useEffect, useRef, useState } from "react";
import { apiGetBytes } from "@/lib/apiClient";
import { lookApi, type CharacterSpeech } from "../api/lookApi";

export function SeeThemSpeak({ characterId }: { characterId: string }) {
  const [list, setList] = useState<CharacterSpeech | null>(null);
  const [lineId, setLineId] = useState<string>("");
  const [angle, setAngle] = useState("front");
  const [shot, setShot] = useState<CharacterSpeech | null>(null);
  const [img, setImg] = useState<string | null>(null);
  const [voice, setVoice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    lookApi.speech(characterId).then((s) => { setList(s); setLineId(s.lines[0]?.id ?? ""); }).catch(() => setList(null));
  }, [characterId]);
  useEffect(() => () => { if (img) URL.revokeObjectURL(img); if (voice) URL.revokeObjectURL(voice); }, [img, voice]);

  const play = async () => {
    if (!lineId) return;
    setBusy(true);
    setError(null);
    try {
      const s = await lookApi.speech(characterId, lineId, angle);
      setShot(s);
      // A fresh image URL restarts the animation from the first sound, in step with the voice.
      setImg(URL.createObjectURL(new Blob([s.svg ?? ""], { type: "image/svg+xml" })));
      let v: string | null = null;
      if (s.voice_asset_id) {
        const bytes = await apiGetBytes(`/api/assets/${s.voice_asset_id}/content`);
        v = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
      }
      setVoice(v);
      setTimeout(() => { if (v && audio.current) { audio.current.currentTime = 0; void audio.current.play().catch(() => undefined); } }, 30);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't draw that line");
    } finally {
      setBusy(false);
    }
  };

  if (!list) return null;
  return (
    <section aria-label="See them speak" className="rounded-lg border border-aura-border bg-black/20 p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[11px] uppercase tracking-wider text-white/50">See them speak</h3>
        <span className="text-[11px] text-white/40">AuraSketch · {list.style.label} (from the project's genre) · free</span>
      </div>
      {list.lines.length === 0 ? (
        <p className="mt-2 text-xs text-white/50">{list.character.name} has no lines yet — bring dialogue in from the approved script on the Dialogue page.</p>
      ) : (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1 text-xs text-white/60">Line
            <select aria-label="Line to speak" value={lineId} onChange={(e) => setLineId(e.target.value)} className="mt-1 block w-full rounded-md border border-aura-border bg-black px-2 py-1.5 text-sm">
              {list.lines.map((l) => <option key={l.id} value={l.id}>Scene {l.scene_number}: {l.text.slice(0, 80)}{l.text.length > 80 ? "…" : ""}{l.has_voice ? " 🔊" : ""}</option>)}
            </select>
          </label>
          <label className="text-xs text-white/60">View
            <select aria-label="Speaking view" value={angle} onChange={(e) => setAngle(e.target.value)} className="mt-1 block rounded-md border border-aura-border bg-black px-2 py-1.5 text-sm">
              <option value="front">Front</option><option value="three_quarter">¾ view</option><option value="profile">Profile</option>
            </select>
          </label>
          <button onClick={play} disabled={busy || !lineId} className="rounded-md bg-aura-gold px-3 py-1.5 text-sm font-medium text-black disabled:opacity-40">{busy ? "Drawing…" : "▶ See it spoken"}</button>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
      {shot && img && (
        <div className="mt-3 flex flex-wrap items-start gap-3">
          <img src={img} alt={`${list.character.name} speaking`} data-testid="speaking-sketch" className="h-64 w-64 rounded-md border border-aura-border" />
          <div className="max-w-sm text-xs text-white/70">
            <p className="text-white">“{shot.line?.text}”</p>
            <p className="mt-1 text-white/50">
              {shot.timed_by === "voice" ? `Timed to this line's voice from Audio Studio (${shot.seconds?.toFixed(1)} s).` : `No voice for this line yet — timed from the words (about ${shot.seconds?.toFixed(1)} s). Make the voice in Audio Studio to hear it here.`}
              {" "}{shot.mouth_shapes} mouth shapes, with natural blinks. It loops.
            </p>
            {voice && <audio ref={audio} src={voice} controls className="mt-2 w-full" />}
            <button onClick={play} className="mt-2 rounded border border-aura-border px-2 py-1 text-xs">↻ Again from the start</button>
          </div>
        </div>
      )}
    </section>
  );
}
