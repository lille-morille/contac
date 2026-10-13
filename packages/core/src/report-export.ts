import { z } from "zod";
import type { ExportActivity, ExportContact } from "./contact-export.ts";

export const reportColumnIds = [
  "number",
  "assignee",
  "organization",
  "name",
  "contactInfo",
  "status",
  "relevance",
  "description",
  "sammendrag",
  "personTags",
  "domains",
  "stikkord",
] as const;
export type ReportColumnId = (typeof reportColumnIds)[number];
export const reportColumnLabels: Record<ReportColumnId, string> = {
  number: "Nr.",
  assignee: "Ansvarlig",
  organization: "Selskap",
  name: "Kontaktperson",
  contactInfo: "Kontaktinfo",
  status: "Status",
  relevance: "Relevans",
  description: "Kort beskrivelse",
  sammendrag: "Sammendrag",
  personTags: "Personmerker",
  domains: "Domener",
  stikkord: "Key takeaways",
};
export const contactRelevanceValues = ["low", "medium", "high"] as const;
export type ContactRelevance = (typeof contactRelevanceValues)[number];
export const reportSectionModes = [
  "activity",
  "company_status",
  "contact_status",
  "custom",
] as const;
export const reportSortModes = ["relevance", "status", "alphabetical"] as const;
export const reportFormats = ["typst", "latex", "csv"] as const;
export type ReportFormat = (typeof reportFormats)[number];

export const defaultReportSettings = {
  format: "typst",
  title: "Kontaktlogg",
  subtitle: "",
  columns: [
    "number",
    "assignee",
    "organization",
    "name",
    "contactInfo",
    "status",
    "sammendrag",
    "stikkord",
  ],
  excludedContactIds: [],
  orderMode: "default",
  contactOrder: [],
  sectionMode: "activity",
  sortMode: "relevance",
  customSections: [],
  customAssignments: {},
} as const satisfies {
  format: ReportFormat;
  title: string;
  subtitle: string;
  columns: readonly ReportColumnId[];
  excludedContactIds: readonly string[];
  orderMode: "default" | "manual";
  contactOrder: readonly string[];
  sectionMode: (typeof reportSectionModes)[number];
  sortMode: (typeof reportSortModes)[number];
  customSections: readonly { id: string; title: string }[];
  customAssignments: Record<string, string>;
};

export const reportSettingsSchema = z
  .object({
    format: z.enum(reportFormats),
    title: z.string().trim().min(1).max(160),
    subtitle: z.string().max(300),
    columns: z
      .array(z.enum([...reportColumnIds, "log"]))
      .min(2)
      .max(reportColumnIds.length + 1)
      .transform(
        (columns) =>
          [
            ...new Set(columns.map((column) => (column === "log" ? "sammendrag" : column))),
          ] as ReportColumnId[],
      ),
    excludedContactIds: z.array(z.uuid()).max(10000),
    orderMode: z.enum(["default", "manual"]),
    contactOrder: z.array(z.uuid()).max(10000),
    sectionMode: z.enum(reportSectionModes).default("activity"),
    sortMode: z.enum(reportSortModes).default("relevance"),
    customSections: z
      .array(z.object({ id: z.uuid(), title: z.string().trim().min(1).max(100) }))
      .max(100)
      .default([]),
    customAssignments: z.record(z.uuid(), z.uuid()).default({}),
  })
  .superRefine((value, context) => {
    if (value.columns[0] !== "number" || !value.columns.includes("name")) {
      context.addIssue({
        code: "custom",
        message: "Nummer må stå først, og kontaktperson må være med.",
      });
    }
    for (const [label, values] of [
      ["columns", value.columns],
      ["excludedContactIds", value.excludedContactIds],
      ["contactOrder", value.contactOrder],
    ] as const) {
      if (new Set(values).size !== values.length)
        context.addIssue({ code: "custom", message: `Duplikat i ${label}.` });
    }
    if (
      new Set(value.customSections.map((section) => section.id)).size !==
      value.customSections.length
    )
      context.addIssue({ code: "custom", message: "Duplikat i seksjoner." });
  });
export type ReportSettings = z.infer<typeof reportSettingsSchema>;

export type ReportContact = ExportContact & {
  sammendrag: string | null;
  stikkord: string | null;
  relevance?: ContactRelevance | null;
  companyStatus?: string;
  assigneeName: string | null;
};
export type ReportPersonRef = { id: string; number: number; name: string };
export type ReportEntry = {
  kind: "full" | "reference";
  activity: ExportActivity;
  owner: ReportPersonRef;
  participants: ReportPersonRef[];
};
export type ReportRow = {
  contact: ReportContact;
  exportNumber: number;
  hasActivity: boolean;
  entries: ReportEntry[];
};
export type ReportData = {
  settings: ReportSettings;
  sections: ReportSection[];
  rows: ReportRow[];
  noActivityRows: ReportRow[];
};
export type ReportSection = { id: string; title: string; rows: ReportRow[] };

const statusRank: Record<string, number> = {
  kan_kontaktes_igjen: 0,
  avsluttet: 1,
  follow_up: 2,
  venter_pa_svar: 3,
  skal_ringe: 4,
  ikke_kontaktet: 5,
  ikke_kontakt_igjen: 6,
};
const statusLabels: Record<string, string> = {
  kan_kontaktes_igjen: "Kan kontaktes igjen",
  avsluttet: "Avsluttet",
  follow_up: "Follow up / Ring igjen",
  venter_pa_svar: "Venter på svar",
  skal_ringe: "Skal ringe",
  ikke_kontaktet: "Ikke kontaktet",
  ikke_kontakt_igjen: "Ikke kontakt igjen",
};
const companyStatusLabels: Record<string, string> = {
  ingen: "Ingen selskapsstatus",
  kunde: "Kunde",
  konkurrent: "Konkurrent",
  samarbeidspartner: "Samarbeidspartner",
  ekspert: "Ekspert",
};
const companyStatusOrder = ["kunde", "ekspert", "samarbeidspartner", "konkurrent", "ingen"];
const relevanceRank: Record<string, number> = { high: 0, medium: 1, low: 2 };

export function reportSectionForContact(
  contact: Pick<ReportContact, "id" | "status" | "companyStatus">,
  hasActivity: boolean,
  settings: ReportSettings,
): { id: string; title: string; rank: number } {
  if (settings.sectionMode === "activity")
    return hasActivity
      ? { id: "activity", title: "Kontakter med aktivitet", rank: 0 }
      : { id: "no-activity", title: "Uten aktivitet", rank: 1 };
  if (settings.sectionMode === "contact_status")
    return {
      id: `status:${contact.status}`,
      title: statusLabels[contact.status] ?? contact.status,
      rank: statusRank[contact.status] ?? 99,
    };
  if (settings.sectionMode === "company_status") {
    const status = contact.companyStatus ?? "ingen";
    return {
      id: `company:${status}`,
      title: companyStatusLabels[status] ?? status,
      rank: companyStatusOrder.indexOf(status) < 0 ? 99 : companyStatusOrder.indexOf(status),
    };
  }
  const id = settings.customAssignments[contact.id];
  const index = settings.customSections.findIndex((section) => section.id === id);
  return index < 0
    ? {
        id: "unassigned",
        title: "Uten seksjon",
        rank: settings.customSections.length,
      }
    : { id: id!, title: settings.customSections[index]!.title, rank: index };
}

export function compareReportContacts(
  a: Pick<ReportContact, "name" | "status" | "relevance" | "contactNumber">,
  b: Pick<ReportContact, "name" | "status" | "relevance" | "contactNumber">,
  sortMode: ReportSettings["sortMode"],
) {
  const relevance =
    (relevanceRank[a.relevance ?? ""] ?? 3) - (relevanceRank[b.relevance ?? ""] ?? 3);
  const status = (statusRank[a.status] ?? 99) - (statusRank[b.status] ?? 99);
  const name = a.name.localeCompare(b.name, "nb") || a.contactNumber - b.contactNumber;
  return sortMode === "alphabetical"
    ? name
    : sortMode === "status"
      ? status || relevance || name
      : relevance || status || name;
}

export function orderedReportContacts(
  contacts: ReportContact[],
  activities: ExportActivity[],
  settings: ReportSettings,
): ReportContact[] {
  const linked = new Set(activities.flatMap((activity) => activity.linkedContactIds));
  const manual = new Map(settings.contactOrder.map((id, index) => [id, index]));
  return [...contacts].sort((a, b) => {
    const aSection = reportSectionForContact(a, linked.has(a.id), settings);
    const bSection = reportSectionForContact(b, linked.has(b.id), settings);
    if (aSection.rank !== bSection.rank) return aSection.rank - bSection.rank;
    if (settings.orderMode === "manual") {
      const aIndex = manual.get(a.id);
      const bIndex = manual.get(b.id);
      if (aIndex !== undefined && bIndex !== undefined) return aIndex - bIndex;
      if (aIndex !== undefined) return -1;
      if (bIndex !== undefined) return 1;
    }
    return compareReportContacts(a, b, settings.sortMode);
  });
}

export function reportExportNumbers(
  orderedContacts: readonly { id: string }[],
  excludedContactIds: ReadonlySet<string>,
): Map<string, number> {
  const numbers = new Map<string, number>();
  for (const contact of orderedContacts)
    if (!excludedContactIds.has(contact.id)) numbers.set(contact.id, numbers.size + 1);
  return numbers;
}

export function buildReportData(input: {
  contacts: ReportContact[];
  activities: ExportActivity[];
  settings: ReportSettings;
}): ReportData {
  const validContacts = input.contacts.filter((contact) => contact.status !== "duplicate");
  const allById = new Map(validContacts.map((contact) => [contact.id, contact]));
  const excluded = new Set(input.settings.excludedContactIds);
  const orderedAll = orderedReportContacts(validContacts, input.activities, input.settings);
  const exportNumbers = reportExportNumbers(orderedAll, excluded);
  const ordered = orderedAll.filter((contact) => !excluded.has(contact.id));
  const selectedIds = new Set(ordered.map((contact) => contact.id));
  const reportOrder = new Map(ordered.map((contact, index) => [contact.id, index]));
  const entries = new Map(ordered.map((contact) => [contact.id, [] as ReportEntry[]]));
  const linked = new Set(input.activities.flatMap((activity) => activity.linkedContactIds));
  const personRef = (id: string): ReportPersonRef => {
    const person = allById.get(id)!;
    return { id, number: person.contactNumber, name: person.name };
  };

  for (const activity of input.activities) {
    const selectedLinks = activity.linkedContactIds
      .filter((id) => selectedIds.has(id))
      .sort((a, b) => reportOrder.get(a)! - reportOrder.get(b)!);
    if (!selectedLinks.length) continue;
    const ownerId =
      activity.exportOwnerContactId &&
      selectedIds.has(activity.exportOwnerContactId) &&
      selectedLinks.includes(activity.exportOwnerContactId)
        ? activity.exportOwnerContactId
        : selectedLinks[0]!;
    const participants = [...new Set(activity.linkedContactIds)]
      .filter((id) => allById.has(id))
      .map(personRef);
    for (const id of selectedLinks) {
      entries.get(id)!.push({
        kind: id === ownerId ? "full" : "reference",
        activity,
        owner: personRef(ownerId),
        participants,
      });
    }
  }
  const rows = ordered.map((contact) => ({
    contact,
    exportNumber: exportNumbers.get(contact.id)!,
    hasActivity: linked.has(contact.id),
    entries: (entries.get(contact.id) ?? []).sort(
      (a, b) =>
        a.activity.occurredAt.localeCompare(b.activity.occurredAt) ||
        a.activity.id.localeCompare(b.activity.id),
    ),
  }));
  const sectionMap = new Map<string, ReportSection>();
  for (const row of rows) {
    const section = reportSectionForContact(row.contact, row.hasActivity, input.settings);
    const group = sectionMap.get(section.id) ?? {
      id: section.id,
      title: section.title,
      rows: [],
    };
    group.rows.push(row);
    sectionMap.set(section.id, group);
  }
  return {
    settings: input.settings,
    sections: [...sectionMap.values()],
    rows: rows.filter((row) => row.hasActivity),
    noActivityRows: rows.filter((row) => !row.hasActivity),
  };
}
