import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { companies, contacts, lois } from "@contac/core/db";
import { registerContactRoutes } from "./contacts.ts";
import type { ApiDeps, ApiEnv } from "./types.ts";

const orgId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const companyId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function makeApp(records: { company?: boolean; contact?: boolean; loi?: boolean }) {
  let deleted = false;
  const tx = {
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          for: async () => (table === companies && records.company ? [{ id: companyId }] : []),
          limit: async () =>
            table === contacts && records.contact
              ? [{ id: "contact" }]
              : table === lois && records.loi
                ? [{ id: "loi" }]
                : [],
        }),
      }),
    }),
    delete: () => ({
      where: async () => {
        deleted = true;
      },
    }),
  };
  const app = new Hono<ApiEnv>();
  app.use("*", async (c, next) => {
    c.set("org", { id: orgId, role: "owner" });
    await next();
  });
  registerContactRoutes(app, {
    db: { transaction: async (run: (transaction: typeof tx) => Promise<unknown>) => run(tx) },
  } as unknown as ApiDeps);
  return { app, wasDeleted: () => deleted };
}

describe("organization deletion", () => {
  it("removes an organization with no linked records", async () => {
    const { app, wasDeleted } = makeApp({ company: true });
    const response = await app.request(`/v1/org/companies/${companyId}/delete`, { method: "POST" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: true });
    expect(wasDeleted()).toBe(true);
  });

  it("keeps organizations with contacts, including contacts hidden from the map", async () => {
    const { app, wasDeleted } = makeApp({ company: true, contact: true });
    const response = await app.request(`/v1/org/companies/${companyId}/delete`, { method: "POST" });
    expect(response.status).toBe(409);
    expect(wasDeleted()).toBe(false);
  });

  it("keeps organizations with agreements", async () => {
    const { app, wasDeleted } = makeApp({ company: true, loi: true });
    const response = await app.request(`/v1/org/companies/${companyId}/delete`, { method: "POST" });
    expect(response.status).toBe(409);
    expect(wasDeleted()).toBe(false);
  });

  it("does not remove an organization outside the selected team", async () => {
    const { app, wasDeleted } = makeApp({});
    const response = await app.request(`/v1/org/companies/${companyId}/delete`, { method: "POST" });
    expect(response.status).toBe(404);
    expect(wasDeleted()).toBe(false);
  });
});
