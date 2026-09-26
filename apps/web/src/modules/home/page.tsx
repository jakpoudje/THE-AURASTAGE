// apps/web/src/modules/home/page.tsx
// Orchestration/composition surface ONLY — see CLAUDE.md.
// Home workspace: public marketing, product explanation, sign-in/get-started.
// No production objects are read or written here (SRS §1, §4).

import Link from "next/link";

const PIPELINE = [
  "Scriptwriter",
  "Casting & Characters",
  "Dialogue Intelligence",
  "Scene DNA",
  "Storyboard & Shots",
  "Visual Generation",
  "Audio Studio",
  "Editorial & Timeline",
  "Export & Deliver",
];

export default function HomePage() {
  return (
    <main>
      <header className="flex items-center justify-between border-b border-aura-border px-8 py-4">
        <div className="flex items-center gap-2">
          <span className="font-display text-xl text-aura-gold">A</span>
          <div>
            <div className="font-display text-lg leading-none">The AuraStage</div>
            <div className="text-[10px] tracking-widest text-white/50">AI FILM PRODUCTION STUDIO</div>
          </div>
        </div>
        <nav className="hidden gap-8 text-sm text-white/70 md:flex">
          <span>Features</span>
          <span>How It Works</span>
          <span>Pricing</span>
          <span>Showcase</span>
        </nav>
        <div className="flex items-center gap-3">
          <Link href="/sign-in" className="rounded-md border border-aura-border px-4 py-2 text-sm">
            Sign In
          </Link>
          <Link
            href="/sign-up"
            className="rounded-md bg-aura-gold px-4 py-2 text-sm font-medium text-black"
          >
            Get Started
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-8 py-20 text-center">
        <p className="mb-4 text-xs uppercase tracking-[0.3em] text-aura-gold">
          Ideas · Stories · Characters · Worlds
        </p>
        <h1 className="font-display text-5xl leading-tight">
          From Imagination to <span className="text-aura-gold">Extraordinary Films</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-white/70">
          The complete AI film production studio. Turn your ideas into professional films with
          intelligent tools for scriptwriting, casting, scenes, visuals, sound and final edit — all
          in one place.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Link
            href="/sign-up"
            className="rounded-md bg-aura-gold px-6 py-3 font-medium text-black"
          >
            Start Creating Free →
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-8 pb-24">
        <h2 className="mb-6 text-center text-xs uppercase tracking-[0.3em] text-white/50">
          A complete film production workflow
        </h2>
        <ol className="grid grid-cols-3 gap-4 text-sm md:grid-cols-9">
          {PIPELINE.map((stage, i) => (
            <li
              key={stage}
              className="flex flex-col items-center gap-2 rounded-md border border-aura-border bg-aura-panel p-4 text-center"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full border border-aura-gold text-xs text-aura-gold">
                {i + 1}
              </span>
              <span className="text-white/80">{stage}</span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
