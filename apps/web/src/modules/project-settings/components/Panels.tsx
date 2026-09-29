"use client";

import Link from "next/link";
import { Fragment } from "react";
import type { ProjectSettings } from "@aurastage/contracts";
import type { SettingsView } from "../api/settingsApi";

type Upd = (fn: (d: ProjectSettings) => ProjectSettings) => void;
const box = "rounded-lg border border-aura-border bg-aura-panel p-4";
const input = "mt-1 w-full rounded-md border border-aura-border bg-black/40 px-3 py-2 text-sm outline-none focus:border-aura-gold disabled:opacity-60";
const H = ({ n, title, note }: { n: number; title: string; note?: string }) => (
  <div className="mb-3">
    <h2 className="font-display text-lg"><span className="mr-2 text-aura-gold">{n}</span>{title}</h2>
    {note && <p className="text-xs text-white/50">{note}</p>}
  </div>
);

export function StoryPanel({ view, projectId }: { view: SettingsView; projectId: string }) {
  const s = view.story;
  const rows: [string, string | number | null][] = [["Title", s.title], ["Type", s.type.replace("_", " ")], ["Genre", [s.genre, s.subgenre].filter(Boolean).join(" · ") || null],
    ["Setting", [s.setting, s.time_period].filter(Boolean).join(" · ") || null], ["Tone", s.tone], ["Runtime", s.target_runtime_minutes ? `${s.target_runtime_minutes} min` : null], ["Logline", s.logline]];
  return (
    <section className={box} aria-label="Story & Creative Summary">
      <div className="flex items-start justify-between">
        <H n={1} title="Story & Creative Summary" note="Comes from Scriptwriter — edit it there so every stage stays in step." />
        <span className="rounded-full border border-aura-gold/40 px-2 py-0.5 text-[10px] uppercase tracking-wider text-aura-gold">Inherited</span>
      </div>
      <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 text-sm">
        {rows.map(([k, v]) => (<Fragment key={k}><dt className="text-white/50">{k}</dt><dd className="text-white/80">{v ?? <span className="text-white/30">—</span>}</dd></Fragment>))}
      </dl>
      <Link href={`/projects/${projectId}/scriptwriter`} className="mt-3 inline-block text-xs text-aura-gold underline">Edit in Scriptwriter →</Link>
    </section>
  );
}

export function TechnicalPanel({ view, d, update, disabled }: { view: SettingsView; d: ProjectSettings; update: Upd; disabled: boolean }) {
  return (
    <section className={box} aria-label="Technical specifications">
      <H n={2} title="Technical specifications" note="Changes apply to new work; the preview shows exactly what they touch." />
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-xs text-white/60">Frame shape for new shot prompts
          <select aria-label="Frame shape" className={input} value={d.technical.aspect_ratio} disabled={disabled}
            onChange={(e) => update((x) => ((x.technical.aspect_ratio = e.target.value as never), x))}>
            {["16:9", "2.39:1", "4:3", "1:1", "9:16"].map((r) => <option key={r}>{r}</option>)}
          </select>
        </label>
        <label className="text-xs text-white/60">Loudness standard (Audio Studio and delivery QC)
          <select aria-label="Loudness standard" className={input} value={d.technical.loudness_standard} disabled={disabled}
            onChange={(e) => update((x) => ((x.technical.loudness_standard = e.target.value as never), x))}>
            {view.loudness_standards.map((l) => <option key={l.id} value={l.id}>{l.label} — {l.integrated_lufs} LUFS ±{l.tolerance_lu}</option>)}
          </select>
        </label>
      </div>
      <ul className="mt-4 grid gap-2 md:grid-cols-2" aria-label="Fixed pipeline facts">
        {view.facts.map((f) => (
          <li key={f.id} className="rounded-md border border-aura-border/70 p-2 text-xs">
            <div className="flex justify-between"><span className="text-white/60">{f.label}</span><span className="font-medium">{f.value}</span></div>
            <div className="text-[11px] text-white/40">{f.reason}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function StylePanel({ d, update, disabled }: { d: ProjectSettings; update: Upd; disabled: boolean }) {
  return (
    <section className={box} aria-label="Visual style">
      <H n={3} title="Visual style & references" note="Added to every compiled shot prompt. Changing it marks compiled prompts for review — approved takes are kept." />
      <label className="text-xs text-white/60">Look
        <textarea aria-label="Look" rows={3} maxLength={500} className={input} value={d.style.look ?? ""} disabled={disabled} placeholder="e.g. Desaturated teal-and-amber, handheld, heavy film grain"
          onChange={(e) => update((x) => ((x.style.look = e.target.value || null), x))} />
      </label>
      <div className="mt-3 text-xs text-white/60">Colour palette</div>
      <div className="mt-1 flex flex-wrap items-center gap-2" aria-label="Colour palette">
        {d.style.palette.map((c, i) => (
          <span key={i} className="flex items-center gap-1 rounded-md border border-aura-border px-1 py-0.5">
            <input type="color" aria-label={`Palette colour ${i + 1}`} value={c} disabled={disabled} onChange={(e) => update((x) => ((x.style.palette[i] = e.target.value), x))} className="h-6 w-8 bg-transparent" />
            {!disabled && <button type="button" aria-label={`Remove colour ${i + 1}`} onClick={() => update((x) => ((x.style.palette = x.style.palette.filter((_, j) => j !== i)), x))} className="text-xs text-white/40">×</button>}
          </span>
        ))}
        {!disabled && d.style.palette.length < 8 && (
          <button type="button" onClick={() => update((x) => ((x.style.palette = [...x.style.palette, "#d4a64a"]), x))} className="rounded-md border border-aura-border px-2 py-1 text-xs">+ Add colour</button>
        )}
      </div>
    </section>
  );
}

export function GenerationPanel({ view, d, update, disabled }: { view: SettingsView; d: ProjectSettings; update: Upd; disabled: boolean }) {
  const pick = (cap: "image" | "video") => view.providers.filter((p) => p.capabilities.includes(cap));
  const lim = d.generation.monthly_paid_take_limit;
  return (
    <section className={box} aria-label="AI providers & generation">
      <H n={4} title="AI providers & generation" note="Visual Generation preselects these. A provider works only once its key is on the server." />
      <div className="grid gap-3 md:grid-cols-2">
        {(["image", "video"] as const).map((cap) => {
          const key = cap === "image" ? "default_image_provider" : "default_video_provider";
          return (
            <label key={cap} className="text-xs text-white/60">Default {cap} provider
              <select aria-label={`Default ${cap} provider`} className={input} value={d.generation[key] ?? ""} disabled={disabled}
                onChange={(e) => update((x) => ((x.generation[key] = e.target.value || null), x))}>
                <option value="">Choose each time</option>
                {pick(cap).map((p) => <option key={p.id} value={p.id}>{p.name}{p.state === "configured" ? "" : " (not connected)"}</option>)}
              </select>
            </label>
          );
        })}
      </div>
      <label className="mt-3 block text-xs text-white/60">Monthly limit on paid takes (Runway, OpenAI…) — AuraStage Sketch is never counted
        <div className="mt-1 flex items-center gap-2">
          <input type="number" aria-label="Monthly paid take limit" min={0} max={100000} className={`${input} mt-0 w-40`} value={lim ?? ""} disabled={disabled} placeholder="No limit"
            onChange={(e) => update((x) => ((x.generation.monthly_paid_take_limit = e.target.value === "" ? null : Math.max(0, Math.floor(Number(e.target.value)))), x))} />
          <span data-testid="paid-usage">{view.paid_takes_this_month} used this month{lim !== null ? ` of ${lim}` : ""}</span>
        </div>
      </label>
    </section>
  );
}

export function DeliveryPanel({ view, d, update, disabled }: { view: SettingsView; d: ProjectSettings; update: Upd; disabled: boolean }) {
  return (
    <section className={box} aria-label="Delivery targets">
      <H n={5} title="Delivery targets" note="What this production must hand over. Export & Deliver tracks them against the current Picture Lock." />
      <div className="grid gap-1 md:grid-cols-2">
        {view.delivery_profiles.map((p) => (
          <label key={p.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="accent-[#d4a64a]" disabled={disabled} checked={d.delivery.required_profiles.includes(p.id as never)}
              onChange={(e) => update((x) => ((x.delivery.required_profiles = e.target.checked ? [...x.delivery.required_profiles, p.id as never] : x.delivery.required_profiles.filter((y) => y !== p.id)), x))} />
            {p.name}
          </label>
        ))}
      </div>
    </section>
  );
}

export function ProductionPanel({ d, update, disabled }: { d: ProjectSettings; update: Upd; disabled: boolean }) {
  const f = (key: "director" | "producer" | "company" | "country" | "copyright" | "writer" | "composer", label: string) => (
    <label className="text-xs text-white/60">{label}
      <input aria-label={label} className={input} value={d.production[key] ?? ""} disabled={disabled} onChange={(e) => update((x) => ((x.production[key] = e.target.value || null), x))} />
    </label>
  );
  return (
    <section className={box} aria-label="Production details">
      <H n={6} title="Production details" note="Written into the metadata of every file rendered from now on." />
      <div className="grid gap-3 md:grid-cols-2">
        {f("director", "Director")}{f("producer", "Producer")}{f("company", "Production company")}{f("country", "Country")}
        <label className="text-xs text-white/60">Year
          <input aria-label="Year" type="number" className={input} value={d.production.year ?? ""} disabled={disabled}
            onChange={(e) => update((x) => ((x.production.year = e.target.value ? Number(e.target.value) : null), x))} />
        </label>
        {f("copyright", "Copyright notice")}
        {f("writer", "Written by")}{f("composer", "Music by")}
      </div>
      <label className="mt-3 block text-xs text-white/60">Thanks (one per line, shown at the end of the credits)
        <textarea aria-label="Thanks" rows={2} className={input} value={d.production.thanks ?? ""} disabled={disabled}
          onChange={(e) => update((x) => ((x.production.thanks = e.target.value || null), x))} />
      </label>
      <div className="mt-4 rounded-md border border-aura-border p-3" role="group" aria-label="Titles and credits">
        <p className="mb-2 text-sm">Titles &amp; credits in video deliverables</p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="accent-[#d4a64a]" aria-label="Opening title card" disabled={disabled} checked={d.titles.opening_title}
            onChange={(e) => update((x) => ((x.titles.opening_title = e.target.checked), x))} />
          Opening title card
          <input aria-label="Title card seconds" type="number" min={2} max={15} className="ml-2 w-16 rounded-md border border-aura-border bg-black/30 px-2 py-1" value={d.titles.opening_seconds}
            disabled={disabled || !d.titles.opening_title} onChange={(e) => update((x) => ((x.titles.opening_seconds = Math.min(15, Math.max(2, Number(e.target.value) || 5))), x))} />
          <span className="text-xs text-white/50">seconds</span>
        </label>
        <label className="mt-2 block text-xs text-white/60">Line under the title (optional)
          <input aria-label="Line under the title" className={input} value={d.titles.opening_subtitle ?? ""} disabled={disabled || !d.titles.opening_title}
            onChange={(e) => update((x) => ((x.titles.opening_subtitle = e.target.value || null), x))} />
        </label>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" className="accent-[#d4a64a]" aria-label="End credits" disabled={disabled} checked={d.titles.end_credits}
            onChange={(e) => update((x) => ((x.titles.end_credits = e.target.checked), x))} />
          End credits roll (the credits above, the cast from Casting, and what made the pictures)
          <select aria-label="Credits speed" className="ml-2 rounded-md border border-aura-border bg-black/30 px-2 py-1" value={d.titles.credits_speed} disabled={disabled || !d.titles.end_credits}
            onChange={(e) => update((x) => ((x.titles.credits_speed = e.target.value as "slow" | "medium" | "fast"), x))}>
            <option value="slow">Slow</option><option value="medium">Medium</option><option value="fast">Fast</option>
          </select>
        </label>
        <p className="mt-2 text-[11px] text-white/40">Added by the render worker to masters and review copies; the Picture Lock itself doesn&apos;t change. Only credits you fill in are shown.</p>
      </div>
    </section>
  );
}
