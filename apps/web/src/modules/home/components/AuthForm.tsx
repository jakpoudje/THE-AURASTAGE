"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabaseClient";

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const client = getSupabaseClient();
      const { error: authError } =
        mode === "sign-up"
          ? await client.auth.signUp({ email, password })
          : await client.auth.signInWithPassword({ email, password });
      if (authError) throw authError;
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto mt-24 w-full max-w-sm rounded-lg border border-aura-border bg-aura-panel p-8">
      <h1 className="font-display text-2xl">
        {mode === "sign-up" ? "Create your account" : "Welcome back"}
      </h1>
      <p className="mt-1 text-sm text-white/60">
        {mode === "sign-up"
          ? "Start producing with The AuraStage."
          : "Sign in to continue your production."}
      </p>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label className="mb-1 block text-xs text-white/60">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-aura-border bg-black/40 px-3 py-2 text-sm outline-none focus:border-aura-gold"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-white/60">Password</label>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-aura-border bg-black/40 px-3 py-2 text-sm outline-none focus:border-aura-gold"
          />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-aura-gold px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
        >
          {loading ? "Please wait…" : mode === "sign-up" ? "Create account" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
