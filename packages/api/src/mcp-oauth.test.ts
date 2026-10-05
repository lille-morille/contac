import { afterEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { mcpUserConnections, memberships, profiles } from "@contac/core/db";
import { mcpOauthChallenge, registerMcpOauthRoutes, resolveAgentTeam } from "./mcp-oauth.ts";
import type { ApiDeps, ApiEnv } from "./types.ts";

const userId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const teamA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const teamB = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const clientId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function makeDeps(options: { teamId?: string | null; member?: boolean; connected?: boolean } = {}) {
  const state = {
    teamId: options.teamId === undefined ? teamA : options.teamId,
    member: options.member ?? true,
    connected: options.connected ?? true,
  };
  const inserted: unknown[] = [];
  const db = {
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: async () =>
            table === profiles
              ? [{ orgId: state.teamId }]
              : table === memberships && state.member
                ? [{ userId }]
                : [],
        }),
        innerJoin: () => ({
          where: () => ({
            limit: async () =>
              table === mcpUserConnections && state.connected ? [{ orgId: state.teamId }] : [],
          }),
        }),
      }),
    }),
    insert: (table: unknown) => ({
      values: (row: unknown) => {
        if (table === mcpUserConnections) inserted.push(row);
        return { onConflictDoNothing: async () => undefined };
      },
    }),
  };
  return { deps: { db, supabase: {} } as unknown as ApiDeps, inserted, state };
}

function makeApp(deps: ApiDeps) {
  const app = new Hono<ApiEnv>();
  app.use("/v1/*", async (c, next) => {
    c.set("user", { id: userId, email: "person@accounts.contac.invalid" });
    await next();
  });
  registerMcpOauthRoutes(app, deps, "https://contac.plingapp.no");
  return app;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("personal MCP OAuth consent", () => {
  it("advertises the fixed resource URL and OAuth challenge", async () => {
    const app = makeApp(makeDeps().deps);
    const metadata = await app.request("/.well-known/oauth-protected-resource/mcp");
    expect(metadata.status).toBe(200);
    expect((await metadata.json()).resource).toBe("https://api.contac.plingapp.no/mcp");
    expect(mcpOauthChallenge("https://contac.plingapp.no")).toContain(
      "oauth-protected-resource/mcp",
    );
  });

  it("resolves the currently selected team and blocks revoked or lost access", async () => {
    const { deps, state } = makeDeps();
    expect(await resolveAgentTeam(deps, userId, clientId)).toEqual({
      orgId: teamA,
      createdBy: userId,
    });
    state.teamId = teamB;
    expect(await resolveAgentTeam(deps, userId, clientId)).toEqual({
      orgId: teamB,
      createdBy: userId,
    });
    state.member = false;
    expect(await resolveAgentTeam(deps, userId, clientId)).toBeNull();
    state.member = true;
    state.connected = false;
    expect(await resolveAgentTeam(deps, userId, clientId)).toBeNull();
  });

  it("requires a selected team and current membership before consent", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    for (const options of [{ teamId: null }, { member: false }]) {
      const { deps, inserted } = makeDeps(options);
      const response = await makeApp(deps).request("/v1/mcp/oauth/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer user-session" },
        body: JSON.stringify({ authorizationId: "request-id" }),
      });
      expect(response.status).toBe(403);
      expect(inserted).toHaveLength(0);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("binds the signed-in user and OAuth client without a team token", async () => {
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
              ? { authorization_id: "request-id", client: { id: clientId }, user: { id: userId } }
              : { redirect_url: "https://claude.ai/oauth/callback?code=abc" },
          ),
          { headers: { "Content-Type": "application/json" } },
        );
      }),
    );
    const { deps, inserted } = makeDeps();
    const response = await makeApp(deps).request("/v1/mcp/oauth/authorize", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer user-session" },
      body: JSON.stringify({ authorizationId: "request-id" }),
    });
    expect(response.status).toBe(200);
    expect(inserted).toEqual([{ userId, clientId }]);
    expect(calls).toHaveLength(2);
    expect((await response.json()).redirectUrl).toContain("claude.ai/oauth/callback");
  });

  it("does not grant a request owned by a different user", async () => {
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
              user: { id: teamB },
            }),
          ),
      ),
    );
    const { deps, inserted } = makeDeps();
    const response = await makeApp(deps).request("/v1/mcp/oauth/authorize", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer user-session" },
      body: JSON.stringify({ authorizationId: "request-id" }),
    });
    expect(response.status).toBe(403);
    expect(inserted).toHaveLength(0);
  });
});
