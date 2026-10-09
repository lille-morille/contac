import { describe, expect, it } from "vitest";
import { isActivityAiEligible } from "./checkin.ts";

describe("shared activity AI permission", () => {
  it("inherits the strictest linked contact permission", () => {
    expect(isActivityAiEligible([true, true])).toBe(true);
    expect(isActivityAiEligible([true, false])).toBe(false);
    expect(isActivityAiEligible([])).toBe(false);
  });
});
