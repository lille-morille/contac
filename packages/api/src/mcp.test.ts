import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { PgDialect } from "drizzle-orm/pg-core";
import { contacts, organizations, teamMcpTokens } from "@contac/core/db";
import { authorizeMcpToken, registerMcpRoutes } from "./mcp.ts";
import type { ApiDeps, ApiEnv } from "./types.ts";

const teamId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const userId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const token = `ctc_${"a".repeat(43)}`;

function fakeDeps(identity: { id: string; orgId: string; createdBy: string } | null = null) {
  const db = {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => (identity ? [identity] : []) }) }),
    }),
    update: () => ({ set: () => ({ where: async () => [] }) }),
  };
  return { db, supabase: {} } as unknown as ApiDeps;
}

describe("team MCP boundary", () => {
  it("rejects absent, malformed, and unknown bearer tokens", async () => {
    const deps = fakeDeps();
    const app = new Hono<ApiEnv>();
    registerMcpRoutes(app, deps, "https://contac.example.test");
    expect((await app.request("/mcp", { method: "POST" })).status).toBe(401);
    expect(
      (await app.request("/mcp", { method: "POST", headers: { Authorization: "Bearer wrong" } }))
        .status,
    ).toBe(401);
    expect(
      (await app.request("/mcp", { method: "POST", headers: { Authorization: `Bearer ${token}` } }))
        .status,
    ).toBe(401);
    expect(await authorizeMcpToken(deps, `Bearer ${token}`)).toBeNull();
  });

  it("exposes only scoped read and create tools after token authentication", async () => {
    const app = new Hono<ApiEnv>();
    registerMcpRoutes(
      app,
      fakeDeps({ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", orgId: teamId, createdBy: userId }),
      "https://contac.example.test",
    );
    const response = await app.request("/mcp", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": "2025-11-25",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    expect(response.status).toBe(200);
    const body = await response.text();
    for (const name of [
      "get_team_identity",
      "list_contacts",
      "get_contact",
      "list_team_reference",
      "list_library_items",
      "list_activities",
      "get_attachment_link",
      "create_contact",
      "batch_create_contacts",
      "add_activity",
    ])
      expect(body).toContain(`"name":"${name}"`);
    expect(body).not.toContain('"name":"delete_contact"');
    expect(body).not.toContain(token);
  });

  it("rejects requests from another browser origin", async () => {
    const app = new Hono<ApiEnv>();
    registerMcpRoutes(
      app,
      fakeDeps({ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", orgId: teamId, createdBy: userId }),
      "https://contac.example.test",
    );
    const response = await app.request("/mcp", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Origin: "https://evil.example.test" },
    });
    expect(response.status).toBe(403);
  });

  it("hashes bearer secrets and scopes contact reads to the token's team", async () => {
    const conditions: { sql: string; params: unknown[] }[] = [];
    const identity = {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      orgId: teamId,
      createdBy: userId,
    };
    const dialect = new PgDialect();
    const db = {
      select: () => ({
        from: (table: unknown) =>
          table === teamMcpTokens
            ? {
                where: (condition: Parameters<PgDialect["sqlToQuery"]>[0]) => {
                  conditions.push(dialect.sqlToQuery(condition));
                  return { limit: async () => [identity] };
                },
              }
            : table === contacts
              ? {
                  innerJoin: () => ({
                    where: (condition: Parameters<PgDialect["sqlToQuery"]>[0]) => {
                      conditions.push(dialect.sqlToQuery(condition));
                      return { orderBy: () => ({ limit: async () => [] }) };
                    },
                  }),
                }
              : {},
      }),
      update: () => ({ set: () => ({ where: async () => [] }) }),
    };
    const app = new Hono<ApiEnv>();
    registerMcpRoutes(
      app,
      { db, supabase: {} } as unknown as ApiDeps,
      "https://contac.example.test",
    );
    const response = await app.request("/mcp", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": "2025-11-25",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "list_contacts", arguments: { expectedTeamId: teamId } },
      }),
    });
    expect(response.status).toBe(200);
    expect(conditions[0]?.params).not.toContain(token);
    expect(conditions[0]?.params[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(conditions[1]?.sql).toContain('"contacts"."org_id"');
    expect(conditions[1]?.params).toContain(teamId);
    expect(conditions[1]?.params).not.toContain("dddddddd-dddd-4ddd-8ddd-dddddddddddd");
  });

  it("rejects a wrong expected team before querying contact data", async () => {
    const queried: unknown[] = [];
    const db = {
      select: () => ({
        from: (table: unknown) => {
          queried.push(table);
          return {
            where: () => ({
              limit: async () => [
                { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", orgId: teamId, createdBy: userId },
              ],
            }),
          };
        },
      }),
      update: () => ({ set: () => ({ where: async () => [] }) }),
    };
    const app = new Hono<ApiEnv>();
    registerMcpRoutes(
      app,
      { db, supabase: {} } as unknown as ApiDeps,
      "https://contac.example.test",
    );
    const response = await app.request("/mcp", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": "2025-11-25",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "list_contacts",
          arguments: { expectedTeamId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" },
        },
      }),
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("team ID does not match");
    expect(queried).toEqual([teamMcpTokens]);
  });

  it("reports the authenticated team's immutable ID and current name", async () => {
    const db = {
      select: () => ({
        from: (table: unknown) => ({
          where: () => ({
            limit: async () =>
              table === teamMcpTokens
                ? [{ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", orgId: teamId, createdBy: userId }]
                : [],
            then: (resolve: (value: unknown) => void) =>
              resolve(table === organizations ? [{ id: teamId, name: "Arbeidsgruppe Alfa" }] : []),
          }),
        }),
      }),
      update: () => ({ set: () => ({ where: async () => [] }) }),
    };
    const app = new Hono<ApiEnv>();
    registerMcpRoutes(
      app,
      { db, supabase: {} } as unknown as ApiDeps,
      "https://contac.example.test",
    );
    const response = await app.request("/mcp", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": "2025-11-25",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "get_team_identity", arguments: {} },
      }),
    });
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain(teamId);
    expect(body).toContain("Arbeidsgruppe Alfa");
  });
});
