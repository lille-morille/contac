import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import {
  activityContacts,
  contactActivities,
  contacts,
  emailActivities,
  emailDrafts,
  profiles,
} from "@contac/core/db";
import { registerEmailCrossTeamRoutes } from "./email-cross-team.ts";
import type { ApiDeps, ApiEnv } from "./types.ts";
vi.mock("./ai.ts", () => ({
  runContactAutomations: vi.fn(),
  extractInboundContactEmails: vi.fn(),
}));
const contactId = "11111111-1111-4111-8111-111111111111";
const teamId = "22222222-2222-4222-8222-222222222222";
const activityId = "33333333-3333-4333-8333-333333333333";
const draftId = "44444444-4444-4444-8444-444444444444";
function fixture(found = true, verifiedSender = false, withDraft = false) {
  const writes: { table: unknown; values: unknown }[] = [];
  const db = {
    transaction: async (fn: (tx: unknown) => unknown) => fn(db),
    select: () => ({
      from: (table: unknown) => {
        const result = () =>
          table === emailDrafts && withDraft
            ? [
                {
                  id: draftId,
                  orgId: teamId,
                  contactId,
                  createdBy: contactId,
                  fromEmail: "member@example.no",
                  toEmails: ["contact@example.no"],
                  ccEmails: [],
                  bccEmails: [],
                  subject: "Research question",
                  body: "Sent message",
                },
              ]
            : table === profiles
              ? verifiedSender
                ? [{ userId: contactId }]
                : []
              : found
                ? [{ id: contactId, email: "contact@example.no" }]
                : [];
        const query = {
          innerJoin: () => query,
          where: () => query,
          for: async () => result(),
          limit: async () => result(),
          then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve(result()).then(resolve),
        };
        return query;
      },
    }),
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        writes.push({ table, values });
        return { returning: async () => [{ id: activityId }] };
      },
    }),
    update: (table: unknown) => ({
      set: (values: unknown) => {
        const query = {
          where: () => {
            writes.push({ table, values });
            return query;
          },
          returning: async () => [{ id: draftId }],
          then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve([]).then(resolve),
        };
        return query;
      },
    }),
  };
  const app = new Hono<ApiEnv>();
  app.use("*", async (c, next) => {
    c.set("user", { id: contactId, email: "member@example.no" });
    c.set("org", { id: teamId, role: "member" });
    await next();
  });
  registerEmailCrossTeamRoutes(app, { db } as unknown as ApiDeps);
  const save = (body: unknown) =>
    app.request("/v1/org/email-activities", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  const markSent = () =>
    app.request(`/v1/org/email-drafts/${draftId}/mark-sent`, { method: "POST" });
  return { save, markSent, writes };
}
describe("manually pasted emails", () => {
  it("rejects empty text, excessive text and invalid addresses before writing", async () => {
    const { save, writes } = fixture();
    for (const fields of [
      { body: "  " },
      { body: "x".repeat(250_001) },
      { body: "text", fromEmail: "invalid" },
    ]) {
      expect((await save({ contactIds: [contactId], ...fields })).status).toBe(400);
    }
    expect(writes).toHaveLength(0);
  });
  it("refuses contacts outside the current team's active contacts", async () => {
    const { save, writes } = fixture(false);
    expect((await save({ contactIds: [contactId], body: "Pasted email" })).status).toBe(404);
    expect(writes).toHaveLength(0);
  });
  it("saves body-only email as an email activity with its explicit date and contact link", async () => {
    const { save, writes } = fixture();
    const response = await save({
      contactIds: [contactId, contactId],
      body: "  Pasted email  ",
      occurredAt: "2026-10-08T09:04:00Z",
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ activityId });
    expect(writes.find((w) => w.table === contactActivities)?.values).toMatchObject({
      orgId: teamId,
      kind: "email",
      summary: "Pasted email",
      occurredAt: new Date("2026-10-08T09:04:00Z"),
    });
    expect(writes.find((w) => w.table === emailActivities)?.values).toMatchObject({
      orgId: teamId,
      activityId,
      fromEmail: "",
      toEmails: [],
      subject: "",
    });
    expect(writes.find((w) => w.table === activityContacts)?.values).toEqual([
      { orgId: teamId, activityId, contactId },
    ]);
  });
  it("moves the addressed contact to waiting after logging a verified outgoing email", async () => {
    const { save, writes } = fixture(true, true);
    expect(
      (
        await save({
          contactIds: [contactId],
          body: "Sent message",
          fromEmail: "member@example.no",
          toEmails: ["contact@example.no"],
        })
      ).status,
    ).toBe(201);
    expect(writes.filter((write) => write.table === contacts)).toEqual([
      expect.objectContaining({ values: expect.objectContaining({ status: "venter_pa_svar" }) }),
      expect.objectContaining({ values: expect.objectContaining({ updatedAt: expect.any(Date) }) }),
    ]);
  });
  it("moves the recipient to waiting when an opened draft is marked sent", async () => {
    const { markSent, writes } = fixture(true, true, true);
    expect((await markSent()).status).toBe(200);
    expect(writes.find((write) => write.table === emailActivities)?.values).toMatchObject({
      fromEmail: "member@example.no",
      toEmails: ["contact@example.no"],
    });
    expect(writes).toContainEqual({
      table: contacts,
      values: expect.objectContaining({ status: "venter_pa_svar" }),
    });
  });
  it.each([
    {
      name: "unverified sender",
      fromEmail: "other@example.no",
      verifiedSender: false,
      toEmails: ["contact@example.no"],
    },
    {
      name: "incoming message",
      fromEmail: "contact@example.no",
      verifiedSender: true,
      toEmails: ["member@example.no"],
    },
  ])("leaves status alone for an $name", async ({ fromEmail, verifiedSender, toEmails }) => {
    const { save, writes } = fixture(true, verifiedSender);
    expect(
      (await save({ contactIds: [contactId], body: "Message", fromEmail, toEmails })).status,
    ).toBe(201);
    expect(writes.filter((write) => write.table === contacts)).toEqual([
      expect.objectContaining({
        values: expect.not.objectContaining({ status: expect.anything() }),
      }),
    ]);
  });
});
