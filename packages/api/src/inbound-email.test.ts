import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  activityContacts,
  classMemberships,
  contactActivities,
  contacts,
  emailActivities,
  emailDrafts,
  inboundEmails,
  inboundSuggestions,
  memberships,
  organizations,
  profiles,
} from "@contac/core/db";
import { registerInboundEmailRoute } from "./email-cross-team.ts";
import type { ApiDeps, ApiEnv } from "./types.ts";
import { extractInboundContactEmails } from "./ai.ts";
vi.mock("./ai.ts", async (original) => ({
  ...(await original<typeof import("./ai.ts")>()),
  extractInboundContactEmails: vi.fn(),
}));
beforeEach(() => {
  vi.mocked(extractInboundContactEmails).mockReset().mockResolvedValue(["oliver.hayden@tum.de"]);
});

type Fixture = {
  directSender?: string;
  bodySenders?: string[];
  senderTeams?: string[];
  currentTeam?: string | null;
  contactTeams?: {
    id?: string;
    orgId: string;
    email: string;
    allowExternalAi?: boolean;
    assigneeId?: string | null;
  }[];
  routed?: boolean;
};

function makeApp(fixture: Fixture = {}) {
  const suggestions: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];
  const activities: Record<string, unknown>[] = [];
  const activityLinks: Record<string, unknown>[] = [];
  const emailRows: Record<string, unknown>[] = [];
  let stored: Record<string, unknown> = {};
  const queries: { table: unknown; params: unknown[] }[] = [];
  const deps = {
    db: {
      select: (fields?: Record<string, unknown>) => ({
        from: (table: unknown) => {
          let params: unknown[] = [];
          const result = () => {
            if (table === organizations)
              return fields && "inboundKey" in fields ? [] : [{ id: "class-a" }];
            if (table === contacts)
              return (
                fixture.contactTeams ?? [{ orgId: "team-5", email: "oliver.hayden@tum.de" }]
              ).map((row, index) => ({
                id: row.id ?? `contact-${index + 1}`,
                assigneeId: row.assigneeId === undefined ? "lenart" : row.assigneeId,
                ...row,
              }));
            if (table === profiles)
              return [
                ...(fixture.directSender
                  ? [{ userId: fixture.directSender, profileEmail: "alias@example.no" }]
                  : []),
                ...(fixture.bodySenders ?? ["lenart"]).map((userId) => ({
                  userId,
                  profileEmail: "lennarh@stud.ntnu.no",
                })),
              ];
            if (table === memberships)
              return (fixture.senderTeams ?? ["team-5"]).map((orgId) => ({ orgId }));
            if (table === classMemberships) return [{ currentTeamId: fixture.currentTeam ?? null }];
            if (table === emailDrafts) return [];
            throw new Error("Unexpected select");
          };
          const query = {
            innerJoin: () => query,
            where: (clause: Parameters<PgDialect["sqlToQuery"]>[0]) => {
              params = new PgDialect().sqlToQuery(clause).params;
              queries.push({ table, params });
              return query;
            },
            limit: async () => result(),
            orderBy: async () => result(),
            then: (resolve: (value: unknown[]) => unknown) =>
              Promise.resolve(result()).then(resolve),
          };
          return query;
        },
      }),
      insert: (table: unknown) => ({
        values: (value: Record<string, unknown> | Record<string, unknown>[]) => ({
          onConflictDoNothing: () => {
            if (table === inboundSuggestions) {
              suggestions.push(value as Record<string, unknown>);
              return Object.assign(Promise.resolve(), {
                returning: async () => [
                  { id: "suggestion-1", ...(value as Record<string, unknown>) },
                ],
              });
            }
            expect(table).toBe(inboundEmails);
            stored = {
              id: "inbound-1",
              ...(value as Record<string, unknown>),
              routedAt: fixture.routed ? new Date() : null,
            };
            return { returning: async () => [stored] };
          },
          returning: async () => {
            if (table === contactActivities) {
              activities.push(value as Record<string, unknown>);
              return [{ id: "activity-1", ...(value as Record<string, unknown>) }];
            }
            throw new Error("Unexpected returning insert");
          },
          then: (resolve: (value: unknown) => unknown) => {
            if (table === activityContacts) activityLinks.push(value as Record<string, unknown>);
            if (table === emailActivities) emailRows.push(value as Record<string, unknown>);
            return Promise.resolve().then(resolve);
          },
        }),
      }),
      update: (table: unknown) => ({
        set: (value: Record<string, unknown>) => {
          const query = {
            where: () => {
              expect([inboundEmails, inboundSuggestions, contacts]).toContain(table);
              updates.push(value);
              return query;
            },
            returning: async () => [{ id: "suggestion-1", ...value }],
            then: (resolve: (value: unknown[]) => unknown) => Promise.resolve([]).then(resolve),
          };
          return query;
        },
      }),
      transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(deps.db),
    },
  } as unknown as ApiDeps;
  const app = new Hono<ApiEnv>();
  registerInboundEmailRoute(app, deps);
  const receive = (overrides: Record<string, unknown> = {}) =>
    app.request("/webhooks/inbound-email", {
      method: "POST",
      headers: { authorization: "Bearer test-secret", "content-type": "application/json" },
      body: JSON.stringify({
        providerMessageId: "forward-1",
        fromEmail: "alias@example.no",
        toEmails: ["contac@plingapp.no"],
        subject: "WG: Universitäres Forschungsprojekt CERN-Technologie",
        body: "oliver.hayden@tum.de<mailto:oliver.hayden@tum.de>\nAm 08.10.2026 schrieb Lenart <lennarh@stud.ntnu.no<mailto:lennarh@stud.ntnu.no>>:",
        ...overrides,
      }),
    });
  vi.stubEnv("INBOUND_WEBHOOK_SECRET", "test-secret");
  return {
    receive,
    suggestions,
    updates,
    activities,
    activityLinks,
    emailRows,
    queries,
    stored: () => stored,
  };
}

afterEach(() => vi.unstubAllEnvs());

describe("forwarded inbound email routing", () => {
  it("keeps an unstructured forward in the inbox for confirmation", async () => {
    const fixture = makeApp();
    expect((await fixture.receive()).status).toBe(202);
    expect(fixture.suggestions).toEqual([
      { inboundId: "inbound-1", orgId: "team-5", kind: "email", recipientUserId: "lenart" },
    ]);
    expect(fixture.stored()).toMatchObject({
      fromEmail: "alias@example.no",
      toEmails: ["contac@plingapp.no"],
    });
    expect(fixture.activities).toHaveLength(0);
  });

  it("automatically adds a clear forward to its assigned contact with original content", async () => {
    const fixture = makeApp({ directSender: "lenart" });
    expect(
      (
        await fixture.receive({
          body: "—\nSignature\n\nBegin forwarded message:\n\nFrom: Oliver <oliver.hayden@tum.de>\nDate: Thu, 8 Oct 2026 23:16:25 +0200\nTo: Lenart <lennarh@stud.ntnu.no>\nSubject: Project\n\nOriginal message",
        })
      ).status,
    ).toBe(202);
    expect(fixture.activities).toHaveLength(1);
    expect(fixture.activities[0]).toMatchObject({
      orgId: "team-5",
      kind: "email",
      exportOwnerContactId: "contact-1",
      createdBy: "lenart",
      summary: "Original message",
      occurredAt: new Date("2026-10-08T21:16:25.000Z"),
    });
    expect(fixture.activityLinks).toEqual([
      { orgId: "team-5", activityId: "activity-1", contactId: "contact-1" },
    ]);
    expect(fixture.emailRows[0]).toMatchObject({
      inboundId: "inbound-1",
      activityId: "activity-1",
      subject: "Project",
      fromEmail: "oliver.hayden@tum.de",
      toEmails: ["lennarh@stud.ntnu.no"],
    });
    expect(fixture.updates).toContainEqual({ status: "accepted" });
    expect(fixture.updates).toContainEqual({ activityId: "activity-1" });
  });

  it("keeps a clear forward for review when the forwarder is not a known sender", async () => {
    const fixture = makeApp();
    expect(
      (
        await fixture.receive({
          body: "From: Oliver <oliver.hayden@tum.de>\nDate: Thu, 8 Oct 2026 23:16:25 +0200\nTo: Lenart <lennarh@stud.ntnu.no>\nSubject: Project\n\nOriginal message",
        })
      ).status,
    ).toBe(202);
    expect(fixture.activities).toHaveLength(0);
    expect(fixture.suggestions).toHaveLength(1);
  });

  it("uses an attached original without calling email matching AI", async () => {
    const fixture = makeApp({ directSender: "lenart" });
    expect(
      (
        await fixture.receive({
          body: "Please log the attached message.",
          forwardedAttachmentPresent: true,
          forwardedAttachment: {
            source: "attachment",
            confidence: "certain",
            fromEmail: "oliver.hayden@tum.de",
            toEmails: ["lennarh@stud.ntnu.no"],
            ccEmails: [],
            subject: "Attached original",
            body: "The actual message",
            occurredAt: "2026-10-08T21:16:25.000Z",
          },
        })
      ).status,
    ).toBe(202);
    expect(extractInboundContactEmails).not.toHaveBeenCalled();
    expect(fixture.activities[0]).toMatchObject({ summary: "The actual message" });
    expect(fixture.emailRows[0]).toMatchObject({
      fromEmail: "oliver.hayden@tum.de",
      subject: "Attached original",
    });
  });

  it("uses a unique body member to keep content in their team and send only overlap alerts elsewhere", async () => {
    const fixture = makeApp({
      bodySenders: ["lenart", "lenart"],
      senderTeams: ["team-5"],
      contactTeams: [
        { id: "contact-1", orgId: "team-5", email: "oliver.hayden@tum.de", assigneeId: "lenart" },
        { orgId: "other-team", email: "oliver.hayden@tum.de" },
      ],
    });
    expect((await fixture.receive()).status).toBe(202);
    expect(fixture.updates).toContainEqual({ extractedEmails: ["oliver.hayden@tum.de"] });
    expect(fixture.suggestions).toEqual([
      { inboundId: "inbound-1", orgId: "team-5", kind: "email", recipientUserId: "lenart" },
      {
        inboundId: "inbound-1",
        orgId: "other-team",
        kind: "alert",
        extractedEmails: ["oliver.hayden@tum.de"],
      },
    ]);
    const lookup = fixture.queries.find(
      (query) => query.table === profiles && query.params.includes("lennarh@stud.ntnu.no"),
    );
    expect(lookup?.params).toContain("class-a");
    expect(fixture.queries.some((query) => query.table === emailDrafts)).toBe(false);
  });

  it("does not spend a team's token when the member's team is ambiguous", async () => {
    const fixture = makeApp({ directSender: "lenart", senderTeams: ["team-1", "team-5"] });
    expect((await fixture.receive()).status).toBe(202);
    expect(fixture.suggestions).toEqual([]);
    expect(extractInboundContactEmails).not.toHaveBeenCalled();
  });

  it("uses the administrator's current team when several real memberships give no unique match", async () => {
    const fixture = makeApp({
      directSender: "lenart",
      senderTeams: ["archive-team", "current-team"],
      currentTeam: "current-team",
      contactTeams: [],
    });
    expect((await fixture.receive({ body: "No contact address" })).status).toBe(202);
    expect(fixture.suggestions).toEqual([
      { inboundId: "inbound-1", orgId: "current-team", kind: "email", recipientUserId: "lenart" },
    ]);
  });

  it("keeps a uniquely matched archived team's mail with that team", async () => {
    const fixture = makeApp({
      directSender: "lenart",
      senderTeams: ["archive-team", "current-team"],
      currentTeam: "current-team",
      contactTeams: [{ orgId: "archive-team", email: "archived@example.no" }],
    });
    expect((await fixture.receive({ ccEmails: ["archived@example.no"] })).status).toBe(202);
    expect(fixture.suggestions).toEqual([
      { inboundId: "inbound-1", orgId: "archive-team", kind: "email", recipientUserId: "lenart" },
    ]);
  });

  it("keeps a registered administrator without a checked team in the class inbox", async () => {
    const fixture = makeApp({ directSender: "lenart", senderTeams: [], currentTeam: null });
    expect((await fixture.receive({ ccEmails: ["oliver.hayden@tum.de"] })).status).toBe(202);
    expect(fixture.suggestions).toEqual([]);
  });

  it("does not attribute the email to an ambiguous body member", async () => {
    const fixture = makeApp({
      bodySenders: ["lenart", "another-member"],
      senderTeams: ["wrong-team"],
    });
    expect((await fixture.receive()).status).toBe(202);
    expect(fixture.updates.some((update) => "senderUserId" in update)).toBe(false);
    expect(fixture.suggestions).toEqual([]);
    expect(extractInboundContactEmails).not.toHaveBeenCalled();
  });

  it("preserves direct header routing and ignores incidental body contacts", async () => {
    const fixture = makeApp({
      bodySenders: [],
      contactTeams: [
        { orgId: "direct-team", email: "direct@example.no" },
        { orgId: "team-5", email: "oliver.hayden@tum.de" },
      ],
    });
    expect((await fixture.receive({ ccEmails: ["direct@example.no"] })).status).toBe(202);
    expect(fixture.suggestions).toEqual([
      { inboundId: "inbound-1", orgId: "direct-team", kind: "email" },
    ]);
  });

  it("leaves unresolvable messages for the class admin", async () => {
    const fixture = makeApp({ contactTeams: [], bodySenders: [] });
    expect((await fixture.receive({ body: "No addresses here" })).status).toBe(202);
    expect(fixture.suggestions).toEqual([]);
  });

  it("does not route an already processed message again", async () => {
    const fixture = makeApp({ routed: true });
    expect(await (await fixture.receive()).json()).toEqual({ duplicate: true });
    expect(fixture.suggestions).toEqual([]);
    expect(fixture.updates).toEqual([]);
  });

  it.each(["toEmails", "ccEmails", "bccEmails"])(
    "identifies the user in %s before contact extraction",
    async (field) => {
      const fixture = makeApp();
      expect(
        (await fixture.receive({ [field]: ["lennarh@stud.ntnu.no"], body: "oliver.hayden@tum.de" }))
          .status,
      ).toBe(202);
      expect(extractInboundContactEmails).toHaveBeenCalledWith(
        expect.anything(),
        "team-5",
        "oliver.hayden@tum.de",
      );
      expect(fixture.suggestions[0]).toMatchObject({ orgId: "team-5", recipientUserId: "lenart" });
    },
  );

  it("keeps failed extraction in the matched user's inbox for manual contact selection", async () => {
    vi.mocked(extractInboundContactEmails).mockRejectedValue(new Error("No provider"));
    const fixture = makeApp();
    expect((await fixture.receive()).status).toBe(202);
    expect(fixture.suggestions).toEqual([
      { inboundId: "inbound-1", orgId: "team-5", kind: "email", recipientUserId: "lenart" },
    ]);
  });

  it("leaves multiple assigned body matches for inbox review", async () => {
    const fixture = makeApp({
      contactTeams: [
        { id: "contact-a", orgId: "team-5", email: "oliver.hayden@tum.de", assigneeId: "lenart" },
        { id: "contact-b", orgId: "team-5", email: "oliver.hayden@tum.de", assigneeId: "lenart" },
      ],
    });
    expect((await fixture.receive()).status).toBe(202);
    expect(fixture.activities).toEqual([]);
    expect(fixture.suggestions).toHaveLength(1);
    expect(fixture.updates).not.toContainEqual({ status: "accepted" });
  });

  it("leaves an unassigned body match for inbox review", async () => {
    const fixture = makeApp({
      contactTeams: [
        {
          id: "contact-unassigned",
          orgId: "team-5",
          email: "oliver.hayden@tum.de",
          assigneeId: null,
        },
      ],
    });
    expect((await fixture.receive()).status).toBe(202);
    expect(fixture.activities).toEqual([]);
    expect(fixture.suggestions).toHaveLength(1);
    expect(fixture.updates).not.toContainEqual({ status: "accepted" });
  });

  it("skips AI if the owner's contact matches a header", async () => {
    const fixture = makeApp();
    expect((await fixture.receive({ ccEmails: ["oliver.hayden@tum.de"] })).status).toBe(202);
    expect(extractInboundContactEmails).not.toHaveBeenCalled();
  });

  it("respects a body-matched contact's external AI prohibition", async () => {
    const fixture = makeApp({
      contactTeams: [{ orgId: "team-5", email: "oliver.hayden@tum.de", allowExternalAi: false }],
    });
    expect((await fixture.receive()).status).toBe(202);
    expect(extractInboundContactEmails).not.toHaveBeenCalled();
    expect(fixture.suggestions[0]).toMatchObject({ recipientUserId: "lenart" });
  });
});
