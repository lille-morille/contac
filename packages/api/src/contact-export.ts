import { buildContactExport } from "@contac/core";
import {
  activityContacts,
  activityFiles,
  companies,
  companyDomains,
  contactActivities,
  contactPersonTags,
  contacts,
  departments,
  domainTags,
  emailActivities,
  organizations,
  personTags,
  workspaceFiles,
} from "@contac/core/db";
import { and, eq, ne } from "drizzle-orm";
import type { Hono } from "hono";
import { stringify } from "yaml";
import { z } from "zod";
import type { ApiDeps, ApiEnv } from "./types.ts";

const id = z.uuid();

export function registerContactExportRoutes(app: Hono<ApiEnv>, deps: ApiDeps) {
  app.post("/v1/org/activities/:id/export-owner", async (c) => {
    const activityId = id.safeParse(c.req.param("id"));
    const body = z.object({ contactId: id }).safeParse(await c.req.json().catch(() => null));
    if (!activityId.success || !body.success) return c.json({ error: "Invalid export owner" }, 400);
    const orgId = c.get("org").id;
    const [link] = await deps.db
      .select({ contactId: activityContacts.contactId })
      .from(activityContacts)
      .innerJoin(contacts, eq(contacts.id, activityContacts.contactId))
      .where(
        and(
          eq(activityContacts.orgId, orgId),
          eq(activityContacts.activityId, activityId.data),
          eq(activityContacts.contactId, body.data.contactId),
          ne(contacts.status, "duplicate"),
        ),
      );
    if (!link) return c.json({ error: "Choose a linked, active contact" }, 400);
    const [activity] = await deps.db
      .update(contactActivities)
      .set({ exportOwnerContactId: link.contactId, updatedAt: new Date() })
      .where(and(eq(contactActivities.orgId, orgId), eq(contactActivities.id, activityId.data)))
      .returning({
        id: contactActivities.id,
        exportOwnerContactId: contactActivities.exportOwnerContactId,
      });
    return activity ? c.json(activity) : c.json({ error: "Activity not found" }, 404);
  });

  app.get("/v1/org/export/contact-log.yaml", async (c) => {
    const orgId = c.get("org").id;
    const [
      teamRows,
      contactRows,
      companyRows,
      departmentRows,
      tagRows,
      contactTagRows,
      domainRows,
      companyDomainRows,
      activityRows,
      linkRows,
      attachmentRows,
      emailRows,
    ] = await Promise.all([
      deps.db
        .select({ id: organizations.id, name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, orgId)),
      deps.db.select().from(contacts).where(eq(contacts.orgId, orgId)),
      deps.db.select().from(companies).where(eq(companies.orgId, orgId)),
      deps.db.select().from(departments).where(eq(departments.orgId, orgId)),
      deps.db.select().from(personTags).where(eq(personTags.orgId, orgId)),
      deps.db.select().from(contactPersonTags).where(eq(contactPersonTags.orgId, orgId)),
      deps.db.select().from(domainTags).where(eq(domainTags.orgId, orgId)),
      deps.db.select().from(companyDomains).where(eq(companyDomains.orgId, orgId)),
      deps.db.select().from(contactActivities).where(eq(contactActivities.orgId, orgId)),
      deps.db.select().from(activityContacts).where(eq(activityContacts.orgId, orgId)),
      deps.db
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
      deps.db.select().from(emailActivities).where(eq(emailActivities.orgId, orgId)),
    ]);
    const team = teamRows[0];
    if (!team) return c.json({ error: "Team not found" }, 404);
    const result = buildContactExport({
      team,
      contacts: contactRows.map((person) => {
        const company = companyRows.find((row) => row.id === person.companyId);
        return {
          id: person.id,
          name: person.name,
          status: person.status,
          companyId: person.companyId,
          companyName: company?.name ?? "",
          departmentId: person.departmentId,
          departmentName:
            departmentRows.find((row) => row.id === person.departmentId)?.name ?? null,
          position: person.position,
          email: person.email,
          phone: person.phone,
          description: person.description,
          assigneeId: person.assigneeId,
          personTags: contactTagRows
            .filter((link) => link.contactId === person.id)
            .map((link) => tagRows.find((tag) => tag.id === link.tagId)?.name)
            .filter((name): name is string => !!name),
          domains: companyDomainRows
            .filter((link) => link.companyId === person.companyId)
            .map((link) => domainRows.find((domain) => domain.id === link.domainId)?.name)
            .filter((name): name is string => !!name),
        };
      }),
      activities: activityRows.map((activity) => {
        const email = emailRows.find((row) => row.activityId === activity.id);
        return {
          id: activity.id,
          kind: activity.kind,
          occurredAt: activity.occurredAt.toISOString(),
          createdAt: activity.createdAt.toISOString(),
          updatedAt: activity.updatedAt.toISOString(),
          createdBy: activity.createdBy,
          exportOwnerContactId: activity.exportOwnerContactId,
          linkedContactIds: linkRows
            .filter((link) => link.activityId === activity.id)
            .map((link) => link.contactId),
          summary: activity.summary,
          transcript: activity.transcript,
          missedOutcome: activity.missedOutcome,
          allowExternalAiOverride: activity.allowExternalAiOverride,
          email: email
            ? {
                from: email.fromEmail,
                to: email.toEmails,
                cc: email.ccEmails,
                bcc: email.bccEmails,
                subject: email.subject,
              }
            : null,
          attachments: attachmentRows
            .filter((file) => file.activityId === activity.id)
            .map(({ id, name, mimeType, sizeBytes }) => ({ id, name, mimeType, sizeBytes })),
        };
      }),
    });
    c.header("Content-Type", "application/yaml; charset=utf-8");
    c.header("Content-Disposition", 'attachment; filename="kontaktlogg.yaml"');
    c.header("Cache-Control", "no-store");
    return c.body(stringify(result, { lineWidth: 0 }));
  });
}
