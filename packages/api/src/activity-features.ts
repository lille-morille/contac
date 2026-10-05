import {
  activityContacts,
  activityFiles,
  checkinAiSettings,
  contactActivities,
  contacts,
  libraryItems,
  workspaceFiles,
} from "@contac/core/db";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Hono } from "hono";
import { z } from "zod";
import type { ApiDeps, ApiEnv } from "./types.ts";
import { aiFeatures, defaultModels } from "./ai.ts";
import { encrypt } from "./ai-token.ts";

const id = z.uuid();
const noteInput = z.object({
  text: z.string().max(50000),
  expectedSavedAt: z.iso.datetime().nullable(),
});
const libraryInput = z.object({
  sourceKind: z.enum(["activity", "note"]),
  contactId: id,
  activityId: id.optional(),
  quote: z.string().trim().min(1).max(10000),
});
const json = async <T extends z.ZodTypeAny>(
  c: { req: { json: () => Promise<unknown> } },
  schema: T,
) => {
  const parsed = schema.safeParse(await c.req.json().catch(() => null));
  return parsed.success ? parsed.data : null;
};
export function registerActivityFeatureRoutes(app: Hono<ApiEnv>, deps: ApiDeps) {
  app.post("/v1/org/contacts/:id/note", async (c) => {
    const contactId = id.safeParse(c.req.param("id"));
    const data = await json(c, noteInput);
    if (!contactId.success || !data) return c.json({ error: "Invalid note" }, 400);
    const orgId = c.get("org").id;
    const [current] = await deps.db
      .select()
      .from(contacts)
      .where(and(eq(contacts.orgId, orgId), eq(contacts.id, contactId.data)));
    if (!current || current.status === "duplicate")
      return c.json({ error: "Contact not found" }, 404);
    if ((current.sharedNoteSavedAt?.toISOString() ?? null) !== data.expectedSavedAt)
      return c.json(
        {
          error: "Note changed while you were editing",
          currentText: current.sharedNote,
          currentSavedAt: current.sharedNoteSavedAt,
        },
        409,
      );
    const [row] = await deps.db
      .update(contacts)
      .set({
        sharedNote: data.text,
        sharedNoteSavedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(contacts.orgId, orgId),
          eq(contacts.id, contactId.data),
          current.sharedNoteSavedAt
            ? eq(contacts.sharedNoteSavedAt, current.sharedNoteSavedAt)
            : isNull(contacts.sharedNoteSavedAt),
        ),
      )
      .returning();
    return row ? c.json(row) : c.json({ error: "Note changed while you were editing" }, 409);
  });

  app.post("/v1/org/activities/:id/files", async (c) => {
    const activityId = id.safeParse(c.req.param("id"));
    const data = await json(c, z.object({ fileId: id }));
    if (!activityId.success || !data) return c.json({ error: "Invalid attachment" }, 400);
    const orgId = c.get("org").id;
    const [activity] = await deps.db
      .select({ id: contactActivities.id })
      .from(contactActivities)
      .where(and(eq(contactActivities.orgId, orgId), eq(contactActivities.id, activityId.data)));
    const [file] = await deps.db
      .select()
      .from(workspaceFiles)
      .where(and(eq(workspaceFiles.orgId, orgId), eq(workspaceFiles.id, data.fileId)));
    if (!activity || !file) return c.json({ error: "Activity or file not found" }, 404);
    if (
      file.sizeBytes > 10 * 1024 * 1024 ||
      !/^(application\/pdf|image\/(png|jpeg))$/.test(file.mimeType)
    )
      return c.json({ error: "Only PDF, PNG, and JPEG files up to 10 MB can be attached" }, 400);
    await deps.db
      .insert(activityFiles)
      .values({ orgId, activityId: activity.id, fileId: file.id })
      .onConflictDoNothing();
    return c.json({ attached: true });
  });
  app.post("/v1/org/activities/:id/files/:fileId/remove", async (c) => {
    const activityId = id.safeParse(c.req.param("id"));
    const fileId = id.safeParse(c.req.param("fileId"));
    if (!activityId.success || !fileId.success) return c.json({ error: "Invalid attachment" }, 400);
    const [row] = await deps.db
      .delete(activityFiles)
      .where(
        and(
          eq(activityFiles.orgId, c.get("org").id),
          eq(activityFiles.activityId, activityId.data),
          eq(activityFiles.fileId, fileId.data),
        ),
      )
      .returning();
    return row ? c.json({ removed: true }) : c.json({ error: "Attachment not found" }, 404);
  });

  app.get("/v1/org/library", async (c) => {
    const orgId = c.get("org").id;
    const [items, activityRows, contactRows] = await Promise.all([
      deps.db
        .select()
        .from(libraryItems)
        .where(eq(libraryItems.orgId, orgId))
        .orderBy(desc(libraryItems.createdAt)),
      deps.db
        .select({ id: contactActivities.id, updatedAt: contactActivities.updatedAt })
        .from(contactActivities)
        .where(eq(contactActivities.orgId, orgId)),
      deps.db
        .select({
          id: contacts.id,
          name: contacts.name,
          contactNumber: contacts.contactNumber,
          sharedNoteSavedAt: contacts.sharedNoteSavedAt,
        })
        .from(contacts)
        .where(eq(contacts.orgId, orgId)),
    ]);
    return c.json(
      items.map((item) => {
        const contact = contactRows.find((row) => row.id === item.contactId);
        const source =
          item.sourceKind === "activity"
            ? activityRows.find((row) => row.id === item.activityId)?.updatedAt
            : contact?.sharedNoteSavedAt;
        return {
          ...item,
          contactName: contact?.name ?? null,
          contactNumber: contact?.contactNumber ?? null,
          sourceDeleted: !source,
          sourceEdited: !!source && source.getTime() !== item.sourceUpdatedAt.getTime(),
        };
      }),
    );
  });
  app.post("/v1/org/library", async (c) => {
    const data = await json(c, libraryInput);
    if (!data) return c.json({ error: "Invalid library quote" }, 400);
    const orgId = c.get("org").id;
    const [contact] = await deps.db
      .select()
      .from(contacts)
      .where(and(eq(contacts.orgId, orgId), eq(contacts.id, data.contactId)));
    if (!contact || contact.status === "duplicate")
      return c.json({ error: "Contact not found" }, 404);
    let updatedAt = contact.sharedNoteSavedAt;
    if (data.sourceKind === "note") {
      if (data.activityId || !updatedAt || !contact.sharedNote.includes(data.quote))
        return c.json({ error: "Quote is not in the saved note" }, 400);
    } else {
      if (!data.activityId) return c.json({ error: "Choose an activity" }, 400);
      const [activity] = await deps.db
        .select()
        .from(contactActivities)
        .innerJoin(activityContacts, eq(activityContacts.activityId, contactActivities.id))
        .where(
          and(
            eq(contactActivities.orgId, orgId),
            eq(contactActivities.id, data.activityId),
            eq(activityContacts.contactId, data.contactId),
          ),
        );
      if (
        !activity ||
        !`${activity.contact_activities.summary}\n${activity.contact_activities.transcript}`.includes(
          data.quote,
        )
      )
        return c.json({ error: "Quote is not in this activity" }, 400);
      updatedAt = activity.contact_activities.updatedAt;
    }
    const [item] = await deps.db
      .insert(libraryItems)
      .values({
        orgId,
        contactId: contact.id,
        activityId: data.sourceKind === "activity" ? data.activityId : null,
        sourceKind: data.sourceKind,
        quote: data.quote,
        sourceUpdatedAt: updatedAt!,
        createdBy: c.get("user").id,
      })
      .returning();
    return c.json(item, 201);
  });
  app.post("/v1/org/library/:id/delete", async (c) => {
    const itemId = id.safeParse(c.req.param("id"));
    if (!itemId.success) return c.json({ error: "Invalid library item" }, 400);
    const [row] = await deps.db
      .delete(libraryItems)
      .where(and(eq(libraryItems.orgId, c.get("org").id), eq(libraryItems.id, itemId.data)))
      .returning();
    return row ? c.json({ deleted: true }) : c.json({ error: "Library item not found" }, 404);
  });

  app.get("/v1/org/checkin-ai", async (c) => {
    const [row] = await deps.db
      .select()
      .from(checkinAiSettings)
      .where(eq(checkinAiSettings.orgId, c.get("org").id));
    return c.json({
      emailDraftEnabled: row?.emailDraftEnabled ?? false,
      hasToken: !!row?.encryptedToken,
      lowModel: row?.lowModel ?? defaultModels.low,
      model: row?.model ?? defaultModels.medium,
      modes: Object.fromEntries(
        aiFeatures.map((feature) => [
          feature,
          row?.modes?.[feature] ??
            (feature === "email_draft" && row?.emailDraftEnabled ? "manual" : "off"),
        ]),
      ),
    });
  });
  app.post("/v1/org/checkin-ai", async (c) => {
    const data = await json(
      c,
      z.object({
        emailDraftEnabled: z.boolean().optional(),
        model: z.string().trim().max(120),
        lowModel: z.string().trim().max(120).optional(),
        modes: z
          .record(z.string(), z.enum(["off", "manual", "suggest", "safe_auto", "dangerous"]))
          .optional(),
        token: z.string().trim().max(500).optional(),
        clearToken: z.boolean().optional(),
      }),
    );
    if (!data) return c.json({ error: "Invalid AI settings" }, 400);
    if (
      data.modes &&
      Object.keys(data.modes).some(
        (feature) => !aiFeatures.includes(feature as (typeof aiFeatures)[number]),
      )
    )
      return c.json({ error: "Unknown AI feature" }, 400);
    if (
      data.modes &&
      ["email_draft", "group_findings"].some(
        (feature) => ![undefined, "off", "manual"].includes(data.modes?.[feature]),
      )
    )
      return c.json({ error: "This feature supports Off or Manual only" }, 400);
    const nextModes = {
      ...data.modes,
      email_draft: data.modes?.email_draft ?? (data.emailDraftEnabled ? "manual" : "off"),
    };
    const encryptedToken = data.token ? encrypt(data.token) : undefined;
    if (data.token && !encryptedToken)
      return c.json({ error: "AI_ENCRYPTION_KEY must be configured on the server" }, 503);
    const [row] = await deps.db
      .insert(checkinAiSettings)
      .values({
        orgId: c.get("org").id,
        emailDraftEnabled: data.emailDraftEnabled ?? false,
        model: data.model || defaultModels.medium,
        lowModel: data.lowModel || defaultModels.low,
        modes: nextModes,
        encryptedToken: encryptedToken ?? null,
      })
      .onConflictDoUpdate({
        target: checkinAiSettings.orgId,
        set: {
          ...(data.clearToken
            ? { emailDraftEnabled: false }
            : data.emailDraftEnabled !== undefined
              ? { emailDraftEnabled: data.emailDraftEnabled }
              : {}),
          model: data.model || null,
          ...(data.lowModel ? { lowModel: data.lowModel } : {}),
          modes: data.clearToken
            ? Object.fromEntries(aiFeatures.map((feature) => [feature, "off"]))
            : nextModes,
          ...(data.clearToken
            ? { encryptedToken: null }
            : encryptedToken
              ? { encryptedToken }
              : {}),
          updatedAt: new Date(),
        },
      })
      .returning();
    return c.json({
      emailDraftEnabled: row.emailDraftEnabled,
      hasToken: !!row.encryptedToken,
      model: row.model ?? "",
      lowModel: row.lowModel,
      modes: row.modes,
    });
  });
}
