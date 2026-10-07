import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import {
  activityContacts,
  contactOverlapDismissals,
  contacts,
  inboundSuggestions,
  logAccessRequests,
  organizations,
} from "@contac/core/db";
import { registerEmailCrossTeamRoutes } from "./email-cross-team.ts";
import type { ApiDeps, ApiEnv } from "./types.ts";

const ownId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";
const teamId = "44444444-4444-4444-8444-444444444444";

function makeApp() {
  const dismissals: { contactId: string; otherContactId: string }[] = [];
  const rows = [
    {
      id: ownId,
      orgId: teamId,
      classId: "class-a",
      name: "Ada",
      teamName: "Team A",
      email: "ada@example.no",
      phoneNormalized: null,
      normalizedName: "ada",
      companyName: "acme",
      status: "ikke_kontaktet",
      assigneeId: null as string | null,
    },
    {
      id: otherId,
      orgId: "team-b",
      classId: "class-a",
      name: "Ada",
      teamName: "Team B",
      email: "ADA@example.no",
      phoneNormalized: null,
      normalizedName: "ada",
      companyName: "acme",
      status: "ikke_kontaktet",
      assigneeId: null,
    },
  ];
  const deps = {
    db: {
      select: (fields: Record<string, unknown>) => ({
        from: (table: unknown) => {
          const result = () => {
            if (table === organizations) return [{ classId: "class-a" }];
            if (table === contactOverlapDismissals) return dismissals;
            if (table === inboundSuggestions || table === logAccessRequests) return [];
            if (table === activityContacts) return [];
            if (table === contacts && "contact" in fields && "classId" in fields)
              return [{ contact: rows[0], companyName: "acme", classId: "class-a" }];
            if (table === contacts && "contact" in fields && "teamName" in fields)
              return [
                { contact: rows[1], companyName: "acme", teamName: "Team B", assigneeName: null },
              ];
            if (table === contacts && "classId" in fields) return rows;
            if (table === contacts) return [];
            throw new Error("Unexpected table");
          };
          const query = {
            innerJoin: () => query,
            leftJoin: () => query,
            where: () =>
              Object.assign(Promise.resolve(result()), { orderBy: async () => result() }),
          };
          return query;
        },
      }),
      insert: (table: unknown) => {
        expect(table).toBe(contactOverlapDismissals);
        return {
          values: (value: { contactId: string; otherContactId: string }) => ({
            onConflictDoNothing: async () => {
              dismissals.push(value);
            },
          }),
        };
      },
    },
  } as unknown as ApiDeps;
  const app = new Hono<ApiEnv>();
  app.use("*", async (c, next) => {
    c.set("org", { id: teamId, role: "member" });
    c.set("user", { id: userId, email: "member@example.no" });
    await next();
  });
  registerEmailCrossTeamRoutes(app, deps);
  return { app, rows, dismissals };
}

describe("cross-team inbox routes", () => {
  it("shows an existing uncontacted match and lets its recipient dismiss it", async () => {
    const { app, dismissals } = makeApp();
    const before = await app.request("/v1/org/inbox");
    expect(before.status).toBe(200);
    expect((await before.json()).overlaps).toMatchObject([
      { contactId: ownId, otherContactId: otherId, otherTeamName: "Team B" },
    ]);

    const dismissed = await app.request("/v1/org/overlap-alerts/dismiss", {
      method: "POST",
      body: JSON.stringify({ contactId: ownId, otherContactId: otherId }),
    });
    expect(dismissed.status).toBe(200);
    expect(dismissals).toHaveLength(1);
    expect((await (await app.request("/v1/org/inbox")).json()).overlaps).toEqual([]);
  });

  it("does not let a non-assignee dismiss another member's alert", async () => {
    const { app, rows, dismissals } = makeApp();
    rows[0]!.assigneeId = "another-user";
    expect((await (await app.request("/v1/org/inbox")).json()).overlaps).toEqual([]);
    const response = await app.request("/v1/org/overlap-alerts/dismiss", {
      method: "POST",
      body: JSON.stringify({ contactId: ownId, otherContactId: otherId }),
    });
    expect(response.status).toBe(404);
    expect(dismissals).toEqual([]);
  });

  it("shows uncontacted matches in the right-side pane data", async () => {
    const { app } = makeApp();
    const response = await app.request(`/v1/org/overlaps/${ownId}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject([
      { contactId: otherId, teamName: "Team B", status: "ikke_kontaktet" },
    ]);
  });
});
