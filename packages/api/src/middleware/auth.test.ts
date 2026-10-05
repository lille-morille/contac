import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { requireAuth } from "./auth.ts";
import type { ApiDeps, ApiEnv } from "../types.ts";

function jwt(claims: object) {
  return `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.signature`;
}

function app() {
  const deps = {
    supabase: {
      auth: {
        getUser: async () => ({
          data: { user: { id: "user-id", email: "a@example.test" } },
          error: null,
        }),
      },
    },
  } as unknown as ApiDeps;
  const api = new Hono<ApiEnv>();
  api.use("/v1/*", requireAuth(deps));
  api.get("/v1/profile/agent-access", (c) => c.json({ userId: c.get("user").id }));
  return api;
}

describe("browser API authorization", () => {
  it("accepts an authenticated browser audience", async () => {
    const response = await app().request("/v1/profile/agent-access", {
      headers: { Authorization: `Bearer ${jwt({ aud: "authenticated" })}` },
    });
    expect(response.status).toBe(200);
  });

  it("rejects an MCP-scoped OAuth token on the browser API", async () => {
    const response = await app().request("/v1/profile/agent-access", {
      headers: {
        Authorization: `Bearer ${jwt({ aud: "https://api.contac.plingapp.no/mcp", client_id: "client-id" })}`,
      },
    });
    expect(response.status).toBe(401);
  });
});
