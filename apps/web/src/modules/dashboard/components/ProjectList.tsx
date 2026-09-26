import Link from "next/link";
import type { Project } from "@aurastage/contracts";

export function ProjectList({ projects }: { projects: Project[] }) {
  if (projects.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-aura-border p-8 text-center text-sm text-white/50">
        No projects yet. Create your first production above.
      </p>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {projects.map((p) => (
        <Link
          key={p.id}
          href={`/projects/${p.id}/scriptwriter`}
          className="block rounded-lg border border-aura-border bg-aura-panel p-5 transition hover:border-aura-gold/60"
        >
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-display text-lg">{p.title}</h3>
            <span className="rounded-full border border-aura-gold/50 px-2 py-0.5 text-[10px] uppercase tracking-wide text-aura-gold">
              {p.status}
            </span>
          </div>
          <p className="text-xs text-white/50">
            {p.type.replace("_", " ")} {p.genre ? `· ${p.genre}` : ""}{" "}
            {p.target_runtime_minutes ? `· ${p.target_runtime_minutes} min` : ""}
          </p>
          {p.logline && <p className="mt-3 text-sm text-white/70">{p.logline}</p>}
          <p className="mt-4 text-xs text-aura-gold">Open Scriptwriter →</p>
        </Link>
      ))}
    </div>
  );
}
