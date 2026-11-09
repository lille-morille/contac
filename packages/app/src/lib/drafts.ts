// Unsaved form drafts kept in this browser so leaving the page does not lose typed text.
const prefix = "contac:draft:";

export function draftKey(...parts: (string | null | undefined)[]) {
  return `${prefix}${parts.map((part) => part ?? "anon").join(":")}`;
}

export function readDraft<T extends object>(key: string): Partial<T> | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null") as unknown;
    return value && typeof value === "object" ? (value as Partial<T>) : null;
  } catch {
    return null;
  }
}

export function writeDraft(key: string, value: object) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A blocked or full browser store only means the draft is kept in memory.
  }
}

export function clearDraft(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing to clear when browser storage is unavailable.
  }
}
