// Sets or clears a per-team feature flag. See "Team feature flags" in README.md.
//   bun --env-file=.env scripts/team-feature-flag.ts <team-id>                  show flags
//   bun --env-file=.env scripts/team-feature-flag.ts <team-id> <flag> on|off   set or clear
import { TEAM_FEATURE_FLAGS, isTeamFeatureFlag } from "../packages/core/src/feature-flags.ts";
import { createDb } from "../packages/core/src/db/client.ts";

const usage = `Usage: bun --env-file=.env scripts/team-feature-flag.ts <team-id> [<flag> on|off]
Flags: ${TEAM_FEATURE_FLAGS.join(", ")}`;
const [teamId, flag, state] = process.argv.slice(2);
const fail = (message: string): never => {
  console.error(`${message}\n\n${usage}`);
  process.exit(1);
};
if (!teamId || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(teamId))
  fail("Give the team ID (organizations.id).");
if (flag !== undefined && !isTeamFeatureFlag(flag)) fail(`Unknown flag "${flag}".`);
if (flag !== undefined && state !== "on" && state !== "off") fail("Say on or off.");
const url = process.env.DATABASE_URL;
if (!url) fail("DATABASE_URL is required.");

const { client } = createDb(url!, 1);
try {
  const [team] = await client<{ name: string }[]>`
    SELECT name FROM public.organizations WHERE id = ${teamId}`;
  if (!team) fail(`No team with ID ${teamId}.`);
  if (flag && state === "on")
    await client`
      INSERT INTO public.team_feature_flags (org_id, flag) VALUES (${teamId}, ${flag})
      ON CONFLICT (org_id, flag) DO NOTHING`;
  if (flag && state === "off")
    await client`
      DELETE FROM public.team_feature_flags WHERE org_id = ${teamId} AND flag = ${flag}`;
  const rows = await client<{ flag: string }[]>`
    SELECT flag FROM public.team_feature_flags WHERE org_id = ${teamId} ORDER BY flag`;
  console.log(`${team.name} (${teamId}): ${rows.map((row) => row.flag).join(", ") || "no flags"}`);
  if (flag) console.log("Members see the change after reloading the workspace.");
} finally {
  await client.end();
}
