import { buildReportData, defaultReportSettings, reportSettingsSchema } from "@contac/core";
import {
  contactReportSettings,
  lois,
  loiVersions,
  companies,
  workspaceFiles,
} from "@contac/core/db";
import { buildReportTemplateZip, buildSignedLoiZip } from "./report-downloads.ts";
import { and, eq } from "drizzle-orm";
import type { Hono } from "hono";
import { stringify } from "yaml";
import { loadReportSnapshot } from "./report-data.ts";
import type { ApiDeps, ApiEnv } from "./types.ts";
import { z } from "zod";

export function registerContactExportRoutes(app: Hono<ApiEnv>, deps: ApiDeps) {
  app.post("/v1/org/export/report-template.zip", async (c) => {
    const input = z
      .object({
        language: z.enum(["nb", "en"]),
        caseName: z.string().trim().min(1).max(200),
        group: z.string().trim().min(1).max(100),
        studyNumber: z.string().trim().min(1).max(20),
        authors: z
          .array(
            z.object({
              name: z.string().trim().min(1).max(200),
              title: z.string().trim().max(200),
            }),
          )
          .min(1)
          .max(50),
      })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!input.success)
      return c.json(
        { error: "Fyll inn casenavn, gruppe, syretestnummer og minst én forfatter." },
        400,
      );
    c.header("Content-Type", "application/zip");
    c.header("Content-Disposition", `attachment; filename="syretest-${input.data.language}.zip"`);
    c.header("Cache-Control", "no-store");
    return c.body(
      Uint8Array.from(await buildReportTemplateZip(input.data.language, input.data)).buffer,
    );
  });
  app.get("/v1/org/export/report-template.zip", async (c) => {
    const language = c.req.query("lang") ?? "nb";
    if (language !== "nb" && language !== "en") return c.json({ error: "Choose nb or en" }, 400);
    c.header("Content-Type", "application/zip");
    c.header("Content-Disposition", `attachment; filename="syretest-${language}.zip"`);
    c.header("Cache-Control", "no-store");
    return c.body(Uint8Array.from(await buildReportTemplateZip(language)).buffer);
  });

  app.get("/v1/org/export/signed-lois.zip", async (c) => {
    const orgId = c.get("org").id;
    const rows = await deps.db
      .select({
        id: loiVersions.id,
        companyName: companies.name,
        name: workspaceFiles.name,
        storagePath: workspaceFiles.storagePath,
        sizeBytes: workspaceFiles.sizeBytes,
      })
      .from(loiVersions)
      .innerJoin(lois, and(eq(lois.id, loiVersions.loiId), eq(lois.orgId, orgId)))
      .innerJoin(companies, and(eq(companies.id, lois.companyId), eq(companies.orgId, orgId)))
      .innerJoin(
        workspaceFiles,
        and(eq(workspaceFiles.id, loiVersions.fileId), eq(workspaceFiles.orgId, orgId)),
      )
      .where(
        and(
          eq(loiVersions.orgId, orgId),
          eq(loiVersions.kind, "signed"),
          eq(workspaceFiles.mimeType, "application/pdf"),
        ),
      )
      .orderBy(companies.name, loiVersions.createdAt, loiVersions.id);
    if (!rows.length) return c.json({ error: "Teamet har ingen signerte intensjonsavtaler." }, 404);
    const maxBytes = 100 * 1024 * 1024;
    if (rows.reduce((total, row) => total + row.sizeBytes, 0) > maxBytes)
      return c.json({ error: "Signerte LOI-er overstiger 100 MiB. Last ned enkeltvis." }, 413);
    const files = [];
    let totalBytes = 0;
    for (const row of rows) {
      const { data, error } = await deps.supabase.storage
        .from("workspace-files")
        .download(row.storagePath);
      if (error || !data)
        return c.json({ error: "Kunne ikke hente alle signerte LOI-er. Prøv igjen." }, 502);
      const bytes = new Uint8Array(await data.arrayBuffer());
      totalBytes += bytes.length;
      if (totalBytes > maxBytes)
        return c.json({ error: "Signerte LOI-er overstiger 100 MiB." }, 413);
      files.push({ ...row, bytes });
    }
    try {
      const zip = await buildSignedLoiZip(files);
      c.header("Content-Type", "application/zip");
      c.header("Content-Disposition", 'attachment; filename="signerte-loier.zip"');
      c.header("Cache-Control", "no-store");
      return c.body(Uint8Array.from(zip).buffer);
    } catch {
      return c.json(
        { error: "En signert LOI kunne ikke leses som PDF. Kontroller de opplastede filene." },
        422,
      );
    }
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
