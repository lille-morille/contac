import {
  buildReportData,
  defaultReportSettings,
  orderedReportContacts,
  reportSettingsSchema,
} from "@contac/core";
import { contactReportSettings, contacts } from "@contac/core/db";
import { and, eq } from "drizzle-orm";
import type { Hono } from "hono";
import { z } from "zod";
import { loadReportSnapshot } from "./report-data.ts";
import {
  renderReportCsv,
  renderReportHtml,
  renderReportLatex,
  renderReportTypst,
} from "./report-renderers.ts";
import type { ApiDeps, ApiEnv } from "./types.ts";

const execFileAsync = promisify(execFile);

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

export function registerReportRoutes(app: Hono<ApiEnv>, deps: ApiDeps) {
  app.get("/v1/org/export/workspace", async (c) => {
    const orgId = c.get("org").id;
    const [saved, snapshot] = await Promise.all([
      readSettings(deps, orgId),
      loadReportSnapshot(deps.db, orgId),
    ]);
    if (!snapshot) return c.json({ error: "Teamet finnes ikke." }, 404);
    const activityLinks = new Map<string, number>();
    for (const activity of snapshot.reportActivities) {
      for (const id of activity.linkedContactIds) {
        activityLinks.set(id, (activityLinks.get(id) ?? 0) + 1);
      }
    }
    return c.json({
      ...saved,
      contacts: orderedReportContacts(
        snapshot.reportContacts,
        snapshot.reportActivities,
        saved.settings,
      ).map((contact) => ({
        id: contact.id,
        contactNumber: contact.contactNumber,
        name: contact.name,
        companyName: contact.companyName,
        status: contact.status,
        relevance: contact.relevance,
        exportStatus: contact.exportStatus ?? "not_ready",
        exportReviewReason: contact.exportReviewReason ?? null,
        exportContentRevision: contact.exportContentRevision ?? 0,
        companyStatus: contact.companyStatus,
        assigneeName: contact.assigneeName,
        email: contact.email,
        phone: contact.phone,
        description: contact.description,
        personTags: contact.personTags,
        domains: contact.domains,
        sammendrag: contact.sammendrag,
        stikkord: contact.stikkord,
        activityCount: activityLinks.get(contact.id) ?? 0,
      })),
    });
  });

  app.post("/v1/org/export/settings", async (c) => {
    const body = z
      .object({
        expectedRevision: z.number().int().min(0),
        settings: reportSettingsSchema,
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "Ugyldige eksportinnstillinger." }, 400);
    const orgId = c.get("org").id;
    const { expectedRevision, settings } = body.data;
    if (expectedRevision === 0) {
      const [created] = await deps.db
        .insert(contactReportSettings)
        .values({ orgId, settings, revision: 1 })
        .onConflictDoNothing()
        .returning({ revision: contactReportSettings.revision });
      if (created) return c.json({ settings, revision: created.revision });
    } else {
      const [updated] = await deps.db
        .update(contactReportSettings)
        .set({ settings, revision: expectedRevision + 1, updatedAt: new Date() })
        .where(
          and(
            eq(contactReportSettings.orgId, orgId),
            eq(contactReportSettings.revision, expectedRevision),
          ),
        )
        .returning({ revision: contactReportSettings.revision });
      if (updated) return c.json({ settings, revision: updated.revision });
    }
    const current = await readSettings(deps, orgId);
    return c.json({ error: "Eksportoppsettet ble endret av en annen person.", ...current }, 409);
  });

  app.post("/v1/org/export/readiness/:contactId", async (c) => {
    const body = z
      .object({
        expectedRevision: z.number().int().nonnegative(),
        status: z.enum(["ready", "needs_review"]),
        reason: z.string().trim().max(1000).nullable().optional(),
      })
      .safeParse(await c.req.json().catch(() => null));
    const contactId = z.uuid().safeParse(c.req.param("contactId"));
    if (!body.success || !contactId.success)
      return c.json({ error: "Ugyldig status for eksportgjennomgang." }, 400);
    if (body.data.status === "needs_review" && !body.data.reason)
      return c.json({ error: "Oppgi hvorfor kontakten trenger gjennomgang." }, 400);
    const [updated] = await deps.db
      .update(contacts)
      .set({
        exportStatus: body.data.status,
        exportReviewReason: body.data.status === "needs_review" ? body.data.reason : null,
      })
      .where(
        and(
          eq(contacts.orgId, c.get("org").id),
          eq(contacts.id, contactId.data),
          eq(contacts.exportContentRevision, body.data.expectedRevision),
        ),
      )
      .returning({
        exportStatus: contacts.exportStatus,
        exportContentRevision: contacts.exportContentRevision,
      });
    return updated
      ? c.json(updated)
      : c.json({ error: "Kontakten ble endret. Oppdater og gjennomgå på nytt." }, 409);
  });

  app.get("/v1/org/export/preview.pdf", async (c) => {
    const orgId = c.get("org").id;
    const [saved, snapshot] = await Promise.all([
      readSettings(deps, orgId),
      loadReportSnapshot(deps.db, orgId),
    ]);
    if (!snapshot) return c.json({ error: "Teamet finnes ikke." }, 404);
    const report = buildReportData({
      contacts: snapshot.reportContacts,
      activities: snapshot.reportActivities,
      settings: saved.settings,
    });
    if (!report.sections.length) return c.json({ error: "Velg minst én kontakt." }, 400);
    const directory = await mkdtemp(join(tmpdir(), "contac-export-preview-"));
    try {
      const source = join(directory, "kontaktlogg.typ");
      const output = join(directory, "kontaktlogg.pdf");
      await writeFile(source, renderReportTypst(report));
      await execFileAsync("typst", ["compile", "--root", directory, source, output], {
        timeout: 30_000,
      });
      c.header("Content-Type", "application/pdf");
      c.header("Cache-Control", "no-store");
      return c.body(new Uint8Array(await readFile(output)));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  app.get("/v1/org/export/file", async (c) => {
    const format = z.enum(["typst", "latex", "csv", "html"]).safeParse(c.req.query("format"));
    if (!format.success) return c.json({ error: "Velg et gyldig eksportformat." }, 400);
    const orgId = c.get("org").id;
    const [saved, snapshot] = await Promise.all([
      readSettings(deps, orgId),
      loadReportSnapshot(deps.db, orgId),
    ]);
    if (!snapshot) return c.json({ error: "Teamet finnes ikke." }, 404);
    const report = buildReportData({
      contacts: snapshot.reportContacts,
      activities: snapshot.reportActivities,
      settings: saved.settings,
    });
    if (!report.rows.length && !report.noActivityRows.length)
      return c.json({ error: "Velg minst én kontakt før eksport." }, 400);
    const unready = report.sections.flatMap((section) =>
      section.rows
        .filter((row) => row.contact.exportStatus !== "ready")
        .map((row) => ({
          id: row.contact.id,
          name: row.contact.name,
          status: row.contact.exportStatus ?? "not_ready",
        })),
    );
    if (unready.length && c.req.query("confirmUnready") !== "true")
      return c.json({ error: "Noen kontakter er ikke klare for eksport.", unready }, 409);
    const rendered =
      format.data === "typst"
        ? renderReportTypst(report)
        : format.data === "latex"
          ? renderReportLatex(report)
          : format.data === "csv"
            ? renderReportCsv(report)
            : renderReportHtml(report);
    const filename =
      format.data === "typst"
        ? "kontaktlogg.typ"
        : format.data === "latex"
          ? "kontaktlogg.tex"
          : format.data === "csv"
            ? "kontaktlogg.csv"
            : null;
    c.header(
      "Content-Type",
      format.data === "html"
        ? "text/html; charset=utf-8"
        : format.data === "csv"
          ? "text/csv; charset=utf-8"
          : "text/plain; charset=utf-8",
    );
    if (filename) c.header("Content-Disposition", `attachment; filename="${filename}"`);
    c.header("Cache-Control", "no-store");
    return c.body(rendered);
  });
}
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
