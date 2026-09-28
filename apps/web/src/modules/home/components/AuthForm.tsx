"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabaseClient";

type Mode = "sign-in" | "sign-up" | "forgot";

/** Supabase auth messages -> plain language, with the next step to take. */
function friendly(message: string, mode: Mode): { text: string; action?: "sign-in" | "forgot" } {
  const m = message.toLowerCase();
  if (m.includes("already registered") || m.includes("already exists"))
    return { text: "This email already has an account. Sign in instead.", action: "sign-in" };
  if (m.includes("invalid login credentials"))
    return { text: "That email and password don't match. Check them, or reset your password.", action: "forgot" };
  if (m.includes("email not confirmed")) return { text: "Please confirm your email first — check your inbox for the link." };
  if (m.includes("password should be") || m.includes("weak password")) return { text: "Please choose a longer password (at least 6 characters)." };
  if (m.includes("rate limit") || m.includes("too many")) return { text: "Too many attempts. Please wait a minute and try again." };
  return { text: mode === "forgot" ? "We couldn't send the reset email. Please try again." : message };
}

/** Where to go after signing in: a same-site path from ?next= (e.g. an invite link), else the dashboard. */
function nextPath() {
  const n = new URLSearchParams(window.location.search).get("next");
  return n && n.startsWith("/") && !n.startsWith("//") ? n : "/dashboard";
}

export function AuthForm({ mode: initialMode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<ReturnType<typeof friendly> | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Already signed in? Go straight to the studio.
  useEffect(() => {
    getSupabaseClient()
      .auth.getSession()
      .then(({ data }) => {
        if (data.session) router.replace(nextPath());
      });
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const client = getSupabaseClient();
      if (mode === "forgot") {
        const { error: err } = await client.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (err) throw err;
        setInfo("If that email has an account, a reset link is on its way. Check your inbox.");
        return;
      }
      if (mode === "sign-up") {
        const { data, error: err } = await client.auth.signUp({ email, password });
        if (err) throw err;
        // Supabase returns a user with no identities when the email is already registered (and hides it).
        if (data.user && (data.user.identities?.length ?? 0) === 0) throw new Error("User already registered");
        if (!data.session) {
          setInfo(
            nextPath() === "/dashboard"
              ? "Account created. Check your email for a confirmation link, then sign in."
              : "Account created. Check your email for a confirmation link, then open your invite link again."
          );
          return;
        }
      } else {
        const { error: err } = await client.auth.signInWithPassword({ email, password });
        if (err) throw err;
      }
      router.push(nextPath());
      router.refresh();
    } catch (err) {
      setError(friendly(err instanceof Error ? err.message : "Something went wrong", mode));
    } finally {
      setLoading(false);
    }
  }

  const switchTo = (m: Mode) => {
    setMode(m);
    setError(null);
    setInfo(null);
    if (m !== "forgot") window.history.replaceState(null, "", (m === "sign-up" ? "/sign-up" : "/sign-in") + window.location.search);
  };

  const title = mode === "sign-up" ? "Create your account" : mode === "forgot" ? "Reset your password" : "Welcome back";
  const subtitle =
    mode === "sign-up"
      ? "Start producing with The AuraStage."
      : mode === "forgot"
        ? "Enter your email and we'll send you a link to choose a new password."
        : "Sign in to continue your production.";

  return (
    <div className="mx-auto mt-24 w-full max-w-sm rounded-lg border border-aura-border bg-aura-panel p-8">
      <Link href="/" className="mb-6 flex items-center gap-2 text-xs uppercase tracking-widest text-aura-gold">
        <span className="font-display text-lg">A</span> The AuraStage
      </Link>
      <h1 className="font-display text-2xl">{title}</h1>
      <p className="mt-1 text-sm text-white/60">{subtitle}</p>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="auth-email" className="mb-1 block text-xs text-white/60">
            Email
          </label>
          <input
            id="auth-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-aura-border bg-black/40 px-3 py-2 text-sm outline-none focus:border-aura-gold"
          />
        </div>
        {mode !== "forgot" && (
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label htmlFor="auth-password" className="block text-xs text-white/60">
                Password
              </label>
              {mode === "sign-in" && (
                <button type="button" onClick={() => switchTo("forgot")} className="text-xs text-aura-gold hover:underline">
                  Forgot password?
                </button>
              )}
            </div>
            <input
              id="auth-password"
              type="password"
              required
              minLength={6}
              autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-aura-border bg-black/40 px-3 py-2 text-sm outline-none focus:border-aura-gold"
            />
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error.text}{" "}
            {error.action === "sign-in" && (
              <button type="button" onClick={() => switchTo("sign-in")} className="text-aura-gold underline">
                Go to Sign in
              </button>
            )}
            {error.action === "forgot" && (
              <button type="button" onClick={() => switchTo("forgot")} className="text-aura-gold underline">
                Reset password
              </button>
            )}
          </p>
        )}
        {info && (
          <p role="status" className="text-sm text-emerald-300">
            {info}
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-aura-gold px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
        >
          {loading ? "Please wait…" : mode === "sign-up" ? "Create account" : mode === "forgot" ? "Send reset link" : "Sign in"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-white/60">
        {mode === "sign-up" ? (
          <>
            Already have an account?{" "}
            <button onClick={() => switchTo("sign-in")} className="text-aura-gold hover:underline">
              Sign in
            </button>
          </>
        ) : mode === "forgot" ? (
          <button onClick={() => switchTo("sign-in")} className="text-aura-gold hover:underline">
            Back to Sign in
          </button>
        ) : (
          <>
            New to The AuraStage?{" "}
            <button onClick={() => switchTo("sign-up")} className="text-aura-gold hover:underline">
              Create an account
            </button>
          </>
        )}
      </p>
    </div>
  );
}
