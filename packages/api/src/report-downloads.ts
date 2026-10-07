import { readFile, readdir } from "node:fs/promises";
import { zipSync, strToU8 } from "fflate";
import { PDFDocument } from "pdf-lib";
import { parse, stringify } from "yaml";

const templateRoot = new URL("./templates/syretest/", import.meta.url);
export type ReportLanguage = "nb" | "en";
export type ReportDetails = {
  caseName: string;
  group: string;
  studyNumber: string;
  authors: { name: string; title: string }[];
};
export const reportCourse = {
  code: "TIØ4331",
  name: "Entreprenørielle muligheter og markedsundersøkelser",
};

async function collectFiles(directory: URL, prefix = ""): Promise<Record<string, Uint8Array>> {
  const result: Record<string, Uint8Array> = {};
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${prefix}${entry.name}`;
    const url = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
    if (entry.isDirectory()) Object.assign(result, await collectFiles(url, `${path}/`));
    else if (entry.isFile()) result[path] = await readFile(url);
  }
  return result;
}

export async function buildReportTemplateZip(language: ReportLanguage, details?: ReportDetails) {
  const [common, localized] = await Promise.all([
    collectFiles(new URL("common/", templateRoot)),
    collectFiles(new URL(`${language}/`, templateRoot)),
  ]);
  const files = { ...common, ...localized };
  if (details) {
    const project = parse(new TextDecoder().decode(files["project.yaml"]));
    Object.assign(project, {
      case_name: details.caseName,
      group: details.group,
      study_number: details.studyNumber,
      authors: details.authors,
      course: reportCourse,
    });
    files["project.yaml"] = strToU8(stringify(project, { lineWidth: 0 }));
  }
  return zipSync(files);
}

export type SignedLoiFile = { id: string; companyName: string; name: string; bytes: Uint8Array };

export async function buildSignedLoiZip(files: SignedLoiFile[]) {
  const entries: Record<string, Uint8Array> = {};
  const manifest = [];
  for (const file of files) {
    const company =
      file.companyName
        .normalize("NFKC")
        .replace(/[^\p{L}\p{N}._-]+/gu, "-")
        .slice(0, 80) || "LOI";
    // The stable version ID prevents both traversal and collisions between uploaded filenames.
    const filename = `${company}-${file.id}.pdf`;
    const pdf = await PDFDocument.load(file.bytes);
    const pages = pdf.getPages().map((page) => {
      const box = page.getCropBox();
      const rotated = Math.abs(page.getRotation().angle) % 180 !== 0;
      return { width: rotated ? box.height : box.width, height: rotated ? box.width : box.height };
    });
    if (!pages.length) throw new Error(`Empty PDF: ${file.name}`);
    entries[`loi/${filename}`] = file.bytes;
    manifest.push({ file: filename, title: `${file.companyName} — ${file.name}`, pages });
  }
  entries["loi/manifest.json"] = strToU8(JSON.stringify(manifest, null, 2) + "\n");
  return zipSync(entries, { level: 0 });
}
