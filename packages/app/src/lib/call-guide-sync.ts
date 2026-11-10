import { ApiError } from "./api.ts";
import type { CallGuide, CallGuideChanges } from "./call-guides.ts";

/**
 * Autosave bookkeeping for the call guide editor. `base` is the last committed
 * version the editor's text derives from, with the body in the editor's own
 * Markdown form; `local` is what the editor shows now.
 */
export type GuideSnapshot = { revision: number; title: string; body: string };
export type GuideText = { title: string; body: string };

/** The fields to send, or null when the editor matches the committed version. */
export function guideChanges(base: GuideSnapshot, local: GuideText): CallGuideChanges | null {
  const changes: CallGuideChanges = {};
  if (local.title !== base.title) changes.title = local.title;
  if (local.body !== base.body) changes.body = local.body;
  return Object.keys(changes).length ? changes : null;
}

/**
 * What to do with a guide that arrived from the server (a refetch after a
 * change signal, polling, focus, or reconnect) while the editor is open.
 *
 * - `ignore`: it is not newer than `base` (for instance the refetch caused by our
 *   own save, or a reorder, which keeps the revision), or our own save is still
 *   in flight and will settle which version is current.
 * - `keep`: a teammate committed a newer version but the member has unsaved
 *   edits; the next save carries the old revision, receives 409, and then shows
 *   the teammate's version, as other scalar fields do.
 * - `apply`: a teammate committed a newer version and nothing local is unsaved,
 *   so the editor shows it.
 */
export function incomingGuideAction(
  base: GuideSnapshot,
  incoming: Pick<CallGuide, "revision">,
  state: { saving: boolean; dirty: boolean },
): "ignore" | "keep" | "apply" {
  if (state.saving || incoming.revision <= base.revision) return "ignore";
  return state.dirty ? "keep" : "apply";
}

/** Whether a failed save should be retried automatically. */
export function isRetryableSaveError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true;
  return error.status >= 500 || error.status === 408 || error.status === 429;
}

/** Delay before retry number `attempt` (1-based): 2 s doubling up to 30 s. */
export function saveRetryDelay(attempt: number): number {
  return Math.min(30_000, 2_000 * 2 ** Math.max(0, attempt - 1));
}

/** Moves `id` one step up or down in `ids`; returns the same array when it cannot move. */
export function moveId(ids: string[], id: string, direction: -1 | 1): string[] {
  const index = ids.indexOf(id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= ids.length) return ids;
  const next = [...ids];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

/** The guide to select after deleting `deletedId`: the next one, else the previous. */
export function guideAfterDelete(ids: string[], deletedId: string): string | null {
  const index = ids.indexOf(deletedId);
  if (index < 0) return ids[0] ?? null;
  return ids[index + 1] ?? ids[index - 1] ?? null;
}
