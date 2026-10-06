import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { organizations, workspaceFiles } from "@contac/core/db";
import { registerTeamAdminRoutes } from "./team-admin.ts";
import type { ApiDeps, ApiEnv } from "./types.ts";

const teamId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const classId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const userId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function makeApp(
  options: {
    admin?: boolean;
    currentName?: string;
    staleRename?: boolean;
    files?: string[];
    storageError?: boolean;
  } = {},
) {
  let deleted = false;
  let renamedTo: string | null = null;
  const removed: string[][] = [];
  const currentName = options.currentName ?? "Team Alfa";
  const team = { id: teamId, classId, name: currentName };
  const tx = {
    select: () => ({
      from: (table: unknown) => ({
        where: () => {
          if (table === organizations) return { for: async () => [{ name: currentName }] };
          if (table === workspaceFiles)
            return Promise.resolve((options.files ?? []).map((path) => ({ path })));
          throw new Error("Unexpected table");
        },
      }),
    }),
    delete: () => ({
      where: async () => {
        deleted = true;
      },
    }),
  };
  const deps = {
    db: {
      select: () => ({
        from: () => ({
          innerJoin: () => ({
            where: () => ({ limit: async () => (options.admin ? [team] : []) }),
          }),
        }),
      }),
      update: () => ({
        set: (changes: { name: string }) => ({
          where: () => ({
            returning: async () => {
              renamedTo = changes.name;
              return options.staleRename ? [] : [{ id: teamId, name: changes.name }];
            },
          }),
        }),
      }),
      transaction: async (run: (value: typeof tx) => Promise<unknown>) => run(tx),
    },
    supabase: {
      storage: {
        from: () => ({
          remove: async (paths: string[]) => {
            removed.push(paths);
            return { error: options.storageError ? new Error("Storage unavailable") : null };
          },
        }),
      },
    },
  } as unknown as ApiDeps;
  const app = new Hono<ApiEnv>();
  app.use("*", async (c, next) => {
    c.set("user", { id: userId, email: "admin@example.test" });
    await next();
  });
  registerTeamAdminRoutes(app, deps);
  return { app, wasDeleted: () => deleted, renamedTo: () => renamedTo, removed };
}

describe("class administrator team management", () => {
  it("renames a team while preserving its ID", async () => {
    const { app, renamedTo } = makeApp({ admin: true });
    const response = await app.request(`/v1/organizations/${teamId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Team Beta", expectedName: "Team Alfa" }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: teamId, name: "Team Beta" });
    expect(renamedTo()).toBe("Team Beta");
  });

  it("rejects a stale rename", async () => {
    const { app } = makeApp({ admin: true, staleRename: true });
    const response = await app.request(`/v1/organizations/${teamId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Team Beta", expectedName: "Team Alfa" }),
    });
    expect(response.status).toBe(409);
  });

  it("prevents a non-admin from renaming or deleting a team", async () => {
    const { app, wasDeleted, renamedTo } = makeApp();
    const rename = await app.request(`/v1/organizations/${teamId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Team Beta", expectedName: "Team Alfa" }),
    });
    const remove = await app.request(`/v1/organizations/${teamId}/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmName: "Team Alfa" }),
    });
    expect(rename.status).toBe(404);
    expect(remove.status).toBe(404);
    expect(renamedTo()).toBeNull();
    expect(wasDeleted()).toBe(false);
  });

  it("requires the current team name before deleting", async () => {
    const { app, wasDeleted, removed } = makeApp({ admin: true });
    const response = await app.request(`/v1/organizations/${teamId}/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmName: "Old Team Name" }),
    });
    expect(response.status).toBe(409);
    expect(wasDeleted()).toBe(false);
    expect(removed).toEqual([]);
  });

  it("deletes the team and removes its stored files", async () => {
    const { app, wasDeleted, removed } = makeApp({
      admin: true,
      files: [`${teamId}/logo`, `${teamId}/agreement`],
    });
    const response = await app.request(`/v1/organizations/${teamId}/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmName: "Team Alfa" }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: true, storageCleanupFailed: false });
    expect(wasDeleted()).toBe(true);
    expect(removed).toEqual([[`${teamId}/logo`, `${teamId}/agreement`]]);
  });

  it("reports failed file cleanup after the team has been deleted", async () => {
    const logger = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { app, wasDeleted } = makeApp({
        admin: true,
        files: [`${teamId}/logo`],
        storageError: true,
      });
      const response = await app.request(`/v1/organizations/${teamId}/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmName: "Team Alfa" }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ deleted: true, storageCleanupFailed: true });
      expect(wasDeleted()).toBe(true);
    } finally {
      logger.mockRestore();
    }
  });
});
