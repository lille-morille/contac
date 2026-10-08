import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { registerContactRoutes } from "./contacts.ts";
import type { ApiDeps, ApiEnv } from "./types.ts";

const orgId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const domainId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const otherId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function makeApp(options: { duplicate?: boolean; stale?: boolean; missing?: boolean } = {}) {
  const current = { id: domainId, name: "Gammelt navn", revision: options.stale ? 2 : 1 };
  let saved: { name: string; normalizedName: string } | null = null;
  let selects = 0;
  const db = {
    select: () => ({
      from: () => ({
        where: async () => {
          selects++;
          if (selects === 1) return options.duplicate ? [{ id: otherId }] : [];
          return options.missing ? [] : [current];
        },
      }),
    }),
    update: () => ({
      set: (changes: { name: string; normalizedName: string }) => ({
        where: () => ({
          returning: async () => {
            if (options.stale || options.missing) return [];
            saved = { name: changes.name, normalizedName: changes.normalizedName };
            return [{ ...current, ...changes, revision: 2 }];
          },
        }),
      }),
    }),
  };
  const app = new Hono<ApiEnv>();
  app.use("*", async (c, next) => {
    c.set("org", { id: orgId, role: "owner" });
    await next();
  });
  registerContactRoutes(app, { db } as unknown as ApiDeps);
  const rename = (name: string) =>
    app.request(`/v1/org/domains/${domainId}/rename`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, expected: { revision: 1 } }),
    });
  return { rename, saved: () => saved };
}

describe("domain rename", () => {
  it("trims the name and stores its normalized key", async () => {
    const { rename, saved } = makeApp();
    const response = await rename("  Helse  Industri  ");
    expect(response.status).toBe(200);
    expect(saved()).toEqual({ name: "Helse  Industri", normalizedName: "helse industri" });
  });

  it("rejects empty names and names already used by the team", async () => {
    const invalid = makeApp();
    expect((await invalid.rename("   ")).status).toBe(400);
    expect(invalid.saved()).toBeNull();

    const duplicate = makeApp({ duplicate: true });
    expect((await duplicate.rename("Helse")).status).toBe(409);
    expect(duplicate.saved()).toBeNull();
  });

  it("reports a stale edit without replacing the current domain", async () => {
    const { rename, saved } = makeApp({ stale: true });
    const response = await rename("Helse");
    expect(response.status).toBe(409);
    expect((await response.json()).current).toEqual({
      id: domainId,
      name: "Gammelt navn",
      revision: 2,
    });
    expect(saved()).toBeNull();
  });

  it("does not rename a domain absent from the selected team", async () => {
    const { rename, saved } = makeApp({ missing: true });
    expect((await rename("Helse")).status).toBe(404);
    expect(saved()).toBeNull();
  });
});
