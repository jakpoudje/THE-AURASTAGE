"use client";

// Landing page for the password-reset email link. Supabase puts a recovery
// session in the URL; the browser client picks it up, then we set the new password.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabaseClient";

export default function ResetPassword() {
  const router = useRouter();
  const [ready, setReady] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const client = getSupabaseClient();
    const { data: sub } = client.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setReady(true);
    });
    const t = setTimeout(() => {
      client.auth.getSession().then(({ data }) => setReady((r) => r ?? !!data.session));
    }, 1500);
    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(t);
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error: err } = await getSupabaseClient().auth.updateUser({ password });
    setLoading(false);
    if (err) {
      setError(err.message.toLowerCase().includes("different") ? "Please choose a password you haven't used before." : err.message);
      return;
    }
    router.replace("/dashboard");
  }

  return (
    <div className="mx-auto mt-24 w-full max-w-sm rounded-lg border border-aura-border bg-aura-panel p-8">
      <h1 className="font-display text-2xl">Choose a new password</h1>
      {ready === null && <p className="mt-4 text-sm text-white/50">Checking your reset link…</p>}
      {ready === false && (
        <p className="mt-4 text-sm text-white/60">
          This reset link has expired or was already used.{" "}
          <Link href="/sign-in" className="text-aura-gold underline">
            Request a new one
          </Link>
          .
        </p>
      )}
      {ready && (
        <form onSubmit={submit} className="mt-6 space-y-4">
          <input
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password"
            className="w-full rounded-md border border-aura-border bg-black/40 px-3 py-2 text-sm outline-none focus:border-aura-gold"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button type="submit" disabled={loading} className="w-full rounded-md bg-aura-gold px-4 py-2 text-sm font-medium text-black disabled:opacity-50">
            {loading ? "Saving…" : "Save new password"}
          </button>
        </form>
      )}
    </div>
  );
}
