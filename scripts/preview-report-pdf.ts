import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  buildReportData,
  defaultReportSettings,
  reportSettingsSchema,
  type ExportActivity,
  type ReportContact,
} from "../packages/core/src/index.ts";
import { contactReportSettings, createDb, organizations } from "../packages/core/src/db/index.ts";
import { loadReportSnapshot } from "../packages/api/src/report-data.ts";
import { renderReportTypst } from "../packages/api/src/report-renderers.ts";

const outputDir = join(import.meta.dirname, "../output/export-preview");
const sourcePath = join(outputDir, "kontaktlogg.typ");
const pdfPath = join(outputDir, "kontaktlogg.pdf");
const id = (number: number) => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;

function fixture(
  sectionMode: "activity" | "company_status" | "contact_status" | "custom" = "company_status",
) {
  const settings = reportSettingsSchema.parse({
    ...defaultReportSettings,
    title: "Kontaktlogg · designprøve",
    subtitle: "Eksempeldata for rask gjennomgang av Typst-utformingen",
    sectionMode,
    customSections: [
      { id: id(81), title: "Viktige samtaler" },
      { id: id(82), title: "Videre oppfølging" },
    ],
    customAssignments: { [id(1)]: id(81), [id(3)]: id(81), [id(2)]: id(82) },
    columns: [
      "number",
      "assignee",
      "organization",
      "name",
      "contactInfo",
      "status",
      "relevance",
      "description",
      "sammendrag",
      "stikkord",
    ],
  });
  const contacts: ReportContact[] = [
    {
      id: id(1),
      contactNumber: 1,
      name: "Ingrid Solberg",
      status: "kan_kontaktes_igjen",
      relevance: "high",
      companyStatus: "kunde",
      companyId: id(71),
      companyName: "Havstrøm AS",
      email: "ingrid@example.no",
      phone: "+47 400 00 001",
      description: "Driftsleder med ansvar for kvalitet og innkjøp",
      assigneeId: id(91),
      assigneeName: "Maja",
      personTags: ["Beslutningstaker"],
      domains: ["Havbruk"],
      sammendrag: "Kvalitetskontroll og sporbarhet ble pekt på som sentrale behov.",
      stikkord:
        "- Sporbarhet er viktig ved leverandørvalg.\n- Manuelle kvalitetsrutiner tar tid.\n- Teamet kan følge opp med en konkret arbeidsflyt.",
    },
    {
      id: id(2),
      contactNumber: 2,
      name: "Jonas Vik",
      status: "follow_up",
      relevance: "medium",
      companyStatus: "kunde",
      companyId: id(72),
      companyName: "Nordlys Teknologi",
      email: "jonas@example.no",
      phone: null,
      description: "Produktsjef for digitale verktøy",
      assigneeId: id(92),
      assigneeName: "Emil",
      personTags: ["Fagekspert"],
      domains: ["Programvare"],
      sammendrag: "Integrasjoner og opplæring ble diskutert i et felles møte.",
      stikkord:
        "- Eksisterende systemer må kunne kobles sammen.\n- En enkel pilot er mer nyttig enn en omfattende anskaffelse.\n- Opplæring bør være kort og praktisk.",
    },
    {
      id: id(3),
      contactNumber: 3,
      name: "Sara Nilsen",
      status: "avsluttet",
      relevance: "high",
      companyStatus: "ekspert",
      companyId: id(73),
      companyName: "Fjord Analyse",
      email: null,
      phone: "+47 400 00 003",
      description: "Analytiker innen klima- og miljødata",
      assigneeId: null,
      assigneeName: null,
      personTags: [],
      domains: ["Analyse"],
      sammendrag: "Samtalen avklarte datakvalitet og prioriteringer.",
      stikkord:
        "- Datakvaliteten varierer mellom kilder.\n- Behovet er foreløpig avklart.\n- Ingen umiddelbar oppfølging.",
    },
    {
      id: id(4),
      contactNumber: 4,
      name: "Tobias Berg",
      status: "ikke_kontaktet",
      relevance: null,
      companyStatus: "ingen",
      companyId: id(74),
      companyName: "Vestland Logistikk",
      email: "tobias@example.no",
      phone: null,
      description: "Logistikksjef",
      assigneeId: null,
      assigneeName: null,
      personTags: [],
      domains: ["Logistikk"],
      sammendrag: null,
      stikkord: null,
    },
  ];
  const activity = (
    number: number,
    owner: number,
    linked: number[],
    kind: ExportActivity["kind"],
    occurredAt: string,
    summary: string,
  ): ExportActivity => ({
    id: id(number),
    kind,
    occurredAt,
    createdAt: occurredAt,
    updatedAt: occurredAt,
    createdBy: id(90),
    exportOwnerContactId: id(owner),
    linkedContactIds: linked.map(id),
    summary,
    transcript: "Transkripsjonen er intern og skal ikke vises i eksporten.",
    missedOutcome: null,
    email: null,
    attachments: [],
  });
  const activities: ExportActivity[] = [
    activity(
      31,
      1,
      [1],
      "phone",
      "2026-10-02T09:30:00.000Z",
      "Ingrid beskrev dagens kvalitetskontroll. Teamet registrerer avvik manuelt og bruker mye tid på å finne igjen dokumentasjon ved leverandørbytte. Hun ønsket en enkel oversikt over hvem som har godkjent hvert steg.",
    ),
    activity(
      32,
      1,
      [1, 2],
      "meeting",
      "2026-10-05T12:00:00.000Z",
      "Felles møte med Ingrid og Jonas. Integrasjon mot eksisterende systemer ble vurdert som nødvendig for en pilot. De foreslo å teste én arbeidsflyt først, med tydelige målepunkter for tid spart og færre manuelle feil.",
    ),
    activity(
      33,
      3,
      [3],
      "phone",
      "2026-10-07T08:15:00.000Z",
      "Sara forklarte at datakvaliteten varierer mellom kilder. Et nytt verktøy må vise usikkerheten tydelig og gjøre det mulig å spore tall tilbake til opprinnelig datasett. Samtalen avklarte også at de ikke planlegger en anskaffelse dette semesteret.",
    ),
  ];
  return buildReportData({ contacts, activities, settings });
}

async function localReport(teamId?: string) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL mangler. Last inn lokal .env.");
  const host = new URL(databaseUrl).hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(host))
    throw new Error("PDF-forhåndsvisning tillater bare lokal database.");
  const { db, client } = createDb(databaseUrl, 1);
  try {
    const [teams, saved] = await Promise.all([
      db.select({ id: organizations.id }).from(organizations),
      db
        .select({ orgId: contactReportSettings.orgId, settings: contactReportSettings.settings })
        .from(contactReportSettings),
    ]);
    const selectedId = teamId ?? (teams.length === 1 ? teams[0]!.id : null);
    if (!selectedId) throw new Error(`Fant ${teams.length} lokale team. Velg ett med --team <id>.`);
    const snapshot = await loadReportSnapshot(db, selectedId);
    if (!snapshot) throw new Error("Fant ikke teamet i den lokale databasen.");
    const current = saved.find((row) => row.orgId === selectedId);
    const parsed = current ? reportSettingsSchema.safeParse(current.settings) : null;
    const settings = parsed?.success
      ? parsed.data
      : reportSettingsSchema.parse(defaultReportSettings);
    return buildReportData({
      contacts: snapshot.reportContacts,
      activities: snapshot.reportActivities,
      settings,
    });
  } finally {
    await client.end();
  }
}

async function compile(output: string, pages?: string) {
  const args = ["compile", sourcePath, output];
  if (pages) args.splice(1, 0, "--pages", pages);
  const result = Bun.spawnSync(["typst", ...args], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0)
    throw new Error(new TextDecoder().decode(result.stderr) || "Typst-kjøringen feilet.");
}

const args = process.argv.slice(2);
const groupModes = ["activity", "company_status", "contact_status", "custom"] as const;
const group =
  args[0] === "--group" && groupModes.includes(args[1] as (typeof groupModes)[number])
    ? (args[1] as (typeof groupModes)[number])
    : null;
if (
  args.length &&
  !(args.length === 1 && args[0] === "--local") &&
  !(args.length === 2 && args[0] === "--team" && /^[0-9a-f-]{36}$/i.test(args[1]!)) &&
  !(args.length === 2 && group)
)
  throw new Error(
    "Bruk: bun run export:pdf [--group activity|company_status|contact_status|custom | --local | --team <lokal-team-id>]",
  );
const report =
  args[0] === "--local" || args[0] === "--team"
    ? await localReport(args[0] === "--team" ? args[1] : undefined)
    : fixture(group ?? undefined);
if (!report.rows.length && !report.noActivityRows.length)
  throw new Error("Eksportoppsettet har ingen inkluderte kontakter.");
await mkdir(outputDir, { recursive: true });
for (const name of await readdir(outputDir))
  if (/^page-\d+\.png$/.test(name)) await unlink(join(outputDir, name));
await writeFile(sourcePath, renderReportTypst(report));
await compile(pdfPath);
await compile(join(outputDir, "page-{0p}.png"));
console.log(`PDF: ${pdfPath}`);
console.log(`Typst: ${sourcePath}`);
console.log(`Pages: ${join(outputDir, "page-*.png")}`);
