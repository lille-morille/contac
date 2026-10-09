import { describe, expect, it } from "vitest";
import { canSuggestContactField, eligibleContactFields } from "./ai-suggestion-policy.ts";

describe("contact suggestion eligibility", () => {
  it("never suggests organizations, including for a blank value", () => {
    expect(canSuggestContactField("companyId", null)).toBe(false);
    expect(canSuggestContactField("companyId", "existing-company")).toBe(false);
  });
  it("only fills missing scalar and classification values", () => {
    expect(canSuggestContactField("phone", "  ")).toBe(true);
    expect(canSuggestContactField("email", "person@example.no")).toBe(false);
    expect(canSuggestContactField("personTagIds", ["decision-maker"])).toBe(false);
    expect(canSuggestContactField("domainIds", ["dosimetry"])).toBe(false);
    expect(canSuggestContactField("domainIds", [])).toBe(true);
  });
  it("allows description and stikkord regeneration while preserving filled contact fields", () => {
    expect(canSuggestContactField("stikkord", "Existing takeaways")).toBe(true);
    expect(canSuggestContactField("sammendrag", "Existing summary")).toBe(true);
    expect(
      eligibleContactFields(
        { email: "new@example.no", phone: "123", description: "Updated role", companyId: "other" },
        { email: "existing@example.no", phone: " ", description: "Old role" },
      ),
    ).toEqual({ phone: "123", description: "Updated role" });
  });
});
