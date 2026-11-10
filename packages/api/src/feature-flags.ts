import { teamFeatureFlags, type Database } from "@contac/core/db";
import { isTeamFeatureFlag, type TeamFeatureFlag } from "@contac/core";
import { and, eq, inArray } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import type { ApiEnv } from "./types.ts";

export async function teamHasFeature(db: Database, orgId: string, flag: TeamFeatureFlag) {
  const [row] = await db
    .select({ flag: teamFeatureFlags.flag })
    .from(teamFeatureFlags)
    .where(and(eq(teamFeatureFlags.orgId, orgId), eq(teamFeatureFlags.flag, flag)))
    .limit(1);
  return !!row;
}

/** Known flags per team. Unknown flag names left in the database are ignored. */
export async function featureFlagsByTeam(
  db: Database,
  orgIds: string[],
): Promise<Map<string, TeamFeatureFlag[]>> {
  const result = new Map<string, TeamFeatureFlag[]>();
  if (!orgIds.length) return result;
  const rows = await db
    .select({ orgId: teamFeatureFlags.orgId, flag: teamFeatureFlags.flag })
    .from(teamFeatureFlags)
    .where(inArray(teamFeatureFlags.orgId, orgIds));
  for (const row of rows) {
    if (!isTeamFeatureFlag(row.flag)) continue;
    result.set(row.orgId, [...(result.get(row.orgId) ?? []), row.flag].sort());
  }
  return result;
}

/**
 * Runs after `requireOrg`. A team without the flag gets the same 404 as an
 * unknown route, so the feature's existence is not revealed.
 */
export function requireTeamFeature(
  isEnabled: (orgId: string) => Promise<boolean>,
): MiddlewareHandler<ApiEnv> {
  return async (c, next) => {
    if (!(await isEnabled(c.get("org").id))) return c.notFound();
    await next();
  };
}
