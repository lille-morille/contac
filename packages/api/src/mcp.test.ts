import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { organizations } from "@contac/core/db";
import { makeServer, registerMcpRoutes } from "./mcp.ts";
import type { ApiDeps, ApiEnv } from "./types.ts";

const teamId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const userId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function fakeDeps() {
  const tables: unknown[] = [];
  const db = {
    select: () => ({
      from: (table: unknown) => {
        tables.push(table);
        return {
          where: () =>
            Promise.resolve(table === organizations ? [{ id: teamId, name: "Team Alfa" }] : []),
        };
      },
    }),
  };
  return { deps: { db, supabase: {} } as unknown as ApiDeps, tables };
}

async function toolRequest(deps: ApiDeps, name: string, args: object = {}) {
  const handler = createMcpHandler(() => makeServer(deps, { orgId: teamId, createdBy: userId }));
  return handler.fetch(
    new Request("https://api.contac.example.test/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": "2025-11-25",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    }),
  );
}

describe("personal MCP team boundary", () => {
  it("requires an OAuth connection before exposing the MCP endpoint", async () => {
    const app = new Hono<ApiEnv>();
    registerMcpRoutes(app, fakeDeps().deps, "https://contac.example.test");
    const response = await app.request("/mcp", { method: "POST" });
    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toContain("oauth-protected-resource");
  });

  it("reports team identity from the authenticated connection", async () => {
    const { deps, tables } = fakeDeps();
    const response = await toolRequest(deps, "get_team_identity");
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain(teamId);
    expect(body).toContain("Team Alfa");
    expect(tables).toEqual([organizations]);
  });

  it("rejects a wrong expected team before any contact query", async () => {
    const { deps, tables } = fakeDeps();
    const response = await toolRequest(deps, "list_contacts", {
      expectedTeamId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("team ID does not match");
    expect(tables).toEqual([]);
  });

  it("requires expectedTeamId on every data tool", async () => {
    const { deps, tables } = fakeDeps();
    for (const name of [
      "list_contacts",
      "get_contact",
      "list_team_reference",
      "list_library_items",
      "list_activities",
      "get_attachment_link",
      "create_contact",
      "batch_create_contacts",
      "add_activity",
    ]) {
      const response = await toolRequest(deps, name);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("expectedTeamId");
    }
    expect(tables).toEqual([]);
  });
});
