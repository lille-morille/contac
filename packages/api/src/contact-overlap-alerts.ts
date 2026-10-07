import { contactsOverlap, type OverlapContact } from "@contac/core";

export type OverlapAlertContact = OverlapContact & {
  id: string;
  orgId: string;
  classId: string;
  name: string;
  teamName: string;
  status: string;
  assigneeId: string | null;
};

export type OverlapAlert = {
  contactId: string;
  contactName: string;
  otherContactId: string;
  otherTeamName: string;
  otherStatus: string;
};

export function buildContactOverlapAlerts(
  contacts: OverlapAlertContact[],
  orgId: string,
  userId: string,
  dismissals: { contactId: string; otherContactId: string }[] = [],
): OverlapAlert[] {
  const dismissed = new Set(dismissals.map((row) => `${row.contactId}:${row.otherContactId}`));
  const own = contacts.filter(
    (contact) =>
      contact.orgId === orgId &&
      contact.status !== "duplicate" &&
      (!contact.assigneeId || contact.assigneeId === userId),
  );
  const others = contacts.filter(
    (contact) => contact.orgId !== orgId && contact.status !== "duplicate",
  );
  return own.flatMap((contact) =>
    others
      .filter(
        (other) =>
          other.classId === contact.classId &&
          !dismissed.has(`${contact.id}:${other.id}`) &&
          contactsOverlap(contact, other),
      )
      .map((other) => ({
        contactId: contact.id,
        contactName: contact.name,
        otherContactId: other.id,
        otherTeamName: other.teamName,
        otherStatus: other.status,
      })),
  );
}
