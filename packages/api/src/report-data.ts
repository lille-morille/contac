import { buildContactExport, type Database, type ReportContact } from "@contac/core";
import {
  activityContacts,
  activityFiles,
  companies,
  companyDomains,
  contactActivities,
  contactPersonTags,
  contacts,
  domainTags,
  emailActivities,
  memberships,
  organizations,
  personTags,
  profiles,
  workspaceFiles,
} from "@contac/core/db";
import { and, eq, isNull } from "drizzle-orm";

function groupBy<Row, Key extends string>(rows: Row[], key: (row: Row) => Key) {
  const result = new Map<Key, Row[]>();
  for (const row of rows) {
    const groupKey = key(row);
    const group = result.get(groupKey) ?? [];
    group.push(row);
    result.set(groupKey, group);
  }
  return result;
}

export async function loadReportSnapshot(db: Database, orgId: string) {
  const [
    teamRows,
    contactRows,
    companyRows,
    tagRows,
    contactTagRows,
    domainRows,
    companyDomainRows,
    activityRows,
    linkRows,
    attachmentRows,
    emailRows,
    profileRows,
  ] = await Promise.all([
    db
      .select({ id: organizations.id, name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, orgId)),
    db
      .select()
      .from(contacts)
      .where(and(eq(contacts.orgId, orgId), isNull(contacts.deletedAt))),
    db.select().from(companies).where(eq(companies.orgId, orgId)),
    db.select().from(personTags).where(eq(personTags.orgId, orgId)),
    db.select().from(contactPersonTags).where(eq(contactPersonTags.orgId, orgId)),
    db.select().from(domainTags).where(eq(domainTags.orgId, orgId)),
    db.select().from(companyDomains).where(eq(companyDomains.orgId, orgId)),
    db.select().from(contactActivities).where(eq(contactActivities.orgId, orgId)),
    db.select().from(activityContacts).where(eq(activityContacts.orgId, orgId)),
    db
      .select({
        activityId: activityFiles.activityId,
        id: workspaceFiles.id,
        name: workspaceFiles.name,
        mimeType: workspaceFiles.mimeType,
        sizeBytes: workspaceFiles.sizeBytes,
      })
      .from(activityFiles)
      .innerJoin(workspaceFiles, eq(workspaceFiles.id, activityFiles.fileId))
      .where(eq(activityFiles.orgId, orgId)),
    db.select().from(emailActivities).where(eq(emailActivities.orgId, orgId)),
    db
      .select({ id: profiles.id, name: profiles.fullName })
      .from(memberships)
      .innerJoin(profiles, eq(profiles.id, memberships.userId))
      .where(and(eq(memberships.orgId, orgId), eq(memberships.isActualMember, true))),
  ]);
  const team = teamRows[0];
  if (!team) return null;
  const companiesById = new Map(companyRows.map((row) => [row.id, row]));
  const tagsById = new Map(tagRows.map((row) => [row.id, row]));
  const domainsById = new Map(domainRows.map((row) => [row.id, row]));
  const namesById = new Map(profileRows.map((row) => [row.id, row.name]));
  const contactTagsById = groupBy(contactTagRows, (row) => row.contactId);
  const companyDomainsById = groupBy(companyDomainRows, (row) => row.companyId);
  const linksByActivity = groupBy(linkRows, (row) => row.activityId);
  const attachmentsByActivity = groupBy(attachmentRows, (row) => row.activityId);
  const emailsByActivity = new Map(emailRows.map((row) => [row.activityId, row]));

  const result = buildContactExport({
    team,
    contacts: contactRows.map((person) => ({
      id: person.id,
      contactNumber: person.contactNumber,
      name: person.name,
      status: person.status,
      companyId: person.companyId,
      companyName: companiesById.get(person.companyId)?.name ?? "",
      email: person.email,
      phone: person.phone,
      description: person.description,
      assigneeId: person.assigneeId,
      personTags: (contactTagsById.get(person.id) ?? [])
        .map((link) => tagsById.get(link.tagId)?.name)
        .filter((name): name is string => !!name),
      domains: (companyDomainsById.get(person.companyId) ?? [])
        .map((link) => domainsById.get(link.domainId)?.name)
        .filter((name): name is string => !!name),
    })),
    activities: activityRows.map((activity) => {
      const email = emailsByActivity.get(activity.id);
      return {
        id: activity.id,
        kind: activity.kind,
        occurredAt: activity.occurredAt.toISOString(),
        createdAt: activity.createdAt.toISOString(),
        updatedAt: activity.updatedAt.toISOString(),
        createdBy: activity.createdBy,
        exportOwnerContactId: activity.exportOwnerContactId,
        linkedContactIds: (linksByActivity.get(activity.id) ?? []).map((link) => link.contactId),
        summary: activity.summary,
        transcript: activity.transcript,
        missedOutcome: activity.missedOutcome,
        email: email
          ? {
              from: email.fromEmail,
              to: email.toEmails,
              cc: email.ccEmails,
              bcc: email.bccEmails,
              subject: email.subject,
            }
          : null,
        attachments: (attachmentsByActivity.get(activity.id) ?? []).map(
          ({ id, name, mimeType, sizeBytes }) => ({ id, name, mimeType, sizeBytes }),
        ),
      };
    }),
  });
  const sourceById = new Map(contactRows.map((row) => [row.id, row]));
  const reportContacts: ReportContact[] = result.contacts.map((person) => ({
    ...person,
    stikkord: sourceById.get(person.id)?.stikkord ?? null,
    assigneeName: person.assigneeId ? (namesById.get(person.assigneeId) ?? null) : null,
  }));
  const originalOwnerByActivity = new Map(
    activityRows.map((row) => [row.id, row.exportOwnerContactId]),
  );
  const reportActivities = result.activities.map((activity) => ({
    ...activity,
    exportOwnerContactId: originalOwnerByActivity.get(activity.id) ?? null,
  }));
  return { reportContacts, reportActivities };
}
