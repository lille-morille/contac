import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import {
  classMemberships,
  emailActivities,
  inboundEmails,
  inboundSuggestions,
} from "@contac/core/db";
import { registerEmailCrossTeamRoutes } from "./email-cross-team.ts";
import type { ApiDeps, ApiEnv } from "./types.ts";

const messages = [
  { id: "recorded", subject: "Saved draft copy" },
  { id: "suggested", subject: "Routed email" },
  { id: "unmatched", subject: "Unknown email" },
];

describe("class administrator email inbox", () => {
  it("hides received copies already linked to activities even without an inbox suggestion", async () => {
    const db = {
      select: () => ({
        from: (table: unknown) => {
          const rows = () =>
            table === classMemberships
              ? [{ classId: "class-1" }]
              : table === inboundEmails
                ? messages
                : table === inboundSuggestions
                  ? [{ inboundId: "suggested" }]
                  : table === emailActivities
                    ? [{ inboundId: "recorded" }]
                    : [];
          return table === inboundEmails
            ? { where: () => ({ orderBy: async () => rows() }) }
            : { where: async () => rows() };
        },
      }),
    };
    const app = new Hono<ApiEnv>();
    app.use("*", async (c, next) => {
      c.set("user", { id: "admin-1", email: "admin@example.no" });
      await next();
    });
    registerEmailCrossTeamRoutes(app, { db } as unknown as ApiDeps);

    const response = await app.request("/v1/class/inbox");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ id: "unmatched", subject: "Unknown email" }]);
  });
});
