import { createMcpHandler } from "@modelcontextprotocol/server";
import { companies, memberships, organizations } from "@contac/core/db";
import { describe, expect, it } from "vitest";
import { makeServer } from "./mcp.ts";
import type { ApiDeps } from "./types.ts";

const teamId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const userId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const companyId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const assigneeId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

async function createContact(deps: ApiDeps, input: object) {
  const handler = createMcpHandler(() => makeServer(deps, { orgId: teamId, createdBy: userId }));
  const response = await handler.fetch(
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
        params: { name: "create_contact", arguments: input },
      }),
    }),
  );
  return response.text();
}

describe("MCP contact creation", () => {
  it("sets the initial status and validates an explicit team assignee", async () => {
    const saved: Record<string, unknown>[] = [];
    let validAssignee = true;
    const transaction = {
      select: () => ({
        from: (table: unknown) => ({
          where: () => {
            const rows =
              table === organizations
                ? [{ id: teamId }]
                : table === companies
                  ? [{ id: companyId }]
                  : table === memberships
                    ? validAssignee
                      ? [{ id: assigneeId }]
                      : []
                    : [];
            return {
              for: async () => rows,
              limit: async () => rows,
              then: (resolve: (value: unknown[]) => void) => resolve(rows),
            };
          },
        }),
      }),
      insert: () => ({
        values: (value: Record<string, unknown>) => ({
          returning: async () => {
            saved.push(value);
            return [
              { id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", ...value, allowExternalAi: false },
            ];
          },
        }),
      }),
    };
    const deps = {
      db: { transaction: async (fn: (tx: typeof transaction) => unknown) => fn(transaction) },
      supabase: {},
    } as unknown as ApiDeps;
    const base = { expectedTeamId: teamId, companyId };

    const explicit = await createContact(deps, {
      ...base,
      name: "Kari Nordmann",
      status: "skal_ringe",
      assigneeId,
    });
    expect(explicit).toContain("skal_ringe");
    expect(saved[0]).toMatchObject({ status: "skal_ringe", assigneeId });

    const implicit = await createContact(deps, {
      ...base,
      name: "Ola Nordmann",
      status: "follow_up",
    });
    expect(implicit).toContain("follow_up");
    expect(saved[1]).toMatchObject({ status: "follow_up", assigneeId: userId });

    validAssignee = false;
    const invalid = await createContact(deps, {
      ...base,
      name: "Per Nordmann",
      assigneeId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    });
    expect(invalid).toContain("Assignee must be a team member");
    expect(saved).toHaveLength(2);
  });
});
