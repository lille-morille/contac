import { describe, expect, it } from "vitest";
import { isActivityAiEligible } from "./checkin.ts";

describe("shared activity AI permission", () => {
  it("inherits the strictest linked contact permission", () => {
    expect(isActivityAiEligible(null, [true, true])).toBe(true);
    expect(isActivityAiEligible(null, [true, false])).toBe(false);
    expect(isActivityAiEligible(null, [])).toBe(false);
  });
  it("honors an explicit activity override", () => {
    expect(isActivityAiEligible(true, [false])).toBe(true);
    expect(isActivityAiEligible(false, [true])).toBe(false);
  });
});
