import { describe, expect, it } from "vitest";
import { buildContactExport, type ExportActivity, type ExportContact } from "./contact-export.ts";

const contact = (id: string, status = "relevant"): ExportContact => ({
  id,
  contactNumber: id === "a" ? 1 : id === "b" ? 2 : 3,
  name: id,
  status,
  companyId: "company",
  companyName: "Gruve AS",
  email: null,
  phone: null,
  description: null,
  assigneeId: null,
  personTags: [],
  domains: [],
});
const activity = (id: string, linkedContactIds: string[]): ExportActivity => ({
  id,
  kind: "meeting",
  occurredAt: "2026-10-04T09:00:00.000Z",
  createdAt: "2026-10-04T10:00:00.000Z",
  updatedAt: "2026-10-04T10:00:00.000Z",
  createdBy: "member",
  exportOwnerContactId: linkedContactIds[0]!,
  linkedContactIds,
  summary: "Hele oppsummeringen",
  transcript: "Hele transkripsjonen",
  missedOutcome: null,
  allowExternalAiOverride: null,
  email: null,
  attachments: [{ id: "file", name: "notat.pdf", mimeType: "application/pdf", sizeBytes: 50 }],
});

describe("contact-log export", () => {
  it("keeps a shared activity once with all live contact links and full text", () => {
    const result = buildContactExport({
      team: { id: "team", name: "Team" },
      contacts: [contact("a"), contact("b"), contact("old", "duplicate")],
      activities: [activity("meeting", ["a", "b", "old"]), activity("meeting", ["a", "b", "old"])],
    });
    expect(result.contacts.map((item) => item.id)).toEqual(["a", "b"]);
    expect(result.contacts.map((item) => item.contactNumber)).toEqual([1, 2]);
    expect(result.activities).toHaveLength(1);
    expect(result.activities[0]).toMatchObject({
      exportOwnerContactId: "a",
      linkedContactIds: ["a", "b"],
      summary: "Hele oppsummeringen",
      transcript: "Hele transkripsjonen",
    });
  });
  it("moves export ownership to another live contact and omits deleted-only activities", () => {
    const result = buildContactExport({
      team: { id: "team", name: "Team" },
      contacts: [contact("b")],
      activities: [activity("shared", ["a", "b"]), activity("deleted-only", ["a"])],
    });
    expect(result.activities).toHaveLength(1);
    expect(result.activities[0]).toMatchObject({
      id: "shared",
      exportOwnerContactId: "b",
      linkedContactIds: ["b"],
    });
  });
});
