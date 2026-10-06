import { randomBytes } from "node:crypto";
import { classMemberships, organizations, profiles, workspaceFiles } from "@contac/core/db";
import { and, asc, eq } from "drizzle-orm";
import type { Hono } from "hono";
import { z } from "zod";
import type { ApiDeps, ApiEnv } from "./types.ts";

const teamIdSchema = z.uuid();
const teamNameSchema = z.string().trim().min(2).max(100);

export function registerTeamAdminRoutes(app: Hono<ApiEnv>, deps: ApiDeps) {
  async function adminClassId(userId: string) {
    const [admin] = await deps.db
      .select({ classId: classMemberships.classId })
      .from(classMemberships)
      .where(and(eq(classMemberships.userId, userId), eq(classMemberships.role, "admin")))
      .limit(1);
    return admin?.classId ?? null;
  }

  app.get("/v1/class/members", async (c) => {
    const classId = await adminClassId(c.get("user").id);
    if (!classId) return c.json({ error: "Class admin access required" }, 403);
    const rows = await deps.db
      .select({
        userId: classMemberships.userId,
        role: classMemberships.role,
        name: profiles.fullName,
        email: profiles.profileEmail,
      })
      .from(classMemberships)
      .leftJoin(profiles, eq(profiles.id, classMemberships.userId))
      .where(eq(classMemberships.classId, classId))
      .orderBy(asc(profiles.fullName), asc(classMemberships.userId));
    c.header("Cache-Control", "no-store");
    return c.json(rows);
  });

  app.post("/v1/class/members/:userId/recovery-code", async (c) => {
    const targetId = teamIdSchema.safeParse(c.req.param("userId"));
    if (!targetId.success) return c.json({ error: "Ugyldig bruker-ID." }, 400);
    const classId = await adminClassId(c.get("user").id);
    if (!classId) return c.json({ error: "Class admin access required" }, 403);
    const [target] = await deps.db
      .select({ userId: classMemberships.userId })
      .from(classMemberships)
      .where(and(eq(classMemberships.classId, classId), eq(classMemberships.userId, targetId.data)))
      .limit(1);
    if (!target) return c.json({ error: "Brukeren finnes ikke i klassen." }, 404);

    const { data: account, error: lookupError } = await deps.supabase.auth.admin.getUserById(
      targetId.data,
    );
    if (lookupError || !account.user) return c.json({ error: "Kunne ikke finne kontoen." }, 502);
    const loginId = /^([\da-f-]{36})@accounts\.contac\.invalid$/i.exec(
      account.user.email ?? "",
    )?.[1];
    if (!loginId) return c.json({ error: "Kontoen kan ikke bruke gjenopprettingskoder." }, 409);

    const password = randomBytes(32).toString("base64url");
    const { error: updateError } = await deps.supabase.auth.admin.updateUserById(targetId.data, {
      password,
    });
    if (updateError) return c.json({ error: "Kunne ikke lage ny gjenopprettingskode." }, 502);
    c.header("Cache-Control", "no-store");
    return c.json({ recoveryCode: `cc1.${loginId}.${password}` });
  });

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
