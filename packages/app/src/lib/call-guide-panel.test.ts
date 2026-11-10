import { afterEach, describe, expect, it, vi } from "vitest";
import {
  callGuidePreferenceKey,
  callGuideTitle,
  readCallGuideCollapsed,
  readSelectedGuideId,
  resolveSelectedGuide,
  tabIndexForKey,
  writeCallGuideCollapsed,
  writeSelectedGuideId,
} from "./call-guide-panel.ts";

const guides = [{ id: "a" }, { id: "b" }, { id: "c" }];

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("call guide selection", () => {
  it("keeps the remembered guide while it exists", () => {
    expect(resolveSelectedGuide(guides, "b")?.id).toBe("b");
  });

  it("selects the first guide in team order when the remembered guide is gone or unset", () => {
    expect(resolveSelectedGuide(guides, "deleted")?.id).toBe("a");
    expect(resolveSelectedGuide(guides, null)?.id).toBe("a");
    expect(resolveSelectedGuide(guides.slice(1), "a")?.id).toBe("b");
  });

  it("selects nothing when the team has no guides", () => {
    expect(resolveSelectedGuide([], "a")).toBeNull();
  });

  it("labels a blank title as Uten tittel and keeps other titles as stored", () => {
    expect(callGuideTitle("  ")).toBe("Uten tittel");
    expect(callGuideTitle("Kunde")).toBe("Kunde");
  });

  it("moves between tabs with arrow keys, Home, and End", () => {
    expect(tabIndexForKey("ArrowRight", 0, 3)).toBe(1);
    expect(tabIndexForKey("ArrowRight", 2, 3)).toBe(0);
    expect(tabIndexForKey("ArrowLeft", 0, 3)).toBe(2);
    expect(tabIndexForKey("Home", 2, 3)).toBe(0);
    expect(tabIndexForKey("End", 0, 3)).toBe(2);
    expect(tabIndexForKey("Enter", 0, 3)).toBeNull();
    expect(tabIndexForKey("ArrowRight", 0, 0)).toBeNull();
  });
});

describe("call guide preferences", () => {
  it("remembers the selected guide and collapsed state per member and team", () => {
    const storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);
    writeSelectedGuideId("user-1", "team-1", "b");
    writeCallGuideCollapsed("user-1", "team-1", true);
    expect(readSelectedGuideId("user-1", "team-1")).toBe("b");
    expect(readCallGuideCollapsed("user-1", "team-1")).toBe(true);
    expect(readSelectedGuideId("user-2", "team-1")).toBeNull();
    expect(readSelectedGuideId("user-1", "team-2")).toBeNull();
    expect(readCallGuideCollapsed("user-1", "team-2")).toBe(false);
    expect(storage.values.get(callGuidePreferenceKey("selected", "user-1", "team-1"))).toBe("b");
    writeCallGuideCollapsed("user-1", "team-1", false);
    expect(readCallGuideCollapsed("user-1", "team-1")).toBe(false);
  });

  it("falls back to defaults when browser storage is missing or throws", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(readSelectedGuideId("user-1", "team-1")).toBeNull();
    expect(() => writeSelectedGuideId("user-1", "team-1", "a")).not.toThrow();
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    });
    expect(readCallGuideCollapsed("user-1", "team-1")).toBe(false);
    expect(() => writeCallGuideCollapsed("user-1", "team-1", true)).not.toThrow();
  });
});
