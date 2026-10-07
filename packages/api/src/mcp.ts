import { CONTACT_DESCRIPTION_MAX_LENGTH } from "@contac/core";
import {
  activityContacts,
  activityFiles,
  aiEditLog,
  companies,
  companyDomains,
  contactActivities,
  contactAdditionalInfo,
  contactPersonTags,
  collabDocuments,
  contacts,
  domainTags,
  emailActivities,
  libraryItems,
  memberships,
  organizations,
  personTags,
  mcpUserConnections,
  profiles,
  workspaceFiles,
} from "@contac/core/db";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { and, asc, desc, eq, gt, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import type { Context, Hono } from "hono";
import { z } from "zod";
import * as Y from "yjs";
import { runContactAutomations } from "./ai.ts";
import {
  authorizeMcpOauth,
  hasTeamAccess,
  mcpOauthChallenge,
  mcpOauthToolMeta,
  registerMcpOauthRoutes,
  type McpIdentity,
} from "./mcp-oauth.ts";
import type { ApiDeps, ApiEnv } from "./types.ts";

const uuid = z.uuid();
const normalize = (value: string) =>
  value.trim().normalize("NFKC").toLocaleLowerCase("nb-NO").replace(/\s+/g, " ");
const phoneKey = (value: string | null | undefined) => {
  const digits = value?.replace(/\D/g, "") ?? "";
  return (digits.length === 10 && digits.startsWith("47") ? digits.slice(2) : digits) || null;
};
const page = z.object({
  expectedTeamId: uuid,
  cursor: uuid.optional(),
  limit: z.number().int().min(1).max(100).default(50),
});
const contactStatus = z.enum([
  "ikke_kontaktet",
  "avsluttet",
  "kan_kontaktes_igjen",
  "skal_ringe",
  "venter_pa_svar",
  "follow_up",
  "ikke_kontakt_igjen",
]);
const additionalInfoGuidance =
  "Tilleggsinformasjon (Markdown): add useful context beyond Kort beskrivelse, such as evidence-backed relevance, a natural conversation opener, and 2–4 specific questions the team could ask this person. Separate known facts from suggested questions or hypotheses. Do not repeat the short description or invent facts; omit sections without useful evidence.";
const contactCreateFields = z.object({
  name: z.string().trim().min(1).max(200),
  companyId: uuid.optional(),
  companyName: z.string().trim().min(1).max(200).optional(),
  email: z.email().optional(),
  phone: z.string().trim().max(200).optional(),
  description: z
    .string()
    .max(CONTACT_DESCRIPTION_MAX_LENGTH)
    .describe(
      `Kort beskrivelse: a concise, evidence-based Norwegian phrase; max ${CONTACT_DESCRIPTION_MAX_LENGTH} characters`,
    )
    .optional(),
  additionalInfo: z.string().trim().min(1).max(20000).describe(additionalInfoGuidance).optional(),
  status: contactStatus
    .describe(
      "Initial workflow status; defaults to ikke_kontaktet. Duplicate is not a creation status.",
    )
    .optional(),
  assigneeId: uuid
    .describe(
      "ID of a member of this team. If omitted with a nondefault status, the connected user becomes the assignee.",
    )
    .optional(),
  tagIds: z.array(uuid).max(30).optional(),
});
const hasOrganization = (input: { companyId?: string; companyName?: string }) =>
  !!(input.companyId || input.companyName);
const contactCreateInput = contactCreateFields
  .extend({ expectedTeamId: uuid })
  .refine(hasOrganization, "Company ID or name is required");
const batchContactInput = contactCreateFields.refine(
  hasOrganization,
  "Company ID or name is required",
);
const contactUpdateInput = z
  .object({
    expectedTeamId: uuid,
    contactId: uuid,
    expectedUpdatedAt: z.iso.datetime(),
    name: z.string().trim().min(1).max(200).optional(),
    companyId: uuid.optional(),
    email: z.union([z.email(), z.literal(""), z.null()]).optional(),
    phone: z.string().trim().max(200).nullable().optional(),
    description: z.string().max(CONTACT_DESCRIPTION_MAX_LENGTH).nullable().optional(),
    stikkord: z.string().trim().max(300).nullable().optional(),
    status: contactStatus.optional(),
    assigneeId: uuid.nullable().optional(),
    allowExternalAi: z.boolean().optional(),
    tagIds: z.array(uuid).max(30).optional(),
    sharedNote: z.string().max(50000).optional(),
    additionalInfo: z
      .object({
        entryId: uuid,
        expectedMarkdown: z.string(),
        markdown: z.string().trim().min(1).max(20000),
      })
      .optional(),
  })
  .refine(
    (input) =>
      Object.keys(input).some(
        (key) => !["expectedTeamId", "contactId", "expectedUpdatedAt"].includes(key),
      ),
    "Provide at least one contact field to change",
  );
const result = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value) }],
});
const failed = (message: string) => ({
  isError: true,
  content: [{ type: "text" as const, text: message }],
});

export function makeServer(deps: ApiDeps, identity: McpIdentity) {
  const { orgId, createdBy } = identity;
  const server = new McpServer({ name: "contac", version: "1.0.0" });
  const correctTeam = (expectedTeamId: string) => expectedTeamId === orgId;

  server.registerTool(
    "get_team_identity",
    {
      description:
        "Verify which Contac team this authenticated connection currently uses. Call before any other Contac tool in each new conversation and compare the returned immutable team ID with your expected team ID. Stop if it differs or verification fails.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
      _meta: mcpOauthToolMeta(),
    },
    async () => {
      const [team] = await deps.db
        .select({ id: organizations.id, name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, orgId));
      return team ? result({ teamId: team.id, teamName: team.name }) : failed("Team not found");
    },
  );

  async function createOne(input: z.infer<typeof contactCreateInput>) {
    return deps.db.transaction(async (tx) => {
      // Serializing team creations makes duplicate decisions within and across
      // concurrent batches deterministic before any new contact is inserted.
      const [team] = await tx
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .for("update");
      if (!team) return { status: "error" as const, error: "Team not found" };
      const tagIds = [...new Set(input.tagIds ?? [])];
      if (tagIds.length) {
        const valid = await tx
          .select({ id: personTags.id })
          .from(personTags)
          .where(and(eq(personTags.orgId, orgId), inArray(personTags.id, tagIds)));
        if (valid.length !== tagIds.length)
          return { status: "error" as const, error: "A tag does not belong to this team" };
      }
      if (input.assigneeId) {
        const [member] = await tx
          .select({ id: memberships.id })
          .from(memberships)
          .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, input.assigneeId)));
        if (!member) return { status: "error" as const, error: "Assignee must be a team member" };
      }
      let companyId = input.companyId;
      if (!companyId && input.companyName) {
        const [existing] = await tx
          .select({ id: companies.id })
          .from(companies)
          .where(
            and(
              eq(companies.orgId, orgId),
              eq(companies.normalizedName, normalize(input.companyName)),
            ),
          );
        companyId = existing?.id;
      }
      if (companyId) {
        const [company] = await tx
          .select({ id: companies.id })
          .from(companies)
          .where(and(eq(companies.orgId, orgId), eq(companies.id, companyId)));
        if (!company)
          return { status: "error" as const, error: "Organization not found in this team" };
      }
      const email = input.email?.toLowerCase() ?? null;
      const phone = phoneKey(input.phone);
      const criteria = [
        ...(companyId
          ? [
              and(
                eq(contacts.normalizedName, normalize(input.name)),
                eq(contacts.companyId, companyId),
              ),
            ]
          : []),
        ...(email ? [eq(contacts.email, email)] : []),
        ...(phone ? [eq(contacts.phoneNormalized, phone)] : []),
      ];
      const candidates = criteria.length
        ? await tx
            .select({
              id: contacts.id,
              name: contacts.name,
              companyId: contacts.companyId,
              email: contacts.email,
              phone: contacts.phone,
            })
            .from(contacts)
            .where(
              and(
                eq(contacts.orgId, orgId),
                ne(contacts.status, "duplicate"),
                isNull(contacts.deletedAt),
                or(...criteria),
              ),
            )
            .limit(10)
        : [];
      if (candidates.length) return { status: "duplicate" as const, candidates };
      if (!companyId && input.companyName) {
        const [company] = await tx
          .insert(companies)
          .values({
            orgId,
            name: input.companyName,
            normalizedName: normalize(input.companyName),
          })
          .onConflictDoUpdate({
            target: [companies.orgId, companies.normalizedName],
            set: { name: input.companyName },
          })
          .returning({ id: companies.id });
        companyId = company.id;
      }
      if (!companyId) return { status: "error" as const, error: "Organization is required" };
      const [contact] = await tx
        .insert(contacts)
        .values({
          orgId,
          companyId,
          name: input.name,
          normalizedName: normalize(input.name),
          email,
          phone: input.phone ?? null,
          phoneNormalized: phone,
          description: input.description ?? null,
          status: input.status ?? "ikke_kontaktet",
          assigneeId:
            input.assigneeId ??
            (input.status && input.status !== "ikke_kontaktet" ? createdBy : null),
          createdBy,
          allowExternalAi: true,
        })
        .returning();
      if (tagIds.length)
        await tx
          .insert(contactPersonTags)
          .values(tagIds.map((tagId) => ({ orgId, contactId: contact.id, tagId })));
      if (input.additionalInfo)
        await tx.insert(contactAdditionalInfo).values({
          orgId,
          contactId: contact.id,
          source: "agent",
          markdown: input.additionalInfo,
        });
      return { status: "created" as const, contact };
    });
  }

  server.registerTool(
    "list_contacts",
    {
      description:
        "List active contacts in this token's team, including their full contact fields. Page using the returned nextCursor.",
      inputSchema: page,
      annotations: { readOnlyHint: true },
      _meta: mcpOauthToolMeta(),
    },
    async ({ expectedTeamId, cursor, limit }) => {
      if (!correctTeam(expectedTeamId))
        return failed("Contac team ID does not match the expected team. Stop using Contac.");
      const rows = await deps.db
        .select({
          contact: contacts,
          companyName: companies.name,
        })
        .from(contacts)
        .innerJoin(companies, and(eq(companies.id, contacts.companyId), eq(companies.orgId, orgId)))
        .where(
          and(
            eq(contacts.orgId, orgId),
            ne(contacts.status, "duplicate"),
            isNull(contacts.deletedAt),
            ...(cursor ? [gt(contacts.id, cursor)] : []),
          ),
        )
        .orderBy(asc(contacts.id))
        .limit(limit + 1);
      const hasMore = rows.length > limit;
      const items = rows.slice(0, limit);
      return result({ items, nextCursor: hasMore ? items.at(-1)?.contact.id : null });
    },
  );

  server.registerTool(
    "get_contact",
    {
      description:
        "Get a contact with its organization, tags, shared note, separate agent/referral Markdown information, linked activities, transcripts, email details, and attachment metadata.",
      inputSchema: z.object({ expectedTeamId: uuid, contactId: uuid }),
      annotations: { readOnlyHint: true },
      _meta: mcpOauthToolMeta(),
    },
    async ({ expectedTeamId, contactId }) => {
      if (!correctTeam(expectedTeamId))
        return failed("Contac team ID does not match the expected team. Stop using Contac.");
      const [contact] = await deps.db
        .select()
        .from(contacts)
        .where(
          and(
            eq(contacts.orgId, orgId),
            eq(contacts.id, contactId),
            ne(contacts.status, "duplicate"),
            isNull(contacts.deletedAt),
          ),
        );
      if (!contact) return failed("Contact not found in this team");
      const [[company], tags, activityRows, additionalInfo] = await Promise.all([
        deps.db
          .select()
          .from(companies)
          .where(and(eq(companies.orgId, orgId), eq(companies.id, contact.companyId))),
        deps.db
          .select({ id: personTags.id, name: personTags.name, description: personTags.description })
          .from(contactPersonTags)
          .innerJoin(
            personTags,
            and(eq(personTags.id, contactPersonTags.tagId), eq(personTags.orgId, orgId)),
          )
          .where(
            and(eq(contactPersonTags.orgId, orgId), eq(contactPersonTags.contactId, contactId)),
          ),
        deps.db
          .select({ activity: contactActivities })
          .from(activityContacts)
          .innerJoin(
            contactActivities,
            and(
              eq(contactActivities.id, activityContacts.activityId),
              eq(contactActivities.orgId, orgId),
            ),
          )
          .where(and(eq(activityContacts.orgId, orgId), eq(activityContacts.contactId, contactId)))
          .orderBy(desc(contactActivities.occurredAt)),
        deps.db
          .select()
          .from(contactAdditionalInfo)
          .where(
            and(
              eq(contactAdditionalInfo.orgId, orgId),
              eq(contactAdditionalInfo.contactId, contactId),
            ),
          )
          .orderBy(asc(contactAdditionalInfo.createdAt)),
      ]);
      const ids = activityRows.map((row) => row.activity.id);
      const [emails, files, participants] = ids.length
        ? await Promise.all([
            deps.db
              .select()
              .from(emailActivities)
              .where(
                and(eq(emailActivities.orgId, orgId), inArray(emailActivities.activityId, ids)),
              ),
            deps.db
              .select({
                activityId: activityFiles.activityId,
                id: workspaceFiles.id,
                name: workspaceFiles.name,
                mimeType: workspaceFiles.mimeType,
                sizeBytes: workspaceFiles.sizeBytes,
              })
              .from(activityFiles)
              .innerJoin(
                workspaceFiles,
                and(eq(workspaceFiles.id, activityFiles.fileId), eq(workspaceFiles.orgId, orgId)),
              )
              .where(and(eq(activityFiles.orgId, orgId), inArray(activityFiles.activityId, ids))),
            deps.db
              .select({
                activityId: activityContacts.activityId,
                contactId: activityContacts.contactId,
              })
              .from(activityContacts)
              .where(
                and(eq(activityContacts.orgId, orgId), inArray(activityContacts.activityId, ids)),
              ),
          ])
        : [[], [], []];
      return result({
        contact,
        company,
        tags,
        additionalInfo,
        activities: activityRows.map(({ activity }) => ({
          ...activity,
          email: emails.find((row) => row.activityId === activity.id) ?? null,
          attachments: files.filter((row) => row.activityId === activity.id),
          participantContactIds: participants
            .filter((row) => row.activityId === activity.id)
            .map((row) => row.contactId),
        })),
      });
    },
  );

  server.registerTool(
    "list_team_reference",
    {
      description:
        "List organizations, domains, domain links, and person tags for this team. Use IDs when creating contacts.",
      inputSchema: z.object({ expectedTeamId: uuid }),
      annotations: { readOnlyHint: true },
      _meta: mcpOauthToolMeta(),
    },
    async ({ expectedTeamId }) => {
      if (!correctTeam(expectedTeamId))
        return failed("Contac team ID does not match the expected team. Stop using Contac.");
      const [companyRows, domainRows, companyDomainRows, tagRows] = await Promise.all([
        deps.db
          .select()
          .from(companies)
          .where(eq(companies.orgId, orgId))
          .orderBy(asc(companies.name)),
        deps.db
          .select()
          .from(domainTags)
          .where(eq(domainTags.orgId, orgId))
          .orderBy(asc(domainTags.name)),
        deps.db.select().from(companyDomains).where(eq(companyDomains.orgId, orgId)),
        deps.db
          .select()
          .from(personTags)
          .where(eq(personTags.orgId, orgId))
          .orderBy(asc(personTags.name)),
      ]);
      return result({
        companies: companyRows,
        domains: domainRows,
        companyDomains: companyDomainRows,
        personTags: tagRows,
      });
    },
  );

  server.registerTool(
    "list_library_items",
    {
      description:
        "List saved team library quotes. Page using nextCursor; contactId and activityId identify their source.",
      inputSchema: page,
      annotations: { readOnlyHint: true },
      _meta: mcpOauthToolMeta(),
    },
    async ({ expectedTeamId, cursor, limit }) => {
      if (!correctTeam(expectedTeamId))
        return failed("Contac team ID does not match the expected team. Stop using Contac.");
      const rows = await deps.db
        .select()
        .from(libraryItems)
        .where(and(eq(libraryItems.orgId, orgId), ...(cursor ? [gt(libraryItems.id, cursor)] : [])))
        .orderBy(asc(libraryItems.id))
        .limit(limit + 1);
      return result({
        items: rows.slice(0, limit),
        nextCursor: rows.length > limit ? rows[limit - 1]!.id : null,
      });
    },
  );

  server.registerTool(
    "list_activities",
    {
      description:
        "List team activities, including summaries and transcripts, newest first. Use get_contact for email headers, participant links, and attachment metadata.",
      inputSchema: z.object({
        expectedTeamId: uuid,
        cursor: z.string().max(100).optional(),
        limit: z.number().int().min(1).max(100).default(50),
      }),
      annotations: { readOnlyHint: true },
      _meta: mcpOauthToolMeta(),
    },
    async ({ expectedTeamId, cursor, limit }) => {
      if (!correctTeam(expectedTeamId))
        return failed("Contac team ID does not match the expected team. Stop using Contac.");
      const [dateText, idText] = cursor?.split("|") ?? [];
      if (
        cursor &&
        (!z.iso.datetime().safeParse(dateText).success || !uuid.safeParse(idText).success)
      )
        return failed("Invalid cursor");
      const before = dateText ? new Date(dateText) : null;
      const rows = await deps.db
        .select()
        .from(contactActivities)
        .where(
          and(
            eq(contactActivities.orgId, orgId),
            ...(before
              ? [
                  or(
                    lt(contactActivities.occurredAt, before),
                    and(
                      eq(contactActivities.occurredAt, before),
                      lt(contactActivities.id, idText!),
                    ),
                  )!,
                ]
              : []),
          ),
        )
        .orderBy(desc(contactActivities.occurredAt), desc(contactActivities.id))
        .limit(limit + 1);
      return result({
        items: rows.slice(0, limit),
        nextCursor:
          rows.length > limit
            ? `${rows[limit - 1]!.occurredAt.toISOString()}|${rows[limit - 1]!.id}`
            : null,
      });
    },
  );

  server.registerTool(
    "get_attachment_link",
    {
      description: "Get a short-lived download URL for an activity attachment in this team.",
      inputSchema: z.object({ expectedTeamId: uuid, fileId: uuid }),
      annotations: { readOnlyHint: true },
      _meta: mcpOauthToolMeta(),
    },
    async ({ expectedTeamId, fileId }) => {
      if (!correctTeam(expectedTeamId))
        return failed("Contac team ID does not match the expected team. Stop using Contac.");
      const [file] = await deps.db
        .select({ file: workspaceFiles })
        .from(activityFiles)
        .innerJoin(workspaceFiles, eq(workspaceFiles.id, activityFiles.fileId))
        .where(
          and(
            eq(activityFiles.orgId, orgId),
            eq(activityFiles.fileId, fileId),
            eq(workspaceFiles.orgId, orgId),
          ),
        )
        .limit(1);
      if (!file) return failed("Attachment not found in this team");
      const { data, error } = await deps.supabase.storage
        .from("workspace-files")
        .createSignedUrl(file.file.storagePath, 60);
      return error || !data
        ? failed("Could not create download link")
        : result({
            name: file.file.name,
            mimeType: file.file.mimeType,
            url: data.signedUrl,
            expiresInSeconds: 60,
          });
    },
  );

  server.registerTool(
    "create_contact",
    {
      description: `Create a contact in this team. Search for existing people first. Supply an existing companyId or a companyName to create or reuse its organization. Keep description (Kort beskrivelse) to a concise, evidence-based Norwegian phrase of at most ${CONTACT_DESCRIPTION_MAX_LENGTH} characters about the person's role or relevant context. ${additionalInfoGuidance} Optional status and assigneeId set the initial workflow state and team member. Does not modify existing contacts.`,
      inputSchema: contactCreateInput,
      annotations: { readOnlyHint: false, destructiveHint: false },
      _meta: mcpOauthToolMeta(),
    },
    async (input) => {
      if (!correctTeam(input.expectedTeamId))
        return failed("Contac team ID does not match the expected team. Stop using Contac.");
      const outcome = await createOne(input);
      if (outcome.status === "error") return failed(outcome.error);
      if (outcome.status === "duplicate") return result(outcome);
      if (outcome.contact.allowExternalAi)
        queueMicrotask(() => {
          void runContactAutomations(deps, orgId, [outcome.contact.id], ["hierarchy"]);
        });
      return result(outcome.contact);
    },
  );

  server.registerTool(
    "update_contact",
    {
      description:
        "Update editable fields of an active contact in this team. Read get_contact first and pass contact.updatedAt as expectedUpdatedAt; stale edits are rejected. Omitted fields remain unchanged. tagIds replaces the full tag set. additionalInfo edits an existing entry using entryId, expectedMarkdown, and replacement markdown. Status changes from ikke_kontaktet assign the acting user when the contact is unassigned.",
      inputSchema: contactUpdateInput,
      annotations: { readOnlyHint: false, destructiveHint: false },
      _meta: mcpOauthToolMeta(),
    },
    async (input) => {
      if (!correctTeam(input.expectedTeamId))
        return failed("Contac team ID does not match the expected team. Stop using Contac.");
      const outcome = await deps.db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(contacts)
          .where(and(eq(contacts.orgId, orgId), eq(contacts.id, input.contactId)))
          .for("update");
        if (!current || current.status === "duplicate" || current.deletedAt)
          return { error: "Active contact not found in this team" };
        if (current.updatedAt.toISOString() !== input.expectedUpdatedAt)
          return { error: "Contact changed since it was read. Call get_contact and retry." };
        if (input.companyId) {
          const [company] = await tx
            .select({ id: companies.id })
            .from(companies)
            .where(and(eq(companies.orgId, orgId), eq(companies.id, input.companyId)));
          if (!company) return { error: "Organization not found in this team" };
        }
        if (input.assigneeId) {
          const [member] = await tx
            .select({ id: memberships.id })
            .from(memberships)
            .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, input.assigneeId)));
          if (!member) return { error: "Assignee must be a team member" };
        }
        const tagIds = input.tagIds && [...new Set(input.tagIds)];
        if (tagIds?.length) {
          const valid = await tx
            .select({ id: personTags.id })
            .from(personTags)
            .where(and(eq(personTags.orgId, orgId), inArray(personTags.id, tagIds)));
          if (valid.length !== tagIds.length)
            return { error: "A tag does not belong to this team" };
        }
        if (input.additionalInfo) {
          const [entry] = await tx
            .select({ markdown: contactAdditionalInfo.markdown })
            .from(contactAdditionalInfo)
            .where(
              and(
                eq(contactAdditionalInfo.orgId, orgId),
                eq(contactAdditionalInfo.contactId, input.contactId),
                eq(contactAdditionalInfo.id, input.additionalInfo.entryId),
              ),
            )
            .for("update");
          if (!entry) return { error: "Additional information entry not found on this contact" };
          if (entry.markdown !== input.additionalInfo.expectedMarkdown)
            return {
              error:
                "Additional information changed since it was read. Call get_contact and retry.",
            };
        }
        const nextStatus = input.status ?? current.status;
        const firstAssignment =
          current.status === "ikke_kontaktet" &&
          nextStatus !== "ikke_kontaktet" &&
          !current.assigneeId;
        const {
          expectedTeamId: _expectedTeamId,
          contactId,
          expectedUpdatedAt: _expectedUpdatedAt,
          tagIds: _tags,
          sharedNote,
          additionalInfo,
          ...changes
        } = input;
        const now = new Date();
        const [contact] = await tx
          .update(contacts)
          .set({
            ...changes,
            ...(changes.name ? { normalizedName: normalize(changes.name) } : {}),
            ...(changes.email !== undefined ? { email: changes.email?.toLowerCase() || null } : {}),
            ...(changes.phone !== undefined ? { phoneNormalized: phoneKey(changes.phone) } : {}),
            ...(changes.stikkord !== undefined
              ? { stikkordSourceVersion: null, stikkordGeneratedAt: null }
              : {}),
            ...(firstAssignment ? { assigneeId: createdBy } : {}),
            ...(sharedNote !== undefined ? { sharedNote, sharedNoteSavedAt: now } : {}),
            updatedAt: now,
          })
          .where(and(eq(contacts.orgId, orgId), eq(contacts.id, contactId)))
          .returning();
        if (tagIds) {
          await tx
            .delete(contactPersonTags)
            .where(
              and(eq(contactPersonTags.orgId, orgId), eq(contactPersonTags.contactId, contactId)),
            );
          if (tagIds.length)
            await tx
              .insert(contactPersonTags)
              .values(tagIds.map((tagId) => ({ orgId, contactId, tagId })));
        }
        if (additionalInfo)
          await tx
            .update(contactAdditionalInfo)
            .set({ markdown: additionalInfo.markdown, updatedAt: now })
            .where(
              and(
                eq(contactAdditionalInfo.orgId, orgId),
                eq(contactAdditionalInfo.contactId, contactId),
                eq(contactAdditionalInfo.id, additionalInfo.entryId),
              ),
            );
        if (sharedNote !== undefined) {
          const doc = new Y.Doc();
          if (sharedNote) doc.getText("content").insert(0, sharedNote);
          const stateBase64 = Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64");
          doc.destroy();
          const [document] = await tx
            .insert(collabDocuments)
            .values({
              orgId,
              kind: "note",
              entityId: contactId,
              stateBase64,
              materializedText: sharedNote,
            })
            .onConflictDoUpdate({
              target: [collabDocuments.orgId, collabDocuments.kind, collabDocuments.entityId],
              set: {
                stateBase64,
                materializedText: sharedNote,
                version: sql`${collabDocuments.version} + 1`,
                updatedAt: now,
              },
            })
            .returning({ version: collabDocuments.version });
          await tx.execute(sql`SELECT realtime.send(
            ${JSON.stringify({ teamId: orgId, kind: "note", id: contactId, version: document.version })}::jsonb,
            'reset', ${`doc:${orgId}:note:${contactId}`}, true
          )`);
        }
        if (
          changes.allowExternalAi !== undefined &&
          changes.allowExternalAi !== current.allowExternalAi
        )
          await tx.insert(aiEditLog).values({
            orgId,
            contactId,
            feature: "ai_permission",
            before: { allowExternalAi: current.allowExternalAi },
            after: { allowExternalAi: contact.allowExternalAi },
            appliedBy: createdBy,
          });
        return { contact, previousAllowExternalAi: current.allowExternalAi };
      });
      if (!outcome.contact) return failed(outcome.error ?? "Could not update contact");
      if (input.allowExternalAi === true && !outcome.previousAllowExternalAi)
        queueMicrotask(() => void runContactAutomations(deps, orgId, [input.contactId]));
      else if (
        outcome.contact.allowExternalAi &&
        ["name", "companyId", "description"].some((key) => key in input)
      )
        queueMicrotask(
          () => void runContactAutomations(deps, orgId, [input.contactId], ["hierarchy"]),
        );
      return result(outcome.contact);
    },
  );

  server.registerTool(
    "batch_create_contacts",
    {
      description: `Create up to 100 evidence-based contacts in this team. Search for existing people first. Each item accepts the create_contact fields: keep description (Kort beskrivelse) to a concise, evidence-based Norwegian phrase of at most ${CONTACT_DESCRIPTION_MAX_LENGTH} characters. ${additionalInfoGuidance} Optional status and assigneeId set each contact's initial workflow state and team member. Duplicates are flagged for review and never created. Returns one result per input item; invalid or failed items do not stop the others.`,
      inputSchema: z.object({
        expectedTeamId: uuid,
        contacts: z.array(z.unknown()).min(1).max(100),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
      _meta: mcpOauthToolMeta(),
    },
    async ({ expectedTeamId, contacts: inputs }) => {
      if (!correctTeam(expectedTeamId))
        return failed("Contac team ID does not match the expected team. Stop using Contac.");
      const results = [];
      const createdIds: string[] = [];
      for (const [index, raw] of inputs.entries()) {
        const parsed = batchContactInput.safeParse(raw);
        if (!parsed.success) {
          results.push({
            index,
            status: "error",
            error: parsed.error.issues.map((issue) => issue.message).join("; "),
          });
          continue;
        }
        try {
          const outcome = await createOne({ ...parsed.data, expectedTeamId });
          if (outcome.status === "created") {
            createdIds.push(outcome.contact.id);
            results.push({
              index,
              status: "created",
              contactId: outcome.contact.id,
              contactNumber: outcome.contact.contactNumber,
            });
          } else if (outcome.status === "duplicate") {
            results.push({ index, status: "duplicate", candidates: outcome.candidates });
          } else {
            results.push({ index, status: "error", error: outcome.error });
          }
        } catch (error) {
          results.push({
            index,
            status: "error",
            error: error instanceof Error ? error.message : "Could not create contact",
          });
        }
      }
      if (createdIds.length)
        queueMicrotask(() => {
          void runContactAutomations(deps, orgId, createdIds, ["hierarchy"]);
        });
      return result({ results });
    },
  );

  server.registerTool(
    "add_activity",
    {
      description:
        "Add a phone call, missed call, or meeting to one or more active contacts in this team. Does not change contact status or create personal reminders.",
      inputSchema: z.object({
        expectedTeamId: uuid,
        contactIds: z.array(uuid).min(1).max(30),
        kind: z.enum(["phone", "missed_phone", "meeting"]),
        summary: z.string().max(20000).default(""),
        transcript: z.string().max(200000).default(""),
        missedOutcome: z
          .enum(["voicemail", "busy", "call_later", "no_answer", "no_signal"])
          .optional(),
        occurredAt: z.iso.datetime().optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
      _meta: mcpOauthToolMeta(),
    },
    async (input) => {
      if (!correctTeam(input.expectedTeamId))
        return failed("Contac team ID does not match the expected team. Stop using Contac.");
      if (input.missedOutcome && input.kind !== "missed_phone")
        return failed("Missed-call outcome requires a missed call");
      const ids = [...new Set(input.contactIds)];
      const valid = await deps.db
        .select({ id: contacts.id })
        .from(contacts)
        .where(
          and(
            eq(contacts.orgId, orgId),
            inArray(contacts.id, ids),
            ne(contacts.status, "duplicate"),
            isNull(contacts.deletedAt),
          ),
        );
      if (valid.length !== ids.length)
        return failed("A contact does not belong to this team or is a duplicate");
      const row = await deps.db.transaction(async (tx) => {
        const [activity] = await tx
          .insert(contactActivities)
          .values({
            orgId,
            kind: input.kind,
            summary: input.summary,
            transcript: input.transcript,
            missedOutcome: input.missedOutcome ?? null,
            exportOwnerContactId: ids[0]!,
            occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
            createdBy,
          })
          .returning();
        await tx
          .insert(activityContacts)
          .values(ids.map((contactId) => ({ orgId, activityId: activity.id, contactId })));
        await tx
          .update(contacts)
          .set({ updatedAt: new Date() })
          .where(and(eq(contacts.orgId, orgId), inArray(contacts.id, ids)));
        return activity;
      });
      if (input.kind !== "missed_phone")
        queueMicrotask(() => {
          void runContactAutomations(deps, orgId, ids);
        });
      return result(row);
    },
  );
  return server;
}

export function registerMcpRoutes(app: Hono<ApiEnv>, deps: ApiDeps, appOrigin: string) {
  registerMcpOauthRoutes(app, deps, appOrigin);
  app.all("/mcp", async (c) => {
    const identity = await authorizeMcpOauth(deps, c.req.header("authorization"), (reason) =>
      console.warn(`[mcp] authorization rejected: ${reason}; method=${c.req.method}`),
    );
    if (!identity) {
      return c.json({ error: "Connect Contac with your account first" }, 401, {
        "WWW-Authenticate": mcpOauthChallenge(appOrigin),
      });
    }
    const handler = createMcpHandler(() => makeServer(deps, identity));
    const response = await handler.fetch(c.req.raw);
    if (response.status >= 400)
      console.warn(
        `[mcp] authenticated request failed: status=${response.status}; method=${c.req.method}`,
      );
    response.headers.set("Cache-Control", "no-store");
    return response;
  });

  app.get("/v1/profile/agent-access", async (c) => {
    const userId = c.get("user").id;
    const [[profile], connections] = await Promise.all([
      deps.db
        .select({ teamId: profiles.agentTeamId })
        .from(profiles)
        .where(eq(profiles.id, userId)),
      deps.db
        .select({ clientId: mcpUserConnections.clientId })
        .from(mcpUserConnections)
        .where(eq(mcpUserConnections.userId, userId)),
    ]);
    const [team] = profile?.teamId
      ? await deps.db
          .select({ name: organizations.name })
          .from(organizations)
          .where(eq(organizations.id, profile.teamId))
      : [];
    return c.json({
      teamId: profile?.teamId ?? null,
      teamName: team?.name ?? null,
      connectionCount: connections.length,
    });
  });
  const selectTeam = async (c: Context<ApiEnv>) => {
    const parsed = z.object({ teamId: uuid }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Choose a team" }, 400);
    const userId = c.get("user").id;
    if (!(await hasTeamAccess(deps, userId, parsed.data.teamId)))
      return c.json({ error: "You do not have access to this team" }, 403);
    await deps.db
      .update(profiles)
      .set({ agentTeamId: parsed.data.teamId, updatedAt: new Date() })
      .where(eq(profiles.id, userId));
    return c.json({ teamId: parsed.data.teamId });
  };
  app.post("/v1/profile/selected-team", selectTeam);
  app.post("/v1/profile/agent-team", selectTeam);
  app.post("/v1/profile/agent-revoke", async (c) => {
    await deps.db.delete(mcpUserConnections).where(eq(mcpUserConnections.userId, c.get("user").id));
    return c.json({ revoked: true });
  });
}
