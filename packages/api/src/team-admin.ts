import { classMemberships, organizations, workspaceFiles } from "@contac/core/db";
import { and, eq } from "drizzle-orm";
import type { Hono } from "hono";
import { z } from "zod";
import type { ApiDeps, ApiEnv } from "./types.ts";

const teamIdSchema = z.uuid();
const teamNameSchema = z.string().trim().min(2).max(100);

export function registerTeamAdminRoutes(app: Hono<ApiEnv>, deps: ApiDeps) {
  async function adminTeam(teamId: string, userId: string) {
    const [team] = await deps.db
      .select({ id: organizations.id, classId: organizations.classId, name: organizations.name })
      .from(organizations)
      .innerJoin(classMemberships, eq(classMemberships.classId, organizations.classId))
      .where(
        and(
          eq(organizations.id, teamId),
          eq(classMemberships.userId, userId),
          eq(classMemberships.role, "admin"),
        ),
      )
      .limit(1);
    return team;
  }

  app.post("/v1/organizations/:id", async (c) => {
    const teamId = teamIdSchema.safeParse(c.req.param("id"));
    const body = z
      .object({ name: teamNameSchema, expectedName: teamNameSchema })
      .safeParse(await c.req.json().catch(() => null));
    if (!teamId.success || !body.success)
      return c.json({ error: "Oppgi et teamnavn på 2–100 tegn." }, 400);
    const team = await adminTeam(teamId.data, c.get("user").id);
    if (!team) return c.json({ error: "Teamet finnes ikke, eller du mangler tilgang." }, 404);
    const [updated] = await deps.db
      .update(organizations)
      .set({ name: body.data.name, updatedAt: new Date() })
      .where(
        and(
          eq(organizations.id, team.id),
          eq(organizations.classId, team.classId),
          eq(organizations.name, body.data.expectedName),
        ),
      )
      .returning({ id: organizations.id, name: organizations.name });
    if (!updated)
      return c.json({ error: "Teamnavnet ble endret av noen andre. Last inn på nytt." }, 409);
    return c.json(updated);
  });

  app.post("/v1/organizations/:id/delete", async (c) => {
    const teamId = teamIdSchema.safeParse(c.req.param("id"));
    const body = z
      .object({ confirmName: teamNameSchema })
      .safeParse(await c.req.json().catch(() => null));
    if (!teamId.success || !body.success)
      return c.json({ error: "Skriv teamnavnet for å bekrefte sletting." }, 400);
    const team = await adminTeam(teamId.data, c.get("user").id);
    if (!team) return c.json({ error: "Teamet finnes ikke, eller du mangler tilgang." }, 404);
    const result = await deps.db.transaction(async (tx) => {
      const [current] = await tx
        .select({ name: organizations.name })
        .from(organizations)
        .where(and(eq(organizations.id, team.id), eq(organizations.classId, team.classId)))
        .for("update");
      if (!current) return { status: "missing" as const, paths: [] as string[] };
      if (current.name !== body.data.confirmName)
        return { status: "changed" as const, paths: [] as string[] };
      const files = await tx
        .select({ path: workspaceFiles.storagePath })
        .from(workspaceFiles)
        .where(eq(workspaceFiles.orgId, team.id));
      await tx.delete(organizations).where(eq(organizations.id, team.id));
      return { status: "deleted" as const, paths: files.map((file) => file.path) };
    });
    if (result.status === "missing") return c.json({ error: "Teamet finnes ikke lenger." }, 404);
    if (result.status === "changed")
      return c.json({ error: "Teamnavnet har endret seg. Last inn på nytt før sletting." }, 409);

    let storageCleanupFailed = false;
    const bucket = deps.supabase.storage.from("workspace-files");
    for (let index = 0; index < result.paths.length; index += 100) {
      try {
        const { error } = await bucket.remove(result.paths.slice(index, index + 100));
        if (error) throw error;
      } catch (error) {
        storageCleanupFailed = true;
        console.error(`Storage cleanup failed after deleting team ${team.id}:`, error);
      }
    }
    return c.json({ deleted: true, storageCleanupFailed });
  });
}
