import {
  activityContacts,
  collabDocuments,
  contactActivities,
  contacts,
  lois,
} from "@contac/core/db";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Hono } from "hono";
import * as Y from "yjs";
import { z } from "zod";
import type { ApiDeps, ApiEnv } from "./types.ts";

const kindSchema = z.enum(["note", "summary", "transcript", "loi-section", "loi-signature"]);
const uuid = z.uuid();
const limits = {
  note: 50_000,
  summary: 20_000,
  transcript: 200_000,
  "loi-section": 20_000,
  "loi-signature": 2_000,
};

function seed(text: string) {
  const doc = new Y.Doc();
  if (text) doc.getText("content").insert(0, text);
  const stateBase64 = Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64");
  doc.destroy();
  return stateBase64;
}

export function registerCollabRoutes(app: Hono<ApiEnv>, deps: ApiDeps) {
  app.get("/v1/org/collab/:kind/:id", async (c) => {
    const parsedKind = kindSchema.safeParse(c.req.param("kind"));
    const parsedId = uuid.safeParse(c.req.param("id"));
    if (!parsedKind.success || !parsedId.success) return c.json({ error: "Invalid document" }, 400);
    const kind = parsedKind.data;
    const entityId = parsedId.data;
    const orgId = c.get("org").id;
    const result = await deps.db.transaction(async (tx) => {
      let sourceText: string | null = null;
      if (kind === "note") {
        const [row] = await tx
          .select()
          .from(contacts)
          .where(and(eq(contacts.orgId, orgId), eq(contacts.id, entityId)))
          .for("update");
        if (row?.sharedNoteSavedAt && row.status !== "duplicate" && !row.deletedAt)
          sourceText = row.sharedNote;
      } else if (kind === "summary" || kind === "transcript") {
        const [row] = await tx
          .select()
          .from(contactActivities)
          .where(and(eq(contactActivities.orgId, orgId), eq(contactActivities.id, entityId)))
          .for("update");
        if (row) sourceText = row[kind];
      } else if (kind === "loi-signature") {
        const [row] = await tx
          .select()
          .from(lois)
          .where(and(eq(lois.orgId, orgId), eq(lois.id, entityId), isNull(lois.sentAt)))
          .for("update");
        if (row) sourceText = row.variables.signatureNote ?? "";
      } else {
        const [row] = await tx
          .select()
          .from(lois)
          .where(
            and(
              eq(lois.orgId, orgId),
              isNull(lois.sentAt),
              sql`${lois.sections} @> ${JSON.stringify([{ id: entityId }])}::jsonb`,
            ),
          )
          .for("update");
        sourceText = row?.sections.find((section) => section.id === entityId)?.body ?? null;
      }
      if (sourceText === null) return null;
      await tx
        .insert(collabDocuments)
        .values({
          orgId,
          kind,
          entityId,
          stateBase64: seed(sourceText),
          materializedText: sourceText,
        })
        .onConflictDoNothing();
      const [current] = await tx
        .select()
        .from(collabDocuments)
        .where(
          and(
            eq(collabDocuments.orgId, orgId),
            eq(collabDocuments.kind, kind),
            eq(collabDocuments.entityId, entityId),
          ),
        )
        .for("update");
      if (!current) throw new Error("Could not load document");
      if (current.materializedText === sourceText) return current;
      const [rebased] = await tx
        .update(collabDocuments)
        .set({
          stateBase64: seed(sourceText),
          materializedText: sourceText,
          version: current.version + 1,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(collabDocuments.orgId, orgId),
            eq(collabDocuments.kind, kind),
            eq(collabDocuments.entityId, entityId),
          ),
        )
        .returning();
      await tx.execute(sql`SELECT realtime.send(
        ${JSON.stringify({ teamId: orgId, kind, id: entityId, version: rebased.version })}::jsonb,
        'reset', ${`doc:${orgId}:${kind}:${entityId}`}, true
      )`);
      return rebased;
    });
    return result
      ? c.json({ state: result.stateBase64, version: result.version })
      : c.json({ error: "Document not found or not saved yet" }, 404);
  });

  app.post("/v1/org/collab/:kind/:id", async (c) => {
    const parsedKind = kindSchema.safeParse(c.req.param("kind"));
    const parsedId = uuid.safeParse(c.req.param("id"));
    const parsed = z
      .object({ update: z.string().min(1).max(600_000) })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsedKind.success || !parsedId.success || !parsed.success)
      return c.json({ error: "Invalid document update" }, 400);
    const kind = parsedKind.data;
    const entityId = parsedId.data;
    const orgId = c.get("org").id;
    let update: Uint8Array;
    try {
      update = new Uint8Array(Buffer.from(parsed.data.update, "base64"));
    } catch {
      return c.json({ error: "Invalid document update" }, 400);
    }
    if (update.length > 450_000) return c.json({ error: "Document update is too large" }, 413);
    const result = await deps.db.transaction(async (tx) => {
      let sourceText: string | null = null;
      if (kind === "note") {
        const [row] = await tx
          .select()
          .from(contacts)
          .where(and(eq(contacts.orgId, orgId), eq(contacts.id, entityId)))
          .for("update");
        if (row?.sharedNoteSavedAt && row.status !== "duplicate" && !row.deletedAt)
          sourceText = row.sharedNote;
      } else if (kind === "summary" || kind === "transcript") {
        const [row] = await tx
          .select()
          .from(contactActivities)
          .where(and(eq(contactActivities.orgId, orgId), eq(contactActivities.id, entityId)))
          .for("update");
        if (row) sourceText = row[kind];
      } else if (kind === "loi-signature") {
        const [row] = await tx
          .select()
          .from(lois)
          .where(and(eq(lois.orgId, orgId), eq(lois.id, entityId), isNull(lois.sentAt)))
          .for("update");
        if (row) sourceText = row.variables.signatureNote ?? "";
      } else {
        const [row] = await tx
          .select()
          .from(lois)
          .where(
            and(
              eq(lois.orgId, orgId),
              isNull(lois.sentAt),
              sql`${lois.sections} @> ${JSON.stringify([{ id: entityId }])}::jsonb`,
            ),
          )
          .for("update");
        sourceText = row?.sections.find((section) => section.id === entityId)?.body ?? null;
      }
      if (sourceText === null) return { status: "missing" as const };
      const [current] = await tx
        .select()
        .from(collabDocuments)
        .where(
          and(
            eq(collabDocuments.orgId, orgId),
            eq(collabDocuments.kind, kind),
            eq(collabDocuments.entityId, entityId),
          ),
        )
        .for("update");
      if (!current || current.materializedText !== sourceText)
        return { status: "conflict" as const, currentText: sourceText };
      const doc = new Y.Doc();
      try {
        Y.applyUpdate(doc, Buffer.from(current.stateBase64, "base64"));
        Y.applyUpdate(doc, update);
      } catch {
        doc.destroy();
        return { status: "invalid" as const };
      }
      const text = doc.getText("content").toString();
      if (text.length > limits[kind]) {
        doc.destroy();
        return { status: "large" as const };
      }
      const stateBase64 = Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64");
      doc.destroy();
      const version = current.version + 1;
      await tx
        .update(collabDocuments)
        .set({ stateBase64, materializedText: text, version, updatedAt: new Date() })
        .where(
          and(
            eq(collabDocuments.orgId, orgId),
            eq(collabDocuments.kind, kind),
            eq(collabDocuments.entityId, entityId),
          ),
        );
      if (kind === "note") {
        await tx
          .update(contacts)
          .set({ sharedNote: text, sharedNoteSavedAt: new Date(), updatedAt: new Date() })
          .where(and(eq(contacts.orgId, orgId), eq(contacts.id, entityId)));
      } else if (kind === "summary" || kind === "transcript") {
        await tx
          .update(contactActivities)
          .set({ [kind]: text, updatedAt: new Date() })
          .where(and(eq(contactActivities.orgId, orgId), eq(contactActivities.id, entityId)));
        const links = await tx
          .select({ contactId: activityContacts.contactId })
          .from(activityContacts)
          .where(and(eq(activityContacts.orgId, orgId), eq(activityContacts.activityId, entityId)));
        if (links.length)
          await tx
            .update(contacts)
            .set({ updatedAt: new Date() })
            .where(
              and(
                eq(contacts.orgId, orgId),
                inArray(
                  contacts.id,
                  links.map((link) => link.contactId),
                ),
              ),
            );
      } else if (kind === "loi-signature") {
        const [row] = await tx
          .select()
          .from(lois)
          .where(and(eq(lois.orgId, orgId), eq(lois.id, entityId)));
        if (row)
          await tx
            .update(lois)
            .set({ variables: { ...row.variables, signatureNote: text }, updatedAt: new Date() })
            .where(and(eq(lois.orgId, orgId), eq(lois.id, entityId)));
      } else {
        const [row] = await tx
          .select()
          .from(lois)
          .where(
            and(
              eq(lois.orgId, orgId),
              sql`${lois.sections} @> ${JSON.stringify([{ id: entityId }])}::jsonb`,
            ),
          );
        if (row)
          await tx
            .update(lois)
            .set({
              sections: row.sections.map((section) =>
                section.id === entityId ? { ...section, body: text } : section,
              ),
              updatedAt: new Date(),
            })
            .where(and(eq(lois.orgId, orgId), eq(lois.id, row.id)));
      }
      await tx.execute(sql`SELECT realtime.send(
        ${JSON.stringify({
          teamId: orgId,
          kind,
          id: entityId,
          version,
          update: parsed.data.update,
        })}::jsonb,
        'update', ${`doc:${orgId}:${kind}:${entityId}`}, true
      )`);
      return { status: "ok" as const, version, text };
    });
    if (result.status === "missing") return c.json({ error: "Document not found" }, 404);
    if (result.status === "conflict")
      return c.json(
        { error: "Document changed outside live editing", currentText: result.currentText },
        409,
      );
    if (result.status === "invalid") return c.json({ error: "Invalid Yjs update" }, 400);
    if (result.status === "large") return c.json({ error: "Document is too long" }, 413);
    return c.json({ version: result.version, text: result.text });
  });
}
