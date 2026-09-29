// apps/api/src/providers/http.ts — small helpers every vendor adapter shares (polling, downloads, errors). Adapters stay
// the only files that know a vendor's endpoints (CLAUDE.md rule 7); these helpers know none.
import { ProviderError } from "./types";

export interface CallOpts { signal?: AbortSignal; fetchImpl?: typeof fetch; pollMs?: number }

export const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((res, rej) => {
    const t = setTimeout(res, ms);
    signal?.addEventListener("abort", () => (clearTimeout(t), rej(new ProviderError("Cancelled"))));
  });

/** Reads a JSON body (or {} when there isn't one) and turns a refusal into a clear, retry-aware ProviderError. */
export async function jsonOrThrow<T = Record<string, unknown>>(r: Response, vendor: string, message: (j: Record<string, any>) => string | undefined, requestId: string | null = null): Promise<T> {
  const j = (await r.json().catch(() => ({}))) as Record<string, any>;
  if (!r.ok) {
    const why = message(j) ?? r.statusText ?? "no details";
    const account = r.status === 401 || r.status === 403 ? " — check the API key on the server" : r.status === 402 ? " — the account needs credit" : "";
    throw new ProviderError(`${vendor} refused the request (${r.status}): ${why}${account}`, requestId, r.status === 429 || r.status >= 500);
  }
  return j as T;
}

/** Polls until `done` returns a value, `failed` returns a reason, or the deadline passes. */
export async function poll<T>(
  vendor: string, requestId: string, opts: CallOpts, check: () => Promise<{ done?: T; failed?: string }>, minutes = 10,
): Promise<T> {
  const deadline = Date.now() + minutes * 60_000;
  for (;;) {
    await sleep(opts.pollMs ?? 5000, opts.signal);
    const s = await check();
    if (s.done !== undefined) return s.done;
    if (s.failed) throw new ProviderError(`${vendor} failed: ${s.failed}`, requestId);
    if (Date.now() > deadline) throw new ProviderError(`${vendor} took longer than ${minutes} minutes`, requestId, true);
  }
}

/** Downloads a finished result. */
export async function download(url: string, vendor: string, requestId: string, fallbackType: string, opts: CallOpts, headers?: Record<string, string>) {
  const f = opts.fetchImpl ?? fetch;
  const media = await f(url, { signal: opts.signal, headers });
  if (!media.ok) throw new ProviderError(`Could not download the ${vendor} result (${media.status})`, requestId, true);
  return { bytes: new Uint8Array(await media.arrayBuffer()), media_type: (media.headers.get("content-type") ?? fallbackType).split(";")[0] };
}

export const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
export const dataUri = (i: { bytes: Uint8Array; media_type: string }) => `data:${i.media_type};base64,${b64(i.bytes)}`;
