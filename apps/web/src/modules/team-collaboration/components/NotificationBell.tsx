"use client";

// Mentions, replies, review requests and finished tasks for the signed-in person
// (read from the server every minute and when opened; nothing is counted locally).

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Notification } from "@aurastage/contracts";
import { collabApi } from "../api/collabApi";

const ago = (iso: string) => {
  const s = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 1000));
  return s < 60 ? "just now" : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : new Date(iso).toLocaleDateString();
};

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ unread: number; items: Notification[] } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const load = useCallback(() => collabApi.notifications().then(setData).catch(() => null), []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  async function go(n: Notification) {
    setOpen(false);
    if (!n.read_at) await collabApi.markRead([n.id]).catch(() => null);
    await load();
    if (n.link) router.push(n.link);
  }

  const unread = data?.unread ?? 0;
  return (
    <div className="relative" ref={box}>
      <button
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        onClick={() => (setOpen((o) => !o), load())}
        className="relative flex h-8 w-8 items-center justify-center rounded-full border border-aura-border text-white/70 hover:text-white"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" />
        </svg>
        {unread > 0 && (
          <span data-testid="unread-count" className="absolute -right-1 -top-1 rounded-full bg-aura-gold px-1.5 text-[10px] font-semibold text-black">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div role="dialog" aria-label="Notifications" className="absolute right-0 z-30 mt-2 w-80 rounded-lg border border-aura-border bg-aura-panel shadow-xl">
          <div className="flex items-center justify-between border-b border-aura-border px-3 py-2">
            <span className="font-display text-sm">Notifications</span>
            {unread > 0 && (
              <button onClick={() => collabApi.markRead(null).then(load)} className="text-xs text-aura-gold underline">
                Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {!data?.items.length && <li className="px-3 py-6 text-center text-xs text-white/50">Nothing yet. Mentions, replies and review requests show up here.</li>}
            {data?.items.map((n) => (
              <li key={n.id}>
                <button onClick={() => go(n)} className={`block w-full px-3 py-2 text-left hover:bg-white/5 ${n.read_at ? "text-white/50" : ""}`}>
                  <div className="flex items-start gap-2 text-xs">
                    {!n.read_at && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-aura-gold" aria-label="unread" />}
                    <span className="font-medium">{n.title}</span>
                  </div>
                  {n.body && <div className="mt-0.5 line-clamp-2 text-xs text-white/50">{n.body}</div>}
                  <div className="mt-0.5 text-[10px] text-white/40">{ago(n.created_at)}</div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
