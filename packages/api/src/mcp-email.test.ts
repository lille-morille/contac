import { createMcpHandler } from "@modelcontextprotocol/server";
import { contacts, emailDrafts, organizations, profiles } from "@contac/core/db";
import { afterEach, describe, expect, it } from "vitest";
import { makeServer } from "./mcp.ts";
import type { ApiDeps } from "./types.ts";

const teamId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const userId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const contactId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const originalInboundAddress = process.env.INBOUND_ADDRESS;
const originalInboundDomain = process.env.INBOUND_EMAIL_DOMAIN;

async function callTool(deps: ApiDeps, args: object) {
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
        params: { name: "create_email_draft", arguments: args },
      }),
    }),
  );
  return response.text();
}

function fakeDeps(contactEmail: string | null = "KARI@example.no") {
  const reads: unknown[] = [];
  const writes: Record<string, unknown>[] = [];
  const db = {
    select: () => ({
      from: (table: unknown) => ({
        where: async () => {
          reads.push(table);
          if (table === contacts) return [{ id: contactId, email: contactEmail }];
          if (table === profiles) return [{ email: "Member@Example.no" }];
          if (table === organizations) return [{ inboundKey: "team-key" }];
          return [];
        },
      }),
    }),
    insert: (table: unknown) => {
      expect(table).toBe(emailDrafts);
      return {
        values: (value: Record<string, unknown>) => ({
          returning: async () => {
            writes.push(value);
            return [{ id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", ...value }];
          },
        }),
      };
    },
  };
  return { deps: { db, supabase: {} } as unknown as ApiDeps, reads, writes };
}

afterEach(() => {
  if (originalInboundAddress === undefined) delete process.env.INBOUND_ADDRESS;
  else process.env.INBOUND_ADDRESS = originalInboundAddress;
  if (originalInboundDomain === undefined) delete process.env.INBOUND_EMAIL_DOMAIN;
  else process.env.INBOUND_EMAIL_DOMAIN = originalInboundDomain;
});

describe("MCP email drafts", () => {
  it("fills sender, recipient, and capture Bcc while preserving the exact content", async () => {
    process.env.INBOUND_ADDRESS = "Contac@Plingapp.no";
    const { deps, writes } = fakeDeps();
    const response = await callTool(deps, {
      expectedTeamId: teamId,
      contactNumber: 12,
      subject: "Invitasjon",
      content: "Hei! Kan vi ta en prat?\n",
    });

    expect(response).toContain("dddddddd-dddd-4ddd-8ddd-dddddddddddd");
    expect(writes).toEqual([
      {
        orgId: teamId,
        contactId,
        createdBy: userId,
        fromEmail: "member@example.no",
        toEmails: ["kari@example.no"],
        ccEmails: [],
        bccEmails: ["contac@plingapp.no"],
        subject: "Invitasjon",
        body: "Hei! Kan vi ta en prat?\n",
      },
    ]);
  });

  it("does not alter a supplied sign-off", async () => {
    const { deps, writes } = fakeDeps();
    await callTool(deps, {
      expectedTeamId: teamId,
      contactNumber: 12,
      subject: "Invitasjon",
      content: "Hei!\nMvh Ola Olsen",
    });
    expect(writes[0]?.body).toBe("Hei!\nMvh Ola Olsen");
  });

  it("rejects a different team before reading data", async () => {
    const { deps, reads, writes } = fakeDeps();
    const response = await callTool(deps, {
      expectedTeamId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      contactNumber: 12,
      subject: "Invitasjon",
      content: "Hei!",
    });
    expect(response).toContain("team ID does not match");
    expect(reads).toEqual([]);
    expect(writes).toEqual([]);
  });

  it("uses the team's inbound key when a shared capture address is not configured", async () => {
    delete process.env.INBOUND_ADDRESS;
    process.env.INBOUND_EMAIL_DOMAIN = "Mail.Example.no";
    const { deps, writes } = fakeDeps();
    await callTool(deps, {
      expectedTeamId: teamId,
      contactNumber: 12,
      subject: "Invitasjon",
      content: "Hei!",
    });
    expect(writes[0]?.bccEmails).toEqual(["inbox+team-key@mail.example.no"]);
  });

  it("requires a contact email before saving", async () => {
    const { deps, writes } = fakeDeps(null);
    const response = await callTool(deps, {
      expectedTeamId: teamId,
      contactNumber: 12,
      subject: "Invitasjon",
      content: "Hei!",
    });
    expect(response).toContain("Contact needs a valid email address");
    expect(writes).toEqual([]);
  });
});
