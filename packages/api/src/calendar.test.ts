import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { registerCalendarRoutes } from "./calendar.ts";
import type { ApiDeps, ApiEnv } from "./types.ts";

const teamId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const contactId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function fixture() {
  const queries: { sql: string; params: unknown[] }[] = [];
  const dialect = new PgDialect();
  const db = {
    select: () => ({
      from: () => ({
        where: async (condition: SQL) => {
          queries.push(dialect.sqlToQuery(condition));
          return [];
        },
      }),
    }),
  };
  const app = new Hono<ApiEnv>();
  app.use("*", async (c, next) => {
    c.set("org", { id: teamId, role: "owner" });
    c.set("user", { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" } as ApiEnv["Variables"]["user"]);
    await next();
  });
  registerCalendarRoutes(app, { db } as unknown as ApiDeps);
  return { app, queries };
}

describe("team calendar access", () => {
  it("filters calendar reads to the selected team", async () => {
    const { app, queries } = fixture();
    const range = new URLSearchParams({
      from: "2026-10-05",
      to: "2026-10-12",
      start: "2026-10-04T22:00:00.000Z",
      end: "2026-10-11T22:00:00.000Z",
    });
    expect((await app.request(`/v1/org/calendar-events?${range}`)).status).toBe(200);
    expect(queries[0]?.sql).toContain('"calendar_events"."org_id" =');
    expect(queries[0]?.params).toContain(teamId);
  });

  it("rejects a meeting unless its contact belongs to the selected team", async () => {
    const { app, queries } = fixture();
    const response = await app.request("/v1/org/calendar-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "meeting",
        title: "Intervju",
        contactId,
        startAt: "2026-10-09T09:00:00.000Z",
        endAt: "2026-10-09T10:00:00.000Z",
      }),
    });
    expect(response.status).toBe(404);
    expect(queries[0]?.sql).toContain('"contacts"."org_id" =');
    expect(queries[0]?.params).toContain(teamId);
    expect(queries[0]?.params).toContain(contactId);
  });
});
