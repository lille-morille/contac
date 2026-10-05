import { randomBytes } from "node:crypto";
import {
  activityContacts,
  activityFiles,
  companies,
  companyDomains,
  contactActivities,
  contactAdditionalInfo,
  contactPersonTags,
  contacts,
  domainTags,
  emailActivities,
  libraryItems,
  organizations,
  personTags,
  teamMcpTokens,
  workspaceFiles,
} from "@contac/core/db";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { and, asc, desc, eq, gt, inArray, isNull, lt, ne, or } from "drizzle-orm";
import type { Hono } from "hono";
import { z } from "zod";
import { runContactAutomations } from "./ai.ts";
import {
  authorizeMcpOauth,
  mcpOauthChallenge,
  mcpOauthToolMeta,
  registerMcpOauthRoutes,
} from "./mcp-oauth.ts";
import { authorizeMcpToken, tokenHash, type TokenIdentity } from "./mcp-token-auth.ts";
import type { ApiDeps, ApiEnv } from "./types.ts";

export { authorizeMcpToken } from "./mcp-token-auth.ts";

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
const contactCreateInput = z
  .object({
    expectedTeamId: uuid,
    name: z.string().trim().min(1).max(200),
    companyId: uuid.optional(),
    companyName: z.string().trim().min(1).max(200).optional(),
    email: z.email().optional(),
    phone: z.string().trim().max(200).optional(),
    description: z.string().max(5000).optional(),
    additionalInfo: z.string().trim().min(1).max(20000).optional(),
    tagIds: z.array(uuid).max(30).optional(),
  })
  .refine((input) => !!(input.companyId || input.companyName), "Company ID or name is required");
const result = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value) }],
});
const failed = (message: string) => ({
  isError: true,
  content: [{ type: "text" as const, text: message }],
});

function makeServer(deps: ApiDeps, identity: TokenIdentity) {
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
              and(eq(contacts.orgId, orgId), ne(contacts.status, "duplicate"), or(...criteria)),
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
      description:
        "Create a contact in this team. Search for existing people first. Supply an existing companyId or a companyName to create or reuse its organization. Keep fields evidence-based; additionalInfo is Markdown context shown separately from the shared note. Does not modify existing contacts.",
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
    "batch_create_contacts",
    {
      description:
        "Create up to 100 evidence-based contacts in this team. Search for existing people first. Each item accepts the create_contact fields, including separate additionalInfo Markdown. Duplicates are flagged for review and never created. Returns one result per input item; invalid or failed items do not stop the others.",
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
        const parsed = contactCreateInput.omit({ expectedTeamId: true }).safeParse(raw);
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
    const origin = c.req.header("origin");
    const header = c.req.header("authorization");
    const apiKey = header?.startsWith("Bearer ctc_") ?? false;
    if (origin && origin !== appOrigin && apiKey)
      return c.json({ error: "Origin not allowed" }, 403);
    const identity = apiKey
      ? await authorizeMcpToken(deps, header)
      : await authorizeMcpOauth(deps, header);
    if (!identity) {
      return c.json({ error: "Invalid or revoked MCP authorization" }, 401, {
        "WWW-Authenticate": mcpOauthChallenge(appOrigin),
      });
    }
    await deps.db
      .update(teamMcpTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(teamMcpTokens.id, identity.id));
    const handler = createMcpHandler(() => makeServer(deps, identity));
    const response = await handler.fetch(c.req.raw);
    response.headers.set("Cache-Control", "no-store");
    return response;
  });

  app.get("/v1/org/mcp-tokens", async (c) => {
    const rows = await deps.db
      .select({
        id: teamMcpTokens.id,
        name: teamMcpTokens.name,
        tokenPrefix: teamMcpTokens.tokenPrefix,
        createdBy: teamMcpTokens.createdBy,
        createdAt: teamMcpTokens.createdAt,
        lastUsedAt: teamMcpTokens.lastUsedAt,
        revokedAt: teamMcpTokens.revokedAt,
      })
      .from(teamMcpTokens)
      .where(eq(teamMcpTokens.orgId, c.get("org").id))
      .orderBy(desc(teamMcpTokens.createdAt));
    return c.json(rows);
  });
  app.post("/v1/org/mcp-tokens", async (c) => {
    const parsed = z
      .object({ name: z.string().trim().min(1).max(100) })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Enter a token name" }, 400);
    const secret = `ctc_${randomBytes(32).toString("base64url")}`;
    const [row] = await deps.db
      .insert(teamMcpTokens)
      .values({
        orgId: c.get("org").id,
        name: parsed.data.name,
        tokenPrefix: secret.slice(0, 12),
        tokenHash: tokenHash(secret),
        createdBy: c.get("user").id,
      })
      .returning({ id: teamMcpTokens.id, name: teamMcpTokens.name });
    return c.json({ ...row, token: secret }, 201, { "Cache-Control": "no-store" });
  });
  app.post("/v1/org/mcp-tokens/:id/revoke", async (c) => {
    const parsed = uuid.safeParse(c.req.param("id"));
    if (!parsed.success) return c.json({ error: "Invalid token" }, 400);
    const [row] = await deps.db
      .update(teamMcpTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(teamMcpTokens.id, parsed.data),
          eq(teamMcpTokens.orgId, c.get("org").id),
          isNull(teamMcpTokens.revokedAt),
        ),
      )
      .returning({ id: teamMcpTokens.id });
    return row ? c.json({ revoked: true }) : c.json({ error: "Token not found" }, 404);
  });
}
