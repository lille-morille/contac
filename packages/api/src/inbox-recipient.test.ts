import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { PgDialect } from "drizzle-orm/pg-core";
import { classMemberships, inboundSuggestions, organizations } from "@contac/core/db";
import { registerEmailCrossTeamRoutes } from "./email-cross-team.ts";
import type { ApiDeps, ApiEnv } from "./types.ts";

const userId = "11111111-1111-4111-8111-111111111111";
const teamId = "22222222-2222-4222-8222-222222222222";
const suggestionId = "33333333-3333-4333-8333-333333333333";
function fixture(admin = false) {
  const clauses: { table: unknown; sql: string; params: unknown[] }[] = [];
  let writes = 0;
  const record = (table: unknown, clause: Parameters<PgDialect["sqlToQuery"]>[0]) =>
    clauses.push({ table, ...new PgDialect().sqlToQuery(clause) });
  const deps = {
    db: {
      select: (fields?: Record<string, unknown>) => ({
        from: (table: unknown) => {
          const result = () =>
            table === classMemberships
              ? admin
                ? [{ role: "admin" }]
                : []
              : table === organizations
                ? [{ classId: "class-a" }]
                : table === inboundSuggestions && fields && "suggestion" in fields
                  ? [
                      {
                        suggestion: {
                          id: suggestionId,
                          orgId: teamId,
                          kind: "email",
                          status: "pending",
                          recipientUserId: "other-user",
                        },
                        inbound: {},
                      },
                    ]
                  : [];
          const query = {
            innerJoin: () => query,
            leftJoin: () => query,
            where: (clause: Parameters<PgDialect["sqlToQuery"]>[0]) => {
              record(table, clause);
              return query;
            },
            orderBy: async () => result(),
            then: (resolve: (rows: unknown[]) => unknown) =>
              Promise.resolve(result()).then(resolve),
          };
          return query;
        },
      }),
      update: (table: unknown) => {
        writes++;
        return {
          set: () => ({
            where: (clause: Parameters<PgDialect["sqlToQuery"]>[0]) => {
              record(table, clause);
              return { returning: async () => [] };
            },
          }),
        };
      },
    },
  } as unknown as ApiDeps;
  const app = new Hono<ApiEnv>();
  app.use("*", async (c, next) => {
    c.set("user", { id: userId, email: "local@example.no" });
    c.set("org", { id: teamId, role: "member" });
    await next();
  });
  registerEmailCrossTeamRoutes(app, deps);
  return { app, clauses, writes: () => writes };
}

describe("personal email inbox access", () => {
  it("limits regular members to shared items and their own personal items", async () => {
    const { app, clauses } = fixture();
    expect((await app.request("/v1/org/inbox")).status).toBe(200);
    const query = clauses.find((c) => c.table === inboundSuggestions)!;
    expect(query.sql).toContain('"recipient_user_id" is null');
    expect(query.sql).toContain('"recipient_user_id" =');
    expect(query.params).toEqual(expect.arrayContaining([teamId, userId, "pending"]));
  });
  it("keeps class-admin inspection scoped to the selected team", async () => {
    const { app, clauses } = fixture(true);
    expect((await app.request("/v1/org/inbox")).status).toBe(200);
    const query = clauses.find((c) => c.table === inboundSuggestions)!;
    expect(query.params).toContain(teamId);
    expect(query.sql).not.toContain('"recipient_user_id"');
  });
  it("rejects accepting another member's email before any writes", async () => {
    const { app, writes } = fixture();
    const response = await app.request(`/v1/org/email-suggestions/${suggestionId}/accept`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contactIds: [suggestionId] }),
    });
    expect(response.status).toBe(403);
    expect(writes()).toBe(0);
  });
  it("enforces recipient scope when dismissing an email", async () => {
    const { app, clauses } = fixture();
    expect(
      (await app.request(`/v1/org/email-suggestions/${suggestionId}/dismiss`, { method: "POST" }))
        .status,
    ).toBe(404);
    const query = clauses.find((c) => c.table === inboundSuggestions)!;
    expect(query.sql).toContain('"recipient_user_id" is null');
    expect(query.params).toEqual(expect.arrayContaining([suggestionId, teamId, userId]));
  });
});
