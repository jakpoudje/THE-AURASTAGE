"use client";

// Account & security (SRS §18): where you're signed in, signing other devices out, changing your password.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { helpApi, type Session } from "./api/helpApi";

function device(ua: string | null) {
  if (!ua) return "Unknown device";
  const os = /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "";
  return [br, os].filter(Boolean).join(" on ") || ua.slice(0, 40);
}

export default function AccountPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const load = useCallback(() => helpApi.sessions().then((r) => setSessions(r.sessions)).catch((e) => setError(e.message)), []);
  useEffect(() => {
    getSupabaseClient().auth.getSession().then(({ data }) => {
      if (!data.session) return router.replace("/sign-in?next=%2Faccount");
      setEmail(data.session.user.email ?? null);
      load();
    });
  }, [router, load]);

  async function act(fn: () => Promise<unknown>, msg: string) {
    setError(null);
    setNotice(null);
    try {
      await fn();
      await load();
      setNotice(msg);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work");
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-6 text-xs uppercase tracking-widest text-white/50">
        <Link href="/dashboard" className="text-aura-gold">The AuraStage</Link> / <Link href="/help" className="underline">Help</Link> / Account & security
      </div>
      <h1 className="font-display text-3xl">Account & security</h1>
      <p className="mt-1 text-sm text-white/60">Signed in as {email}</p>
      {error && <p role="alert" className="mt-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
      {notice && <p role="status" className="mt-3 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{notice}</p>}

      <div className="mt-6 rounded-lg border border-aura-border bg-aura-panel p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg">Where you're signed in</h2>
          {sessions && sessions.filter((s) => !s.current).length > 0 && (
            <button onClick={() => window.confirm("Sign out every other device?") && act(() => helpApi.revoke(null), "Signed out of your other devices.")}
              className="rounded-md border border-red-500/40 px-3 py-1 text-xs text-red-300">Sign out all other devices</button>
          )}
        </div>
        <ul className="mt-2 divide-y divide-aura-border" aria-label="Sessions">
          {sessions?.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-2 text-sm" data-testid={s.current ? "session-current" : "session-other"}>
              <div>
                <div>{device(s.user_agent)} {s.current && <span className="ml-1 rounded-full border border-emerald-500/40 px-2 text-[10px] text-emerald-300">This device</span>}</div>
                <div className="text-[11px] text-white/50">
                  {s.ip ? `${s.ip} · ` : ""}signed in {new Date(s.created_at).toLocaleDateString()} · last active {new Date(s.last_active_at).toLocaleString()}
                </div>
              </div>
              {!s.current && <button onClick={() => act(() => helpApi.revoke(s.id), "That device was signed out.")} className="rounded-md border border-aura-border px-2 py-1 text-xs">Sign out</button>}
            </li>
          ))}
        </ul>
      </div>

      <form className="mt-6 rounded-lg border border-aura-border bg-aura-panel p-4" aria-label="Change password"
        onSubmit={async (e) => {
          e.preventDefault();
          await act(async () => {
            const { error: err } = await getSupabaseClient().auth.updateUser({ password: pw });
            if (err) throw new Error(/should be|weak/i.test(err.message) ? "Please choose a longer password (at least 6 characters)." : err.message);
            setPw("");
          }, "Password changed.");
        }}>
        <h2 className="font-display text-lg">Change password</h2>
        <input type="password" aria-label="New password" autoComplete="new-password" minLength={6} required value={pw} onChange={(e) => setPw(e.target.value)}
          className="mt-2 w-full rounded-md border border-aura-border bg-black/40 px-3 py-2 text-sm" />
        <button className="mt-2 rounded-md bg-aura-gold px-3 py-1.5 text-sm text-black">Change password</button>
      </form>
    </div>
  );
}
