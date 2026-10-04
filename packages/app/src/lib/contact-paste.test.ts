import { describe, expect, it } from "vitest";
import { parseContactPaste, remainingSuggestion } from "./contact-paste.ts";

describe("quick contact paste", () => {
  it("keeps person and organization as editable suggestions while filling phone and email", () => {
    const parsed = parseContactPaste("Anders Morille 93668953 anders.morille@gmail.com Rana AS");
    expect(parsed).toEqual({
      email: "anders.morille@gmail.com",
      phone: "93668953",
      suggestion: "Anders Morille Rana AS",
    });
    expect(remainingSuggestion(parsed.suggestion, "Anders Morille")).toBe("Rana AS");
    expect(remainingSuggestion(parsed.suggestion, "Rana AS")).toBe("Anders Morille");
  });

  it("updates the organization suggestion after a full suggestion is trimmed in the name field", () => {
    const source = "Anders Morille Rana AS";
    expect(remainingSuggestion(source, source)).toBe("");
    expect(remainingSuggestion(source, "Anders Morille")).toBe("Rana AS");
  });

  it("drops long ambiguous remainder text", () => {
    expect(parseContactPaste(`93668953 ${"A".repeat(51)}`).suggestion).toBe("");
  });
});
