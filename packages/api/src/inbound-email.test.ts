import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  classMemberships,
  contacts,
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
  contactTeams?: { orgId: string; email: string; allowExternalAi?: boolean }[];
  routed?: boolean;
};

function makeApp(fixture: Fixture = {}) {
  const suggestions: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];
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
              return fixture.contactTeams ?? [{ orgId: "team-5", email: "oliver.hayden@tum.de" }];
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
        values: (value: Record<string, unknown>) => ({
          onConflictDoNothing: () => {
            if (table === inboundSuggestions) {
              suggestions.push(value);
              return Object.assign(Promise.resolve(), {
                returning: async () => [{ id: "suggestion-1", ...value }],
              });
            }
            expect(table).toBe(inboundEmails);
            stored = { id: "inbound-1", ...value, routedAt: fixture.routed ? new Date() : null };
            return { returning: async () => [stored] };
          },
        }),
      }),
      update: (table: unknown) => ({
        set: (value: Record<string, unknown>) => ({
          where: async () => {
            expect([inboundEmails, inboundSuggestions]).toContain(table);
            updates.push(value);
          },
        }),
      }),
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
  return { receive, suggestions, updates, queries, stored: () => stored };
}

afterEach(() => vi.unstubAllEnvs());

describe("forwarded inbound email routing", () => {
  it("routes the screenshot's body contact to its team and preserves actual headers", async () => {
    const fixture = makeApp();
    expect((await fixture.receive()).status).toBe(202);
    expect(fixture.suggestions).toEqual([
      { inboundId: "inbound-1", orgId: "team-5", kind: "email", recipientUserId: "lenart" },
    ]);
    expect(fixture.stored()).toMatchObject({
      fromEmail: "alias@example.no",
      toEmails: ["contac@plingapp.no"],
    });
  });

  it("uses a unique body member to keep content in their team and send only overlap alerts elsewhere", async () => {
    const fixture = makeApp({
      bodySenders: ["lenart", "lenart"],
      senderTeams: ["team-5"],
      contactTeams: [
        { orgId: "team-5", email: "oliver.hayden@tum.de" },
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
