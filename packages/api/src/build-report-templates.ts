import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { unzipSync } from "fflate";
import { buildReportTemplateZip } from "./report-downloads.ts";

// Compile an unpacked main.typ with Typst 0.15.1+ for a local preview.
const destination = resolve(process.argv[2] ?? "../../output/syretest");
await mkdir(destination, { recursive: true });
for (const language of ["nb", "en"] as const) {
  const zip = await buildReportTemplateZip(language);
  await writeFile(join(destination, `syretest-${language}.zip`), zip);
  for (const [name, bytes] of Object.entries(unzipSync(zip))) {
    const path = join(destination, language, name);
    await mkdir(resolve(path, ".."), { recursive: true });
    await writeFile(path, bytes);
  }
}
console.log(`Report templates saved to ${destination}`);
