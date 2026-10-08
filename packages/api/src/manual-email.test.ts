import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { activityContacts, contactActivities, emailActivities } from "@contac/core/db";
import { registerEmailCrossTeamRoutes } from "./email-cross-team.ts";
import type { ApiDeps, ApiEnv } from "./types.ts";
vi.mock("./ai.ts", () => ({
  runContactAutomations: vi.fn(),
  extractInboundContactEmails: vi.fn(),
}));
const contactId = "11111111-1111-4111-8111-111111111111";
const teamId = "22222222-2222-4222-8222-222222222222";
const activityId = "33333333-3333-4333-8333-333333333333";
function fixture(found = true) {
  const writes: { table: unknown; values: unknown }[] = [];
  const db = {
    transaction: async (fn: (tx: unknown) => unknown) => fn(db),
    select: () => ({
      from: () => ({ where: () => ({ for: async () => (found ? [{ id: contactId }] : []) }) }),
    }),
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        writes.push({ table, values });
        return { returning: async () => [{ id: activityId }] };
      },
    }),
    update: () => ({ set: () => ({ where: async () => {} }) }),
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
  return { save, writes };
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
});
