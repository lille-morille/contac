import { z } from "zod";
import type { ExportActivity, ExportContact } from "./contact-export.ts";

export const reportColumnIds = [
  "number",
  "assignee",
  "organization",
  "name",
  "contactInfo",
  "status",
  "description",
  "personTags",
  "domains",
  "stikkord",
  "log",
] as const;
export type ReportColumnId = (typeof reportColumnIds)[number];
export const reportColumnLabels: Record<ReportColumnId, string> = {
  number: "Nr.",
  assignee: "Ansvarlig",
  organization: "Selskap",
  name: "Kontaktperson",
  contactInfo: "Kontaktinfo",
  status: "Status",
  description: "Kort beskrivelse",
  personTags: "Personmerker",
  domains: "Domener",
  stikkord: "Stikkord",
  log: "Logg",
};
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
    "stikkord",
    "log",
  ],
  excludedContactIds: [],
  orderMode: "default",
  contactOrder: [],
} as const satisfies {
  format: ReportFormat;
  title: string;
  subtitle: string;
  columns: readonly ReportColumnId[];
  excludedContactIds: readonly string[];
  orderMode: "default" | "manual";
  contactOrder: readonly string[];
};

export const reportSettingsSchema = z
  .object({
    format: z.enum(reportFormats),
    title: z.string().trim().min(1).max(160),
    subtitle: z.string().max(300),
    columns: z.array(z.enum(reportColumnIds)).min(2).max(reportColumnIds.length),
    excludedContactIds: z.array(z.uuid()).max(10000),
    orderMode: z.enum(["default", "manual"]),
    contactOrder: z.array(z.uuid()).max(10000),
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
  });
export type ReportSettings = z.infer<typeof reportSettingsSchema>;

export type ReportContact = ExportContact & {
  stikkord: string | null;
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
  hasActivity: boolean;
  entries: ReportEntry[];
};
export type ReportData = {
  settings: ReportSettings;
  rows: ReportRow[];
  noActivityRows: ReportRow[];
};

const statusRank: Record<string, number> = {
  kan_kontaktes_igjen: 0,
  avsluttet: 1,
  follow_up: 2,
  venter_pa_svar: 3,
  skal_ringe: 4,
  ikke_kontaktet: 5,
  ikke_kontakt_igjen: 6,
};

export function orderedReportContacts(
  contacts: ReportContact[],
  activities: ExportActivity[],
  settings: ReportSettings,
): ReportContact[] {
  const linked = new Set(activities.flatMap((activity) => activity.linkedContactIds));
  const manual = new Map(settings.contactOrder.map((id, index) => [id, index]));
  const defaultCompare = (a: ReportContact, b: ReportContact) =>
    (statusRank[a.status] ?? 99) - (statusRank[b.status] ?? 99) ||
    a.name.localeCompare(b.name, "nb") ||
    a.contactNumber - b.contactNumber;
  return [...contacts].sort((a, b) => {
    const section = Number(linked.has(b.id)) - Number(linked.has(a.id));
    if (section) return section;
    if (settings.orderMode === "manual") {
      const aIndex = manual.get(a.id);
      const bIndex = manual.get(b.id);
      if (aIndex !== undefined && bIndex !== undefined) return aIndex - bIndex;
      if (aIndex !== undefined) return -1;
      if (bIndex !== undefined) return 1;
    }
    return defaultCompare(a, b);
  });
}

export function buildReportData(input: {
  contacts: ReportContact[];
  activities: ExportActivity[];
  settings: ReportSettings;
}): ReportData {
  const validContacts = input.contacts.filter((contact) => contact.status !== "duplicate");
  const allById = new Map(validContacts.map((contact) => [contact.id, contact]));
  const excluded = new Set(input.settings.excludedContactIds);
  const ordered = orderedReportContacts(validContacts, input.activities, input.settings).filter(
    (contact) => !excluded.has(contact.id),
  );
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
    hasActivity: linked.has(contact.id),
    entries: (entries.get(contact.id) ?? []).sort(
      (a, b) =>
        a.activity.occurredAt.localeCompare(b.activity.occurredAt) ||
        a.activity.id.localeCompare(b.activity.id),
    ),
  }));
  return {
    settings: input.settings,
    rows: rows.filter((row) => row.hasActivity),
    noActivityRows: rows.filter((row) => !row.hasActivity),
  };
}
