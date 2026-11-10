/** Workspace page key for the team's call guides (`?page=call_guides`). */
export const callGuidePage = "call_guides";

/**
 * In-app URL of the Samtaleguider page, with `guideId` selected when given.
 * The workspace keeps the current team when the link has no `team` parameter.
 */
export function callGuideHref(guideId?: string): string {
  const params = new URLSearchParams({ page: callGuidePage });
  if (guideId) params.set("guide", guideId);
  return `/?${params.toString()}`;
}
