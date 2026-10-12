import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { contactActivities, emailDrafts, inboundSuggestions } from "@contac/core/db";
import { registerContactRoutes } from "./contacts.ts";
import type { ApiDeps, ApiEnv } from "./types.ts";

const orgId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const activityId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("activity deletion", () => {
  it("removes a linked sent draft and clears inbound references before deleting the activity", async () => {
    const references = { draft: true, suggestion: true, activity: true };
    const tx = {
      select: () => ({
        from: () => ({
          where: async () => [],
        }),
      }),
      delete: (table: unknown) => ({
        where: () =>
          table === emailDrafts
            ? Promise.resolve().then(() => {
                references.draft = false;
              })
            : {
                returning: async () => {
                  if (table !== contactActivities) throw new Error("unexpected delete");
                  if (references.draft || references.suggestion)
                    throw new Error("foreign key violation");
                  if (!references.activity) return [];
                  references.activity = false;
                  return [{ id: activityId }];
                },
              },
      }),
      update: (table: unknown) => ({
        set: () => ({
          where: async () => {
            if (table === inboundSuggestions) references.suggestion = false;
          },
        }),
      }),
    };
    const app = new Hono<ApiEnv>();
    app.use("*", async (c, next) => {
      c.set("org", { id: orgId, role: "owner" });
      await next();
    });
    registerContactRoutes(app, {
      db: { transaction: async (run: (transaction: typeof tx) => Promise<unknown>) => run(tx) },
    } as unknown as ApiDeps);

    const response = await app.request(`/v1/org/activities/${activityId}/delete`, {
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: true });
    expect(references).toEqual({ draft: false, suggestion: false, activity: false });
  });
});
