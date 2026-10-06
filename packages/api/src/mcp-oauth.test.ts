import { afterEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import {
  classMemberships,
  mcpUserConnections,
  memberships,
  organizations,
  profiles,
} from "@contac/core/db";
import { registerMcpRoutes } from "./mcp.ts";
import {
  hasTeamAccess,
  mcpOauthChallenge,
  registerMcpOauthRoutes,
  resolveAgentTeam,
} from "./mcp-oauth.ts";
import type { ApiDeps, ApiEnv } from "./types.ts";

const userId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const teamA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const teamB = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const clientId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function makeDeps(
  options: {
    teamId?: string | null;
    member?: boolean;
    classAdmin?: boolean;
    connected?: boolean;
  } = {},
) {
  const state = {
    teamId: options.teamId === undefined ? teamA : options.teamId,
    member: options.member ?? true,
    classAdmin: options.classAdmin ?? false,
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
        innerJoin: (joined: unknown) => ({
          where: () => ({
            limit: async () =>
              table === mcpUserConnections && state.connected
                ? [{ orgId: state.teamId }]
                : table === organizations && joined === classMemberships && state.classAdmin
                  ? [{ userId }]
                  : [],
          }),
        }),
      }),
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          if (table === profiles) state.teamId = values.agentTeamId as string;
        },
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
  it("accepts Supabase OAuth audiences only with a client grant and rejects ordinary sessions", async () => {
    vi.stubEnv("SUPABASE_URL", "https://supabase.example.test");
    vi.stubEnv("MCP_PUBLIC_BASE_URL", "https://api.contac.plingapp.no");
    const { publicKey, privateKey } = await generateKeyPair("ES256");
    const jwk = { ...(await exportJWK(publicKey)), kid: "test-key", alg: "ES256", use: "sig" };
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ keys: [jwk] }), {
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    vi.resetModules();
    const { authorizeMcpOauth } = await import("./mcp-oauth.ts");
    const sign = (audience: string, withClient = true) =>
      new SignJWT({ role: "authenticated", ...(withClient ? { client_id: clientId } : {}) })
        .setProtectedHeader({ alg: "ES256", kid: "test-key" })
        .setIssuer("https://supabase.example.test/auth/v1")
        .setSubject(userId)
        .setAudience(audience)
        .setExpirationTime("5m")
        .sign(privateKey);
    const tokenDeps = (connected: boolean) =>
      ({
        db: {
          select: () => ({
            from: () => ({
              innerJoin: () => ({
                where: () => ({ limit: async () => (connected ? [{ orgId: teamA }] : []) }),
              }),
              where: () => ({ limit: async () => [{ userId }] }),
            }),
          }),
        },
      }) as unknown as ApiDeps;
    const deps = tokenDeps(true);
    const failures: string[] = [];

    expect(
      await authorizeMcpOauth(deps, `Bearer ${await sign("authenticated")}`, (reason) =>
        failures.push(reason),
      ),
      failures.join(", "),
    ).toEqual({
      orgId: teamA,
      createdBy: userId,
    });
    expect(
      await authorizeMcpOauth(deps, `Bearer ${await sign("https://api.contac.plingapp.no/mcp")}`),
    ).toEqual({
      orgId: teamA,
      createdBy: userId,
    });
    expect(
      await authorizeMcpOauth(deps, `Bearer ${await sign("authenticated", false)}`),
    ).toBeNull();
    expect(await authorizeMcpOauth(deps, `Bearer ${await sign("another-resource")}`)).toBeNull();
    expect(
      await authorizeMcpOauth(tokenDeps(false), `Bearer ${await sign("authenticated")}`),
    ).toBeNull();
  });

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

  it("uses the workspace team selection for existing agent connections", async () => {
    const { deps, state } = makeDeps();
    const app = new Hono<ApiEnv>();
    app.use("/v1/*", async (c, next) => {
      c.set("user", { id: userId, email: "person@accounts.contac.invalid" });
      await next();
    });
    registerMcpRoutes(app, deps, "https://contac.plingapp.no");
    const response = await app.request("/v1/profile/selected-team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId: teamB }),
    });
    expect(response.status).toBe(200);
    expect(state.teamId).toBe(teamB);
    expect(await resolveAgentTeam(deps, userId, clientId)).toEqual({
      orgId: teamB,
      createdBy: userId,
    });
  });

  it("does not switch the workspace or agent to a team without access", async () => {
    const { deps, state } = makeDeps({ member: false });
    const app = new Hono<ApiEnv>();
    app.use("/v1/*", async (c, next) => {
      c.set("user", { id: userId, email: "person@accounts.contac.invalid" });
      await next();
    });
    registerMcpRoutes(app, deps, "https://contac.plingapp.no");
    const response = await app.request("/v1/profile/selected-team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId: teamB }),
    });
    expect(response.status).toBe(403);
    expect(state.teamId).toBe(teamA);
  });

  it("lets a class admin select a class team without direct membership", async () => {
    const { deps } = makeDeps({ member: false, classAdmin: true });
    expect(await hasTeamAccess(deps, userId, teamA)).toBe(true);
    expect(await resolveAgentTeam(deps, userId, clientId)).toEqual({
      orgId: teamA,
      createdBy: userId,
    });
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
