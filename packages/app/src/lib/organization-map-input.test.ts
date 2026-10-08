import { describe, expect, it } from "vitest";
import { mapWheelAction } from "./organization-map-input.ts";

describe("organization map input modes", () => {
  it("pans in both directions with trackpad scrolling", () => {
    expect(mapWheelAction("trackpad", 25, -40, false)).toEqual({ kind: "pan", offset: [-25, 40] });
  });
  it("zooms with mouse scrolling and trackpad pinch", () => {
    for (const mode of ["mouse", "trackpad"] as const) {
      const action = mapWheelAction(mode, 0, -20, mode === "trackpad");
      expect(action.kind).toBe("zoom");
      if (action.kind === "zoom") expect(action.factor).toBeGreaterThan(1);
    }
    const action = mapWheelAction("mouse", 0, 20, false);
    if (action.kind === "zoom") expect(action.factor).toBeLessThan(1);
  });
  it("normalizes line-based scroll deltas", () => {
    expect(mapWheelAction("trackpad", 1, 2, false, 16)).toEqual({
      kind: "pan",
      offset: [-16, -32],
    });
  });
});
