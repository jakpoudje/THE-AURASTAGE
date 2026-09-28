"use client";

// Accept an invite. The token is in the URL fragment (/invite#<token>), which browsers
// never send to a server. The person must be signed in with the invited email.

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { InvitePreview } from "@aurastage/contracts";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { teamApi } from "./api/teamApi";

type State =
  | { kind: "loading" }
  | { kind: "signed-out"; token: string }
  | { kind: "ready"; token: string; preview: InvitePreview; email: string }
  | { kind: "error"; message: string };

export default function AcceptInvitePage() {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = window.location.hash.replace(/^#/, "");
    if (!/^[0-9a-f]{48}$/.test(token)) {
      setState({ kind: "error", message: "This invite link isn't complete. Ask for the link again and open it exactly as sent." });
      return;
    }
    (async () => {
      const { data } = await getSupabaseClient().auth.getSession();
      if (!data.session) return setState({ kind: "signed-out", token });
      try {
        setState({ kind: "ready", token, preview: await teamApi.preview(token), email: data.session.user.email ?? "" });
      } catch (err) {
        setState({ kind: "error", message: err instanceof Error ? err.message : "This invite link isn't valid" });
      }
    })();
  }, []);

  const next = (token: string) => encodeURIComponent(`/invite#${token}`);

  async function accept(token: string) {
    setBusy(true);
    setError(null);
    try {
      const r = await teamApi.accept(token);
      router.replace(r.project_id ? `/projects/${r.project_id}/team` : "/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not accept the invite");
      setBusy(false);
    }
  }

  async function switchAccount(token: string) {
    await getSupabaseClient().auth.signOut();
    router.replace(`/sign-in?next=${next(token)}`);
  }

  return (
    <div className="mx-auto mt-24 w-full max-w-md rounded-lg border border-aura-border bg-aura-panel p-8">
      <Link href="/" className="mb-6 flex items-center gap-2 text-xs uppercase tracking-widest text-aura-gold">
        <span className="font-display text-lg">A</span> The AuraStage
      </Link>
      <h1 className="font-display text-2xl">You're invited</h1>
      {state.kind === "loading" && <p className="mt-4 text-sm text-white/50">Checking your invite…</p>}
      {state.kind === "error" && <p role="alert" className="mt-4 text-sm text-red-300">{state.message}</p>}
      {state.kind === "signed-out" && (
        <div className="mt-4 space-y-3 text-sm">
          <p className="text-white/70">Sign in — or create an account — with the email address this invite was sent to.</p>
          <div className="flex gap-2">
            <Link href={`/sign-in?next=${next(state.token)}`} className="rounded-md bg-aura-gold px-4 py-2 text-black">Sign in</Link>
            <Link href={`/sign-up?next=${next(state.token)}`} className="rounded-md border border-aura-border px-4 py-2">Create account</Link>
          </div>
        </div>
      )}
      {state.kind === "ready" && (
        <div className="mt-4 space-y-3 text-sm">
          <p className="text-white/80">
            {state.preview.invited_by ?? "Someone"} invited <strong>{state.preview.email}</strong> to{" "}
            {state.preview.project ? <>work on <strong>{state.preview.project}</strong> as <strong>{state.preview.project_role_label}</strong></> : <>join <strong>{state.preview.organization}</strong> as <strong>{state.preview.org_role}</strong></>}.
          </p>
          {state.preview.status !== "pending" ? (
            <p role="alert" className="text-red-300">
              {state.preview.status === "accepted" ? "This invite has already been used." : state.preview.status === "revoked" ? "This invite was cancelled." : "This invite has expired — ask for a new one."}
            </p>
          ) : !state.preview.email_matches ? (
            <div className="space-y-2">
              <p role="alert" className="text-aura-gold">You're signed in as {state.email}. This invite is for {state.preview.email}.</p>
              <button onClick={() => switchAccount(state.token)} className="rounded-md border border-aura-border px-4 py-2">Sign in with {state.preview.email}</button>
            </div>
          ) : (
            <button onClick={() => accept(state.token)} disabled={busy} className="rounded-md bg-aura-gold px-4 py-2 font-medium text-black disabled:opacity-50">
              {busy ? "Joining…" : "Accept invite"}
            </button>
          )}
          {error && <p role="alert" className="text-red-300">{error}</p>}
        </div>
      )}
    </div>
  );
}
