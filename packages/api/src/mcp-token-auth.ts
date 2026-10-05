import { createHash } from "node:crypto";
import { teamMcpTokens } from "@contac/core/db";
import { and, eq, isNull } from "drizzle-orm";
import type { ApiDeps } from "./types.ts";

export type TokenIdentity = { id: string; orgId: string; createdBy: string };
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function authorizeMcpToken(deps: ApiDeps, authorization: string | undefined) {
  const match = /^Bearer (ctc_[A-Za-z0-9_-]{40,})$/.exec(authorization ?? "");
  if (!match) return null;
  const [row] = await deps.db
    .select({
      id: teamMcpTokens.id,
      orgId: teamMcpTokens.orgId,
      createdBy: teamMcpTokens.createdBy,
    })
    .from(teamMcpTokens)
    .where(and(eq(teamMcpTokens.tokenHash, tokenHash(match[1]!)), isNull(teamMcpTokens.revokedAt)))
    .limit(1);
  return row ?? null;
}
