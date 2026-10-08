import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { PgDialect } from "drizzle-orm/pg-core";
import { classMemberships, memberships, organizations } from "@contac/core/db";
import { registerTeamAdminRoutes } from "./team-admin.ts";
import type { ApiDeps, ApiEnv } from "./types.ts";

const classId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const userId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const first = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const second = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function fixture(admin = true) {
  let currentTeamId: string | null = null;
  const rows = new Map([
    [first, false],
    [second, false],
  ]);
  const teamRows = [
    { id: first, name: "Team Alfa" },
    { id: second, name: "Team Beta" },
  ];
  const db = {
    select: (fields: Record<string, unknown>) => ({
      from: (table: unknown) => {
        let params: unknown[] = [];
        const result = () => {
          if (table === classMemberships) return admin ? [{ classId, currentTeamId }] : [];
          if (table === organizations)
            return "name" in fields ? teamRows : [{ id: params.includes(second) ? second : first }];
          if (table === memberships)
            return [...rows]
              .filter(
                ([orgId, isActualMember]) =>
                  !params.includes(userId) || (params.includes(orgId) && isActualMember),
              )
              .map(([orgId, isActualMember]) => ({
                orgId,
                userId,
                name: "Admin",
                email: "admin@example.no",
                isActualMember,
              }));
          return [];
        };
        const query = {
          innerJoin: () => query,
          leftJoin: () => query,
          where: (clause: Parameters<PgDialect["sqlToQuery"]>[0]) => {
            params = new PgDialect().sqlToQuery(clause).params;
            return query;
          },
          orderBy: async () => result(),
          limit: async () => result(),
          for: async () => result(),
          then: (resolve: (rows: ReturnType<typeof result>) => unknown) =>
            Promise.resolve(result()).then(resolve),
        };
        return query;
      },
    }),
    insert: () => ({
      values: (value: { orgId: string; isActualMember: boolean }) => ({
        onConflictDoUpdate: async () => {
          rows.set(value.orgId, value.isActualMember);
        },
      }),
    }),
    update: (table: unknown) => ({
      set: (value: { currentTeamId: string }) => ({
        where: async () => {
          if (table === classMemberships) currentTeamId = value.currentTeamId;
        },
      }),
    }),
    transaction: async (run: (tx: unknown) => Promise<unknown>) => run(db),
  };
  const app = new Hono<ApiEnv>();
  app.use("*", async (c, next) => {
    c.set("user", { id: userId, email: "admin@example.no" });
    await next();
  });
  registerTeamAdminRoutes(app, { db } as unknown as ApiDeps);
  const post = (path: string, body: object = {}) =>
    app.request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  return { app, post, rows, current: () => currentTeamId };
}

describe("class administrator actual team membership", () => {
  it("shows only checked memberships and keeps a single current team", async () => {
    const state = fixture();
    expect((await (await state.app.request("/v1/class/teams")).json()).teams[0].members).toEqual(
      [],
    );
    expect(
      (await state.post(`/v1/class/teams/${first}/membership`, { included: true })).status,
    ).toBe(200);
    expect(state.current()).toBe(first);
    expect(
      (await state.post(`/v1/class/teams/${second}/membership`, { included: true })).status,
    ).toBe(200);
    expect((await state.post(`/v1/class/teams/${second}/current`)).status).toBe(200);
    expect(
      (await state.post(`/v1/class/teams/${second}/membership`, { included: false })).status,
    ).toBe(409);
    expect((await state.post(`/v1/class/teams/${first}/current`)).status).toBe(200);
    expect(
      (await state.post(`/v1/class/teams/${second}/membership`, { included: false })).status,
    ).toBe(200);
    const body = await (await state.app.request("/v1/class/teams")).json();
    expect(body.currentTeamId).toBe(first);
    expect(body.teams[0].members).toHaveLength(1);
    expect(body.teams[1].members).toEqual([]);
  });

  it("rejects membership changes from a non-admin", async () => {
    const state = fixture(false);
    expect(
      (await state.post(`/v1/class/teams/${first}/membership`, { included: true })).status,
    ).toBe(403);
    expect((await state.post(`/v1/class/teams/${first}/current`)).status).toBe(403);
    expect(state.rows.get(first)).toBe(false);
  });
});
