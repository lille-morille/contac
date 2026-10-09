export function isActivityAiEligible(linkedContactAllowsAi: boolean[]): boolean {
  if (!linkedContactAllowsAi.length) return false;
  return linkedContactAllowsAi.every(Boolean);
}
