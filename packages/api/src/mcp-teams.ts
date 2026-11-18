import { classMemberships, organizations } from "@contac/core/db";
import type { McpServer } from "@modelcontextprotocol/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { mcpOauthToolMeta, type McpIdentity } from "./mcp-oauth.ts";
import { createClassTeam, createTeamInviteLink, normalizeTeamName } from "./team-creation.ts";
import type { ApiDeps } from "./types.ts";

const result = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value) }],
});
const failed = (message: string) => ({
  isError: true,
  content: [{ type: "text" as const, text: message }],
});

/** Class-admin tools that act on the class containing the connected team. */
export function registerMcpTeamTools(
  server: McpServer,
  deps: ApiDeps,
  identity: McpIdentity,
  appOrigin: string,
) {
  const { orgId, createdBy } = identity;

  server.registerTool(
    "create_teams",
    {
      description:
        "Class admins only: create up to 50 new teams in the class that contains the connected team. Each new team gets the default person tags and starts with no members. A name that matches an existing team in the class (ignoring case and spacing) is returned as exists and not created again, so retries are safe. With createInviteLinks, each created team also gets a reusable invite link; share it with that team's members so they can join. Members cannot be added by name.",
      inputSchema: z.object({
        expectedTeamId: z.uuid(),
        names: z.array(z.string().trim().min(2).max(100)).min(1).max(50),
        createInviteLinks: z.boolean().default(false),
      }),
      _meta: mcpOauthToolMeta(),
    },
    async ({ expectedTeamId, names, createInviteLinks }) => {
      if (expectedTeamId !== orgId)
        return failed("Contac team ID does not match the expected team. Stop using Contac.");
      const [admin] = await deps.db
        .select({ classId: organizations.classId })
        .from(organizations)
        .innerJoin(classMemberships, eq(classMemberships.classId, organizations.classId))
        .where(
          and(
            eq(organizations.id, orgId),
            eq(classMemberships.userId, createdBy),
            eq(classMemberships.role, "admin"),
          ),
        )
        .limit(1);
      if (!admin) return failed("Only a class admin can create teams.");

      const existing = await deps.db
        .select({ id: organizations.id, name: organizations.name })
        .from(organizations)
        .where(eq(organizations.classId, admin.classId));
      const known = new Map(existing.map((team) => [normalizeTeamName(team.name), team]));
      const items = [];
      for (const [index, name] of names.entries()) {
        const key = normalizeTeamName(name);
        const match = known.get(key);
        if (match) {
          items.push({ index, status: "exists" as const, team: match });
          continue;
        }
        try {
          const created = await createClassTeam(deps.db, admin.classId, name);
          const team = { id: created.id, name: created.name };
          known.set(key, team);
          const inviteUrl = createInviteLinks
            ? await createTeamInviteLink(deps.db, appOrigin, created.id, createdBy)
            : undefined;
          items.push({ index, status: "created" as const, team, inviteUrl });
        } catch (error) {
          console.error("MCP team creation failed", error);
          items.push({ index, status: "error" as const, name, error: "Could not create team" });
        }
      }
      return result({ classId: admin.classId, items });
    },
  );
}
