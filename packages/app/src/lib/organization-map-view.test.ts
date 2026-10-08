import { describe, expect, it } from "vitest";
import { readMapView, saveMapView, validMapView } from "./organization-map-view.ts";

describe("organization map viewport", () => {
  it("retains pan and zoom across remounts and separates teams and selections", () => {
    const view = { zoom: 0.7, position: [125, -300] as [number, number] };
    saveMapView("team-a:all", view);
    saveMapView("team-a:company:one", { zoom: 1.5, position: [0, 20] });
    expect(readMapView("team-a:all")).toEqual(view);
    expect(readMapView("team-a:company:one")?.zoom).toBe(1.5);
    expect(readMapView("team-b:all")).toBeNull();
  });
  it("rejects invalid or out-of-range saved transforms", () => {
    for (const value of [
      null,
      {},
      { zoom: 0, position: [0, 0] },
      { zoom: 4, position: [0, 0] },
      { zoom: 1, position: [NaN, 0] },
      { zoom: 1, position: [0] },
    ])
      expect(validMapView(value)).toBe(false);
    expect(validMapView({ zoom: 0.05, position: [-100, 0] })).toBe(true);
  });
});
