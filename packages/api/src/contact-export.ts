import { buildReportData, defaultReportSettings, reportSettingsSchema } from "@contac/core";
import { contactReportSettings } from "@contac/core/db";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { stringify } from "yaml";
import { loadReportSnapshot } from "./report-data.ts";
import type { ApiDeps, ApiEnv } from "./types.ts";

const reportTemplatePath = "report-templates/contac-report-v1.zip";

export function registerContactExportRoutes(app: Hono<ApiEnv>, deps: ApiDeps) {
  app.get("/v1/org/export/report-template.zip", async (c) => {
    const { data, error } = await deps.supabase.storage
      .from("workspace-files")
      .download(reportTemplatePath);
    if (error || !data) return c.json({ error: "Rapportmalen er ikke lastet opp ennå." }, 404);
    c.header("Content-Type", "application/zip");
    c.header("Content-Disposition", 'attachment; filename="contac-report-v1.zip"');
    c.header("Cache-Control", "no-store");
    return c.body(await data.arrayBuffer());
  });

  app.get("/v1/org/export/contact-log.yaml", async (c) => {
    const orgId = c.get("org").id;
    const [snapshot, settingsRow] = await Promise.all([
      loadReportSnapshot(deps.db, orgId),
      deps.db
        .select({ settings: contactReportSettings.settings })
        .from(contactReportSettings)
        .where(eq(contactReportSettings.orgId, orgId)),
    ]);
    if (!snapshot) return c.json({ error: "Teamet finnes ikke." }, 404);
    const parsed = reportSettingsSchema.safeParse(
      settingsRow[0]?.settings ?? defaultReportSettings,
    );
    const settings = parsed.success
      ? parsed.data
      : reportSettingsSchema.parse(defaultReportSettings);
    const complete = buildReportData({
      contacts: snapshot.reportContacts,
      activities: snapshot.reportActivities,
      settings: { ...settings, excludedContactIds: [] },
    });
    const owners = new Map(
      [...complete.rows, ...complete.noActivityRows].flatMap((row) =>
        row.entries
          .filter((entry) => entry.kind === "full")
          .map((entry) => [entry.activity.id, row.contact.id] as const),
      ),
    );
    const result = {
      ...snapshot.result,
      activities: snapshot.result.activities.map((activity) => ({
        ...activity,
        exportOwnerContactId: owners.get(activity.id) ?? activity.exportOwnerContactId,
      })),
    };
    c.header("Content-Type", "application/yaml; charset=utf-8");
    c.header("Content-Disposition", 'attachment; filename="kontaktlogg.yaml"');
    c.header("Cache-Control", "no-store");
    return c.body(stringify(result, { lineWidth: 0 }));
  });
}
