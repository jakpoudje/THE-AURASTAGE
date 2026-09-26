// Regression (2026-09-26): creating a project with a pasted story outline in the
// logline returned a bare 400 "Invalid project input" and the dashboard showed nothing.
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerProjectsRoutes } from "../projects.controller";

const ORG = "dbeb36db-f39f-4a4b-bae6-e7abdcd10e82";
const LONG = "Act I: The Heist. ".repeat(120); // ~2,100 characters

function app(inserted: Record<string, unknown>[] = []) {
  const a = Fastify();
  a.addHook("onRequest", async (req) => {
    const r = req as unknown as { db: unknown; userId: string };
    r.userId = "33333333-3333-4333-8333-333333333333";
    r.db = {
      rpc: async () => ({ data: true, error: null }),
      from: () => ({
        insert: (row: Record<string, unknown>) => {
          inserted.push(row);
          return {
            select: () => ({
              single: async () => ({
                data: { id: "44444444-4444-4444-8444-444444444444", status: "draft", type: "feature_film", created_at: "t", updated_at: "t", ...row },
                error: null,
              }),
            }),
          };
        },
      }),
    };
  });
  return a;
}

describe("POST /api/projects", () => {
  it("explains an over-long logline in plain language", async () => {
    const a = app();
    await registerProjectsRoutes(a);
    const res = await a.inject({ method: "POST", url: "/api/projects", payload: { org_id: ORG, title: "The Abuja Covenant", logline: LONG } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toBe("Logline must be 500 characters or fewer — put longer story text in the synopsis");
  });

  it("accepts a long story as the synopsis", async () => {
    const inserted: Record<string, unknown>[] = [];
    const a = app(inserted);
    await registerProjectsRoutes(a);
    const res = await a.inject({
      method: "POST",
      url: "/api/projects",
      payload: { org_id: ORG, title: "The Abuja Covenant", synopsis: LONG, target_runtime_minutes: 120 },
    });
    expect(res.statusCode).toBe(201);
    expect(inserted[0].synopsis).toBe(LONG);
    expect(res.json().synopsis).toBe(LONG);
  });
});
