import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { CONTACT_DESCRIPTION_MAX_LENGTH } from "@contac/core";
import { registerContactRoutes } from "./contacts.ts";
import type { ApiDeps, ApiEnv } from "./types.ts";

const orgId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const contactId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function makeApp(description: string) {
  const current = {
    id: contactId,
    orgId,
    companyId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    description,
    status: "ikke_kontaktet",
    assigneeId: null,
    deletedAt: null,
    allowExternalAi: false,
  };
  let savedDescription: string | undefined;
  const db = {
    select: () => ({ from: () => ({ where: async () => [current] }) }),
    update: () => ({
      set: (changes: { description?: string }) => ({
        where: () => ({
          returning: async () => {
            savedDescription = changes.description;
            return [{ ...current, ...changes }];
          },
        }),
      }),
    }),
  };
  const app = new Hono<ApiEnv>();
  app.use("*", async (c, next) => {
    c.set("org", { id: orgId, role: "owner" });
    await next();
  });
  registerContactRoutes(app, { db } as unknown as ApiDeps);
  return { app, savedDescription: () => savedDescription };
}

describe("contact description edits", () => {
  it("accepts a shorter description when the saved value exceeds the new limit", async () => {
    const original = "x".repeat(CONTACT_DESCRIPTION_MAX_LENGTH + 30);
    const { app, savedDescription } = makeApp(original);
    const response = await app.request(`/v1/org/contacts/${contactId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "Shortened", expected: { description: original } }),
    });

    expect(response.status).toBe(200);
    expect(savedDescription()).toBe("Shortened");
  });

  it("still rejects a newly submitted description above the limit", async () => {
    const { app, savedDescription } = makeApp("Existing");
    const response = await app.request(`/v1/org/contacts/${contactId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: "x".repeat(CONTACT_DESCRIPTION_MAX_LENGTH + 1),
        expected: { description: "Existing" },
      }),
    });

    expect(response.status).toBe(400);
    expect(savedDescription()).toBeUndefined();
  });
});
