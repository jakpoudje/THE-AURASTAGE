// Live provider key check (run by the live-smoke loader with SMOKE_FILE=keycheck.ts). Says, for each key the owner
// added on the servers, whether the provider accepts it and whether the account can actually generate — with the
// cheapest possible real request. Prints results only, never a key.
const out = (check: string, ok: boolean, detail: string) => console.log(JSON.stringify({ check, ok, detail }));
const scrub = (s: string) => String(s ?? "").replace(/(sk|key)-[A-Za-z0-9_\-]{6,}/g, "[key]").slice(0, 300);
const results: boolean[] = [];

async function anthropic(label: string, key?: string) {
  if (!key) return out(`Anthropic Claude (${label})`, false, "no key set");
  const h = { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" };
  const m = await fetch("https://api.anthropic.com/v1/models?limit=20", { headers: h });
  const mj: any = await m.json().catch(() => ({}));
  if (!m.ok) { results.push(false); return out(`Anthropic Claude (${label})`, false, `key refused: ${m.status} ${scrub(mj?.error?.message)}`); }
  const models: string[] = (mj.data ?? []).map((x: any) => x.id);
  const model = models.find((id) => /haiku/.test(id)) ?? models[0];
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: h, body: JSON.stringify({ model, max_tokens: 5, messages: [{ role: "user", content: "Reply with OK" }] }) });
  const j: any = await r.json().catch(() => ({}));
  results.push(r.ok);
  out(`Anthropic Claude (${label})`, r.ok, r.ok ? `key accepted and the account can generate (${model} replied "${scrub(j.content?.[0]?.text)}"); ${models.length} models available` : `key accepted but generating failed: ${r.status} ${scrub(j?.error?.message)}`);
}

async function openai(label: string, key?: string) {
  if (!key) return out(`OpenAI (${label})`, false, "no key set");
  const h = { Authorization: `Bearer ${key}`, "content-type": "application/json" };
  const m = await fetch("https://api.openai.com/v1/models", { headers: h });
  const mj: any = await m.json().catch(() => ({}));
  if (!m.ok) { results.push(false); return out(`OpenAI (${label})`, false, `key refused: ${m.status} ${scrub(mj?.error?.message)}`); }
  const ids: string[] = (mj.data ?? []).map((x: any) => x.id);
  const has = ["gpt-5", "gpt-image-1", "gpt-4o-mini"].map((id) => `${id}: ${ids.includes(id) ? "yes" : "no"}`).join(", ");
  const model = ids.includes("gpt-4o-mini") ? "gpt-4o-mini" : ids.find((id) => id.startsWith("gpt")) ?? ids[0];
  const r = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: h, body: JSON.stringify({ model, max_completion_tokens: 5, messages: [{ role: "user", content: "Reply with OK" }] }) });
  const j: any = await r.json().catch(() => ({}));
  results.push(r.ok);
  out(`OpenAI (${label})`, r.ok, r.ok ? `key accepted and the account can generate (${model}); models — ${has}` : `key accepted but generating failed: ${r.status} ${scrub(j?.error?.message)}; models — ${has}`);
}

async function kling(label: string, ak?: string, sk?: string, base?: string) {
  if (!ak || !sk) return out(`Kling (${label})`, false, "no access key / secret key set (both are needed)");
  const { createHmac } = await import("node:crypto");
  const b = (s: string | Buffer) => Buffer.from(s).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  const now = Math.floor(Date.now() / 1000);
  const head = b(JSON.stringify({ alg: "HS256", typ: "JWT" })), body = b(JSON.stringify({ iss: ak, exp: now + 1800, nbf: now - 5 }));
  const token = `${head}.${body}.${b(createHmac("sha256", sk).update(`${head}.${body}`).digest())}`;
  const url = `${base || "https://api-singapore.klingai.com"}/v1/videos/text2video?pageNum=1&pageSize=1`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const j: any = await r.json().catch(() => ({}));
  const ok = r.ok && j.code === 0;
  results.push(ok);
  out(`Kling (${label})`, ok, ok ? "keys accepted (signed request answered)" : `refused: ${r.status} code ${j.code ?? "?"} ${scrub(j.message)}`);
}

const e = Bun.env;
await anthropic("API server", e.API_ANTHROPIC_API_KEY);
await anthropic("generation worker", e.WORKER_ANTHROPIC_API_KEY);
await openai("API server", e.API_OPENAI_API_KEY);
await openai("generation worker", e.WORKER_OPENAI_API_KEY);
await kling("API server", e.API_KLING_ACCESS_KEY, e.API_KLING_SECRET_KEY, e.API_KLING_API_BASE);
await kling("generation worker", e.WORKER_KLING_ACCESS_KEY, e.WORKER_KLING_SECRET_KEY, e.WORKER_KLING_API_BASE);
console.log(`KEYCHECK DONE ${results.filter(Boolean).length}/${results.length} working`);
