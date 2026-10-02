import { beforeEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";

// Regression 2026-10-02: every API call asked Supabase Auth to verify the token; under load sign-in took a minute.
const getUser = vi.fn();
vi.mock("@aurastage/database", () => ({ createSupabaseClient: () => ({ auth: { getUser } }) }));
const { registerAuth, forgetVerifiedSessions } = await import("../auth");

const jwt = (expSecondsFromNow: number) =>
  `h.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expSecondsFromNow })).toString("base64url")}.s`;
async function app() {
  const a = Fastify();
  await registerAuth(a);
  a.get("/x", async (req) => ({ user: req.userId }));
  return a;
}

describe("API session verification", () => {
  beforeEach(() => { getUser.mockReset(); forgetVerifiedSessions(); getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null }); });

  it("verifies a token with Supabase once, then reuses it for a short while", async () => {
    const a = await app(), t = jwt(3600);
    for (let i = 0; i < 3; i++) expect((await a.inject({ url: "/x", headers: { authorization: `Bearer ${t}` } })).json()).toEqual({ user: "u1" });
    expect(getUser).toHaveBeenCalledTimes(1);
  });
  it("signing other devices out forgets every remembered session at once", async () => {
    const a = await app(), t = jwt(3600);
    await a.inject({ url: "/x", headers: { authorization: `Bearer ${t}` } });
    forgetVerifiedSessions();
    getUser.mockResolvedValue({ data: { user: null }, error: { message: "session not found" } });
    expect((await a.inject({ url: "/x", headers: { authorization: `Bearer ${t}` } })).statusCode).toBe(401);
  });
  it("never remembers a token past its own expiry, nor a refused one", async () => {
    const a = await app(), expired = jwt(-5);
    await a.inject({ url: "/x", headers: { authorization: `Bearer ${expired}` } });
    await a.inject({ url: "/x", headers: { authorization: `Bearer ${expired}` } });
    expect(getUser).toHaveBeenCalledTimes(2);
    getUser.mockResolvedValue({ data: { user: null }, error: { message: "bad" } });
    const bad = jwt(3600);
    expect((await a.inject({ url: "/x", headers: { authorization: `Bearer ${bad}` } })).statusCode).toBe(401);
    expect((await a.inject({ url: "/x" })).statusCode).toBe(401);
  });
});
