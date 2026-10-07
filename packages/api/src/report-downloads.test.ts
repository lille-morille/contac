import { describe, expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { PDFDocument, degrees } from "pdf-lib";
import { Hono } from "hono";
import { buildReportTemplateZip, buildSignedLoiZip } from "./report-downloads.ts";
import { registerContactExportRoutes } from "./contact-export.ts";
import type { ApiDeps, ApiEnv } from "./types.ts";
import { parse } from "yaml";

describe("report downloads", () => {
  it("injects only reviewed metadata into editable YAML and keeps an automatic Typst date", async () => {
    const app = new Hono<ApiEnv>();
    registerContactExportRoutes(app, {} as ApiDeps);
    const details = {
      language: "en",
      caseName: 'Case: "quoted" #panic("literal")',
      group: "8",
      studyNumber: "4",
      authors: [
        { name: "Åse Example", title: "Engineer" },
        { name: "Second Author", title: "" },
      ],
    };
    const response = await app.request("/v1/org/export/report-template.zip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(details),
    });
    expect(response.status).toBe(200);
    const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
    const project = parse(strFromU8(files["project.yaml"]!));
    expect(project).toMatchObject({
      language: "en",
      case_name: details.caseName,
      group: "8",
      study_number: "4",
      authors: details.authors,
      course: { code: "TIØ4331", name: "Entreprenørielle muligheter og markedsundersøkelser" },
      show_guidance: true,
    });
    expect(project).not.toHaveProperty("date");
    expect(strFromU8(files["title-page.typ"]!)).toContain("datetime.today()");
    for (const invalid of [
      { ...details, authors: [] },
      { ...details, caseName: " " },
      { ...details, date: "2026-01-01" },
    ]) {
      expect(
        (
          await app.request("/v1/org/export/report-template.zip", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(invalid),
          })
        ).status,
      ).toBe(400);
    }
  });
  it.each(["nb", "en"] as const)(
    "ships a standalone %s project without case data or submitted attachments",
    async (language) => {
      const files = unzipSync(await buildReportTemplateZip(language));
      expect(Object.keys(files)).toEqual(
        expect.arrayContaining([
          "main.typ",
          "project.yaml",
          "kontaktlogg.typ",
          "dependencies/helpers.typ",
          "graphics/entreprenorskolen.png",
          "loi/manifest.json",
          "prepare-lois.py",
          "sections/case-change.typ",
          "sections/sustainability.typ",
        ]),
      );
      expect(Object.keys(files).some((name) => /\.(csv|pdf)$/i.test(name))).toBe(false);
      const source = Object.entries(files)
        .filter(([name]) => name.endsWith(".typ"))
        .map(([, bytes]) => strFromU8(bytes))
        .join("\n");
      expect(source).not.toMatch(/Rana Gruber|SYR-98|sanntidsanalyse av malm/);
      expect(strFromU8(files["loi/manifest.json"]!)).toBe("[]\n");
      expect(strFromU8(files["main.typ"]!)).toContain(
        language === "nb"
          ? "Kontaktlogg (Obligatorisk vedlegg)"
          : "Contact Log (Mandatory Appendix)",
      );
      expect(strFromU8(files["project.yaml"]!)).toContain(`language: ${language}`);
    },
  );

  it("serves language-specific ZIPs without accessing storage and rejects unknown languages", async () => {
    const app = new Hono<ApiEnv>();
    registerContactExportRoutes(app, {} as ApiDeps);
    const response = await app.request("/v1/org/export/report-template.zip?lang=en");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toContain("syretest-en.zip");
    const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
    expect(strFromU8(files["sections/summary.typ"]!)).toContain("Executive Summary");
    expect((await app.request("/v1/org/export/report-template.zip?lang=../../")).status).toBe(400);
    expect((await app.request("/v1/org/export/not-a-file")).status).toBe(404);
  });

  it("retains every original PDF byte and describes all pages, rotations and filename collisions", async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([300, 500]);
    pdf.addPage([300, 500]).setRotation(degrees(90));
    const bytes = await pdf.save();
    const files = unzipSync(
      await buildSignedLoiZip([
        { id: "first", companyName: "../Example / AS", name: "same.pdf", bytes },
        { id: "second", companyName: "../Example / AS", name: "same.pdf", bytes },
      ]),
    );
    const manifest = JSON.parse(strFromU8(files["loi/manifest.json"]!));
    expect(manifest).toHaveLength(2);
    expect(manifest[0].file).not.toBe(manifest[1].file);
    for (const entry of manifest) {
      expect(entry.file).not.toContain("/");
      expect(entry.pages).toEqual([
        { width: 300, height: 500 },
        { width: 500, height: 300 },
      ]);
      expect(files[`loi/${entry.file}`]).toEqual(bytes);
    }
  });

  it("does not silently export an unreadable signed PDF", async () => {
    await expect(
      buildSignedLoiZip([
        { id: "bad", companyName: "Example", name: "bad.pdf", bytes: new Uint8Array([1, 2, 3]) },
      ]),
    ).rejects.toThrow();
  });
});
