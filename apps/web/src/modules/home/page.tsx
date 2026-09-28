// apps/web/src/modules/home/page.tsx
// Orchestration/composition surface ONLY — see CLAUDE.md.
// Home workspace: public marketing, product explanation, sign-in/get-started (docs/design/UI_REFERENCE.md, owner's
// reference 2026-09-28). No production objects are read or written here (SRS §1, §4). Provider names are listed
// only for integrations that exist in the code, with their real state (CLAUDE.md rule 12).

import Link from "next/link";
import { ArtImage, GenreArt, HeroArt, type GenreId } from "./components/Art";

const NAV = [
  { href: "/", label: "Home" },
  { href: "#features", label: "Features" },
  { href: "#genres", label: "Showcase" },
  { href: "#how-it-works", label: "How It Works" },
  { href: "/help", label: "Help" },
];

const FEATURES = [
  { icon: "✎", title: "Script to Screen", sub: "End-to-end film production" },
  { icon: "☺", title: "Consistent Characters", sub: "Casting, looks and continuity" },
  { icon: "▣", title: "Cinematic Visuals", sub: "Shot plans to generated takes" },
  { icon: "♫", title: "Professional Audio", sub: "Dialogue, SFX, music, mix" },
  { icon: "≡", title: "Advanced Editing", sub: "Timeline, lock, export" },
];

// Only integrations with code behind them. "Built in" works today; the others turn on when their key is added.
const PROVIDERS: { name: string; state: string }[] = [
  { name: "AuraStage Sketch", state: "Built in" },
  { name: "OpenAI Images", state: "Add a key to connect" },
  { name: "Runway", state: "Add a key to connect" },
  { name: "Anthropic Claude", state: "Coming next" },
  { name: "ElevenLabs", state: "Coming next" },
  { name: "Luma · Google Veo", state: "Planned" },
];

const GENRES: { id: GenreId; label: string }[] = [
  { id: "action", label: "Action" }, { id: "drama", label: "Drama" }, { id: "scifi", label: "Sci-Fi" }, { id: "fantasy", label: "Fantasy" },
  { id: "thriller", label: "Thriller" }, { id: "animation", label: "Animation" }, { id: "documentary", label: "Documentary" }, { id: "romance", label: "Romance" },
];

const PIPELINE = [
  ["Scriptwriter", "Write, import and approve the script; scenes come from it."],
  ["Casting & Characters", "Characters found in the script, with profiles, looks and relationships."],
  ["Dialogue Intelligence", "Every line with speaker, listener, emotion and timing."],
  ["Scene DNA", "A locked blueprint per scene: who, where, when, mood, sound."],
  ["Storyboard & Shots", "Shot plans with a reason for every shot."],
  ["Visual Generation", "Prompts compiled from everything above, generated as takes you approve."],
  ["Audio Studio", "Recordings, mix and loudness measured to your delivery standard."],
  ["Editorial & Timeline", "Assembly from approved takes and mixes, then Picture Lock."],
  ["Export & Deliver", "Masters, subtitles and stems — each file checked before download."],
];

export default function HomePage() {
  return (
    <main className="bg-aura-bg text-white">
      <header className="sticky top-0 z-20 border-b border-aura-border bg-aura-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-3">
            <svg viewBox="0 0 40 40" className="h-9 w-9" aria-hidden><path d="M20 3 L37 37 L28 37 L20 20 L12 37 L3 37 Z" fill="#e8b84b" /><path d="M20 20 L25 30 L15 30 Z" fill="#0a0a0c" /></svg>
            <span>
              <span className="block font-display text-lg leading-none">The AuraStage</span>
              <span className="text-[9px] tracking-[0.25em] text-white/50">AI FILM PRODUCTION STUDIO</span>
            </span>
          </Link>
          <nav className="hidden gap-8 text-sm md:flex" aria-label="Main">
            {NAV.map((n, i) => (
              <Link key={n.label} href={n.href} className={i === 0 ? "border-b-2 border-aura-gold pb-1 text-aura-gold" : "text-white/70 hover:text-white"}>{n.label}</Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/sign-in" className="rounded-md border border-aura-border px-4 py-2 text-sm hover:border-white/40">Sign In</Link>
            <Link href="/sign-up" className="rounded-md bg-aura-gold px-4 py-2 text-sm font-medium text-black shadow-[0_0_24px_rgba(232,184,75,0.35)]">Get Started</Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-aura-border">
        <HeroArt />
        <ArtImage name="hero" alt="" className="opacity-90" />
        <div className="absolute inset-0 bg-gradient-to-r from-aura-bg/90 via-aura-bg/40 to-transparent" />
        <div className="relative mx-auto grid max-w-7xl gap-8 px-6 pb-10 pt-16 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <p className="text-[11px] uppercase tracking-[0.35em] text-aura-gold">Ideas | Characters | Scenes | Sound | Visuals | Final Film</p>
            <h1 className="mt-5 font-display text-5xl leading-[1.05] md:text-6xl">
              Turn Your Ideas<br />Into <span className="text-aura-gold">Extraordinary Films</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-white/75">
              The complete AI film production studio. From script to screen — with intelligent tools, cinematic quality and total creative control.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link href="/sign-up" className="rounded-md bg-aura-gold px-7 py-3.5 font-medium text-black shadow-[0_0_30px_rgba(232,184,75,0.35)]">Get Started Free →</Link>
              <a href="#how-it-works" className="rounded-md border border-white/40 px-7 py-3.5 font-medium hover:border-white">▷ See How It Works</a>
            </div>
          </div>
          <blockquote className="hidden self-start justify-self-end text-right font-display text-xl italic text-white/85 lg:block">
            “Professional filmmaking<br />power, without limits.”
            <span className="mt-3 block h-0.5 w-10 bg-aura-gold ml-auto" />
          </blockquote>
        </div>
        <ul id="features" className="relative mx-auto grid max-w-7xl grid-cols-2 gap-6 px-6 pb-10 md:grid-cols-5" aria-label="Features">
          {FEATURES.map((f) => (
            <li key={f.title} className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-md border border-white/20 text-lg text-white/80">{f.icon}</span>
              <span>
                <span className="block text-sm">{f.title}</span>
                <span className="text-xs text-white/50">{f.sub}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-b border-aura-border bg-aura-panel" aria-label="Providers">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-10 gap-y-4 px-6 py-6">
          <p className="text-[11px] uppercase leading-5 tracking-[0.25em] text-white/60">Works with<br />leading AI providers</p>
          {PROVIDERS.map((p) => (
            <span key={p.name} className="flex flex-col">
              <span className="text-lg font-semibold tracking-tight text-white/90">{p.name}</span>
              <span className={`text-[10px] uppercase tracking-wider ${p.state === "Built in" ? "text-emerald-300" : "text-white/40"}`}>{p.state}</span>
            </span>
          ))}
        </div>
      </section>

      <section id="genres" className="mx-auto grid max-w-7xl gap-8 px-6 py-14 lg:grid-cols-[260px_1fr]">
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-aura-gold">Any genre. Any story.</p>
          <h2 className="mt-3 font-display text-4xl leading-tight">Create Without Limits</h2>
          <p className="mt-3 text-white/60">Live action, animation or hybrid. Bring any story, in any genre, to life with cinematic quality.</p>
          <a href="#how-it-works" className="mt-6 inline-block rounded-md border border-aura-gold/70 px-5 py-2.5 text-sm">Explore Features →</a>
        </div>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8" aria-label="Genres">
          {GENRES.map((g) => (
            <li key={g.id} className="relative h-56 overflow-hidden rounded-lg border border-aura-border">
              <GenreArt id={g.id} />
              <ArtImage name={`genre-${g.id}`} alt="" />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-2 pb-3 pt-10 text-center text-sm font-medium">{g.label}</div>
            </li>
          ))}
        </ul>
      </section>

      <section id="how-it-works" className="border-t border-aura-border bg-aura-panel/60">
        <div className="mx-auto max-w-7xl px-6 py-14">
          <p className="text-center text-[11px] uppercase tracking-[0.3em] text-aura-gold">How it works</p>
          <h2 className="mt-3 text-center font-display text-4xl">Nine stages. One connected production.</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-white/60">Every stage builds on the approved work before it. Change something upstream and everything it affects is flagged for review — nothing approved is ever silently overwritten.</p>
          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PIPELINE.map(([t, d], i) => (
              <li key={t} className="rounded-lg border border-aura-border bg-aura-bg p-5">
                <span className="flex h-7 w-7 items-center justify-center rounded-full border border-aura-gold text-xs text-aura-gold">{i + 1}</span>
                <h3 className="mt-3 font-display text-lg">{t}</h3>
                <p className="mt-1 text-sm text-white/60">{d}</p>
              </li>
            ))}
          </ol>
          <div className="mt-10 text-center">
            <Link href="/sign-up" className="rounded-md bg-aura-gold px-7 py-3.5 font-medium text-black">Start Your Film →</Link>
          </div>
        </div>
      </section>

      <footer className="relative overflow-hidden border-t border-aura-border py-10 text-center">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(232,184,75,0.18),transparent_60%)]" />
        <p className="relative text-sm tracking-[0.5em] text-white/80">FROM IMAGINATION TO FINAL FILM</p>
        <span className="relative mx-auto mt-3 block h-0.5 w-10 bg-aura-gold" />
      </footer>
    </main>
  );
}
