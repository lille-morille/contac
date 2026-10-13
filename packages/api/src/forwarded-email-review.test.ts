import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import {
  activityContacts,
  contactActivities,
  contacts,
  emailActivities,
  inboundSuggestions,
  profiles,
} from "@contac/core/db";
import { registerEmailCrossTeamRoutes } from "./email-cross-team.ts";
import type { ApiDeps, ApiEnv } from "./types.ts";

vi.mock("./ai.ts", () => ({
  runContactAutomations: vi.fn(),
  extractInboundContactEmails: vi.fn(),
}));

const userId = "11111111-1111-4111-8111-111111111111";
const teamId = "22222222-2222-4222-8222-222222222222";
const suggestionId = "33333333-3333-4333-8333-333333333333";
const contactId = "44444444-4444-4444-8444-444444444444";
const activityId = "55555555-5555-4555-8555-555555555555";

function fixture(verifiedSender = false) {
  const writes: { table: unknown; values: Record<string, unknown> }[] = [];
  const inbound = {
    id: "inbound-1",
    forwardedIntent: true,
    forwardedMessage: {
      source: "inline",
      confidence: "review",
      fromEmail: "external@example.org",
      toEmails: ["teammate@example.no"],
      ccEmails: [],
      subject: "Original",
      body: "Original body",
      occurredAt: null,
    },
    fromEmail: "teammate@example.no",
    toEmails: ["contac@plingapp.no"],
    ccEmails: [],
    bccEmails: [],
    subject: "Fwd: Original",
    body: "Signature and quoted message",
    receivedAt: new Date("2026-10-08T21:30:00.000Z"),
  };
  const db = {
    select: (fields?: Record<string, unknown>) => ({
      from: (table: unknown) => {
        const result = () =>
          table === inboundSuggestions && fields && "suggestion" in fields
            ? [
                {
                  suggestion: {
                    id: suggestionId,
                    kind: "email",
                    status: "pending",
                    recipientUserId: userId,
                  },
                  inbound,
                },
              ]
            : table === contacts
              ? [{ id: contactId, email: "contact@example.no" }]
              : table === profiles && verifiedSender
                ? [{ userId }]
                : [];
        const query = {
          innerJoin: () => query,
          where: () => query,
          limit: async () => result(),
          then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve(result()).then(resolve),
        };
        return query;
      },
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => {
        const query = {
          where: () => {
            writes.push({ table, values });
            return query;
          },
          returning: async () => [{ id: suggestionId }],
          then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve([]).then(resolve),
        };
        return query;
      },
    }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        writes.push({ table, values });
        return {
          returning: async () => [{ id: activityId }],
          then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve([]).then(resolve),
        };
      },
    }),
    transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(db),
  };
  const app = new Hono<ApiEnv>();
  app.use("*", async (c, next) => {
    c.set("user", { id: userId, email: "teammate@example.no" });
    c.set("org", { id: teamId, role: "member" });
    await next();
  });
  registerEmailCrossTeamRoutes(app, { db } as unknown as ApiDeps);
  const accept = (body: unknown) =>
    app.request(`/v1/org/email-suggestions/${suggestionId}/accept`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  return { accept, writes };
}

describe("forwarded email inbox review", () => {
  it("requires a reviewed original before saving an uncertain forward", async () => {
    const { accept, writes } = fixture();
    expect((await accept({ contactIds: [contactId] })).status).toBe(428);
    expect(writes).toEqual([]);
  });

  it("saves the confirmed original headers, date and body", async () => {
    const { accept, writes } = fixture();
    expect(
      (
        await accept({
          contactIds: [contactId],
          message: {
            fromEmail: "external@example.org",
            toEmails: ["teammate@example.no"],
            ccEmails: [],
            subject: "Original",
            body: "Original body",
            occurredAt: "2026-10-08T21:16:25.000Z",
          },
        })
      ).status,
    ).toBe(200);
    expect(writes.find((write) => write.table === contactActivities)?.values).toMatchObject({
      summary: "Original body",
      exportOwnerContactId: contactId,
      occurredAt: new Date("2026-10-08T21:16:25.000Z"),
    });
    expect(writes.find((write) => write.table === emailActivities)?.values).toMatchObject({
      fromEmail: "external@example.org",
      toEmails: ["teammate@example.no"],
      subject: "Original",
      inboundId: "inbound-1",
    });
    expect(writes.find((write) => write.table === activityContacts)?.values).toEqual([
      { orgId: teamId, activityId, contactId },
    ]);
    expect(writes.some((write) => write.table === contacts && "status" in write.values)).toBe(
      false,
    );
  });

  it("moves the recipient to waiting when the accepted email was sent by a team member", async () => {
    const { accept, writes } = fixture(true);
    expect(
      (
        await accept({
          contactIds: [contactId],
          message: {
            fromEmail: "teammate@example.no",
            toEmails: ["contact@example.no"],
            ccEmails: [],
            subject: "Research question",
            body: "Sent message",
            occurredAt: "2026-10-08T21:16:25.000Z",
          },
        })
      ).status,
    ).toBe(200);
    expect(writes).toContainEqual({
      table: contacts,
      values: expect.objectContaining({ status: "venter_pa_svar" }),
    });
  });
});
