import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerCollaborationRoutes } from "../collaboration.controller";

const P = "11111111-1111-4111-8111-111111111111";
const C = "55555555-5555-4555-8555-555555555555";
const U = "33333333-3333-4333-8333-333333333333";
type Row = Record<string, any>;

function fakeDb(rpcImpl: (fn: string, a: Row) => { data?: unknown; error?: unknown }, tables: Record<string, Row[]> = {}) {
  const calls: { fn: string; args: Row }[] = [];
  const from = (t: string) => {
    let head = false;
    const q: any = {
      select: (_c: string, o?: { head?: boolean }) => ((head = !!o?.head), q), order: () => q, eq: () => q, is: () => q, limit: () => q,
      then: (ok: any) => ok(head ? { count: (tables[t] ?? []).filter((r) => !r.read_at).length, error: null } : { data: tables[t] ?? [], error: null }),
    };
    return q;
  };
  return { calls, db: { from, rpc: async (fn: string, args: Row) => { calls.push({ fn, args }); const r = rpcImpl(fn, args); return { data: r.data ?? null, error: r.error ?? null }; } } };
}
async function app(fake: ReturnType<typeof fakeDb>) {
  const a = Fastify();
  a.addHook("onRequest", async (req) => void Object.assign(req as any, { db: fake.db, userId: U }));
  await registerCollaborationRoutes(a);
  return a;
}
const comment = { id: C, parent_id: null, module: "editorial", object_type: "Timeline", object_id: P, object_version: "rev-7", anchor: { frame: 48, timecode: "00:00:02:00" },
  body: "Cut earlier", mentions: [U], mention_emails: ["w@aurastage.invalid"], created_by: U, author_email: "r@aurastage.invalid", created_at: "2026-09-28T00:00:00Z",
  edited_at: null, resolved_at: null, resolved_by_email: null, deleted_at: null };

describe("comments, tasks, notifications, activity", () => {
  it("adds a timecode comment with mentions; the database gets the exact version and anchor", async () => {
    const fake = fakeDb(() => ({ data: { id: C } }));
    const res = await (await app(fake)).inject({ method: "POST", url: `/api/projects/${P}/comments`,
      payload: { module: "editorial", object_type: "Timeline", object_id: P, object_version: "rev-7", anchor: { frame: 48, timecode: "00:00:02:00" }, body: " Cut earlier ", mentions: [U] } });
    expect(res.json()).toEqual({ id: C });
    expect(fake.calls[0]).toEqual({ fn: "add_comment", args: { p_project: P, p_module: "editorial", p_object_type: "Timeline", p_object_id: P, p_object_version: "rev-7",
      p_anchor: { frame: 48, timecode: "00:00:02:00" }, p_body: "Cut earlier", p_parent: null, p_mentions: [U] } });
  });
  it("refuses an empty comment or an unknown workspace before the database", async () => {
    const fake = fakeDb(() => ({ data: {} }));
    const a = await app(fake);
    const empty = await a.inject({ method: "POST", url: `/api/projects/${P}/comments`, payload: { module: "script", object_type: "Workspace", object_id: P, body: "   " } });
    expect(empty.statusCode).toBe(400);
    expect(empty.json().error.message).toBe("Write something first");
    expect((await a.inject({ method: "POST", url: `/api/projects/${P}/comments`, payload: { module: "moon", object_type: "Workspace", object_id: P, body: "x" } })).statusCode).toBe(400);
    expect(fake.calls).toHaveLength(0);
  });
  it("lists a workspace's comments with its filters", async () => {
    const fake = fakeDb(() => ({ data: [comment] }));
    const res = await (await app(fake)).inject({ method: "GET", url: `/api/projects/${P}/comments?module=editorial&object_type=Timeline&object_id=${P}` });
    expect(res.json()[0]).toMatchObject({ anchor: { timecode: "00:00:02:00" }, object_version: "rev-7", mention_emails: ["w@aurastage.invalid"] });
    expect(fake.calls[0].args).toEqual({ p_project: P, p_module: "editorial", p_object_type: "Timeline", p_object_id: P });
  });
  it("a reviewer resolving someone else's thread gets the gate's reason", async () => {
    const fake = fakeDb(() => ({ error: { code: "42501", message: "AURA-COL-403: your role (Reviewer) can't edit in Editorial & Timeline. Ask the project's producer for access." } }));
    const res = await (await app(fake)).inject({ method: "POST", url: `/api/comments/${C}/resolve`, payload: { resolved: true } });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.message).toMatch(/Reviewer\) can't edit in Editorial/);
  });
  it("creates a review request; dates must be real dates", async () => {
    const fake = fakeDb(() => ({ data: { id: C } }));
    const a = await app(fake);
    const bad = await a.inject({ method: "POST", url: `/api/projects/${P}/tasks`, payload: { module: "script", kind: "review", title: "Review", due_date: "tomorrow" } });
    expect(bad.statusCode).toBe(400);
    await a.inject({ method: "POST", url: `/api/projects/${P}/tasks`, payload: { module: "script", kind: "review", title: " Review scene 2 ", assignee: U, due_date: "2026-10-01" } });
    expect(fake.calls[0]).toEqual({ fn: "create_task", args: { p_project: P, p_module: "script", p_object_type: null, p_object_id: null, p_kind: "review", p_title: "Review scene 2", p_assignee: U, p_due: "2026-10-01" } });
  });
  it("my tasks come from every project; status must be known", async () => {
    const fake = fakeDb(() => ({ data: [] }));
    const a = await app(fake);
    await a.inject({ method: "GET", url: "/api/tasks/mine" });
    expect(fake.calls[0]).toEqual({ fn: "list_tasks", args: { p_project: null, p_mine: true } });
    expect((await a.inject({ method: "PATCH", url: `/api/tasks/${C}`, payload: { status: "finished" } })).statusCode).toBe(400);
  });
  it("notifications: latest items and the unread count; mark all read", async () => {
    const n = { id: C, project_id: P, kind: "mention", title: "r mentioned you in Scriptwriter", body: "hi", link: `/projects/${P}/scriptwriter?comment=${C}`, created_at: "2026-09-28T00:00:00Z", read_at: null };
    const fake = fakeDb(() => ({ data: 1 }), { notifications: [n, { ...n, id: U, read_at: "2026-09-28T00:00:00Z" }] });
    const a = await app(fake);
    const list = (await a.inject({ method: "GET", url: "/api/notifications" })).json();
    expect(list.unread).toBe(1);
    expect(list.items).toHaveLength(2);
    expect((await a.inject({ method: "POST", url: "/api/notifications/read", payload: {} })).json()).toEqual({ marked: 1 });
    expect(fake.calls[0]).toEqual({ fn: "mark_notifications_read", args: { p_ids: null } });
  });
  it("activity reads the audit trail and describes it", async () => {
    const fake = fakeDb(() => ({ data: [{ id: C, action: "CommentAdded", object_type: "Comment", object_id: C, metadata: { module: "editorial", anchor: { timecode: "00:00:02:00" } }, actor_id: U, actor_email: "r@aurastage.invalid", created_at: "2026-09-28T00:00:00Z" }] }));
    const res = (await (await app(fake)).inject({ method: "GET", url: `/api/projects/${P}/activity` })).json();
    expect(res.items[0]).toMatchObject({ summary: "commented in Editorial & Timeline at 00:00:02:00", actor_email: "r@aurastage.invalid" });
    expect(fake.calls[0]).toEqual({ fn: "project_activity", args: { p_project: P, p_before: null, p_limit: 50 } });
  });
});
