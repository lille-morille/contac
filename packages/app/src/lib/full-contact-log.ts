export type LogContact = {
  name: string;
  companyName: string;
  email?: string | null;
  phone?: string | null;
  description?: string | null;
};
export type LogActivity = {
  id: string;
  kind: "phone" | "missed_phone" | "meeting" | "email";
  occurredAt: string;
  summary: string;
  transcript: string;
  missedOutcome: string | null;
  participantNames: string[];
  attachmentNames: string[];
  email?: { fromEmail: string; toEmails: string[]; ccEmails: string[]; subject: string } | null;
};

export function formatFullContactLog(contact: LogContact, activities: LogActivity[]): string {
  const header = [
    `Kontakt: ${contact.name}`,
    `Organisasjon: ${contact.companyName}`,
    contact.email && `E-post: ${contact.email}`,
    contact.phone && `Telefon: ${contact.phone}`,
    contact.description && `Kort beskrivelse: ${contact.description}`,
  ].filter(Boolean);
  const entries = [...new Map(activities.map((activity) => [activity.id, activity])).values()]
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id))
    .map((activity) =>
      [
        `## ${activity.occurredAt} · ${activity.kind === "meeting" ? "Møte" : activity.kind === "phone" ? "Telefonsamtale" : activity.kind === "email" ? "E-post" : "Ubesvart anrop"}`,
        activity.email &&
          `Fra: ${activity.email.fromEmail}\nTil: ${activity.email.toEmails.join(", ")}${activity.email.ccEmails.length ? `\nKopi: ${activity.email.ccEmails.join(", ")}` : ""}\nEmne: ${activity.email.subject}`,
        activity.missedOutcome && `Utfall: ${activity.missedOutcome}`,
        activity.participantNames.length && `Deltakere: ${activity.participantNames.join(", ")}`,
        `Sammendrag/notater:\n${activity.summary || "(ingen)"}`,
        activity.transcript && `Transkripsjon:\n${activity.transcript}`,
        activity.attachmentNames.length && `Vedlegg: ${activity.attachmentNames.join(", ")}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
    );
  return [
    ...header,
    "",
    "# Kontaktlogg",
    "",
    ...entries.flatMap((entry, index) => (index ? ["", "---", "", entry] : [entry])),
  ].join("\n");
}
