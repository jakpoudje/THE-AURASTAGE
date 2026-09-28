import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerCollaborationRoutes } from "../collaboration.controller";
import { colForbiddenMessage } from "../../../infrastructure/permissions";

const P = "11111111-1111-4111-8111-111111111111";
const ORG = "22222222-2222-4222-8222-222222222222";
const W = "33333333-3333-4333-8333-333333333333";
const INV = "44444444-4444-4444-8444-444444444444";
const TOKEN = "ab".repeat(24);
type Row = Record<string, any>;

const modules = (actions: Record<string, string[]>) =>
  Object.fromEntries(["script", "casting", "dialogue", "scene_dna", "shots", "generation", "audio", "editorial", "delivery", "assets", "settings", "team"]
    .map((m) => [m, actions[m] ?? ["view", "comment"]]));
const writerAccess = { project_id: P, org_id: ORG, org_role: "member", project_role: "writer", project_role_label: "Writer", grants: [], source: "project",
  modules: modules({ script: ["view", "comment", "create", "edit"] }) };
const ownerAccess = { ...writerAccess, org_role: "owner", project_role: null, project_role_label: null, source: "organization",
  modules: modules(Object.fromEntries(["script", "team"].map((m) => [m, ["view", "comment", "create", "edit", "generate", "approve", "lock", "administer"]]))) };
const member = (email: string, extra: Row = {}) => ({ user_id: W, email, org_role: "member", project_role: "writer", grants: [], source: "project", joined_at: "2026-09-28T00:00:00Z", last_sign_in_at: null, ...extra });
const invite = { id: INV, org_id: ORG, project_id: P, email: "new@aurastage.invalid", org_role: "member", project_role: "reviewer", grants: [],
  created_at: "2026-09-28T00:00:00Z", expires_at: "2026-10-12T00:00:00Z", accepted_at: null, revoked_at: null };

function fakeDb(rpcImpl: (fn: string, a: Row) => { data?: unknown; error?: unknown }, tables: Record<string, Row[]> = {}) {
  const calls: { fn: string; args: Row }[] = [];
  const reads: string[] = [];
  const from = (t: string) => {
    reads.push(t);
    const q: any = { select: () => q, order: () => q, eq: () => q, is: () => q, then: (ok: any) => ok({ data: tables[t] ?? [], error: null }) };
    return q;
  };
  return { calls, reads, db: { from, rpc: async (fn: string, args: Row) => { calls.push({ fn, args }); const r = rpcImpl(fn, args); return { data: r.data ?? null, error: r.error ?? null }; } } };
}
async function app(fake: ReturnType<typeof fakeDb>) {
  const a = Fastify();
  a.addHook("onRequest", async (req) => void Object.assign(req as any, { db: fake.db, userId: W }));
  await registerCollaborationRoutes(a);
  return a;
}
const tables = { projects: [{ id: P, org_id: ORG, title: "Shadows of Lagos" }], project_roles: [{ id: "writer", label: "Writer", department: "Story", description: "d", permissions: { script: ["create", "edit"] }, sort: 3 }], invites: [invite] };

describe("Team & Collaboration routes", () => {
  it("a writer sees the team and their access, but not the open invites", async () => {
    const fake = fakeDb((fn) => ({ data: fn === "project_access" ? writerAccess : [member("writer@aurastage.invalid"), member("owner@aurastage.invalid", { org_role: "owner", project_role: null, source: "organization" })] }), tables);
    const res = await (await app(fake)).inject({ method: "GET", url: `/api/projects/${P}/team` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ can_manage: false, can_manage_studio: false, access: { project_role: "writer" }, project: { title: "Shadows of Lagos" } });
    expect(body.members).toHaveLength(2);
    expect(body.invites).toEqual([]);
    expect(fake.reads).not.toContain("invites");
  });

  it("an owner sees open invites", async () => {
    const fake = fakeDb((fn) => ({ data: fn === "project_access" ? ownerAccess : [] }), tables);
    const body = (await (await app(fake)).inject({ method: "GET", url: `/api/projects/${P}/team` })).json();
    expect(body).toMatchObject({ can_manage: true, can_manage_studio: true });
    expect(body.invites.map((i: Row) => i.email)).toEqual(["new@aurastage.invalid"]);
  });

  it("a member invite needs a project and a role", async () => {
    const fake = fakeDb(() => ({ data: {} }));
    const res = await (await app(fake)).inject({ method: "POST", url: `/api/organizations/${ORG}/invites`, payload: { email: "a@aurastage.invalid", org_role: "member" } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toBe("Choose the project and role for this person");
    expect(fake.calls).toHaveLength(0);
  });

  it("creates an invite: email normalised, token returned once", async () => {
    const fake = fakeDb(() => ({ data: { invite, token: TOKEN } }));
    const res = await (await app(fake)).inject({ method: "POST", url: `/api/organizations/${ORG}/invites`,
      payload: { email: " New@AuraStage.invalid ", project_id: P, project_role: "reviewer", grants: ["script:approve"] } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ token: TOKEN, invite: { id: INV } });
    expect(fake.calls[0]).toEqual({ fn: "create_invite", args: { p_org: ORG, p_email: "new@aurastage.invalid", p_org_role: "member", p_project: P, p_project_role: "reviewer", p_grants: ["script:approve"] } });
  });

  it("refuses unknown permissions before reaching the database", async () => {
    const fake = fakeDb(() => ({ data: {} }));
    const res = await (await app(fake)).inject({ method: "POST", url: `/api/projects/${P}/team/members`, payload: { user_id: W, role: "writer", grants: ["script:fly"] } });
    expect(res.statusCode).toBe(400);
    expect(fake.calls).toHaveLength(0);
  });

  it("passes the permission gate's plain-language reason through as 403", async () => {
    const fake = fakeDb(() => ({ error: { code: "42501", message: "AURA-COL-403: your role (Writer) can't administer in Team & Collaboration. Ask the project's producer for access." } }));
    const res = await (await app(fake)).inject({ method: "POST", url: `/api/projects/${P}/team/members`, payload: { user_id: W, role: "producer" } });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toEqual({ code: "AURA-COL-403", message: "your role (Writer) can't administer in Team & Collaboration. Ask the project's producer for access." });
  });

  it("keeps the last owner", async () => {
    const fake = fakeDb(() => ({ error: { code: "P0409", message: "AURA-COL-409: a studio needs at least one owner — make someone else an owner first" } }));
    const res = await (await app(fake)).inject({ method: "PATCH", url: `/api/organizations/${ORG}/members/${W}`, payload: { role: "admin" } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.message).toMatch(/at least one owner/);
  });

  it("invite tokens travel in the body; malformed ones never reach the database; expired is 410", async () => {
    const bad = fakeDb(() => ({ data: {} }));
    expect((await (await app(bad)).inject({ method: "POST", url: "/api/invites/accept", payload: { token: "nope" } })).statusCode).toBe(400);
    expect(bad.calls).toHaveLength(0);
    const expired = fakeDb(() => ({ error: { code: "P0410", message: "AURA-COL-410: this invite has expired — ask for a new one" } }));
    const res = await (await app(expired)).inject({ method: "POST", url: "/api/invites/accept", payload: { token: TOKEN } });
    expect(res.statusCode).toBe(410);
    expect(res.json().error.message).toBe("this invite has expired — ask for a new one");
    expect(expired.calls[0]).toEqual({ fn: "accept_invite", args: { p_token: TOKEN } });
  });

  it("previews an invite for the signed-in person", async () => {
    const fake = fakeDb(() => ({ data: { status: "pending", email: "new@aurastage.invalid", org_role: "member", project_role: "reviewer", project_role_label: "Reviewer",
      organization: "Lagos Films", project: "Shadows of Lagos", project_id: P, invited_by: "owner@aurastage.invalid", expires_at: "2026-10-12T00:00:00Z", email_matches: false } }));
    const res = await (await app(fake)).inject({ method: "POST", url: "/api/invites/preview", payload: { token: TOKEN } });
    expect(res.json()).toMatchObject({ project: "Shadows of Lagos", project_role_label: "Reviewer", email_matches: false });
  });

  it("colForbiddenMessage only unwraps the permission gate", () => {
    expect(colForbiddenMessage({ message: "AURA-COL-403: you don't have access to this project" })).toBe("you don't have access to this project");
    expect(colForbiddenMessage({ message: "AURA-EXP-403: not allowed" })).toBeUndefined();
  });
});
