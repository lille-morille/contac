import { afterEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { classMemberships, mcpOauthGrants, memberships, teamMcpTokens } from "@contac/core/db";
import { mcpOauthChallenge, registerMcpOauthRoutes } from "./mcp-oauth.ts";
import type { ApiDeps, ApiEnv } from "./types.ts";

const userId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const orgId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const clientId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const teamToken = `ctc_${"a".repeat(43)}`;

function makeApp(options: { token?: boolean; member?: boolean; detailsUser?: string } = {}) {
  const inserted: unknown[] = [];
  const db = {
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: async () => {
            if (table === teamMcpTokens)
              return options.token
                ? [{ id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", orgId, createdBy: userId }]
                : [];
            if (table === memberships) return options.member ? [{ userId }] : [];
            return [];
          },
        }),
        innerJoin: () => ({
          where: () => ({ limit: async () => (table === classMemberships ? [] : []) }),
        }),
      }),
    }),
    insert: (table: unknown) => ({
      values: (row: unknown) => {
        if (table === mcpOauthGrants) inserted.push(row);
        return { onConflictDoUpdate: async () => undefined };
      },
    }),
  };
  const app = new Hono<ApiEnv>();
  app.use("/v1/*", async (c, next) => {
    c.set("user", { id: userId, email: "person@accounts.contac.invalid" });
    await next();
  });
  registerMcpOauthRoutes(
    app,
    { db, supabase: {} } as unknown as ApiDeps,
    "https://contac.plingapp.no",
  );
  return { app, inserted };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("MCP OAuth consent boundary", () => {
  it("advertises the fixed resource URL and an OAuth challenge", async () => {
    const { app } = makeApp();
    const metadata = await app.request("/.well-known/oauth-protected-resource/mcp");
    expect(metadata.status).toBe(200);
    expect((await metadata.json()).resource).toBe("https://api.contac.plingapp.no/mcp");
    expect(mcpOauthChallenge("https://contac.plingapp.no")).toContain(
      'resource_metadata="https://api.contac.plingapp.no/.well-known/oauth-protected-resource/mcp"',
    );
  });

  it("rejects invalid keys and people outside the token's team", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    for (const options of [
      { token: false, member: true },
      { token: true, member: false },
    ]) {
      const { app, inserted } = makeApp(options);
      const response = await app.request("/v1/mcp/oauth/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer user-session" },
        body: JSON.stringify({ authorizationId: "request-id", teamToken }),
      });
      expect(response.status).toBe(403);
      expect(inserted).toHaveLength(0);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("binds a valid team's key to the signed-in OAuth client before approval", async () => {
    vi.stubEnv("SUPABASE_URL", "https://supabase.example.test");
    vi.stubEnv("SUPABASE_SECRET_KEY", "server-only-key");
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        return new Response(
          JSON.stringify(
            calls.length === 1
              ? {
                  authorization_id: "request-id",
                  client: { id: clientId },
                  user: { id: userId },
                }
              : { redirect_url: "https://chatgpt.com/connector/oauth/callback?code=abc" },
          ),
          {
            headers: { "Content-Type": "application/json" },
          },
        );
      }),
    );
    const { app, inserted } = makeApp({ token: true, member: true });
    const response = await app.request("/v1/mcp/oauth/authorize", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer user-session" },
      body: JSON.stringify({ authorizationId: "request-id", teamToken }),
    });
    expect(response.status).toBe(200);
    expect(inserted).toEqual([
      { userId, clientId, tokenId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" },
    ]);
    expect(calls).toHaveLength(2);
    expect((await response.json()).redirectUrl).toContain("chatgpt.com/connector/oauth/callback");
  });

  it("does not grant a request belonging to a different user", async () => {
    vi.stubEnv("SUPABASE_URL", "https://supabase.example.test");
    vi.stubEnv("SUPABASE_SECRET_KEY", "server-only-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              authorization_id: "request-id",
              client: { id: clientId },
              user: { id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" },
            }),
          ),
      ),
    );
    const { app, inserted } = makeApp({ token: true, member: true });
    const response = await app.request("/v1/mcp/oauth/authorize", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer user-session" },
      body: JSON.stringify({ authorizationId: "request-id", teamToken }),
    });
    expect(response.status).toBe(403);
    expect(inserted).toHaveLength(0);
  });
});
