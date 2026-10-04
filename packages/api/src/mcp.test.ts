import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { PgDialect } from "drizzle-orm/pg-core";
import { contacts, teamMcpTokens } from "@contac/core/db";
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
      "list_contacts",
      "get_contact",
      "list_team_reference",
      "list_library_items",
      "list_activities",
      "get_attachment_link",
      "create_contact",
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
                    leftJoin: () => ({
                      where: (condition: Parameters<PgDialect["sqlToQuery"]>[0]) => {
                        conditions.push(dialect.sqlToQuery(condition));
                        return { orderBy: () => ({ limit: async () => [] }) };
                      },
                    }),
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
        params: { name: "list_contacts", arguments: {} },
      }),
    });
    expect(response.status).toBe(200);
    expect(conditions[0]?.params).not.toContain(token);
    expect(conditions[0]?.params[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(conditions[1]?.sql).toContain('"contacts"."org_id"');
    expect(conditions[1]?.params).toContain(teamId);
    expect(conditions[1]?.params).not.toContain("dddddddd-dddd-4ddd-8ddd-dddddddddddd");
  });

  it("lets team admins manage keys but blocks ordinary members", async () => {
    const app = new Hono<ApiEnv>();
    app.use("/v1/org/*", async (c, next) => {
      c.set("org", { id: teamId, role: "member" });
      c.set("user", { id: userId, email: "member@example.test" });
      await next();
    });
    registerMcpRoutes(app, fakeDeps(), "https://contac.example.test");
    const response = await app.request("/v1/org/mcp-tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "bot" }),
    });
    expect(response.status).toBe(403);
  });
});
