"use client";

// The project's audit trail in plain language (activityFeedEngine on the server).

import { useEffect, useState } from "react";
import type { ActivityItem } from "@aurastage/contracts";
import { collabApi } from "../api/collabApi";

export function ActivityFeed({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    collabApi.activity(projectId).then((r) => setItems(r.items)).catch((e) => setError(e.message));
  }, [projectId]);
  return (
    <div className="rounded-lg border border-aura-border bg-aura-panel p-4">
      <h2 className="font-display text-lg">Recent activity</h2>
      {error && <p role="alert" className="mt-2 text-xs text-red-300">{error}</p>}
      <ol className="mt-2 space-y-2 text-sm" aria-label="Recent activity">
        {items && !items.length && <li className="text-xs text-white/50">Nothing yet.</li>}
        {items?.slice(0, 25).map((i) => (
          <li key={i.id} className="text-xs">
            <span className="text-white/80">{i.actor_email ? i.actor_email.split("@")[0] : "The system"}</span>{" "}
            <span className="text-white/60">{i.summary}</span>
            <div className="text-[10px] text-white/40">{new Date(i.created_at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
          </li>
        ))}
      </ol>
    </div>
  );
}
