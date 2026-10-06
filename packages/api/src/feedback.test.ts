import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { PgDialect } from "drizzle-orm/pg-core";
import { classFeedback } from "@contac/core/db";
import { registerFeedbackRoutes } from "./feedback.ts";
import type { ApiDeps, ApiEnv } from "./types.ts";

const userId = "11111111-1111-4111-8111-111111111111";
const classId = "22222222-2222-4222-8222-222222222222";
const feedbackId = "33333333-3333-4333-8333-333333333333";

function makeApp(options: { member?: boolean; admin?: boolean; updated?: boolean } = {}) {
  const clauses: { sql: string; params: unknown[] }[] = [];
  let inserted: Record<string, unknown> | null = null;
  let completed: Record<string, unknown> | null = null;
  const record = (clause: Parameters<PgDialect["sqlToQuery"]>[0]) => {
    const query = new PgDialect().sqlToQuery(clause);
    clauses.push({ sql: query.sql, params: query.params });
  };
  const deps = {
    db: {
      select: () => ({
        from: () => ({
          where: (clause: Parameters<PgDialect["sqlToQuery"]>[0]) => {
            record(clause);
            return {
              limit: async () =>
                options.member === false ||
                (options.admin === false && clauses.at(-1)?.params.includes("admin"))
                  ? []
                  : [{ classId }],
              orderBy: async () => [],
            };
          },
        }),
      }),
      insert: (table: unknown) => {
        expect(table).toBe(classFeedback);
        return {
          values: (value: Record<string, unknown>) => {
            inserted = value;
            return { returning: async () => [{ id: feedbackId }] };
          },
        };
      },
      update: (table: unknown) => {
        expect(table).toBe(classFeedback);
        return {
          set: (value: Record<string, unknown>) => {
            completed = value;
            return {
              where: (clause: Parameters<PgDialect["sqlToQuery"]>[0]) => {
                record(clause);
                return {
                  returning: async () => (options.updated === false ? [] : [{ id: feedbackId }]),
                };
              },
            };
          },
        };
      },
    },
  } as unknown as ApiDeps;
  const app = new Hono<ApiEnv>();
  app.use("*", async (c, next) => {
    c.set("user", { id: userId, email: "user@example.test" });
    await next();
  });
  registerFeedbackRoutes(app, deps);
  return { app, clauses, inserted: () => inserted, completed: () => completed };
}

describe("class feedback", () => {
  it("validates the form and stores the sender's class and identity", async () => {
    const { app, inserted } = makeApp();
    const invalid = await app.request("/v1/feedback", {
      method: "POST",
      body: JSON.stringify({ kind: "other", content: "hello" }),
    });
    expect(invalid.status).toBe(400);
    const response = await app.request("/v1/feedback", {
      method: "POST",
      body: JSON.stringify({ kind: "justering", content: "  Bedre visning  " }),
    });
    expect(response.status).toBe(201);
    expect(inserted()).toMatchObject({
      classId,
      userId,
      kind: "justering",
      content: "Bedre visning",
    });
  });

  it("rejects submissions from users outside the class", async () => {
    const { app, inserted } = makeApp({ member: false });
    const response = await app.request("/v1/feedback", {
      method: "POST",
      body: JSON.stringify({ kind: "bug_feil", content: "Feil" }),
    });
    expect(response.status).toBe(403);
    expect(inserted()).toBeNull();
  });

  it("scopes completion to the admin's class and only open feedback", async () => {
    const { app, clauses, completed } = makeApp();
    const response = await app.request(`/v1/class/feedback/${feedbackId}/complete`, {
      method: "POST",
    });
    expect(response.status).toBe(200);
    expect(completed()).toMatchObject({ completedBy: userId, completedAt: expect.any(Date) });
    expect(clauses[0]?.params).toContain("admin");
    expect(clauses[1]?.params).toEqual(expect.arrayContaining([feedbackId, classId]));
    expect(clauses[1]?.sql).toContain('"completed_at" is null');
  });

  it("hides the class log from non-admin members", async () => {
    const { app } = makeApp({ admin: false });
    const response = await app.request(`/v1/class/feedback/${feedbackId}/complete`, {
      method: "POST",
    });
    expect(response.status).toBe(403);
  });

  it("scopes completion messages to their sender and class", async () => {
    const { app, clauses } = makeApp();
    const response = await app.request("/v1/feedback/inbox");
    expect(response.status).toBe(200);
    expect(clauses[1]?.params).toEqual(expect.arrayContaining([classId, userId]));
    expect(clauses[1]?.sql).toContain('"completed_at" is not null');
    expect(clauses[1]?.sql).toContain('"acknowledged_at" is null');
  });

  it("does not complete feedback twice", async () => {
    const { app } = makeApp({ updated: false });
    const response = await app.request(`/v1/class/feedback/${feedbackId}/complete`, {
      method: "POST",
    });
    expect(response.status).toBe(409);
  });
});
