import { describe, expect, it } from "vitest";
import { nextPickerIndex, pickerDirection } from "./picker-keyboard.ts";
const key = (key: string, ctrlKey = false) => ({ key, ctrlKey, metaKey: false, altKey: false });
describe("picker keyboard navigation", () => {
  it("supports arrows and both Ctrl navigation pairs", () => {
    for (const value of [key("ArrowDown"), key("j", true), key("n", true)])
      expect(pickerDirection(value)).toBe(1);
    for (const value of [key("ArrowUp"), key("k", true), key("p", true)])
      expect(pickerDirection(value)).toBe(-1);
  });
  it("preserves typing and modified or composing input", () => {
    expect(pickerDirection(key("n"))).toBeNull();
    expect(pickerDirection({ ...key("k", true), metaKey: true })).toBeNull();
    expect(pickerDirection({ ...key("j", true), isComposing: true })).toBeNull();
  });
  it("wraps options and handles no focus or empty lists", () => {
    expect(nextPickerIndex(2, 1, 3)).toBe(0);
    expect(nextPickerIndex(0, -1, 3)).toBe(2);
    expect(nextPickerIndex(-1, 1, 3)).toBe(0);
    expect(nextPickerIndex(-1, -1, 3)).toBe(2);
    expect(nextPickerIndex(0, 1, 0)).toBe(-1);
  });
});
