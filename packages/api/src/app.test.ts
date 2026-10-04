import { describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import type { ApiDeps } from "./types.ts";

function deps(authenticated = false): ApiDeps {
  return {
    supabase: {
      auth: {
        getUser: async () =>
          authenticated
            ? {
                data: {
                  user: { id: "11111111-1111-4111-8111-111111111111", email: "a@example.test" },
                },
                error: null,
              }
            : { data: { user: null }, error: new Error("invalid") },
      },
    },
    db: {
      select: () => ({
        from: () => ({
          innerJoin: () => ({ where: () => ({ limit: async () => [] }) }),
          where: () => ({ limit: async () => [] }),
        }),
      }),
    },
  } as unknown as ApiDeps;
}

describe("API access boundary", () => {
  it("keeps health public", async () => {
    const res = await createApp(deps(), "http://localhost:3000").request("/health");
    expect(res.status).toBe(200);
  });
  it("requires a valid session for private routes", async () => {
    const app = createApp(deps(), "http://localhost:3000");
    expect((await app.request("/v1/me")).status).toBe(401);
    expect(
      (await app.request("/v1/me", { headers: { Authorization: "Bearer invalid" } })).status,
    ).toBe(401);
  });
  it("rejects a user who is not a member of the requested organization", async () => {
    const app = createApp(deps(true), "http://localhost:3000");
    const res = await app.request("/v1/org/conversations", {
      headers: {
        Authorization: "Bearer valid",
        "x-org-id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      },
    });
    expect(res.status).toBe(403);
  });
});
