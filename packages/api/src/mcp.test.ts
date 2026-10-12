import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { contacts, organizations } from "@contac/core/db";
import { makeServer, registerMcpRoutes } from "./mcp.ts";
import type { ApiDeps, ApiEnv } from "./types.ts";
import { searchTeam } from "./search.ts";

vi.mock("./search.ts", () => ({ searchTeam: vi.fn() }));

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

  it("searches only the connected team after checking its expected ID", async () => {
    const { deps, tables } = fakeDeps();
    vi.mocked(searchTeam).mockResolvedValueOnce([
      {
        contactId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        activityId: null,
        kind: "contact",
        passage: "Kari Nordmann · Hav AS",
        contactName: "Kari Nordmann",
        companyName: "Hav AS",
        ownerOrgId: teamId,
        score: 0.9,
      },
    ]);
    const response = await toolRequest(deps, "search_contacts", {
      expectedTeamId: teamId,
      query: "Kari",
    });
    expect(await response.text()).toContain("Kari Nordmann");
    expect(searchTeam).toHaveBeenCalledWith(deps, teamId, "Kari", {
      includeShared: false,
      limit: 10,
    });
    expect(tables).toEqual([]);

    vi.mocked(searchTeam).mockClear();
    const wrongTeam = await toolRequest(deps, "search_contacts", {
      expectedTeamId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      query: "Kari",
    });
    expect(await wrongTeam.text()).toContain("team ID does not match");
    expect(searchTeam).not.toHaveBeenCalled();
  });

  it("requires expectedTeamId on every data tool", async () => {
    const { deps, tables } = fakeDeps();
    for (const name of [
      "search_contacts",
      "list_contacts",
      "get_contact",
      "create_email_draft",
      "list_team_reference",
      "create_domain",
      "update_domain",
      "set_company_domains",
      "batch_set_company_domains",
      "list_library_items",
      "list_activities",
      "get_attachment_link",
      "create_contact",
      "update_contact",
      "batch_update_contacts",
      "batch_create_contacts",
      "add_activity",
      "list_calendar_events",
      "get_calendar_event",
      "create_calendar_event",
      "update_calendar_event",
      "delete_calendar_event",
      "list_calendar_reminders",
      "get_calendar_reminder",
      "create_calendar_reminder",
      "update_calendar_reminder",
      "dismiss_calendar_reminder",
      "delete_calendar_reminder",
    ]) {
      const response = await toolRequest(deps, name);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("expectedTeamId");
    }
    expect(tables).toEqual([]);
  });

  it("rejects overlong contact descriptions in both creation tools before writing", async () => {
    const { deps, tables } = fakeDeps();
    let writes = 0;
    Object.assign(deps.db, {
      transaction: async () => {
        writes++;
        throw new Error("valid item reached creation");
      },
    });
    const contact = {
      expectedTeamId: teamId,
      name: "Kari Nordmann",
      companyName: "Gruve AS",
      description: "a".repeat(121),
    };
    const single = await toolRequest(deps, "create_contact", contact);
    expect(await single.text()).toContain("120");

    const batch = await toolRequest(deps, "batch_create_contacts", {
      expectedTeamId: teamId,
      contacts: [contact, { ...contact, description: "a".repeat(120) }],
    });
    const body = await batch.text();
    const message = JSON.parse(body.match(/^data: (.*)$/m)?.[1] ?? body);
    const outcome = JSON.parse(message.result.content[0].text);
    expect(outcome.results).toEqual([
      { index: 0, status: "error", error: expect.stringContaining("120") },
      { index: 1, status: "error", error: "valid item reached creation" },
    ]);
    expect(writes).toBe(1);
    expect(tables).toEqual([]);
  });

  it("rejects a wrong team and an invalid status before an update transaction", async () => {
    const { deps } = fakeDeps();
    let transactions = 0;
    Object.assign(deps.db, {
      transaction: async () => {
        transactions++;
      },
    });
    const input = {
      expectedTeamId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      contactId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      expectedUpdatedAt: "2026-10-06T10:00:00.000Z",
      status: "skal_ringe",
    };
    expect(await (await toolRequest(deps, "update_contact", input)).text()).toContain(
      "team ID does not match",
    );
    expect(
      await (
        await toolRequest(deps, "update_contact", {
          ...input,
          expectedTeamId: teamId,
          status: "duplicate",
        })
      ).text(),
    ).toContain("status");
    expect(transactions).toBe(0);
  });

  it("assigns the acting user on the first status change and rejects stale edits", async () => {
    const { deps } = fakeDeps();
    const contactId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const original = {
      id: contactId,
      orgId: teamId,
      status: "ikke_kontaktet",
      assigneeId: null,
      updatedAt: new Date("2026-10-06T10:00:00.000Z"),
      allowExternalAi: false,
      deletedAt: null,
    };
    let saved: Record<string, unknown> | null = null;
    let writes = 0;
    const mockTx = {
      select: () => ({
        from: (table: unknown) => ({
          where: () => ({ for: async () => (table === contacts ? [original] : []) }),
        }),
      }),
      update: () => ({
        set: (changes: Record<string, unknown>) => ({
          where: () => ({
            returning: async () => {
              writes++;
              saved = changes;
              return [{ ...original, ...changes }];
            },
          }),
        }),
      }),
    };
    Object.assign(deps.db, {
      transaction: async (fn: (transaction: typeof mockTx) => unknown) => fn(mockTx),
    });
    const input = {
      expectedTeamId: teamId,
      contactId,
      expectedUpdatedAt: original.updatedAt.toISOString(),
      status: "skal_ringe",
    };
    const response = await toolRequest(deps, "update_contact", input);
    expect(await response.text()).toContain("skal_ringe");
    expect(saved).toMatchObject({ status: "skal_ringe", assigneeId: userId });
    expect(writes).toBe(1);
    const stale = await toolRequest(deps, "update_contact", {
      ...input,
      expectedUpdatedAt: "2026-10-06T09:00:00.000Z",
    });
    expect(await stale.text()).toContain("Contact changed since it was read");
    expect(writes).toBe(1);
  });

  it("updates relevance in a batch while isolating invalid and stale contacts", async () => {
    const { deps } = fakeDeps();
    const firstId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const secondId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const updatedAt = new Date("2026-10-06T10:00:00.000Z");
    const current = new Map([
      [
        firstId,
        {
          id: firstId,
          orgId: teamId,
          status: "skal_ringe",
          deletedAt: null,
          updatedAt,
          allowExternalAi: false,
        },
      ],
      [
        secondId,
        {
          id: secondId,
          orgId: teamId,
          status: "skal_ringe",
          deletedAt: null,
          updatedAt,
          allowExternalAi: false,
        },
      ],
    ]);
    const saved: Array<{ id: string; changes: Record<string, unknown> }> = [];
    let selectedId = "";
    let selection = 0;
    const mockTx = {
      select: () => ({
        from: () => ({
          where: () => {
            selectedId = selection++ === 0 ? firstId : secondId;
            return { for: async () => [current.get(selectedId)] };
          },
        }),
      }),
      update: () => ({
        set: (changes: Record<string, unknown>) => ({
          where: () => ({
            returning: async () => {
              saved.push({ id: selectedId, changes });
              return [{ ...current.get(selectedId), ...changes, id: selectedId }];
            },
          }),
        }),
      }),
    };
    Object.assign(deps.db, {
      transaction: async (fn: (transaction: typeof mockTx) => unknown) => fn(mockTx),
    });
    const response = await toolRequest(deps, "batch_update_contacts", {
      expectedTeamId: teamId,
      contacts: [
        { contactId: firstId, expectedUpdatedAt: updatedAt.toISOString(), relevance: "high" },
        { contactId: secondId, expectedUpdatedAt: updatedAt.toISOString(), relevance: "unknown" },
        { contactId: secondId, expectedUpdatedAt: "2026-10-06T09:00:00.000Z", relevance: "low" },
        { contactId: secondId, expectedUpdatedAt: updatedAt.toISOString(), relevance: null },
      ],
    });
    const body = await response.text();
    const message = JSON.parse(body.match(/^data: (.*)$/m)?.[1] ?? body);
    const { results } = JSON.parse(message.result.content[0].text);
    expect(results.map((item: { status: string }) => item.status)).toEqual([
      "updated",
      "error",
      "error",
      "updated",
    ]);
    expect(results[2].error).toContain("Contact changed since it was read");
    expect(saved).toMatchObject([
      {
        id: firstId,
        changes: { relevance: "high", relevanceManual: true, relevanceSourceVersion: null },
      },
      {
        id: secondId,
        changes: { relevance: null, relevanceManual: false, relevanceSourceVersion: null },
      },
    ]);

    const wrongTeam = await toolRequest(deps, "batch_update_contacts", {
      expectedTeamId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      contacts: [
        { contactId: firstId, expectedUpdatedAt: updatedAt.toISOString(), relevance: "low" },
      ],
    });
    expect(await wrongTeam.text()).toContain("team ID does not match");
    expect(saved).toHaveLength(2);
  });
});
