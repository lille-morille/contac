import { describe, expect, it } from "vitest";
import { partitionSafeAutoFields, remainingSuggestion } from "./ai.ts";

describe("field-level AI suggestions", () => {
  it("auto-fills blank fields and leaves different filled values for review", () => {
    expect(
      partitionSafeAutoFields(
        {
          email: "ada@example.no",
          phone: "+47 123 45 678",
          description: "Instituttleder for biokjemisk avdeling",
        },
        {
          email: " Ada@Example.no ",
          phone: "",
          description: "Forsker",
        },
      ),
    ).toEqual({
      automatic: { phone: "+47 123 45 678" },
      pending: { description: "Instituttleder for biokjemisk avdeling" },
    });
  });

  it("keeps other fields pending when one field is accepted or dismissed", () => {
    const payload = {
      fields: { email: "ada@example.no", phone: "+47 123 45 678" },
      evidence: "Fra samtalen",
    };
    expect(remainingSuggestion("contact_fields", payload, new Set(["phone"]))).toEqual({
      fields: { email: "ada@example.no" },
      evidence: "Fra samtalen",
    });
    expect(remainingSuggestion("contact_fields", payload, new Set(["phone", "email"]))).toBeNull();
  });

  it("keeps a proposed domain separate from a proposed person tag", () => {
    const payload = {
      hierarchy: {
        newDomainName: "Oppdrett",
        newDomainDescription: "Fiskeri og oppdrett",
        personTagIds: ["tag-1"],
      },
    };
    expect(remainingSuggestion("hierarchy", payload, new Set(["newDomainName"]))).toEqual({
      hierarchy: { personTagIds: ["tag-1"] },
    });
  });
});
