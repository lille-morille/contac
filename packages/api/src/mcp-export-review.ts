import {
  buildReportData,
  defaultReportSettings,
  orderedReportContacts,
  reportFormats,
  reportLayouts,
  reportSectionModes,
  reportSortModes,
  reportColumnIds,
  reportSettingsSchema,
} from "@contac/core";
import {
  activityContacts,
  companies,
  contactActivities,
  contactReportSettings,
  contacts,
  emailActivities,
  exportReviewItems,
  exportReviewRuns,
} from "@contac/core/db";
import type { McpServer } from "@modelcontextprotocol/server";
import { and, asc, eq, inArray, lt, ne, or } from "drizzle-orm";
import { z } from "zod";
import { loadReportSnapshot } from "./report-data.ts";
import { mcpOauthToolMeta, type McpIdentity } from "./mcp-oauth.ts";
import type { ApiDeps } from "./types.ts";

const uuid = z.uuid();
const result = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value) }],
});
const failed = (message: string) => ({
  isError: true,
  content: [{ type: "text" as const, text: message }],
});
const guideVersion = "2026-10-14";
const reviewGuide = readFileSync(
  new URL("../../../skills/contac-export-review/SKILL.md", import.meta.url),
  "utf8",
);
const leaseMs = 20 * 60 * 1000;

async function readSettings(deps: ApiDeps, orgId: string) {
  const [row] = await deps.db
    .select()
    .from(contactReportSettings)
    .where(eq(contactReportSettings.orgId, orgId));
  const parsed = row ? reportSettingsSchema.safeParse(row.settings) : null;
  return {
    settings: parsed?.success ? parsed.data : reportSettingsSchema.parse(defaultReportSettings),
    revision: row?.revision ?? 0,
  };
}

async function reviewContext(deps: ApiDeps, orgId: string, contactId: string) {
  const [person] = await deps.db
    .select({
      id: contacts.id,
      contactNumber: contacts.contactNumber,
      name: contacts.name,
      companyId: contacts.companyId,
      email: contacts.email,
      phone: contacts.phone,
      description: contacts.description,
      sammendrag: contacts.sammendrag,
      stikkord: contacts.stikkord,
      relevance: contacts.relevance,
      exportStatus: contacts.exportStatus,
      exportContentRevision: contacts.exportContentRevision,
      updatedAt: contacts.updatedAt,
      allowExternalAi: contacts.allowExternalAi,
    })
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), eq(contacts.id, contactId)));
  if (!person || !person.allowExternalAi) return null;
  const [[company], activities] = await Promise.all([
    deps.db
      .select({ name: companies.name })
      .from(companies)
      .where(and(eq(companies.orgId, orgId), eq(companies.id, person.companyId))),
    deps.db
      .select({ activity: contactActivities })
      .from(activityContacts)
      .innerJoin(contactActivities, eq(contactActivities.id, activityContacts.activityId))
      .where(and(eq(activityContacts.orgId, orgId), eq(activityContacts.contactId, contactId)))
      .orderBy(asc(contactActivities.occurredAt)),
  ]);
  const ids = activities.map(({ activity }) => activity.id);
  const [links, emails] = ids.length
    ? await Promise.all([
        deps.db
          .select({
            activityId: activityContacts.activityId,
            contactId: contacts.id,
            name: contacts.name,
            allowExternalAi: contacts.allowExternalAi,
          })
          .from(activityContacts)
          .innerJoin(contacts, eq(contacts.id, activityContacts.contactId))
          .where(and(eq(activityContacts.orgId, orgId), inArray(activityContacts.activityId, ids))),
        deps.db
          .select()
          .from(emailActivities)
          .where(and(eq(emailActivities.orgId, orgId), inArray(emailActivities.activityId, ids))),
      ])
    : [[], []];
  const allowedActivities = activities.filter(({ activity }) =>
    links.filter((link) => link.activityId === activity.id).every((link) => link.allowExternalAi),
  );
  return {
    contact: {
      ...person,
      updatedAt: person.updatedAt.toISOString(),
      companyName: company?.name ?? "",
    },
    activities: allowedActivities.map(({ activity }) => ({
      id: activity.id,
      kind: activity.kind,
      occurredAt: activity.occurredAt.toISOString(),
      summary: activity.summary,
      transcript: activity.transcript,
      missedOutcome: activity.missedOutcome,
      email: emails.find((email) => email.activityId === activity.id) ?? null,
      participants: links
        .filter((link) => link.activityId === activity.id)
        .map(({ contactId, name }) => ({ contactId, name })),
    })),
    omittedSharedActivities: activities.length - allowedActivities.length,
    guidance: "Use documented activities only. Internal research notes are intentionally absent.",
  };
}

export function registerMcpExportReviewTools(
  server: McpServer,
  deps: ApiDeps,
  identity: McpIdentity,
) {
  const { orgId, createdBy } = identity;
  const correctTeam = (expectedTeamId: string) => expectedTeamId === orgId;

  server.registerPrompt(
    "review_contact_log",
    {
      title: "Review Contac contact log",
      description:
        "Process the team's contact-log export backlog using the maintained writing guide.",
      argsSchema: z.object({ request: z.string().optional() }),
      _meta: mcpOauthToolMeta(),
    },
    ({ request }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `${reviewGuide}\n\nUser's specific request: ${request ?? "Review the included contact log."}`,
          },
        },
      ],
    }),
  );
  server.registerTool(
    "get_export_review_guide",
    {
      description:
        "Read the current export-review writing and workflow instructions if your client does not show MCP prompts or repository skills.",
      inputSchema: z.object({ expectedTeamId: uuid }),
      annotations: { readOnlyHint: true },
      _meta: mcpOauthToolMeta(),
    },
    async ({ expectedTeamId }) =>
      correctTeam(expectedTeamId)
        ? result({ guideVersion, guide: reviewGuide })
        : failed("Contac team ID mismatch. Stop using Contac."),
  );

  server.registerTool(
    "get_export_workspace",
    {
      description:
        "Read this team's saved contact-log export settings, revision, included contacts, sections, sorting, and readiness. Use the revision when changing settings.",
      inputSchema: z.object({ expectedTeamId: uuid }),
      annotations: { readOnlyHint: true },
      _meta: mcpOauthToolMeta(),
    },
    async ({ expectedTeamId }) => {
      if (!correctTeam(expectedTeamId))
        return failed("Contac team ID mismatch. Stop using Contac.");
      const [saved, snapshot] = await Promise.all([
        readSettings(deps, orgId),
        loadReportSnapshot(deps.db, orgId),
      ]);
      if (!snapshot) return failed("Team not found");
      const excluded = new Set(saved.settings.excludedContactIds);
      return result({
        ...saved,
        contacts: orderedReportContacts(
          snapshot.reportContacts,
          snapshot.reportActivities,
          saved.settings,
        ).map((contact) => ({
          id: contact.id,
          contactNumber: contact.contactNumber,
          name: contact.name,
          included: !excluded.has(contact.id),
          exportStatus: contact.exportStatus,
          relevance: contact.relevance,
        })),
      });
    },
  );

  const settingsPatch = z.object({
    format: z.enum(reportFormats).optional(),
    layout: z.enum(reportLayouts).optional(),
    title: z.string().trim().min(1).max(160).optional(),
    subtitle: z.string().max(300).optional(),
    columns: z.array(z.enum(reportColumnIds)).optional(),
    excludedContactIds: z.array(uuid).optional(),
    orderMode: z.enum(["default", "manual"]).optional(),
    contactOrder: z.array(uuid).optional(),
    sectionMode: z.enum(reportSectionModes).optional(),
    sortMode: z.enum(reportSortModes).optional(),
    customSections: z
      .array(z.object({ id: uuid, title: z.string().trim().min(1).max(100) }))
      .optional(),
    customAssignments: z.record(uuid, uuid).optional(),
  });
  server.registerTool(
    "update_export_settings",
    {
      description:
        "Patch the team's saved export settings: layout, title, columns, inclusion, grouping, custom sections and assignments, or sorting. Read get_export_workspace first and pass its expectedRevision. Arrays and assignments replace their full saved value; omitted settings stay unchanged. A concurrent change is rejected.",
      inputSchema: z.object({
        expectedTeamId: uuid,
        expectedRevision: z.number().int().nonnegative(),
        patch: settingsPatch,
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
      _meta: mcpOauthToolMeta(),
    },
    async ({ expectedTeamId, expectedRevision, patch }) => {
      if (!correctTeam(expectedTeamId))
        return failed("Contac team ID mismatch. Stop using Contac.");
      const saved = await readSettings(deps, orgId);
      if (saved.revision !== expectedRevision)
        return failed("Export settings changed. Read get_export_workspace and retry.");
      const parsed = reportSettingsSchema.safeParse({ ...saved.settings, ...patch });
      if (!parsed.success) return failed(parsed.error.message);
      const settings = parsed.data;
      const sectionIds = new Set(settings.customSections.map((section) => section.id));
      if (Object.values(settings.customAssignments).some((id) => !sectionIds.has(id)))
        return failed("A custom assignment points to a missing section");
      const [updated] =
        expectedRevision === 0
          ? await deps.db
              .insert(contactReportSettings)
              .values({ orgId, settings, revision: 1 })
              .onConflictDoNothing()
              .returning({ revision: contactReportSettings.revision })
          : await deps.db
              .update(contactReportSettings)
              .set({ settings, revision: expectedRevision + 1, updatedAt: new Date() })
              .where(
                and(
                  eq(contactReportSettings.orgId, orgId),
                  eq(contactReportSettings.revision, expectedRevision),
                ),
              )
              .returning({ revision: contactReportSettings.revision });
      return updated
        ? result({ revision: updated.revision, settings })
        : failed("Export settings changed. Read get_export_workspace and retry.");
    },
  );

  server.registerTool(
    "start_export_review",
    {
      description:
        "Start or resume a durable team export-review backlog. Included contacts are the default scope; all_active reviews every active contact. Multiple agents can share the returned runId and independently call next_contact.",
      inputSchema: z.object({
        expectedTeamId: uuid,
        scope: z.enum(["included", "all_active"]).default("included"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
      _meta: mcpOauthToolMeta(),
    },
    async ({ expectedTeamId, scope }) => {
      if (!correctTeam(expectedTeamId))
        return failed("Contac team ID mismatch. Stop using Contac.");
      const [existing] = await deps.db
        .select()
        .from(exportReviewRuns)
        .where(and(eq(exportReviewRuns.orgId, orgId), eq(exportReviewRuns.status, "active")));
      if (existing) return result({ runId: existing.id, scope: existing.scope, resumed: true });
      const [saved, snapshot] = await Promise.all([
        readSettings(deps, orgId),
        loadReportSnapshot(deps.db, orgId),
      ]);
      if (!snapshot) return failed("Team not found");
      const excluded = new Set(saved.settings.excludedContactIds);
      const people = orderedReportContacts(
        snapshot.reportContacts,
        snapshot.reportActivities,
        saved.settings,
      ).filter((contact) => scope === "all_active" || !excluded.has(contact.id));
      let run;
      try {
        run = await deps.db.transaction(async (tx) => {
          const [created] = await tx
            .insert(exportReviewRuns)
            .values({
              orgId,
              createdBy,
              guideVersion,
              scope,
            })
            .returning();
          if (people.length)
            await tx.insert(exportReviewItems).values(
              people.map((contact, position) => ({
                runId: created.id,
                orgId,
                contactId: contact.id,
                position,
              })),
            );
          return created;
        });
      } catch (error) {
        const [concurrent] = await deps.db
          .select()
          .from(exportReviewRuns)
          .where(and(eq(exportReviewRuns.orgId, orgId), eq(exportReviewRuns.status, "active")));
        if (concurrent)
          return result({ runId: concurrent.id, scope: concurrent.scope, resumed: true });
        throw error;
      }
      return result({ runId: run.id, scope, total: people.length, guideVersion });
    },
  );

  server.registerTool(
    "next_contact",
    {
      description:
        "Atomically finish a claimed export-review contact and claim the next one. Pass finishClaimToken to mark the previous contact ready without rewriting it; use outcome needs_review plus a reason when uncertain. An update_contact call is optional. Source changes invalidate stale claims. Claim tokens let parallel agents share one run safely.",
      inputSchema: z.object({
        expectedTeamId: uuid,
        runId: uuid,
        finishClaimToken: uuid.optional(),
        outcome: z.enum(["ready", "needs_review"]).default("ready"),
        reason: z.string().trim().max(1000).optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
      _meta: mcpOauthToolMeta(),
    },
    async ({ expectedTeamId, runId, finishClaimToken, outcome, reason }) => {
      if (!correctTeam(expectedTeamId))
        return failed("Contac team ID mismatch. Stop using Contac.");
      if (outcome === "needs_review" && !reason) return failed("A review reason is required");
      const now = new Date();
      const transactionResult = await deps.db.transaction(async (tx) => {
        const [run] = await tx
          .select()
          .from(exportReviewRuns)
          .where(and(eq(exportReviewRuns.id, runId), eq(exportReviewRuns.orgId, orgId)));
        if (!run || run.status !== "active") return { error: "Active review run not found" };
        if (finishClaimToken) {
          const [item] = await tx
            .select()
            .from(exportReviewItems)
            .where(
              and(
                eq(exportReviewItems.runId, runId),
                eq(exportReviewItems.orgId, orgId),
                eq(exportReviewItems.claimToken, finishClaimToken),
                eq(exportReviewItems.state, "claimed"),
              ),
            )
            .for("update");
          if (!item || !item.leaseUntil || item.leaseUntil < now)
            return { error: "Claim expired. Request fresh context." };
          const [person] = await tx
            .select()
            .from(contacts)
            .where(and(eq(contacts.id, item.contactId), eq(contacts.orgId, orgId)))
            .for("update");
          if (
            !person ||
            !person.allowExternalAi ||
            person.exportContentRevision !== item.claimedRevision
          ) {
            await tx
              .update(exportReviewItems)
              .set({ state: "pending", claimToken: null, claimedRevision: null, leaseUntil: null })
              .where(
                and(
                  eq(exportReviewItems.runId, runId),
                  eq(exportReviewItems.contactId, item.contactId),
                ),
              );
            return {
              error: "Contact evidence, reviewed text, or AI permission changed. Claim it again.",
            };
          }
          await tx
            .update(contacts)
            .set({
              exportStatus: outcome,
              exportReviewReason: outcome === "needs_review" ? reason : null,
            })
            .where(and(eq(contacts.id, person.id), eq(contacts.orgId, orgId)));
          await tx
            .update(exportReviewItems)
            .set({
              state: "completed",
              outcome,
              claimToken: null,
              leaseUntil: null,
              completedAt: now,
            })
            .where(
              and(
                eq(exportReviewItems.runId, runId),
                eq(exportReviewItems.contactId, item.contactId),
              ),
            );
        }
        for (;;) {
          const [item] = await tx
            .select()
            .from(exportReviewItems)
            .where(
              and(
                eq(exportReviewItems.runId, runId),
                eq(exportReviewItems.orgId, orgId),
                or(
                  eq(exportReviewItems.state, "pending"),
                  and(
                    eq(exportReviewItems.state, "claimed"),
                    lt(exportReviewItems.leaseUntil, now),
                  ),
                ),
              ),
            )
            .orderBy(asc(exportReviewItems.position))
            .limit(1)
            .for("update", { skipLocked: true });
          if (!item) {
            const remaining = await tx
              .select({ state: exportReviewItems.state })
              .from(exportReviewItems)
              .where(
                and(eq(exportReviewItems.runId, runId), ne(exportReviewItems.state, "completed")),
              );
            if (!remaining.length)
              await tx
                .update(exportReviewRuns)
                .set({ status: "completed", completedAt: now })
                .where(eq(exportReviewRuns.id, runId));
            return {
              done: remaining.length === 0,
              waiting: remaining.length > 0,
              remaining: remaining.length,
            };
          }
          const [person] = await tx
            .select()
            .from(contacts)
            .where(and(eq(contacts.id, item.contactId), eq(contacts.orgId, orgId)))
            .for("update");
          if (
            !person ||
            person.deletedAt ||
            person.status === "duplicate" ||
            !person.allowExternalAi
          ) {
            if (person && !person.deletedAt && person.status !== "duplicate")
              await tx
                .update(contacts)
                .set({
                  exportStatus: "needs_review",
                  exportReviewReason:
                    "Ekstern AI er ikke tillatt for kontakten; gjennomgå manuelt.",
                })
                .where(eq(contacts.id, person.id));
            await tx
              .update(exportReviewItems)
              .set({
                state: "completed",
                outcome: "needs_review",
                claimToken: null,
                leaseUntil: null,
                completedAt: now,
              })
              .where(
                and(
                  eq(exportReviewItems.runId, runId),
                  eq(exportReviewItems.contactId, item.contactId),
                ),
              );
            continue;
          }
          const claimToken = crypto.randomUUID();
          await tx
            .update(exportReviewItems)
            .set({
              state: "claimed",
              claimToken,
              claimedRevision: person.exportContentRevision,
              leaseUntil: new Date(now.getTime() + leaseMs),
              attempts: item.attempts + 1,
            })
            .where(
              and(
                eq(exportReviewItems.runId, runId),
                eq(exportReviewItems.contactId, item.contactId),
              ),
            );
          return {
            claimToken,
            contactId: item.contactId,
            claimedRevision: person.exportContentRevision,
            leaseUntil: new Date(now.getTime() + leaseMs).toISOString(),
          };
        }
      });
      if ("error" in transactionResult && transactionResult.error)
        return failed(transactionResult.error);
      if (!("contactId" in transactionResult) || !transactionResult.contactId)
        return result(transactionResult);
      const context = await reviewContext(deps, orgId, transactionResult.contactId);
      if (!context || context.contact.exportContentRevision !== transactionResult.claimedRevision) {
        await deps.db
          .update(exportReviewItems)
          .set({ state: "pending", claimToken: null, claimedRevision: null, leaseUntil: null })
          .where(
            and(
              eq(exportReviewItems.runId, runId),
              eq(exportReviewItems.claimToken, transactionResult.claimToken),
            ),
          );
        return failed(
          "Contact changed while loading context. Call next_contact again for fresh context.",
        );
      }
      return result({ ...transactionResult, context });
    },
  );

  server.registerTool(
    "get_export_review_status",
    {
      description: "Read progress of a shared export-review run and its unresolved contacts.",
      inputSchema: z.object({ expectedTeamId: uuid, runId: uuid }),
      annotations: { readOnlyHint: true },
      _meta: mcpOauthToolMeta(),
    },
    async ({ expectedTeamId, runId }) => {
      if (!correctTeam(expectedTeamId))
        return failed("Contac team ID mismatch. Stop using Contac.");
      const [run] = await deps.db
        .select()
        .from(exportReviewRuns)
        .where(and(eq(exportReviewRuns.id, runId), eq(exportReviewRuns.orgId, orgId)));
      if (!run) return failed("Review run not found");
      const items = await deps.db
        .select({
          state: exportReviewItems.state,
          outcome: exportReviewItems.outcome,
          contactId: exportReviewItems.contactId,
        })
        .from(exportReviewItems)
        .where(and(eq(exportReviewItems.runId, runId), eq(exportReviewItems.orgId, orgId)));
      return result({
        runId,
        status: run.status,
        total: items.length,
        pending: items.filter((item) => item.state === "pending").length,
        claimed: items.filter((item) => item.state === "claimed").length,
        completed: items.filter((item) => item.state === "completed").length,
        needsReviewContactIds: items
          .filter((item) => item.outcome === "needs_review")
          .map((item) => item.contactId),
      });
    },
  );

  server.registerTool(
    "preview_export",
    {
      description:
        "Read the current export's ordered section outline and readiness warnings before download or copy.",
      inputSchema: z.object({ expectedTeamId: uuid }),
      annotations: { readOnlyHint: true },
      _meta: mcpOauthToolMeta(),
    },
    async ({ expectedTeamId }) => {
      if (!correctTeam(expectedTeamId))
        return failed("Contac team ID mismatch. Stop using Contac.");
      const [saved, snapshot] = await Promise.all([
        readSettings(deps, orgId),
        loadReportSnapshot(deps.db, orgId),
      ]);
      if (!snapshot) return failed("Team not found");
      const report = buildReportData({
        contacts: snapshot.reportContacts,
        activities: snapshot.reportActivities,
        settings: saved.settings,
      });
      return result({
        revision: saved.revision,
        format: saved.settings.format,
        layout: saved.settings.layout,
        sections: report.sections.map((section) => ({
          title: section.title,
          contacts: section.rows.map((row) => ({
            id: row.contact.id,
            exportNumber: row.exportNumber,
            name: row.contact.name,
            exportStatus: row.contact.exportStatus,
          })),
        })),
        unready: report.sections
          .flatMap((section) => section.rows)
          .filter((row) => row.contact.exportStatus !== "ready")
          .map((row) => ({
            id: row.contact.id,
            name: row.contact.name,
            status: row.contact.exportStatus,
          })),
      });
    },
  );
}
import { readFileSync } from "node:fs";
