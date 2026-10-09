import { describe, expect, it } from "vitest";
import { buildReportData, defaultReportSettings, reportSettingsSchema } from "./report-export.ts";
import type { ExportActivity } from "./contact-export.ts";

const uuid = (number: number) => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const settings = () => reportSettingsSchema.parse(defaultReportSettings);
const contact = (number: number, status = "kan_kontaktes_igjen") => ({
  id: uuid(number),
  contactNumber: number,
  name: `Kontakt ${number}`,
  status,
  companyId: uuid(99),
  companyName: "Selskap",
  companyStatus: "ingen",
  relevance: null as "low" | "medium" | "high" | null,
  email: null,
  phone: null,
  description: null,
  assigneeId: null,
  personTags: [],
  domains: [],
  sammendrag: null,
  stikkord: null,
  assigneeName: null,
});
const meeting = (owner: number, linked: number[]): ExportActivity => ({
  id: uuid(50),
  kind: "meeting",
  occurredAt: "2026-10-07T10:00:00.000Z",
  createdAt: "2026-10-07T10:00:00.000Z",
  updatedAt: "2026-10-07T10:00:00.000Z",
  createdBy: uuid(90),
  exportOwnerContactId: uuid(owner),
  linkedContactIds: linked.map(uuid),
  summary: "Fullt møte",
  transcript: "Hele transkripsjonen",
  missedOutcome: null,
  email: null,
  attachments: [],
});

describe("saved report composition", () => {
  it("upgrades saved log columns to summaries and supplies new section defaults", () => {
    const legacy = {
      format: "typst",
      title: "Kontaktlogg",
      subtitle: "",
      columns: ["number", "name", "stikkord", "log"],
      excludedContactIds: [],
      orderMode: "default",
      contactOrder: [],
    };
    const parsed = reportSettingsSchema.parse(legacy);
    expect(parsed.columns).toEqual(["number", "name", "stikkord", "sammendrag"]);
    expect(parsed.sectionMode).toBe("activity");
    expect(parsed.sortMode).toBe("relevance");
  });
  it("uses status order and moves all contacts without activity to the compact section", () => {
    const report = buildReportData({
      contacts: [contact(1, "ikke_kontaktet"), contact(2, "avsluttet"), contact(3)],
      activities: [meeting(1, [1, 2])],
      settings: settings(),
    });
    expect(report.rows.map((row) => row.contact.contactNumber)).toEqual([2, 1]);
    expect(report.noActivityRows.map((row) => row.contact.contactNumber)).toEqual([3]);
  });

  it("prints a shared activity once, references its owner, and falls back in saved order", () => {
    const configured = settings();
    configured.orderMode = "manual";
    configured.contactOrder = [uuid(3), uuid(2), uuid(1)];
    let report = buildReportData({
      contacts: [contact(1), contact(2), contact(3)],
      activities: [meeting(1, [1, 2, 3])],
      settings: configured,
    });
    expect(report.rows.map((row) => row.contact.contactNumber)).toEqual([3, 2, 1]);
    expect(
      report.rows.flatMap((row) => row.entries).filter((entry) => entry.kind === "full"),
    ).toHaveLength(1);
    expect(
      report.rows.find((row) => row.contact.contactNumber === 3)?.entries[0]?.owner.number,
    ).toBe(1);
    configured.excludedContactIds = [uuid(1)];
    report = buildReportData({
      contacts: [contact(1), contact(2), contact(3)],
      activities: [meeting(1, [1, 2, 3])],
      settings: configured,
    });
    expect(report.rows[0]?.entries[0]?.kind).toBe("full");
    expect(report.rows[0]?.entries[0]?.owner.number).toBe(3);
    expect(report.rows[1]?.entries[0]?.kind).toBe("reference");
  });

  it("sorts within company sections by relevance, status or name", () => {
    const configured = settings();
    configured.sectionMode = "company_status";
    const contacts = [contact(1, "skal_ringe"), contact(2, "avsluttet"), contact(3, "avsluttet")];
    contacts[0]!.companyStatus = "ekspert";
    contacts[1]!.companyStatus = "ekspert";
    contacts[2]!.companyStatus = "kunde";
    contacts[0]!.relevance = "high";
    contacts[1]!.relevance = "low";
    contacts[2]!.relevance = "medium";
    let report = buildReportData({
      contacts,
      activities: [meeting(1, [1, 2, 3])],
      settings: configured,
    });
    expect(report.sections.map((section) => section.title)).toEqual(["Kunde", "Ekspert"]);
    expect(report.sections[1]?.rows.map((row) => row.contact.contactNumber)).toEqual([1, 2]);
    configured.sortMode = "status";
    report = buildReportData({
      contacts,
      activities: [meeting(1, [1, 2, 3])],
      settings: configured,
    });
    expect(report.sections[1]?.rows.map((row) => row.contact.contactNumber)).toEqual([2, 1]);
    configured.sortMode = "alphabetical";
    report = buildReportData({
      contacts,
      activities: [meeting(1, [1, 2, 3])],
      settings: configured,
    });
    expect(report.sections[1]?.rows.map((row) => row.contact.contactNumber)).toEqual([1, 2]);
  });

  it("places new contacts without a custom assignment in a final section", () => {
    const configured = settings();
    configured.sectionMode = "custom";
    configured.customSections = [{ id: uuid(90), title: "Kunder" }];
    configured.customAssignments = { [uuid(1)]: uuid(90) };
    const report = buildReportData({
      contacts: [contact(1), contact(2)],
      activities: [],
      settings: configured,
    });
    expect(report.sections.map((section) => section.title)).toEqual(["Kunder", "Uten seksjon"]);
  });
});
