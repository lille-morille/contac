import { describe, expect, it } from "vitest";
import { buildReportData, defaultReportSettings, reportSettingsSchema } from "@contac/core";
import {
  reportEntryParts,
  renderReportCsv,
  renderReportHtml,
  renderReportLatex,
  renderReportTypst,
} from "./report-renderers.ts";

const id = (number: number) => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
function sample() {
  const settings = reportSettingsSchema.parse(defaultReportSettings);
  const report = buildReportData({
    settings,
    contacts: [
      {
        id: id(12),
        contactNumber: 12,
        name: 'Ola #12 "Æøå"',
        status: "avsluttet",
        companyId: id(80),
        companyName: "Firma & Co",
        email: "ola@example.no",
        phone: null,
        description: null,
        assigneeId: null,
        personTags: [],
        domains: [],
        stikkord: "Viktig",
        assigneeName: null,
      },
    ],
    activities: [
      {
        id: id(22),
        kind: "meeting",
        occurredAt: "2026-10-07T10:00:00.000Z",
        createdAt: "2026-10-07T10:00:00.000Z",
        updatedAt: "2026-10-07T10:00:00.000Z",
        createdBy: id(90),
        exportOwnerContactId: id(12),
        linkedContactIds: [id(12)],
        summary: "Møte #1 & detaljer",
        transcript: "HEMMELIG TRANSKRIPSJON: Lang tekst med norske tegn. ".repeat(900),
        missedOutcome: null,
        email: null,
        attachments: [],
      },
    ],
  });
  return report;
}

describe("report source generation", () => {
  it("embeds structured data and permanent-number citation functions", () => {
    const source = renderReportTypst(sample());
    expect(source).toContain("#let report-data = json(bytes(");
    expect(source).toContain("#let cite-contact(..args)");
    expect(source).toContain("kontaktlogg-k-");
    expect(source).toContain('paper: "a4", flipped: false');
    expect(source).toContain("#let contact-card(row, columns, compact: false)");
    expect(source).toContain("block(width: 100%, breakable: true");
    expect(source).toContain('if column == "log" { log-box(row) }');
    expect(source).toContain("fill: navy, entry.heading");
    expect(source).toContain("row-gutter: if compact { 7pt } else { 5pt }");
    expect(reportEntryParts(sample().rows[0]!.entries[0]!)).toEqual({
      heading: "7. okt. 2026, 12:00 · Møte",
      body: "Sammendrag/notater: Møte #1 & detaljer",
      before: [],
      summary: "Møte #1 & detaljer",
      after: [],
    });
  });

  it("escapes source formats and keeps CSV multiline cells", () => {
    const report = sample();
    const csv = renderReportCsv(report);
    expect(csv).toContain('"K-12"');
    expect(csv).toContain('"Ola #12 ""Æøå"""');
    expect(csv).toContain("Møte #1 & detaljer");
    for (const source of [
      csv,
      renderReportHtml(report),
      renderReportLatex(report),
      renderReportTypst(report),
    ]) {
      expect(source).not.toContain("HEMMELIG TRANSKRIPSJON");
      expect(source).not.toContain("Transkripsjon:");
    }
    expect(renderReportHtml(report)).toContain("Firma &amp; Co");
    expect(renderReportLatex(report)).toContain("Firma \\& Co");
    expect(renderReportLatex(report)).toContain("\\section*{Kontaktlogg}");
  });

  it("keeps spreadsheet formulas as text in CSV", () => {
    const report = sample();
    report.rows[0]!.contact.stikkord = '=IMPORTXML("https://example.com","x")';
    expect(renderReportCsv(report)).toContain('"\'=IMPORTXML(""https://example.com"",""x"")"');
  });
});
