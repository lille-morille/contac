import { ApiError, request } from "./api.ts";

/**
 * Call guides (`Samtaleguider`) for the selected team. Every endpoint answers 404
 * when the team lacks the `call_guides` flag; check `useTeamFeature("call_guides")`
 * before querying. See docs/spec/10-call-guides.md.
 */
export type CallGuide = {
  id: string;
  orgId: string;
  title: string;
  /** Markdown. */
  body: string;
  /** Team order, ascending. */
  position: number;
  /** Send as `expectedRevision` on the next title/body write. Reorder leaves it unchanged. */
  revision: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};
export type CallGuideChanges = { title?: string; body?: string };

export {
  CALL_GUIDE_BODY_MAX_LENGTH,
  CALL_GUIDE_DEFAULT_TITLE,
  CALL_GUIDE_TITLE_MAX_LENGTH,
} from "@contac/core";

/**
 * Query keys. The realtime layer invalidates `callGuideKeys.all(teamId)` (and so
 * every key below it) on each `call_guides` change signal.
 */
export const callGuideKeys = {
  all: (teamId: string) => ["call-guides", teamId] as const,
  list: (teamId: string) => ["call-guides", teamId, "list"] as const,
  detail: (teamId: string, id: string) => ["call-guides", teamId, "detail", id] as const,
};

/** All guides of the team with their bodies, in team order. */
export function listCallGuides(teamId: string) {
  return request<CallGuide[]>("/org/call-guides", teamId);
}

export function getCallGuide(teamId: string, id: string) {
  return request<CallGuide>(`/org/call-guides/${id}`, teamId);
}

/** Creates `Uten tittel` with an empty body at the end of the team order. */
export function createCallGuide(teamId: string) {
  return request<CallGuide>("/org/call-guides", teamId, {});
}

/**
 * Saves title and/or body. A stale `expectedRevision` rejects with an `ApiError`
 * of status 409; read the latest guide with `callGuideConflict(error)`.
 */
export function updateCallGuide(
  teamId: string,
  id: string,
  expectedRevision: number,
  changes: CallGuideChanges,
) {
  return request<CallGuide>(`/org/call-guides/${id}/update`, teamId, {
    expectedRevision,
    ...changes,
  });
}

/**
 * Saves the whole team order. `ids` must list every guide of the team once. If a
 * guide was added or deleted meanwhile, it rejects with 409; read the current
 * list with `callGuideOrderConflict(error)`.
 */
export function reorderCallGuides(teamId: string, ids: string[]) {
  return request<CallGuide[]>("/org/call-guides/reorder", teamId, { ids });
}

/** Permanent. */
export function deleteCallGuide(teamId: string, id: string) {
  return request<{ deleted: true }>(`/org/call-guides/${id}/delete`, teamId, {});
}

/** The latest committed guide from a 409 on `updateCallGuide`, otherwise null. */
export function callGuideConflict(error: unknown): CallGuide | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  const current = error.details.current;
  return current && typeof current === "object" && !Array.isArray(current)
    ? (current as CallGuide)
    : null;
}

/** The current team list from a 409 on `reorderCallGuides`, otherwise null. */
export function callGuideOrderConflict(error: unknown): CallGuide[] | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  return Array.isArray(error.details.current) ? (error.details.current as CallGuide[]) : null;
}
