import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import {
  activityContacts,
  classMemberships,
  companyDomains,
  contactAdditionalInfo,
  contactOverlapDismissals,
  contactPersonTags,
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
            if (table === classMemberships) return [];
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

function makeSharedLogApp({ matched = true, sameClass = true } = {}) {
  let grants = 0;
  const other = {
    id: otherId,
    orgId: "team-b",
    companyId: "company-b",
    name: "Ada",
    normalizedName: "ada",
    email: "ada@example.no",
    phone: "+47 123 45 678",
    phoneNormalized: "4712345678",
    status: "venter_pa_svar",
    description: "Intervjuet om anskaffelser",
    sammendrag: "Ønsker en enklere bestillingsprosess.",
    stikkord: "Innkjøp, friksjon",
    sharedNote: "Ring igjen neste uke.",
    relevance: "high",
  };
  const own = { ...other, id: ownId, orgId: teamId, companyId: "company-a" };
  const deps = {
    db: {
      select: (fields?: Record<string, unknown>) => ({
        from: (table: unknown) => {
          const result = () => {
            if (table === contacts && fields && "teamName" in fields)
              return [
                {
                  contact: other,
                  teamName: "Team B",
                  classId: "class-a",
                  companyName: "acme",
                  organizationName: "Acme",
                  assigneeName: "Victoria",
                },
              ];
            if (table === contacts) return matched ? [{ contact: own, companyName: "acme" }] : [];
            if (table === organizations) return [{ classId: sameClass ? "class-a" : "class-b" }];
            if (table === contactPersonTags) return [{ name: "Beslutningstaker" }];
            if (table === companyDomains) return [{ name: "Helse" }];
            if (table === contactAdditionalInfo)
              return [{ id: "info-1", markdown: "Kjent fra pilot." }];
            if (table === activityContacts) return [];
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
        expect(table).toBe(logAccessRequests);
        return {
          values: () => ({
            onConflictDoUpdate: async () => {
              grants++;
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
  return { app, grants: () => grants };
}

describe("cross-team contact log", () => {
  it("shows the other team's contact summary even when there are no activities", async () => {
    const { app } = makeSharedLogApp();
    const response = await app.request(`/v1/org/shared-log/${otherId}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      contact: {
        name: "Ada",
        teamName: "Team B",
        organizationName: "Acme",
        assigneeName: "Victoria",
        status: "venter_pa_svar",
        sammendrag: "Ønsker en enklere bestillingsprosess.",
        sharedNote: "Ring igjen neste uke.",
        tags: ["Beslutningstaker"],
        domains: ["Helse"],
        additionalInfo: [{ markdown: "Kjent fra pilot." }],
      },
      activities: [],
    });
  });

  it.each([
    { matched: false, sameClass: true },
    { matched: true, sameClass: false },
  ])("keeps unrelated contacts out of the shared view", async (access) => {
    const { app, grants } = makeSharedLogApp(access);
    const response = await app.request(`/v1/org/shared-log/${otherId}`);
    expect(response.status).toBe(403);
    expect(grants()).toBe(0);
  });
});
