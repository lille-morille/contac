/**
 * Per-team feature flags for staged rollouts. A team has a flag when a row for it
 * exists in `team_feature_flags`. Set or clear one with `scripts/team-feature-flag.ts`.
 * To roll a feature out to every team, remove its gate and then its name here.
 */
export const TEAM_FEATURE_FLAGS = ["call_guides"] as const;
export type TeamFeatureFlag = (typeof TEAM_FEATURE_FLAGS)[number];

export function isTeamFeatureFlag(value: unknown): value is TeamFeatureFlag {
  return typeof value === "string" && (TEAM_FEATURE_FLAGS as readonly string[]).includes(value);
}
