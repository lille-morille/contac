import { describe, expect, it } from "vitest";
import { mergeLoiEdit } from "./loi-merge.ts";

const base = {
  ourSignerName: "Ada",
  counterpartySignerName: "Bo",
  documentDate: "1.10.2026",
  variables: { projectName: "Prosjekt", signatureNote: "Opprinnelig" },
  sections: [{ id: "11111111-1111-4111-8111-111111111111", title: "Formål", body: "A" }],
};

describe("LOI concurrent save", () => {
  it("preserves live paragraph edits when someone saves another field", () => {
    const current = { ...base, sections: [{ ...base.sections[0], body: "A og B" }] };
    const proposed = { ...base, documentDate: "2.10.2026" };
    const result = mergeLoiEdit(current, base, proposed);
    expect(result.conflicts).toEqual([]);
    expect(result.merged.sections[0].body).toBe("A og B");
    expect(result.merged.documentDate).toBe("2.10.2026");
  });
  it("blocks a stale edit to the same scalar", () => {
    const current = { ...base, ourSignerName: "Charlie" };
    const proposed = { ...base, ourSignerName: "Dana" };
    expect(mergeLoiEdit(current, base, proposed).conflicts).toContain("ourSignerName");
  });
  it("blocks incompatible section structure edits", () => {
    const current = { ...base, sections: [] };
    const proposed = {
      ...base,
      sections: [
        ...base.sections,
        {
          id: "22222222-2222-4222-8222-222222222222",
          title: "Økonomi",
          body: "B",
        },
      ],
    };
    expect(mergeLoiEdit(current, base, proposed).conflicts).toContain("sections.structure");
  });
});
