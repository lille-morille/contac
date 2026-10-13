import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { defaultReportSettings, reportExportNumbers, reportSettingsSchema } from "@contac/core";
import { PreviewCards } from "./export-page.tsx";

it("previews export numbers for included contacts and permanent numbers for excluded contacts", () => {
  const contacts: Parameters<typeof PreviewCards>[0]["contacts"] = [12, 34, 56].map(
    (number) => ({
      id: String(number),
      contactNumber: number,
      name: `Kontakt ${number}`,
      companyName: "Firma",
      status: "ikke_kontaktet",
      relevance: null,
      companyStatus: "ingen",
      assigneeName: null,
      email: null,
      phone: null,
      description: null,
      personTags: [],
      domains: [],
      stikkord: null,
      sammendrag: null,
      activityCount: 0,
    }),
  );
  const excluded = new Set(["34"]);
  const html = renderToStaticMarkup(
    <PreviewCards
      contacts={contacts}
      columns={["number", "name"]}
      excluded={excluded}
      exportNumbers={reportExportNumbers(contacts, excluded)}
      settings={reportSettingsSchema.parse(defaultReportSettings)}
      onMove={() => {}}
      onToggle={() => {}}
      onOpen={() => {}}
      onSaveStikkord={async () => {}}
      onSaveSammendrag={async () => {}}
      onRefresh={() => {}}
      onAssign={() => {}}
    />,
  );
  expect(html).toContain("K-1");
  expect(html).toContain("K-2");
  expect(html).toContain("Ikke med · permanent K-34");
  expect(html).not.toContain("permanent K-12");
});
