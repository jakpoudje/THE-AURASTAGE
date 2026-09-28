// apps/api/src/infrastructure/rateLimit.ts
// Cross-cutting protection (SRS §18/§20): a fixed-window limit per signed-in person, separate for
// reads and writes, plus safe response headers. Runs after auth so limits follow the person, not the IP.
// In-memory per API instance: with one instance this is exact; with several, each allows its own share.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

export const LIMITS = { read: 600, write: 120 } as const; // per minute
const WINDOW_MS = 60_000;

type Counter = { windowStart: number; read: number; write: number };
export function createLimiter(limits: { read: number; write: number } = LIMITS, now: () => number = Date.now) {
  const counters = new Map<string, Counter>();
  let lastSweep = now();
  return {
    /** Returns seconds to wait, or 0 when the request may go ahead. */
    hit(key: string, kind: "read" | "write"): number {
      const t = now();
      if (t - lastSweep > WINDOW_MS) {
        for (const [k, c] of counters) if (t - c.windowStart >= WINDOW_MS) counters.delete(k);
        lastSweep = t;
      }
      let c = counters.get(key);
      if (!c || t - c.windowStart >= WINDOW_MS) counters.set(key, (c = { windowStart: t, read: 0, write: 0 }));
      c[kind] += 1;
      return c[kind] > limits[kind] ? Math.ceil((c.windowStart + WINDOW_MS - t) / 1000) : 0;
    },
  };
}

export async function registerProtection(app: FastifyInstance, limiter = createLimiter()) {
  app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.userId) return; // public paths (health) and unauthenticated requests were already answered by auth
    const kind = request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS" ? "read" : "write";
    const wait = limiter.hit(request.userId, kind);
    if (wait > 0) {
      reply.header("Retry-After", String(wait));
      reply.code(429).send({ error: { code: "AURA-MOS-429", message: `That's a lot of requests in a minute — please wait ${wait} s and try again.` } });
      return reply;
    }
  });
  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("X-Frame-Options", "DENY");
    if (!reply.hasHeader("Cache-Control")) reply.header("Cache-Control", "no-store");
    return payload;
  });
}
