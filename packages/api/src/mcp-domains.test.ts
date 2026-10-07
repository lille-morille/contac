import { createMcpHandler } from "@modelcontextprotocol/server";
import { companies, companyDomains, domainTags, personTags } from "@contac/core/db";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { makeServer } from "./mcp.ts";
import type { ApiDeps } from "./types.ts";

const teamId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherTeamId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const companyA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const companyB = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const domainA = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const domainB = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const foreignDomain = "11111111-1111-4111-8111-111111111111";

type State = {
  companies: { id: string; orgId: string; name: string; domainsRevision: number }[];
  domains: {
    id: string;
    orgId: string;
    name: string;
    normalizedName: string;
    description: string | null;
    color: string;
    revision: number;
  }[];
  links: { orgId: string; companyId: string; domainId: string }[];
};

function memoryDb(initial?: Partial<State>, failLinkInsert = false) {
  let state: State = {
    companies: [
      { id: companyA, orgId: teamId, name: "Gruve AS", domainsRevision: 0 },
      { id: companyB, orgId: teamId, name: "Verk AS", domainsRevision: 0 },
    ],
    domains: [
      {
        id: domainA,
        orgId: teamId,
        name: "Universitet",
        normalizedName: "universitet",
        description: null,
        color: "blue",
        revision: 0,
      },
      {
        id: domainB,
        orgId: teamId,
        name: "Industri",
        normalizedName: "industri",
        description: null,
        color: "mint",
        revision: 0,
      },
      {
        id: foreignDomain,
        orgId: otherTeamId,
        name: "Foreign",
        normalizedName: "foreign",
        description: null,
        color: "blue",
        revision: 0,
      },
    ],
    links: [{ orgId: teamId, companyId: companyA, domainId: domainA }],
    ...initial,
  };
  let writes = 0;
  const dialect = new PgDialect();
  const makeClient = (working: State) => ({
    select: (_shape?: unknown) => ({
      from: (table: unknown) => {
        let joined = false;
        const query = {
          innerJoin: () => {
            joined = true;
            return query;
          },
          where: (condition: Parameters<typeof dialect.sqlToQuery>[0]) => {
            const params = dialect.sqlToQuery(condition).params.map(String);
            const allForTeam = params.length === 1;
            const values = () => {
              if (table === companies)
                return working.companies
                  .filter(
                    (row) => params.includes(row.orgId) && (allForTeam || params.includes(row.id)),
                  )
                  .map((row) => ({ ...row }));
              if (table === domainTags)
                return working.domains
                  .filter(
                    (row) =>
                      params.includes(row.orgId) &&
                      (allForTeam ||
                        params.includes(row.id) ||
                        params.includes(row.normalizedName)),
                  )
                  .map((row) => ({ ...row }));
              if (table === companyDomains) {
                const links = working.links.filter(
                  (row) =>
                    params.includes(row.orgId) && (allForTeam || params.includes(row.companyId)),
                );
                return joined
                  ? links.map((link) => {
                      const domain = working.domains.find((row) => row.id === link.domainId)!;
                      return { id: domain.id, name: domain.name };
                    })
                  : links;
              }
              if (table === personTags) return [];
              return [];
            };
            return {
              then: (resolve: (rows: unknown[]) => void) => Promise.resolve(values()).then(resolve),
              for: async () => values(),
              orderBy: async () => values(),
            };
          },
        };
        return query;
      },
    }),
    insert: (table: unknown) => ({
      values: (value: unknown) => {
        const rows = Array.isArray(value) ? value : [value];
        if (table === companyDomains) {
          if (failLinkInsert) throw new Error("link insert failed");
          working.links.push(...(rows as State["links"]));
          writes++;
          return {};
        }
        const input = rows[0] as Partial<State["domains"][number]>;
        const existing = working.domains.find(
          (row) => row.orgId === input.orgId && row.normalizedName === input.normalizedName,
        );
        const inserted = existing
          ? []
          : [
              {
                id: "22222222-2222-4222-8222-222222222222",
                description: null,
                color: "blue",
                revision: 0,
                ...input,
              },
            ];
        if (inserted.length) {
          working.domains.push(inserted[0] as State["domains"][number]);
          writes++;
        }
        return { onConflictDoNothing: () => ({ returning: async () => inserted }) };
      },
    }),
    delete: (table: unknown) => ({
      where: (condition: Parameters<typeof dialect.sqlToQuery>[0]) => {
        const params = dialect.sqlToQuery(condition).params.map(String);
        if (table === companyDomains) {
          working.links = working.links.filter(
            (row) => !(params.includes(row.orgId) && params.includes(row.companyId)),
          );
          writes++;
        }
      },
    }),
    update: (table: unknown) => ({
      set: (changes: Record<string, unknown>) => ({
        where: (condition: Parameters<typeof dialect.sqlToQuery>[0]) => {
          const params = dialect.sqlToQuery(condition).params.map(String);
          const rows = table === companies ? working.companies : working.domains;
          const row = rows.find((item) => params.includes(item.orgId) && params.includes(item.id));
          const returning = async () => {
            if (!row) return [];
            for (const [key, value] of Object.entries(changes))
              (row as unknown as Record<string, unknown>)[key] =
                key === "revision" || key === "domainsRevision"
                  ? (row as unknown as Record<string, number>)[key]! + 1
                  : value;
            writes++;
            return [{ ...row }];
          };
          return {
            returning,
            then: (resolve: (value: unknown[]) => void) => returning().then(resolve),
          };
        },
      }),
    }),
  });
  const db = {
    ...makeClient(state),
    transaction: async <T>(fn: (tx: ReturnType<typeof makeClient>) => Promise<T>) => {
      const working = structuredClone(state);
      const before = writes;
      try {
        const outcome = await fn(makeClient(working));
        Object.assign(state, working);
        return outcome;
      } catch (error) {
        writes = before;
        throw error;
      }
    },
  };
  return { db: db as unknown as ApiDeps["db"], state: () => state, writes: () => writes };
}

async function call(db: ApiDeps["db"], name: string, args: object) {
  const handler = createMcpHandler(() =>
    makeServer({ db, supabase: {} } as ApiDeps, { orgId: teamId, createdBy: otherTeamId }),
  );
  const response = await handler.fetch(
    new Request("https://api.contac.test/mcp", {
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
  const body = await response.text();
  const message = JSON.parse(body.match(/^data: (.*)$/m)?.[1] ?? body);
  const output = message.result.content[0].text;
  try {
    return JSON.parse(output);
  } catch {
    return { error: output };
  }
}

describe("MCP domain management", () => {
  it("requires the connected team and rejects foreign organization and domain IDs", async () => {
    const store = memoryDb();
    const base = {
      expectedTeamId: teamId,
      companyId: companyA,
      domainIds: [domainB],
      expectedRevision: 0,
    };
    for (const [tool, args] of [
      ["create_domain", { name: "New" }],
      ["update_domain", { domainId: domainA, expectedRevision: 0, color: "pink" }],
      ["set_company_domains", base],
      ["batch_set_company_domains", { items: [base] }],
    ] as const)
      expect(
        (await call(store.db, tool, { ...args, expectedTeamId: otherTeamId })).error,
      ).toContain("team ID does not match");
    expect(
      (
        await call(store.db, "update_domain", {
          expectedTeamId: teamId,
          domainId: foreignDomain,
          expectedRevision: 0,
          color: "pink",
        })
      ).error,
    ).toContain("Domain not found in this team");
    expect(
      (await call(store.db, "set_company_domains", { ...base, companyId: foreignDomain })).error,
    ).toContain("Organization not found");
    expect(
      (await call(store.db, "set_company_domains", { ...base, domainIds: [foreignDomain] })).error,
    ).toContain("not found in this team");
    expect(store.state().links).toEqual([
      { orgId: teamId, companyId: companyA, domainId: domainA },
    ]);
    expect(store.writes()).toBe(0);
  });

  it("reuses normalized duplicate names and rejects stale domain edits", async () => {
    const store = memoryDb();
    const duplicate = await call(store.db, "create_domain", {
      expectedTeamId: teamId,
      name: "  UNIVERSITET  ",
      color: "pink",
    });
    expect(duplicate.status).toBe("reused");
    expect(duplicate.domain.id).toBe(domainA);
    expect(store.state().domains[0]!.color).toBe("blue");
    const updated = await call(store.db, "update_domain", {
      expectedTeamId: teamId,
      domainId: domainA,
      expectedRevision: 0,
      description: "Higher education",
    });
    expect(updated.status).toBe("updated");
    expect(updated.previous.revision).toBe(0);
    expect(updated.resulting.revision).toBe(1);
    const stale = await call(store.db, "update_domain", {
      expectedTeamId: teamId,
      domainId: domainA,
      expectedRevision: 0,
      color: "pink",
    });
    expect(stale.status).toBe("conflict");
    expect(store.state().domains[0]!.color).toBe("blue");
    const renameDuplicate = await call(store.db, "update_domain", {
      expectedTeamId: teamId,
      domainId: domainA,
      expectedRevision: 1,
      name: " INDUSTRI ",
    });
    expect(renameDuplicate.error).toContain("already exists");
    expect(store.state().domains[0]!.name).toBe("Universitet");
  });

  it("clears links, advances revision, and rejects a stale replacement", async () => {
    const store = memoryDb();
    const input = {
      expectedTeamId: teamId,
      companyId: companyA,
      domainIds: [],
      expectedRevision: 0,
    };
    const cleared = await call(store.db, "set_company_domains", input);
    expect(cleared.status).toBe("updated");
    expect(cleared.previous.domains).toEqual([{ id: domainA, name: "Universitet" }]);
    expect(cleared.resulting).toEqual({ revision: 1, domains: [] });
    expect(store.state().links).toEqual([]);
    expect(
      (await call(store.db, "set_company_domains", { ...input, domainIds: [domainB] })).status,
    ).toBe("conflict");
    const readback = await call(store.db, "list_team_reference", { expectedTeamId: teamId });
    expect(
      readback.companies.find((company: { id: string }) => company.id === companyA).domainsRevision,
    ).toBe(1);
    expect(readback.companyDomains).toEqual([]);
    expect(readback.domains.find((domain: { id: string }) => domain.id === domainA).revision).toBe(
      0,
    );
  });

  it("keeps each invalid replacement atomic and reports batch partial failures", async () => {
    const store = memoryDb();
    const batch = await call(store.db, "batch_set_company_domains", {
      expectedTeamId: teamId,
      items: [
        { companyId: companyA, domainIds: [domainB, foreignDomain], expectedRevision: 0 },
        { companyId: companyB, domainIds: [domainB], expectedRevision: 0 },
      ],
    });
    expect(batch.results.map((item: { status: string }) => item.status)).toEqual([
      "error",
      "updated",
    ]);
    expect(store.state().links).toEqual([
      { orgId: teamId, companyId: companyA, domainId: domainA },
      { orgId: teamId, companyId: companyB, domainId: domainB },
    ]);
    const before = store.writes();
    const preview = await call(store.db, "batch_set_company_domains", {
      expectedTeamId: teamId,
      dryRun: true,
      items: [{ companyId: companyA, domainIds: [], expectedRevision: 0 }],
    });
    expect(preview.results[0].status).toBe("dry_run");
    expect(preview.results[0].wouldChange).toBe(true);
    expect(store.writes()).toBe(before);
  });

  it("rolls back a replacement when inserting its new links fails", async () => {
    const store = memoryDb(undefined, true);
    expect(
      (
        await call(store.db, "set_company_domains", {
          expectedTeamId: teamId,
          companyId: companyA,
          domainIds: [domainB],
          expectedRevision: 0,
        })
      ).error,
    ).toContain("link insert failed");
    expect(store.state().links).toEqual([
      { orgId: teamId, companyId: companyA, domainId: domainA },
    ]);
    expect(store.state().companies[0]!.domainsRevision).toBe(0);
  });
});
