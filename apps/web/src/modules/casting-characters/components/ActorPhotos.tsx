"use client";

// Actor photos (BUILD_PLAN §8 item 14): a real performer's photo can replace a generated reference view of the
// character they play — only under a recorded consent. The photo goes to the Assets Library (Characters) and is used
// by prompts and providers exactly like a generated view. Withdrawing consent stops every photo under it at once.

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/apiClient";
import { lookApi, type PerformerConsent } from "../api/lookApi";

const msg = (e: unknown, d: string) => (e instanceof ApiError || e instanceof Error ? e.message : d);

export function ActorPhotos({ projectId, characterId, characterName, view, viewLabel, lookId, ageStateId, canEdit, onChanged }: {
  projectId: string; characterId: string; characterName: string; view: string; viewLabel: string;
  lookId: string | null; ageStateId: string | null; canEdit: boolean; onChanged: () => void;
}) {
  const [consents, setConsents] = useState<PerformerConsent[] | null>(null);
  const [performer, setPerformer] = useState("");
  const [statement, setStatement] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [consentId, setConsentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await lookApi.consents(characterId);
    setConsents(r.consents);
    const active = r.consents.filter((k) => k.active);
    setConsentId((cur) => (active.some((k) => k.id === cur) ? cur : active[0]?.id ?? ""));
  }, [characterId]);
  useEffect(() => { load().catch((e) => setError(msg(e, "Couldn't load consents"))); }, [load]);

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true); setError(null); setNotice(null);
    try { await fn(); setNotice(done); await load(); onChanged(); } catch (e) { setError(msg(e, "Something went wrong")); } finally { setBusy(false); }
  }

  const active = (consents ?? []).filter((k) => k.active);
  const name = performer.trim();
  return (
    <section aria-label="Actor photos" className="space-y-3 rounded-lg border border-aura-border p-3 text-xs">
      <div>
        <div className="text-sm font-medium">Actor photos (with consent)</div>
        <p className="mt-1 text-white/50">Cast a real performer? Their photos can replace the generated views of {characterName}. A photo is only used with the performer's recorded consent, and withdrawing it stops every photo under it at once.</p>
      </div>

      {active.length > 0 && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-white/60">Performer
            <select aria-label="Consent to use" value={consentId} onChange={(e) => setConsentId(e.target.value)} className="mt-1 block rounded-md border border-aura-border bg-black px-2 py-1.5 text-sm">
              {active.map((k) => <option key={k.id} value={k.id}>{k.performer_name}</option>)}
            </select>
          </label>
          <label className={`rounded-md border border-aura-gold/60 px-3 py-1.5 text-aura-gold ${!canEdit || busy ? "pointer-events-none opacity-40" : "cursor-pointer"}`}>
            Upload a photo for “{viewLabel}”
            <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label={`Actor photo for ${viewLabel}`} disabled={!canEdit || busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void run(() => lookApi.addActorPhoto(projectId, characterId, f, { consent_id: consentId, view, look_id: lookId, age_state_id: ageStateId }),
                  `Photo of ${active.find((k) => k.id === consentId)?.performer_name ?? "the performer"} is now the ${viewLabel} view. It's in the Assets Library under Characters.`);
              }} />
          </label>
        </div>
      )}

      {canEdit && (
        <details className="rounded-md border border-aura-border/60 p-2">
          <summary className="cursor-pointer text-white/70">Record a performer's consent</summary>
          <form className="mt-2 space-y-2" onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await lookApi.recordConsent(characterId, { performer_name: name, statement: statement.trim(), confirm: true });
              setPerformer(""); setStatement(""); setConfirmed(false);
            }, `Consent from ${name} recorded. You can now upload their photos for each view.`);
          }}>
            <label className="block text-white/60">Performer's full name
              <input value={performer} onChange={(e) => setPerformer(e.target.value)} maxLength={120} className="mt-1 block w-full rounded-md border border-aura-border bg-black px-2 py-1.5 text-sm" />
            </label>
            <label className="block text-white/60">What they agreed to
              <textarea value={statement} onChange={(e) => setStatement(e.target.value)} maxLength={2000} rows={3}
                placeholder={`e.g. ${name || "The performer"} agrees that photos of them may be used as the reference for ${characterName} in this project's storyboards, generated images and videos.`}
                className="mt-1 block w-full rounded-md border border-aura-border bg-black px-2 py-1.5 text-sm" />
            </label>
            <label className="flex items-start gap-2 text-white/70">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" />
              <span>I confirm the performer gave this consent (keep the signed release with your production paperwork).</span>
            </label>
            <button type="submit" disabled={busy || !name || statement.trim().length < 20 || !confirmed} className="rounded-md bg-aura-gold px-3 py-1.5 font-medium text-black disabled:opacity-40">Record consent</button>
          </form>
        </details>
      )}

      {notice && <p role="status" className="text-emerald-300">{notice}</p>}
      {error && <p role="alert" className="text-red-300">{error}</p>}

      {(consents ?? []).length > 0 && (
        <ul aria-label="Recorded consents" className="space-y-2">
          {consents!.map((k) => {
            const inUse = k.photos.filter((p) => p.in_use).length;
            return (
              <li key={k.id} data-testid="consent" className="rounded-md bg-black/30 p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{k.performer_name}</span>
                  <span className={k.active ? "text-emerald-300" : "text-red-300"}>{k.active ? "Consent active" : `Withdrawn ${k.revoked_at?.slice(0, 10)}`}</span>
                  <span className="text-white/50">recorded {k.recorded_at.slice(0, 10)} · {k.active ? `${inUse} photo${inUse === 1 ? "" : "s"} in use` : `${k.photos.length} photo${k.photos.length === 1 ? "" : "s"} no longer used`}</span>
                  {k.active && canEdit && (
                    <button disabled={busy} onClick={() => {
                      if (window.confirm(`Withdraw ${k.performer_name}'s consent? Their photos stop being used as ${characterName}'s reference straight away.`))
                        void run(() => lookApi.withdrawConsent(k.id), `${k.performer_name}'s consent withdrawn — their photos are no longer used.`);
                    }} className="ml-auto rounded-md border border-red-400/50 px-2 py-1 text-red-300 disabled:opacity-40">Withdraw consent</button>
                  )}
                </div>
                <p className="mt-1 text-white/60">“{k.statement}”</p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
