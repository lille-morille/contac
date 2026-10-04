export function isActivityAiEligible(
  override: boolean | null,
  linkedContactAllowsAi: boolean[],
): boolean {
  if (!linkedContactAllowsAi.length) return false;
  return override ?? linkedContactAllowsAi.every(Boolean);
}
