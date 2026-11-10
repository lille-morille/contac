import { CALL_GUIDE_DEFAULT_TITLE } from "@contac/core";

/**
 * Selection, labels, and remembered preferences for the call guide panel in a
 * live conversation (spec 10, unit C). Kept free of React and the API client so
 * it can be tested on its own.
 */

/** Tab label: titles are stored as sent, so a blank title reads `Uten tittel`. */
export function callGuideTitle(title: string): string {
  return title.trim() || CALL_GUIDE_DEFAULT_TITLE;
}

/**
 * The guide to show: the preferred (last selected) guide while it still exists,
 * otherwise the first guide in team order, or null when the team has none.
 */
export function resolveSelectedGuide<T extends { id: string }>(
  guides: readonly T[],
  preferredId: string | null | undefined,
): T | null {
  return guides.find((guide) => guide.id === preferredId) ?? guides[0] ?? null;
}

/**
 * Index of the tab that a key press in the tab list moves to, or null for keys
 * the tab list does not handle. Arrow keys wrap around.
 */
export function tabIndexForKey(key: string, current: number, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case "ArrowRight":
      return (current + 1) % count;
    case "ArrowLeft":
      return (current - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

type PreferenceKind = "selected" | "collapsed";

/** `contac:call-guide:<kind>:<userId>:<teamId>`: per member, per team. */
export function callGuidePreferenceKey(
  kind: PreferenceKind,
  userId: string | null | undefined,
  teamId: string,
): string {
  return `contac:call-guide:${kind}:${userId ?? "anon"}:${teamId}`;
}

function read(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) globalThis.localStorage?.removeItem(key);
    else globalThis.localStorage?.setItem(key, value);
  } catch {
    // A blocked or full browser store only means the preference is not remembered.
  }
}

export function readSelectedGuideId(userId: string | null | undefined, teamId: string) {
  return read(callGuidePreferenceKey("selected", userId, teamId)) || null;
}

export function writeSelectedGuideId(
  userId: string | null | undefined,
  teamId: string,
  guideId: string,
) {
  write(callGuidePreferenceKey("selected", userId, teamId), guideId);
}

export function readCallGuideCollapsed(userId: string | null | undefined, teamId: string) {
  return read(callGuidePreferenceKey("collapsed", userId, teamId)) === "1";
}

export function writeCallGuideCollapsed(
  userId: string | null | undefined,
  teamId: string,
  collapsed: boolean,
) {
  write(callGuidePreferenceKey("collapsed", userId, teamId), collapsed ? "1" : null);
}
