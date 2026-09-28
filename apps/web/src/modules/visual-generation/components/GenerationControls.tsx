"use client";

// Generation controls. Provider status comes from the server (key present or
// not + the last real result) — never a decorative "online" light.
import { useState } from "react";
import type { AspectRatio, ProviderStatus, RequestTakeInput } from "@aurastage/contracts";
import type { VisualShot } from "../types";

const RATIOS: AspectRatio[] = ["16:9", "2.39:1", "4:3", "1:1", "9:16"];

export function ProviderList({ providers }: { providers: ProviderStatus[] }) {
  return (
    <ul className="space-y-2 text-sm" aria-label="Provider status">
      {providers.map((p) => (
        <li key={p.id} className="flex items-start gap-2">
          <span aria-hidden className={p.state === "configured" ? "text-emerald-400" : "text-white/30"}>●</span>
          <span className="min-w-0">
            <span>{p.name}</span>{" "}
            <span className="text-[11px] text-white/40">{p.state === "configured" ? "connected" : "not connected"}</span>
            {p.last_result && (
              <span className={`block text-[11px] ${p.last_result.status === "succeeded" ? "text-white/40" : "text-red-300"}`}>
                Last take {p.last_result.status} {new Date(p.last_result.at).toLocaleString()}
                {p.last_result.message ? ` — ${p.last_result.message}` : ""}
              </span>
            )}
            <span className="block text-[11px] text-white/35">{p.note}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function GenerationControls({
  s,
  providers,
  mediaReady,
  usable,
  busy,
  onGenerate,
}: {
  s: VisualShot;
  providers: ProviderStatus[];
  mediaReady: boolean;
  usable: boolean;
  busy: boolean;
  onGenerate: (input: Partial<RequestTakeInput>) => void;
}) {
  const [capability, setCapability] = useState<"image" | "video">("image");
  const available = providers.filter((p) => p.capabilities.includes(capability));
  const [providerId, setProviderId] = useState<string>("aurastage-sketch");
  const provider = available.find((p) => p.id === providerId) ?? available[0];
  const models = provider?.models.filter((m) => m.capability === capability) ?? [];
  const [modelId, setModelId] = useState<string>("");
  const model = models.find((m) => m.id === modelId) ?? models[0];
  const [ratio, setRatio] = useState<AspectRatio>("16:9");
  const [variations, setVariations] = useState(1);
  const [duration, setDuration] = useState(5);
  const [seed, setSeed] = useState("");
  const frames = s.takes.filter((t) => t.status === "succeeded" && t.capability === "image" && t.media_type !== "image/svg+xml");
  const [sourceId, setSourceId] = useState<string>("");
  const source = frames.find((t) => t.id === sourceId) ?? frames.find((t) => t.id === s.approved_take_id) ?? frames[0];

  const blocker = !usable
    ? "Approve the shot plan again first."
    : !s.package || s.package.review_state !== "current"
      ? "Compile the prompt first."
      : !mediaReady
        ? "Media storage isn't set up on the server yet."
        : !provider
          ? "No provider offers this yet."
          : provider.state !== "configured"
            ? `${provider.name} isn't connected yet — its API key hasn't been added.`
            : capability === "video" && !source
              ? "Video starts from a finished image take (not a sketch) — generate one first."
              : null;

  const sel = "mt-1 w-full rounded-md border border-aura-border bg-black/40 px-2 py-1.5 text-sm";
  return (
    <div className="rounded-xl border border-aura-border bg-aura-panel p-4">
      <h3 className="font-display text-lg">Generation controls</h3>
      <div className="mt-3 flex gap-1 rounded-md border border-aura-border p-1 text-sm" role="radiogroup" aria-label="Output type">
        {(["image", "video"] as const).map((c) => (
          <button key={c} role="radio" aria-checked={capability === c} onClick={() => setCapability(c)} className={`flex-1 rounded px-2 py-1 ${capability === c ? "bg-aura-gold text-black" : "text-white/60"}`}>
            {c === "image" ? "Text → Image" : "Image → Video"}
          </button>
        ))}
      </div>
      <label className="mt-3 block text-[11px] uppercase tracking-wider text-white/50">
        Provider
        <select aria-label="Provider" value={provider?.id ?? ""} onChange={(e) => (setProviderId(e.target.value), setModelId(""))} className={sel}>
          {available.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} {p.state === "configured" ? "" : "(not connected)"}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-3 block text-[11px] uppercase tracking-wider text-white/50">
        Model
        <select aria-label="Model" value={model?.id ?? ""} onChange={(e) => setModelId(e.target.value)} className={sel}>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="block text-[11px] uppercase tracking-wider text-white/50">
          Aspect ratio
          <select aria-label="Aspect ratio" value={ratio} onChange={(e) => setRatio(e.target.value as AspectRatio)} className={sel}>
            {RATIOS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label className="block text-[11px] uppercase tracking-wider text-white/50">
          Variations
          <select aria-label="Variations" value={variations} onChange={(e) => setVariations(Number(e.target.value))} className={sel}>
            {[1, 2, 3, 4].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        {capability === "video" && (
          <label className="block text-[11px] uppercase tracking-wider text-white/50">
            Duration
            <select aria-label="Duration" value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={sel}>
              <option value={5}>5 s</option>
              <option value={10}>10 s</option>
            </select>
          </label>
        )}
        <label className="block text-[11px] uppercase tracking-wider text-white/50">
          Seed (optional)
          <input aria-label="Seed" inputMode="numeric" value={seed} onChange={(e) => setSeed(e.target.value.replace(/\D/g, ""))} className={sel} />
        </label>
      </div>
      {capability === "video" && frames.length > 0 && (
        <label className="mt-3 block text-[11px] uppercase tracking-wider text-white/50">
          Starting frame
          <select aria-label="Starting frame" value={source?.id ?? ""} onChange={(e) => setSourceId(e.target.value)} className={sel}>
            {frames.map((t) => (
              <option key={t.id} value={t.id}>
                V{t.take_number} {t.approval === "approved" ? "(approved)" : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      <button
        onClick={() =>
          onGenerate({
            provider: provider!.id,
            model: model!.id,
            capability,
            aspect_ratio: ratio,
            variations,
            seed: seed ? Number(seed) : null,
            duration_seconds: capability === "video" ? duration : null,
            source_take_id: capability === "video" ? source?.id ?? null : null,
          })
        }
        disabled={!!blocker || busy}
        className="mt-4 w-full rounded-md bg-aura-gold px-4 py-2 text-sm font-medium text-black disabled:opacity-40"
      >
        {busy ? "Queuing…" : `Generate ${variations > 1 ? `${variations} takes` : "shot"}`}
      </button>
      {blocker && <p className="mt-2 text-xs text-white/50">{blocker}</p>}
    </div>
  );
}
