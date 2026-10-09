import {
  buildReportData,
  defaultReportSettings,
  orderedReportContacts,
  reportSettingsSchema,
} from "@contac/core";
import { contactReportSettings } from "@contac/core/db";
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
