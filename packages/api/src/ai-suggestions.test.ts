import { describe, expect, it } from "vitest";
import {
  featureMode,
  partitionAutomaticContactFields,
  partitionSafeAutoFields,
  remainingSuggestion,
  suggestedFields,
} from "./ai.ts";

describe("field-level AI suggestions", () => {
  it("treats legacy manual contact modes as automatic suggestions without changing on-demand features", () => {
    const settings = {
      emailDraftEnabled: false,
      modes: Object.fromEntries(
        [
          "stikkord",
          "contact_fields",
          "hierarchy",
          "contact_referral",
          "group_findings",
          "email_draft",
        ].map((feature) => [feature, "manual"]),
      ),
    };
    for (const feature of ["stikkord", "contact_fields", "hierarchy", "contact_referral"] as const)
      expect(featureMode(settings, feature)).toBe("suggest");
    expect(featureMode(settings, "group_findings")).toBe("manual");
    expect(featureMode(settings, "email_draft")).toBe("manual");
  });

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

  it("keeps a generated description for review even when its field is blank", () => {
    expect(
      partitionSafeAutoFields({ description: "Senior fullstackutvikler" }, { description: null }),
    ).toEqual({ automatic: {}, pending: { description: "Senior fullstackutvikler" } });
  });

  it("never automatically applies a generated description in dangerous mode", () => {
    expect(
      partitionAutomaticContactFields(
        { email: "ada@example.no", description: "Senior fullstackutvikler" },
        { email: "old@example.no", description: "" },
        "dangerous",
      ),
    ).toEqual({
      automatic: {},
      pending: { description: "Senior fullstackutvikler" },
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

  it("keeps takeaways pending after a summary is accepted", () => {
    const payload = {
      sammendrag: "Full oversikt over funnene.",
      text: "- Funn A\n- Funn B\n- Funn C",
      summarySourceVersion: "source-1",
    };
    expect(suggestedFields("stikkord", payload)).toEqual(new Set(["stikkord", "sammendrag"]));
    expect(remainingSuggestion("stikkord", payload, new Set(["sammendrag"]))).toEqual({
      text: payload.text,
      summarySourceVersion: "source-1",
    });
    expect(
      remainingSuggestion("stikkord", payload, new Set(["sammendrag", "stikkord"])),
    ).toBeNull();
  });

  it("keeps an AI relevance proposal available after the takeaways are handled", () => {
    const payload = { text: "- Funn", relevance: "high" };
    expect(suggestedFields("stikkord", payload)).toEqual(new Set(["stikkord", "relevance"]));
    expect(remainingSuggestion("stikkord", payload, new Set(["stikkord"]))).toEqual({
      relevance: "high",
    });
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

  it("replaces only fields with a new nonempty proposal", () => {
    const old = {
      hierarchy: { personTagIds: ["old-tag"], domainIds: ["domain-1"] },
      evidence: "Older source",
    };
    const newer = {
      hierarchy: { personTagIds: ["new-tag"], domainIds: [], newDomainDescription: "Metadata" },
    };
    expect(suggestedFields("hierarchy", newer)).toEqual(new Set(["personTagIds"]));
    expect(remainingSuggestion("hierarchy", old, suggestedFields("hierarchy", newer))).toEqual({
      hierarchy: { domainIds: ["domain-1"] },
      evidence: "Older source",
    });
    expect(
      remainingSuggestion(
        "contact_fields",
        { fields: { email: "old@example.no", phone: "123" } },
        suggestedFields("contact_fields", { fields: { email: "new@example.no" } }),
      ),
    ).toEqual({ fields: { phone: "123" } });
  });
});
