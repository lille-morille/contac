export type ExportContact = {
  id: string;
  contactNumber: number;
  name: string;
  status: string;
  companyId: string;
  companyName: string;
  email: string | null;
  phone: string | null;
  description: string | null;
  assigneeId: string | null;
  personTags: string[];
  domains: string[];
};

export type ExportActivity = {
  id: string;
  kind: "phone" | "missed_phone" | "meeting" | "email";
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  exportOwnerContactId: string | null;
  linkedContactIds: string[];
  summary: string;
  transcript: string;
  missedOutcome: string | null;
  allowExternalAiOverride: boolean | null;
  email: {
    from: string;
    to: string[];
    cc: string[];
    bcc: string[];
    subject: string;
  } | null;
  attachments: { id: string; name: string; mimeType: string; sizeBytes: number }[];
};

export function buildContactExport(input: {
  team: { id: string; name: string };
  contacts: ExportContact[];
  activities: ExportActivity[];
}) {
  const contacts = input.contacts
    .filter((contact) => contact.status !== "duplicate")
    .map((contact) => ({
      ...contact,
      personTags: [...new Set(contact.personTags)].sort((a, b) => a.localeCompare(b, "nb")),
      domains: [...new Set(contact.domains)].sort((a, b) => a.localeCompare(b, "nb")),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "nb") || a.id.localeCompare(b.id));
  const validIds = new Set(contacts.map((contact) => contact.id));
  const activities = [...new Map(input.activities.map((item) => [item.id, item])).values()]
    .map((activity) => {
      const linkedContactIds = [...new Set(activity.linkedContactIds)]
        .filter((id) => validIds.has(id))
        .sort();
      if (!linkedContactIds.length) return null;
      const exportOwnerContactId =
        activity.exportOwnerContactId && linkedContactIds.includes(activity.exportOwnerContactId)
          ? activity.exportOwnerContactId
          : linkedContactIds[0]!;
      return {
        ...activity,
        exportOwnerContactId,
        linkedContactIds,
        attachments: [...activity.attachments].sort((a, b) => a.id.localeCompare(b.id)),
      };
    })
    .filter((activity): activity is NonNullable<typeof activity> => !!activity)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id));
  return { schemaVersion: 1, team: input.team, contacts, activities };
}
