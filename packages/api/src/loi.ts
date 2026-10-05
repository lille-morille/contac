import {
  companies,
  loiSettings,
  lois,
  loiVersions,
  profiles,
  workspaceFiles,
  collabDocuments,
} from "@contac/core/db";
import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import type { Hono } from "hono";
import { z } from "zod";
import {
  compileLoiPdf,
  defaultLoiSections,
  defaultLoiTemplate,
  defaultLoiVariables,
} from "./loi-template.ts";
import type { ApiDeps, ApiEnv } from "./types.ts";
import { mergeLoiEdit } from "./loi-merge.ts";

const id = z.uuid();
const sections = z
  .array(z.object({ id, title: z.string().trim().min(1).max(200), body: z.string().max(20_000) }))
  .max(30);
const variables = z.object({
  documentTitle: z.string().trim().min(1).max(200),
  subtitle: z.string().max(300),
  projectName: z.string().max(200),
  ourSignerRole: z.string().max(200),
  counterpartySignerRole: z.string().max(200),
  signatureNote: z.string().max(2000),
});
const editableLoi = z.object({
  ourSignerName: z.string().trim().min(1).max(200),
  counterpartySignerName: z.string().trim().max(200),
  documentDate: z.string().trim().min(1).max(100),
  variables,
  sections,
});
const pngMagic = [137, 80, 78, 71, 13, 10, 26, 10];

async function teamFile(deps: ApiDeps, orgId: string, fileId: string, mimeType: string) {
  const [file] = await deps.db
    .select()
    .from(workspaceFiles)
    .where(and(eq(workspaceFiles.id, fileId), eq(workspaceFiles.orgId, orgId)));
  const limit = mimeType === "image/png" ? 5 : 10;
  if (!file || file.mimeType !== mimeType || file.sizeBytes > limit * 1024 * 1024)
    throw new Error(`Choose a ${mimeType} file from this team (max ${limit} MiB)`);
  return file;
}
async function pngBytes(deps: ApiDeps, orgId: string, fileId: string | null) {
  if (!fileId) return undefined;
  const file = await teamFile(deps, orgId, fileId, "image/png");
  const { data, error } = await deps.supabase.storage
    .from("workspace-files")
    .download(file.storagePath);
  if (error || !data) throw new Error("Could not read the PNG logo");
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (!pngMagic.every((value, index) => bytes[index] === value))
    throw new Error("The logo is not a PNG image");
  return bytes;
}

export function registerLoiRoutes(app: Hono<ApiEnv>, deps: ApiDeps) {
  app.get("/v1/org/loi-settings", async (c) => {
    const [settings] = await deps.db
      .select()
      .from(loiSettings)
      .where(eq(loiSettings.orgId, c.get("org").id));
    return c.json({
      businessName: settings?.businessName ?? "",
      logoFileId: settings?.logoFileId ?? null,
    });
  });
  app.post("/v1/org/loi-settings", async (c) => {
    const parsed = z
      .object({
        businessName: z.string().trim().max(200),
        logoFileId: id.nullable(),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Invalid LOI settings" }, 400);
    const orgId = c.get("org").id;
    try {
      if (parsed.data.logoFileId) await pngBytes(deps, orgId, parsed.data.logoFileId);
    } catch (error) {
      return c.json({ error: String(error) }, 400);
    }
    const [row] = await deps.db
      .insert(loiSettings)
      .values({ orgId, ...parsed.data })
      .onConflictDoUpdate({
        target: loiSettings.orgId,
        set: { ...parsed.data, updatedAt: new Date() },
      })
      .returning();
    return c.json(row);
  });
  app.post("/v1/org/loi-companies/:id/logo", async (c) => {
    const companyId = id.safeParse(c.req.param("id"));
    const parsed = z
      .object({ fileId: id.nullable(), sourceUrl: z.url().max(1000).nullable().optional() })
      .safeParse(await c.req.json().catch(() => null));
    if (!companyId.success || !parsed.success) return c.json({ error: "Invalid logo" }, 400);
    const orgId = c.get("org").id;
    try {
      if (parsed.data.fileId) await pngBytes(deps, orgId, parsed.data.fileId);
    } catch (error) {
      return c.json({ error: String(error) }, 400);
    }
    const [row] = await deps.db
      .update(companies)
      .set({
        loiLogoFileId: parsed.data.fileId,
        loiLogoUrl: parsed.data.sourceUrl ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(companies.id, companyId.data), eq(companies.orgId, orgId)))
      .returning({
        id: companies.id,
        logoFileId: companies.loiLogoFileId,
        sourceUrl: companies.loiLogoUrl,
      });
    return row ? c.json(row) : c.json({ error: "Organization not found" }, 404);
  });
  app.get("/v1/org/lois", async (c) => {
    const orgId = c.get("org").id;
    const companyId = c.req.query("companyId");
    if (companyId && !id.safeParse(companyId).success)
      return c.json({ error: "Invalid organization" }, 400);
    const rows = await deps.db
      .select()
      .from(lois)
      .where(and(eq(lois.orgId, orgId), ...(companyId ? [eq(lois.companyId, companyId)] : [])))
      .orderBy(desc(lois.createdAt));
    const versions = await deps.db
      .select()
      .from(loiVersions)
      .where(eq(loiVersions.orgId, orgId))
      .orderBy(desc(loiVersions.createdAt));
    return c.json({
      lois: rows.map((row) => ({
        ...row,
        variables: { ...defaultLoiVariables, ...row.variables },
      })),
      versions,
    });
  });
  app.get("/v1/org/lois/last-sent", async (c) => {
    const orgId = c.get("org").id;
    const [latest] = await deps.db
      .select({
        id: lois.id,
        companyId: lois.companyId,
        companyName: companies.name,
        sentAt: lois.sentAt,
        sentBy: lois.sentBy,
        senderName: profiles.fullName,
        sentVersionId: lois.sentVersionId,
      })
      .from(lois)
      .innerJoin(companies, eq(companies.id, lois.companyId))
      .leftJoin(profiles, eq(profiles.id, lois.sentBy))
      .where(and(eq(lois.orgId, orgId), isNotNull(lois.sentAt)))
      .orderBy(desc(lois.sentAt))
      .limit(1);
    if (!latest) return c.json(null);
    const [version] = latest.sentVersionId
      ? await deps.db
          .select({ fileId: loiVersions.fileId })
          .from(loiVersions)
          .where(eq(loiVersions.id, latest.sentVersionId))
      : [];
    return c.json({ ...latest, fileId: version?.fileId ?? null });
  });
  app.post("/v1/org/lois", async (c) => {
    const parsed = z
      .object({ companyId: id, copyFromId: id.optional() })
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Invalid LOI" }, 400);
    const orgId = c.get("org").id;
    const [company] = await deps.db
      .select({ id: companies.id })
      .from(companies)
      .where(and(eq(companies.id, parsed.data.companyId), eq(companies.orgId, orgId)));
    if (!company) return c.json({ error: "Organization not found" }, 404);
    const [source] = parsed.data.copyFromId
      ? await deps.db
          .select()
          .from(lois)
          .where(
            and(eq(lois.id, parsed.data.copyFromId), eq(lois.orgId, orgId), isNotNull(lois.sentAt)),
          )
      : [];
    if (parsed.data.copyFromId && !source)
      return c.json({ error: "Sent source LOI not found" }, 404);
    const [sentVersion] = source?.sentVersionId
      ? await deps.db
          .select({ contentSnapshot: loiVersions.contentSnapshot })
          .from(loiVersions)
          .where(and(eq(loiVersions.id, source.sentVersionId), eq(loiVersions.orgId, orgId)))
      : [];
    const copied = sentVersion?.contentSnapshot;
    const [creator] = await deps.db
      .select({ name: profiles.fullName })
      .from(profiles)
      .where(eq(profiles.id, c.get("user").id));
    const [settings] = await deps.db
      .select({ businessName: loiSettings.businessName })
      .from(loiSettings)
      .where(eq(loiSettings.orgId, orgId));
    const sourceVariables = copied?.variables ?? source?.variables ?? {};
    const [row] = await deps.db
      .insert(lois)
      .values({
        orgId,
        companyId: company.id,
        createdBy: c.get("user").id,
        ourSignerName: creator?.name ?? "",
        counterpartySignerName:
          source?.companyId === company.id
            ? (copied?.counterpartySignerName ?? source.counterpartySignerName)
            : "",
        documentDate: new Date().toLocaleDateString("nb-NO"),
        variables: {
          ...defaultLoiVariables,
          projectName: settings?.businessName ?? "",
          ...sourceVariables,
        },
        sections: (copied?.sections ?? source?.sections ?? defaultLoiSections).map((section) => ({
          ...section,
          id: crypto.randomUUID(),
        })),
      })
      .returning();
    return c.json(row, 201);
  });
  app.post("/v1/org/lois/:id", async (c) => {
    const loiId = id.safeParse(c.req.param("id"));
    const parsed = editableLoi
      .extend({ expected: editableLoi })
      .safeParse(await c.req.json().catch(() => null));
    if (!loiId.success || !parsed.success) return c.json({ error: "Invalid LOI" }, 400);
    const orgId = c.get("org").id;
    const result = await deps.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(lois)
        .where(and(eq(lois.id, loiId.data), eq(lois.orgId, orgId), isNull(lois.sentAt)))
        .for("update");
      if (!current) return { status: "missing" as const };
      const { expected, ...proposed } = parsed.data;
      const merged = mergeLoiEdit(current, expected, proposed);
      if (merged.conflicts.length)
        return { status: "conflict" as const, current, fields: merged.conflicts };
      const [row] = await tx
        .update(lois)
        .set({ ...merged.merged, updatedAt: new Date() })
        .where(and(eq(lois.id, current.id), eq(lois.orgId, orgId)))
        .returning();
      const removed = current.sections
        .map((section) => section.id)
        .filter(
          (sectionId): sectionId is string =>
            !!sectionId && !row.sections.some((section) => section.id === sectionId),
        );
      if (removed.length)
        await tx
          .delete(collabDocuments)
          .where(
            and(
              eq(collabDocuments.orgId, orgId),
              eq(collabDocuments.kind, "loi-section"),
              inArray(collabDocuments.entityId, removed),
            ),
          );
      return { status: "ok" as const, row };
    });
    if (result.status === "missing") return c.json({ error: "Editable LOI not found" }, 404);
    if (result.status === "conflict")
      return c.json(
        {
          error: "LOI changed while you were editing",
          current: result.current,
          fields: result.fields,
        },
        409,
      );
    return c.json(result.row);
  });
  app.post("/v1/org/lois/:id/compile", async (c) => {
    const loiId = id.safeParse(c.req.param("id"));
    if (!loiId.success) return c.json({ error: "Invalid LOI" }, 400);
    const orgId = c.get("org").id;
    const [loi] = await deps.db
      .select()
      .from(lois)
      .where(and(eq(lois.id, loiId.data), eq(lois.orgId, orgId)));
    if (!loi || loi.sentAt) return c.json({ error: "Editable LOI not found" }, 404);
    const [company, settings] = await Promise.all([
      deps.db
        .select()
        .from(companies)
        .where(and(eq(companies.id, loi.companyId), eq(companies.orgId, orgId)))
        .then((rows) => rows[0]),
      deps.db
        .select()
        .from(loiSettings)
        .where(eq(loiSettings.orgId, orgId))
        .then((rows) => rows[0]),
    ]);
    if (!company) return c.json({ error: "Organization not found" }, 404);
    if (!settings?.businessName)
      return c.json({ error: "Set the team business name before compiling" }, 400);
    const variables = { ...defaultLoiVariables, ...loi.variables };
    let pdf: Uint8Array;
    try {
      const [teamLogo, partyLogo] = await Promise.all([
        pngBytes(deps, orgId, settings.logoFileId),
        pngBytes(deps, orgId, company.loiLogoFileId),
      ]);
      pdf = await compileLoiPdf(
        defaultLoiTemplate,
        {
          team_business_name: settings.businessName,
          organization_name: company.name,
          our_signer_name: loi.ourSignerName,
          counterparty_signer_name: loi.counterpartySignerName,
          document_date: loi.documentDate,
          document_title: variables.documentTitle,
          subtitle: variables.subtitle,
          project_name: variables.projectName,
          our_signer_role: variables.ourSignerRole,
          counterparty_signer_role: variables.counterpartySignerRole,
          signature_note: variables.signatureNote,
          sections: loi.sections,
          team_logo: teamLogo ? "team-logo.png" : null,
          counterparty_logo: partyLogo ? "counterparty-logo.png" : null,
        },
        { team: teamLogo, counterparty: partyLogo },
      );
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "PDF compilation failed" },
        400,
      );
    }
    const path = `${orgId}/loi/${loi.id}/${crypto.randomUUID()}.pdf`;
    const { error } = await deps.supabase.storage
      .from("workspace-files")
      .upload(path, new Blob([Uint8Array.from(pdf).buffer], { type: "application/pdf" }), {
        contentType: "application/pdf",
        upsert: false,
      });
    if (error) return c.json({ error: "Could not store generated PDF" }, 502);
    try {
      const version = await deps.db.transaction(async (tx) => {
        const [file] = await tx
          .insert(workspaceFiles)
          .values({
            orgId,
            storagePath: path,
            name: `LOI-${company.name}-${new Date().toISOString()}.pdf`.slice(0, 255),
            mimeType: "application/pdf",
            sizeBytes: pdf.length,
            createdBy: c.get("user").id,
          })
          .returning();
        const [saved] = await tx
          .insert(loiVersions)
          .values({
            orgId,
            loiId: loi.id,
            fileId: file.id,
            kind: "generated",
            label: `Generert ${new Date().toLocaleString("nb-NO")}`,
            contentSnapshot: {
              sections: loi.sections,
              variables,
              ourSignerName: loi.ourSignerName,
              counterpartySignerName: loi.counterpartySignerName,
              documentDate: loi.documentDate,
              organizationName: company.name,
              teamBusinessName: settings.businessName,
            },
            createdBy: c.get("user").id,
          })
          .returning();
        return saved;
      });
      return c.json(version, 201);
    } catch (cause) {
      await deps.supabase.storage.from("workspace-files").remove([path]);
      throw cause;
    }
  });
  app.post("/v1/org/lois/:id/mark-sent", async (c) => {
    const loiId = id.safeParse(c.req.param("id"));
    const parsed = z.object({ versionId: id }).safeParse(await c.req.json().catch(() => null));
    if (!loiId.success || !parsed.success)
      return c.json({ error: "Choose a generated version" }, 400);
    const orgId = c.get("org").id;
    const [version] = await deps.db
      .select()
      .from(loiVersions)
      .where(
        and(
          eq(loiVersions.id, parsed.data.versionId),
          eq(loiVersions.orgId, orgId),
          eq(loiVersions.loiId, loiId.data),
          eq(loiVersions.kind, "generated"),
        ),
      );
    if (!version?.contentSnapshot) return c.json({ error: "Generated version not found" }, 404);
    const [row] = await deps.db
      .update(lois)
      .set({
        sentAt: new Date(),
        sentBy: c.get("user").id,
        sentVersionId: version.id,
        sections: version.contentSnapshot.sections,
        variables: version.contentSnapshot.variables ?? defaultLoiVariables,
        ourSignerName: version.contentSnapshot.ourSignerName,
        counterpartySignerName: version.contentSnapshot.counterpartySignerName,
        documentDate: version.contentSnapshot.documentDate,
        updatedAt: new Date(),
      })
      .where(and(eq(lois.id, loiId.data), eq(lois.orgId, orgId), isNull(lois.sentAt)))
      .returning();
    return row ? c.json(row) : c.json({ error: "Unsent LOI not found" }, 404);
  });
  app.post("/v1/org/lois/:id/signed", async (c) => {
    const loiId = id.safeParse(c.req.param("id"));
    const parsed = z
      .object({ fileId: id, label: z.string().trim().min(1).max(200) })
      .safeParse(await c.req.json().catch(() => null));
    if (!loiId.success || !parsed.success) return c.json({ error: "Choose a signed PDF" }, 400);
    const orgId = c.get("org").id;
    const [loi] = await deps.db
      .select()
      .from(lois)
      .where(and(eq(lois.id, loiId.data), eq(lois.orgId, orgId), isNotNull(lois.sentAt)));
    if (!loi) return c.json({ error: "Sent LOI not found" }, 404);
    try {
      await teamFile(deps, orgId, parsed.data.fileId, "application/pdf");
    } catch (error) {
      return c.json({ error: String(error) }, 400);
    }
    const [version] = await deps.db
      .insert(loiVersions)
      .values({
        orgId,
        loiId: loi.id,
        fileId: parsed.data.fileId,
        kind: "signed",
        label: parsed.data.label,
        createdBy: c.get("user").id,
      })
      .returning();
    return c.json({ ...version, suggestCompanyStatus: "signert_intensjonsavtale" }, 201);
  });
}
