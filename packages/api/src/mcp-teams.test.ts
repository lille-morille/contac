import { describe, expect, it } from "vitest";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { invitations, organizations, personTags } from "@contac/core/db";
import { makeServer } from "./mcp.ts";
import type { ApiDeps } from "./types.ts";

const teamId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const classId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const userId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

/** Fake database: the first select is the class-admin check, the second lists class teams. */
function fakeDeps(options: { admin: boolean; existing?: Array<{ id: string; name: string }> }) {
  const inserts: Array<{ table: unknown; values: unknown }> = [];
  let selects = 0;
  let created = 0;
  const insert = (table: unknown) => ({
    values: (values: unknown) => {
      inserts.push({ table, values });
      const row = values as { name?: string };
      const returned = [{ id: `new-team-${++created}`, name: row.name }];
      return Object.assign(Promise.resolve(), { returning: async () => returned });
    },
  });
  const db = {
    select: () => ({
      from: () => {
        const call = selects++;
        const value = call === 0 ? (options.admin ? [{ classId }] : []) : (options.existing ?? []);
        const where = () => Object.assign(Promise.resolve(value), { limit: async () => value });
        return { where, innerJoin: () => ({ where }) };
      },
    }),
    insert,
    transaction: async (fn: (tx: unknown) => unknown) => fn({ insert }),
  };
  return { deps: { db, supabase: {} } as unknown as ApiDeps, inserts };
}

async function callCreateTeams(deps: ApiDeps, args: object) {
  const handler = createMcpHandler(() =>
    makeServer(deps, { orgId: teamId, createdBy: userId }, "https://contac.example.test"),
  );
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
        params: { name: "create_teams", arguments: args },
      }),
    }),
  );
  const body = await response.text();
  const message = JSON.parse(body.match(/^data: (.*)$/m)?.[1] ?? body);
  return message.result as { isError?: boolean; content: Array<{ text: string }> };
}

describe("create_teams MCP tool", () => {
  it("rejects a user who is not a class admin before writing", async () => {
    const { deps, inserts } = fakeDeps({ admin: false });
    const result = await callCreateTeams(deps, { expectedTeamId: teamId, names: ["Gruppe 1"] });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("class admin");
    expect(inserts).toEqual([]);
  });

  it("rejects a mismatched expected team", async () => {
    const { deps, inserts } = fakeDeps({ admin: true });
    const result = await callCreateTeams(deps, {
      expectedTeamId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      names: ["Gruppe 1"],
    });
    expect(result.isError).toBe(true);
    expect(inserts).toEqual([]);
  });

  it("creates new teams with default tags and invite links, and skips existing names", async () => {
    const { deps, inserts } = fakeDeps({
      admin: true,
      existing: [{ id: "old-team", name: "Gruppe 1: COOP" }],
    });
    const result = await callCreateTeams(deps, {
      expectedTeamId: teamId,
      names: ["gruppe 1:  coop", "Gruppe 2: Wifi Sensing", "Gruppe 2: wifi sensing"],
      createInviteLinks: true,
    });
    expect(result.isError).toBeUndefined();
    const { items } = JSON.parse(result.content[0]!.text);
    expect(items.map((item: { status: string }) => item.status)).toEqual([
      "exists",
      "created",
      "exists",
    ]);
    expect(items[0].team).toEqual({ id: "old-team", name: "Gruppe 1: COOP" });
    expect(items[1].team.name).toBe("Gruppe 2: Wifi Sensing");
    expect(items[1].inviteUrl).toMatch(/^https:\/\/contac\.example\.test\/invite\?token=/);
    expect(inserts.map((insert) => insert.table)).toEqual([organizations, personTags, invitations]);
    expect(inserts[0]!.values).toMatchObject({ classId, name: "Gruppe 2: Wifi Sensing" });
    expect(inserts[2]!.values).toMatchObject({ orgId: "new-team-1", invitedBy: userId });
  });
});
