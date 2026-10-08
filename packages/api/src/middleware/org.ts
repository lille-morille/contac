import { and, eq } from "drizzle-orm";
import { classMemberships, memberships, organizations, profiles } from "@contac/core/db";
import type { MiddlewareHandler } from "hono";
import type { ApiDeps, ApiEnv } from "../types.ts";

export function requireOrg(deps: ApiDeps): MiddlewareHandler<ApiEnv> {
  return async (c, next) => {
    const orgId = c.req.header("x-org-id");
    if (!orgId || !/^[\da-f-]{36}$/i.test(orgId))
      return c.json({ error: "Select an organization" }, 400);
    const [member] = await deps.db
      .select({ role: memberships.role })
      .from(memberships)
      .where(
        and(
          eq(memberships.orgId, orgId),
          eq(memberships.userId, c.get("user").id),
          eq(memberships.isActualMember, true),
        ),
      )
      .limit(1);
    let role = member?.role;
    if (!role) {
      const [classAdmin] = await deps.db
        .select({ role: classMemberships.role })
        .from(organizations)
        .innerJoin(classMemberships, eq(classMemberships.classId, organizations.classId))
        .where(
          and(
            eq(organizations.id, orgId),
            eq(classMemberships.userId, c.get("user").id),
            eq(classMemberships.role, "admin"),
          ),
        )
        .limit(1);
      if (classAdmin) role = "owner";
    }
    if (!role) return c.json({ error: "No access to this organization" }, 403);
    const [profile] = await deps.db
      .select({ onboardedAt: profiles.onboardedAt })
      .from(profiles)
      .where(eq(profiles.id, c.get("user").id))
      .limit(1);
    if (!profile?.onboardedAt)
      return c.json({ error: "Complete your profile before using the team" }, 403);
    c.set("org", { id: orgId, role });
    await next();
  };
}
