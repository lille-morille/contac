import { CONTACT_DESCRIPTION_MAX_LENGTH } from "@contac/core";
import {
  activityContacts,
  activityFiles,
  companies,
  companyDomains,
  contactActivities,
  contactPersonTags,
  contactReminders,
  contacts,
  emailActivities,
  emailDrafts,
  inboundSuggestions,
  domainTags,
  favoriteContacts,
  workspaceFiles,
  memberships,
  lois,
  personTags,
  profiles,
  aiEditLog,
  aiSuggestions,
} from "@contac/core/db";
import {
  and,
  asc,
  desc,
  eq,
  exists,
  getTableColumns,
  inArray,
  isNotNull,
  isNull,
  ne,
  or,
  sql,
} from "drizzle-orm";
import type { Hono } from "hono";
import { z } from "zod";
import type { ApiDeps, ApiEnv } from "./types.ts";
import { runContactAutomations } from "./ai.ts";
import { replaceCompanyDomains } from "./domain-management.ts";

const id = z.uuid();
const status = z.enum([
  "ikke_kontaktet",
  "avsluttet",
  "kan_kontaktes_igjen",
  "skal_ringe",
  "venter_pa_svar",
  "follow_up",
  "ikke_kontakt_igjen",
]);
const companyStatus = z.enum(["ingen", "kunde", "konkurrent", "samarbeidspartner", "ekspert"]);
const color = z.enum([
  "blue",
  "orange",
  "mint",
  "pink",
  "violet",
  "coral",
  "yellow",
  "lime",
  "cyan",
  "slate",
]);
const blank = z.string().trim().max(200).nullable().optional();
const missedOutcome = z.enum(["voicemail", "busy", "call_later", "no_answer", "no_signal"]);
const norm = (value: string) =>
  value.trim().normalize("NFKC").toLocaleLowerCase("nb-NO").replace(/\s+/g, " ");
const phoneKey = (value: string | null | undefined) => {
  const digits = value?.replace(/\D/g, "") ?? "";
  return (digits.length === 10 && digits.startsWith("47") ? digits.slice(2) : digits) || null;
};
const contactInput = z.object({
  name: z.string().trim().min(1).max(200),
  companyId: id.optional(),
  companyName: z.string().trim().min(1).max(200).optional(),
  email: z.email().nullable().optional(),
  phone: blank,
  description: z.string().max(CONTACT_DESCRIPTION_MAX_LENGTH).nullable().optional(),
  tagIds: z.array(id).optional(),
  referralSuggestionId: id.optional(),
});
const contactPatch = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  companyId: id.optional(),
  email: z.union([z.email(), z.literal(""), z.null()]).optional(),
  phone: blank,
  description: z.string().max(CONTACT_DESCRIPTION_MAX_LENGTH).nullable().optional(),
  stikkord: z.string().trim().max(1000).nullable().optional(),
  relevance: z.enum(["low", "medium", "high"]).nullable().optional(),
  sammendrag: z.string().max(20000).nullable().optional(),
  status: status.optional(),
  assigneeId: id.nullable().optional(),
  allowExternalAi: z.boolean().optional(),
});
const guardedContactPatch = contactPatch.extend({
  expected: contactPatch.extend({
    description: z.string().nullable().optional(),
    stikkord: z.string().max(20000).nullable().optional(),
    relevance: z.enum(["low", "medium", "high"]).nullable().optional(),
    sammendrag: z.string().max(20000).nullable().optional(),
  }),
});
const contactScalarColumns = {
  name: contacts.name,
  companyId: contacts.companyId,
  email: contacts.email,
  phone: contacts.phone,
  description: contacts.description,
  stikkord: contacts.stikkord,
  relevance: contacts.relevance,
  sammendrag: contacts.sammendrag,
  status: contacts.status,
  assigneeId: contacts.assigneeId,
  allowExternalAi: contacts.allowExternalAi,
} as const;
// JSON lookup keeps rolling deployments compatible before the sorting migration lands.
const contactReadColumns = {
  ...getTableColumns(contacts),
  sortUpdatedAt:
    sql`coalesce((to_jsonb(${contacts})->>'sort_updated_at')::timestamptz, ${contacts.updatedAt})`.mapWith(
      contacts.updatedAt,
    ),
};
const parse = async <T extends z.ZodTypeAny>(
  c: { req: { json: () => Promise<unknown> } },
  schema: T,
): Promise<z.infer<T> | null> => {
  const body = await c.req.json().catch(() => null);
  const result = schema.safeParse(body);
  return result.success ? result.data : null;
};

export function registerContactRoutes(app: Hono<ApiEnv>, deps: ApiDeps) {
  app.get("/v1/org/contact-records/:id", async (c) => {
    const contactId = id.safeParse(c.req.param("id"));
    if (!contactId.success) return c.json({ error: "Invalid contact" }, 400);
    const [row] = await deps.db
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.orgId, c.get("org").id),
          eq(contacts.id, contactId.data),
          isNull(contacts.deletedAt),
        ),
      );
    return row ? c.json(row) : c.json({ error: "Contact not found" }, 404);
  });
  app.get("/v1/org/activity-records/:id", async (c) => {
    const activityId = id.safeParse(c.req.param("id"));
    if (!activityId.success) return c.json({ error: "Invalid activity" }, 400);
    const [row] = await deps.db
      .select()
      .from(contactActivities)
      .where(
        and(
          eq(contactActivities.orgId, c.get("org").id),
          eq(contactActivities.id, activityId.data),
        ),
      );
    return row ? c.json(row) : c.json({ error: "Activity not found" }, 404);
  });
  app.get("/v1/org/contact-data", async (c) => {
    const orgId = c.get("org").id;
    const userId = c.get("user").id;
    const part = c.req.query("part");
    if (part === "core") {
      const [
        companyRows,
        domainRows,
        companyDomainRows,
        tagRows,
        contactRows,
        creatorRows,
        assigneeRows,
        contactTagRows,
        memberRows,
      ] = await Promise.all([
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
        deps.db
          .select(contactReadColumns)
          .from(contacts)
          .where(and(eq(contacts.orgId, orgId), isNull(contacts.deletedAt)))
          .orderBy(desc(contacts.updatedAt)),
        deps.db
          .selectDistinct({
            userId: profiles.id,
            name: profiles.fullName,
            avatarPath: profiles.avatarPath,
          })
          .from(contacts)
          .innerJoin(profiles, eq(profiles.id, contacts.createdBy))
          .where(and(eq(contacts.orgId, orgId), isNull(contacts.deletedAt))),
        deps.db
          .selectDistinct({
            userId: profiles.id,
            name: profiles.fullName,
            avatarPath: profiles.avatarPath,
          })
          .from(contacts)
          .innerJoin(profiles, eq(profiles.id, contacts.assigneeId))
          .where(and(eq(contacts.orgId, orgId), isNull(contacts.deletedAt))),
        deps.db.select().from(contactPersonTags).where(eq(contactPersonTags.orgId, orgId)),
        deps.db
          .select({
            userId: memberships.userId,
            role: memberships.role,
            name: profiles.fullName,
            avatarPath: profiles.avatarPath,
          })
          .from(memberships)
          .leftJoin(profiles, eq(profiles.id, memberships.userId))
          .where(and(eq(memberships.orgId, orgId), eq(memberships.isActualMember, true))),
      ]);
      return c.json({
        companies: companyRows,
        domains: domainRows,
        companyDomains: companyDomainRows,
        personTags: tagRows,
        contacts: contactRows,
        contactCreators: creatorRows,
        contactAssignees: assigneeRows,
        contactPersonTags: contactTagRows,
        members: memberRows,
      });
    }
    if (part === "activities") {
      const [activityRows, activityContactRows, activityFileRows, emailRows] = await Promise.all([
        deps.db
          .select()
          .from(contactActivities)
          .where(eq(contactActivities.orgId, orgId))
          .orderBy(desc(contactActivities.occurredAt)),
        deps.db.select().from(activityContacts).where(eq(activityContacts.orgId, orgId)),
        deps.db
          .select({
            activityId: activityFiles.activityId,
            id: workspaceFiles.id,
            name: workspaceFiles.name,
            mimeType: workspaceFiles.mimeType,
            sizeBytes: workspaceFiles.sizeBytes,
          })
          .from(activityFiles)
          .innerJoin(workspaceFiles, eq(workspaceFiles.id, activityFiles.fileId))
          .where(eq(activityFiles.orgId, orgId)),
        deps.db.select().from(emailActivities).where(eq(emailActivities.orgId, orgId)),
      ]);
      return c.json({
        activities: activityRows,
        activityContacts: activityContactRows,
        activityFiles: activityFileRows,
        emailActivities: emailRows,
      });
    }
    if (part === "personal") {
      const [favoriteRows, reminderRows] = await Promise.all([
        deps.db
          .select({ contactId: favoriteContacts.contactId })
          .from(favoriteContacts)
          .where(and(eq(favoriteContacts.orgId, orgId), eq(favoriteContacts.userId, userId)))
          .orderBy(asc(favoriteContacts.createdAt)),
        deps.db
          .select()
          .from(contactReminders)
          .where(
            and(
              eq(contactReminders.orgId, orgId),
              eq(contactReminders.userId, userId),
              isNull(contactReminders.dismissedAt),
              exists(
                deps.db
                  .select({ id: contacts.id })
                  .from(contacts)
                  .where(
                    and(eq(contacts.id, contactReminders.contactId), isNull(contacts.deletedAt)),
                  ),
              ),
            ),
          )
          .orderBy(asc(contactReminders.dueAt)),
      ]);
      return c.json({
        favoriteContactIds: favoriteRows.map((row) => row.contactId),
        reminders: reminderRows,
      });
    }
    if (part) return c.json({ error: "Unknown contact-data part" }, 400);
    const [
      companyRows,
      domainRows,
      companyDomainRows,
      tagRows,
      contactRows,
      creatorRows,
      contactTagRows,
      activityRows,
      activityContactRows,
      activityFileRows,
      emailRows,
      memberRows,
      favoriteRows,
      reminderRows,
    ] = await Promise.all([
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
      deps.db
        .select(contactReadColumns)
        .from(contacts)
        .where(and(eq(contacts.orgId, orgId), isNull(contacts.deletedAt)))
        .orderBy(desc(contacts.updatedAt)),
      deps.db
        .selectDistinct({
          userId: profiles.id,
          name: profiles.fullName,
          avatarPath: profiles.avatarPath,
        })
        .from(contacts)
        .innerJoin(profiles, eq(profiles.id, contacts.createdBy))
        .where(and(eq(contacts.orgId, orgId), isNull(contacts.deletedAt))),
      deps.db.select().from(contactPersonTags).where(eq(contactPersonTags.orgId, orgId)),
      deps.db
        .select()
        .from(contactActivities)
        .where(eq(contactActivities.orgId, orgId))
        .orderBy(desc(contactActivities.occurredAt)),
      deps.db.select().from(activityContacts).where(eq(activityContacts.orgId, orgId)),
      deps.db
        .select({
          activityId: activityFiles.activityId,
          id: workspaceFiles.id,
          name: workspaceFiles.name,
          mimeType: workspaceFiles.mimeType,
          sizeBytes: workspaceFiles.sizeBytes,
        })
        .from(activityFiles)
        .innerJoin(workspaceFiles, eq(workspaceFiles.id, activityFiles.fileId))
        .where(eq(activityFiles.orgId, orgId)),
      deps.db.select().from(emailActivities).where(eq(emailActivities.orgId, orgId)),
      deps.db
        .select({
          userId: memberships.userId,
          role: memberships.role,
          name: profiles.fullName,
          avatarPath: profiles.avatarPath,
        })
        .from(memberships)
        .leftJoin(profiles, eq(profiles.id, memberships.userId))
        .where(and(eq(memberships.orgId, orgId), eq(memberships.isActualMember, true))),
      deps.db
        .select({ contactId: favoriteContacts.contactId })
        .from(favoriteContacts)
        .where(and(eq(favoriteContacts.orgId, orgId), eq(favoriteContacts.userId, userId)))
        .orderBy(asc(favoriteContacts.createdAt)),
      deps.db
        .select()
        .from(contactReminders)
        .where(
          and(
            eq(contactReminders.orgId, orgId),
            eq(contactReminders.userId, userId),
            isNull(contactReminders.dismissedAt),
            exists(
              deps.db
                .select({ id: contacts.id })
                .from(contacts)
                .where(
                  and(eq(contacts.id, contactReminders.contactId), isNull(contacts.deletedAt)),
                ),
            ),
          ),
        )
        .orderBy(asc(contactReminders.dueAt)),
    ]);
    return c.json({
      companies: companyRows,
      domains: domainRows,
      companyDomains: companyDomainRows,
      personTags: tagRows,
      contacts: contactRows,
      contactCreators: creatorRows,
      contactPersonTags: contactTagRows,
      activities: activityRows,
      activityContacts: activityContactRows,
      activityFiles: activityFileRows,
      emailActivities: emailRows,
      members: memberRows,
      favoriteContactIds: favoriteRows.map((row) => row.contactId),
      reminders: reminderRows,
    });
  });

  app.post("/v1/org/companies", async (c) => {
    const data = await parse(c, z.object({ name: z.string().trim().min(1).max(200) }));
    if (!data) return c.json({ error: "Enter an organization name" }, 400);
    const orgId = c.get("org").id;
    const [row] = await deps.db
      .insert(companies)
      .values({ orgId, name: data.name, normalizedName: norm(data.name) })
      .onConflictDoUpdate({
        target: [companies.orgId, companies.normalizedName],
        set: { name: data.name },
      })
      .returning();
    return c.json(row, 201);
  });
  app.post("/v1/org/companies/:id", async (c) => {
    const companyId = id.safeParse(c.req.param("id"));
    const patch = z.object({
      status: companyStatus.optional(),
      name: z.string().trim().min(1).max(200).optional(),
    });
    const data = await parse(c, patch.extend({ expected: patch }));
    if (!companyId.success || !data || Object.keys(data).length === 1)
      return c.json({ error: "Invalid organization change" }, 400);
    const { expected, ...changes } = data;
    const keys = Object.keys(changes) as ("status" | "name")[];
    if (keys.some((key) => !Object.hasOwn(expected, key)))
      return c.json({ error: "Current field values are required" }, 428);
    if (changes.name) {
      const [existing] = await deps.db
        .select({ id: companies.id })
        .from(companies)
        .where(
          and(
            eq(companies.orgId, c.get("org").id),
            eq(companies.normalizedName, norm(changes.name)),
            ne(companies.id, companyId.data),
          ),
        )
        .limit(1);
      if (existing)
        return c.json({ error: "En organisasjon med dette navnet finnes allerede." }, 409);
    }
    const [row] = await deps.db
      .update(companies)
      .set({
        ...changes,
        ...(changes.name ? { normalizedName: norm(changes.name) } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(companies.orgId, c.get("org").id),
          eq(companies.id, companyId.data),
          ...keys.map((key) => sql`${companies[key]} IS NOT DISTINCT FROM ${expected[key]}`),
        ),
      )
      .returning();
    if (row) return c.json(row);
    const [latest] = await deps.db
      .select()
      .from(companies)
      .where(and(eq(companies.orgId, c.get("org").id), eq(companies.id, companyId.data)));
    return latest
      ? c.json({ error: "Organization changed while you were editing", current: latest }, 409)
      : c.json({ error: "Organization not found" }, 404);
  });
  app.post("/v1/org/companies/:id/delete", async (c) => {
    const companyId = id.safeParse(c.req.param("id"));
    if (!companyId.success) return c.json({ error: "Invalid organization" }, 400);
    const orgId = c.get("org").id;
    const result = await deps.db.transaction(async (tx) => {
      const [company] = await tx
        .select({ id: companies.id })
        .from(companies)
        .where(and(eq(companies.orgId, orgId), eq(companies.id, companyId.data)))
        .for("update");
      if (!company) return "missing" as const;
      const [person] = await tx
        .select({ id: contacts.id })
        .from(contacts)
        .where(and(eq(contacts.orgId, orgId), eq(contacts.companyId, companyId.data)))
        .limit(1);
      if (person) return "contacts" as const;
      const [agreement] = await tx
        .select({ id: lois.id })
        .from(lois)
        .where(and(eq(lois.orgId, orgId), eq(lois.companyId, companyId.data)))
        .limit(1);
      if (agreement) return "lois" as const;
      await tx
        .delete(companies)
        .where(and(eq(companies.orgId, orgId), eq(companies.id, companyId.data)));
      return "deleted" as const;
    });
    if (result === "missing") return c.json({ error: "Organization not found" }, 404);
    if (result === "contacts")
      return c.json(
        { error: "Flytt alle kontakter først. Gjenopprett slettede kontakter for å flytte dem." },
        409,
      );
    if (result === "lois")
      return c.json({ error: "Organisasjonen har en intensjonsavtale og kan ikke slettes." }, 409);
    return c.json({ deleted: true });
  });
  app.post("/v1/org/domains", async (c) => {
    const data = await parse(
      c,
      z.object({
        name: z.string().trim().min(1).max(100),
        description: z.string().trim().min(1).max(500),
        color,
      }),
    );
    if (!data) return c.json({ error: "Invalid domain" }, 400);
    const orgId = c.get("org").id;
    const [row] = await deps.db
      .insert(domainTags)
      .values({ orgId, ...data, normalizedName: norm(data.name) })
      .onConflictDoNothing({ target: [domainTags.orgId, domainTags.normalizedName] })
      .returning();
    if (!row) return c.json({ error: "Domenet finnes allerede. Velg det i listen." }, 409);
    return c.json(row, 201);
  });
  app.post("/v1/org/domains/:id", async (c) => {
    const domainId = id.safeParse(c.req.param("id"));
    const data = await parse(
      c,
      z.object({
        description: z.string().trim().min(1).max(500),
        expected: z.object({
          description: z.string().nullable(),
          revision: z.number().int().nonnegative(),
        }),
      }),
    );
    if (!domainId.success || !data) return c.json({ error: "Invalid domain description" }, 400);
    const orgId = c.get("org").id;
    const [updated] = await deps.db
      .update(domainTags)
      .set({ description: data.description, revision: sql`${domainTags.revision} + 1` })
      .where(
        and(
          eq(domainTags.orgId, orgId),
          eq(domainTags.id, domainId.data),
          eq(domainTags.revision, data.expected.revision),
          sql`${domainTags.description} IS NOT DISTINCT FROM ${data.expected.description}`,
        ),
      )
      .returning();
    if (updated) return c.json(updated);
    const [current] = await deps.db
      .select({ description: domainTags.description, revision: domainTags.revision })
      .from(domainTags)
      .where(and(eq(domainTags.orgId, orgId), eq(domainTags.id, domainId.data)));
    if (!current) return c.json({ error: "Domain not found" }, 404);
    return c.json({ error: "Domain changed while you were editing", current }, 409);
  });
  app.post("/v1/org/domains/:id/rename", async (c) => {
    const domainId = id.safeParse(c.req.param("id"));
    const data = await parse(
      c,
      z.object({
        name: z.string().trim().min(1).max(100),
        expected: z.object({ revision: z.number().int().nonnegative() }),
      }),
    );
    if (!domainId.success || !data) return c.json({ error: "Invalid domain name" }, 400);
    const orgId = c.get("org").id;
    const normalizedName = norm(data.name);
    const [duplicate] = await deps.db
      .select({ id: domainTags.id })
      .from(domainTags)
      .where(and(eq(domainTags.orgId, orgId), eq(domainTags.normalizedName, normalizedName)));
    if (duplicate && duplicate.id !== domainId.data)
      return c.json({ error: "Domenenavnet finnes allerede." }, 409);
    try {
      const [updated] = await deps.db
        .update(domainTags)
        .set({ name: data.name, normalizedName, revision: sql`${domainTags.revision} + 1` })
        .where(
          and(
            eq(domainTags.orgId, orgId),
            eq(domainTags.id, domainId.data),
            eq(domainTags.revision, data.expected.revision),
          ),
        )
        .returning();
      if (updated) return c.json(updated);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "23505")
        return c.json({ error: "Domenenavnet finnes allerede." }, 409);
      throw error;
    }
    const [current] = await deps.db
      .select({ name: domainTags.name, revision: domainTags.revision })
      .from(domainTags)
      .where(and(eq(domainTags.orgId, orgId), eq(domainTags.id, domainId.data)));
    if (!current) return c.json({ error: "Domain not found" }, 404);
    return c.json({ error: "Domenet ble endret mens du redigerte.", current }, 409);
  });
  app.post("/v1/org/companies/:id/domains", async (c) => {
    const companyId = id.safeParse(c.req.param("id"));
    const data = await parse(
      c,
      z.object({
        domainIds: z.array(id).max(1),
        expected: z.object({ domainIds: z.array(id), revision: z.number().int().nonnegative() }),
      }),
    );
    if (!companyId.success || !data) return c.json({ error: "Invalid domains" }, 400);
    const orgId = c.get("org").id;
    const outcome = await replaceCompanyDomains(deps.db, orgId, {
      companyId: companyId.data,
      domainIds: data.domainIds,
      expectedRevision: data.expected.revision,
    });
    if (outcome.status === "conflict")
      return c.json({ error: outcome.error, current: outcome.previous }, 409);
    if (outcome.status === "error") return c.json({ error: outcome.error }, 404);
    return c.json({ ok: true, outcome });
  });
  app.post("/v1/org/person-tags", async (c) => {
    const data = await parse(
      c,
      z.object({
        name: z.string().trim().min(1).max(100),
        description: z.string().trim().min(1).max(500),
      }),
    );
    if (!data) return c.json({ error: "Invalid tag" }, 400);
    const orgId = c.get("org").id;
    const [row] = await deps.db
      .insert(personTags)
      .values({
        orgId,
        name: data.name,
        description: data.description,
        normalizedName: norm(data.name),
      })
      .onConflictDoNothing({ target: [personTags.orgId, personTags.normalizedName] })
      .returning();
    if (!row)
      return c.json({ error: "Taggen finnes allerede. Rediger beskrivelsen i listen." }, 409);
    return c.json(row, 201);
  });
  app.post("/v1/org/person-tags/:id", async (c) => {
    const tagId = id.safeParse(c.req.param("id"));
    const data = await parse(
      c,
      z.object({
        description: z.string().trim().min(1).max(500),
        expected: z.object({ description: z.string().nullable() }),
      }),
    );
    if (!tagId.success || !data) return c.json({ error: "Invalid tag description" }, 400);
    const orgId = c.get("org").id;
    const [updated] = await deps.db
      .update(personTags)
      .set({ description: data.description })
      .where(
        and(
          eq(personTags.orgId, orgId),
          eq(personTags.id, tagId.data),
          sql`${personTags.description} IS NOT DISTINCT FROM ${data.expected.description}`,
        ),
      )
      .returning();
    if (updated) return c.json(updated);
    const [current] = await deps.db
      .select({ description: personTags.description })
      .from(personTags)
      .where(and(eq(personTags.orgId, orgId), eq(personTags.id, tagId.data)));
    if (!current) return c.json({ error: "Tag not found" }, 404);
    return c.json({ error: "Tag changed while you were editing", current }, 409);
  });

  app.get("/v1/org/contacts/deleted", async (c) => {
    const rows = await deps.db
      .select()
      .from(contacts)
      .where(and(eq(contacts.orgId, c.get("org").id), isNotNull(contacts.deletedAt)))
      .orderBy(desc(contacts.deletedAt));
    return c.json(rows);
  });
  app.post("/v1/org/contacts/:id/delete", async (c) => {
    const contactId = id.safeParse(c.req.param("id"));
    if (!contactId.success) return c.json({ error: "Invalid contact" }, 400);
    const [row] = await deps.db
      .update(contacts)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(contacts.orgId, c.get("org").id),
          eq(contacts.id, contactId.data),
          isNull(contacts.deletedAt),
          ne(contacts.status, "duplicate"),
        ),
      )
      .returning();
    return row ? c.json(row) : c.json({ error: "Active contact not found" }, 404);
  });
  app.post("/v1/org/contacts/:id/restore", async (c) => {
    const contactId = id.safeParse(c.req.param("id"));
    if (!contactId.success) return c.json({ error: "Invalid contact" }, 400);
    const [row] = await deps.db
      .update(contacts)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(
        and(
          eq(contacts.orgId, c.get("org").id),
          eq(contacts.id, contactId.data),
          isNotNull(contacts.deletedAt),
        ),
      )
      .returning();
    return row ? c.json(row) : c.json({ error: "Deleted contact not found" }, 404);
  });

  app.post("/v1/org/contacts", async (c) => {
    const data = await parse(c, contactInput);
    if (!data || (!data.companyId && !data.companyName))
      return c.json({ error: "Name and organization are required" }, 400);
    const orgId = c.get("org").id;
    if (data.tagIds?.length) {
      const valid = await deps.db
        .select({ id: personTags.id })
        .from(personTags)
        .where(and(eq(personTags.orgId, orgId), inArray(personTags.id, data.tagIds)));
      if (valid.length !== new Set(data.tagIds).size)
        return c.json({ error: "Tag not found" }, 404);
    }
    const result = await deps.db.transaction(async (tx) => {
      let referral: {
        sourceContactId: string;
        sourceContactName: string;
        markdown: string;
      } | null = null;
      if (data.referralSuggestionId) {
        const [suggestion] = await tx
          .select()
          .from(aiSuggestions)
          .where(
            and(
              eq(aiSuggestions.id, data.referralSuggestionId),
              eq(aiSuggestions.orgId, orgId),
              eq(aiSuggestions.feature, "contact_referral"),
              eq(aiSuggestions.status, "pending"),
            ),
          );
        if (!suggestion?.contactId) return null;
        const [source] = await tx
          .select({ id: contacts.id, name: contacts.name })
          .from(contacts)
          .where(
            and(
              eq(contacts.orgId, orgId),
              eq(contacts.id, suggestion.contactId),
              isNull(contacts.deletedAt),
            ),
          );
        if (!source) return null;
        const reason =
          typeof suggestion.payload.reason === "string" ? suggestion.payload.reason : "";
        const passage =
          typeof suggestion.payload.passage === "string" ? suggestion.payload.passage : "";
        referral = {
          sourceContactId: source.id,
          sourceContactName: source.name,
          markdown:
            [reason, passage ? `> ${passage.replace(/\n/g, "\n> ")}` : ""]
              .filter(Boolean)
              .join("\n\n") || "Henvisning fra en samtale.",
        };
      }
      let companyId = data.companyId;
      if (!companyId && data.companyName) {
        const [company] = await tx
          .insert(companies)
          .values({ orgId, name: data.companyName, normalizedName: norm(data.companyName) })
          .onConflictDoUpdate({
            target: [companies.orgId, companies.normalizedName],
            set: { name: data.companyName },
          })
          .returning();
        companyId = company.id;
      }
      const [company] = await tx
        .select({ id: companies.id })
        .from(companies)
        .where(and(eq(companies.orgId, orgId), eq(companies.id, companyId!)));
      if (!company) return null;
      if (data.referralSuggestionId) {
        const [claimed] = await tx
          .update(aiSuggestions)
          .set({ status: "applied" })
          .where(
            and(
              eq(aiSuggestions.id, data.referralSuggestionId),
              eq(aiSuggestions.status, "pending"),
            ),
          )
          .returning({ id: aiSuggestions.id });
        if (!claimed) return null;
      }
      const [row] = await tx
        .insert(contacts)
        .values({
          orgId,
          companyId: companyId!,
          name: data.name,
          normalizedName: norm(data.name),
          email: data.email?.toLowerCase() || null,
          phone: data.phone || null,
          phoneNormalized: phoneKey(data.phone),
          description: data.description || null,
          sharedNote: referral
            ? `Henvisning fra ${referral.sourceContactName}:\n${referral.markdown}`
            : "",
          sharedNoteSavedAt: referral ? new Date() : null,
          createdBy: c.get("user").id,
          allowExternalAi: true,
        })
        .returning();
      if (data.tagIds?.length) {
        await tx
          .insert(contactPersonTags)
          .values([...new Set(data.tagIds)].map((tagId) => ({ orgId, contactId: row.id, tagId })));
      }
      return row;
    });
    if (result && result.allowExternalAi)
      queueMicrotask(() => {
        void runContactAutomations(deps, orgId, [result.id], ["hierarchy"]);
      });
    return result
      ? c.json(result, 201)
      : c.json({ error: "Organisasjonen eller kontaktforslaget er ikke tilgjengelig lenger" }, 409);
  });
  app.post("/v1/org/contacts/:id", async (c) => {
    const contactId = id.safeParse(c.req.param("id"));
    const data = await parse(c, guardedContactPatch);
    if (!contactId.success || !data || Object.keys(data).length === 1)
      return c.json({ error: "Invalid contact change" }, 400);
    const { expected, ...changes } = data;
    const changedKeys = Object.keys(changes) as (keyof typeof contactScalarColumns)[];
    if (changedKeys.some((key) => !Object.hasOwn(expected, key)))
      return c.json({ error: "Current field values are required to save changes" }, 428);
    const orgId = c.get("org").id;
    const [current] = await deps.db
      .select()
      .from(contacts)
      .where(and(eq(contacts.orgId, orgId), eq(contacts.id, contactId.data)));
    if (!current || current.status === "duplicate" || current.deletedAt)
      return c.json({ error: "Active contact not found" }, 404);
    if (changes.assigneeId) {
      const [member] = await deps.db
        .select({ id: memberships.id })
        .from(memberships)
        .where(
          and(
            eq(memberships.orgId, orgId),
            eq(memberships.userId, changes.assigneeId),
            eq(memberships.isActualMember, true),
          ),
        );
      if (!member) return c.json({ error: "Assignee must be a team member" }, 400);
    }
    const companyId = changes.companyId ?? current.companyId;
    if (changes.companyId) {
      const [company] = await deps.db
        .select({ id: companies.id })
        .from(companies)
        .where(and(eq(companies.orgId, orgId), eq(companies.id, companyId)));
      if (!company) return c.json({ error: "Organization not found" }, 404);
    }
    const nextStatus = changes.status ?? current.status;
    const firstAssignment =
      current.status === "ikke_kontaktet" && nextStatus !== "ikke_kontaktet" && !current.assigneeId;
    const assigneeId = firstAssignment
      ? c.get("user").id
      : changes.assigneeId !== undefined
        ? changes.assigneeId
        : current.assigneeId;
    const [row] = await deps.db
      .update(contacts)
      .set({
        ...changes,
        assigneeId,
        ...(changes.name ? { normalizedName: norm(changes.name) } : {}),
        ...(changes.email !== undefined ? { email: changes.email?.toLowerCase() || null } : {}),
        ...(changes.phone !== undefined ? { phoneNormalized: phoneKey(changes.phone) } : {}),
        ...(changes.stikkord !== undefined
          ? { stikkordSourceVersion: null, stikkordGeneratedAt: null }
          : {}),
        ...(changes.sammendrag !== undefined
          ? { sammendragSourceVersion: null, sammendragGeneratedAt: null }
          : {}),
        ...(changes.relevance !== undefined
          ? { relevanceManual: changes.relevance !== null, relevanceSourceVersion: null }
          : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(contacts.orgId, orgId),
          eq(contacts.id, contactId.data),
          isNull(contacts.deletedAt),
          ...changedKeys.map(
            (key) => sql`${contactScalarColumns[key]} IS NOT DISTINCT FROM ${expected[key]}`,
          ),
          ...(firstAssignment
            ? [eq(contacts.status, current.status), isNull(contacts.assigneeId)]
            : []),
        ),
      )
      .returning();
    if (
      row &&
      changes.allowExternalAi !== undefined &&
      changes.allowExternalAi !== current.allowExternalAi
    )
      await deps.db.insert(aiEditLog).values({
        orgId,
        contactId: row.id,
        feature: "ai_permission",
        before: { allowExternalAi: current.allowExternalAi },
        after: { allowExternalAi: row.allowExternalAi },
        appliedBy: c.get("user").id,
      });
    if (row && changes.allowExternalAi === true && !current.allowExternalAi)
      queueMicrotask(() => {
        void runContactAutomations(deps, orgId, [row.id]);
      });
    else if (
      row &&
      row.allowExternalAi &&
      (changes.sammendrag !== undefined || changes.relevance === null)
    )
      queueMicrotask(() => {
        void runContactAutomations(deps, orgId, [row.id], ["stikkord"]);
      });
    else if (
      row &&
      row.allowExternalAi &&
      ["name", "companyId", "description"].some((key) => key in changes)
    )
      queueMicrotask(() => {
        void runContactAutomations(deps, orgId, [row.id], ["hierarchy"]);
      });
    if (row) return c.json(row);
    const [latest] = await deps.db
      .select()
      .from(contacts)
      .where(and(eq(contacts.orgId, orgId), eq(contacts.id, contactId.data)));
    return c.json({ error: "Contact changed while you were editing", current: latest }, 409);
  });
  app.post("/v1/org/contacts/:id/favorite", async (c) => {
    const contactId = id.safeParse(c.req.param("id"));
    const data = await parse(c, z.object({ favorite: z.boolean() }));
    if (!contactId.success || !data) return c.json({ error: "Invalid favorite" }, 400);
    const orgId = c.get("org").id;
    const userId = c.get("user").id;
    const [contact] = await deps.db
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(
          eq(contacts.orgId, orgId),
          eq(contacts.id, contactId.data),
          ne(contacts.status, "duplicate"),
          isNull(contacts.deletedAt),
        ),
      );
    if (!contact) return c.json({ error: "Active contact not found" }, 404);
    if (data.favorite) {
      await deps.db
        .insert(favoriteContacts)
        .values({ orgId, userId, contactId: contact.id })
        .onConflictDoNothing();
    } else {
      await deps.db
        .delete(favoriteContacts)
        .where(
          and(
            eq(favoriteContacts.orgId, orgId),
            eq(favoriteContacts.userId, userId),
            eq(favoriteContacts.contactId, contact.id),
          ),
        );
    }
    return c.json({ contactId: contact.id, favorite: data.favorite });
  });
  app.post("/v1/org/contacts/:id/tags", async (c) => {
    const contactId = id.safeParse(c.req.param("id"));
    const data = await parse(
      c,
      z.object({ tagIds: z.array(id), expected: z.object({ tagIds: z.array(id) }) }),
    );
    if (!contactId.success || !data) return c.json({ error: "Invalid tags" }, 400);
    const orgId = c.get("org").id;
    const [contact] = await deps.db
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(
          eq(contacts.orgId, orgId),
          eq(contacts.id, contactId.data),
          ne(contacts.status, "duplicate"),
          isNull(contacts.deletedAt),
        ),
      );
    const valid = data.tagIds.length
      ? await deps.db
          .select({ id: personTags.id })
          .from(personTags)
          .where(and(eq(personTags.orgId, orgId), inArray(personTags.id, data.tagIds)))
      : [];
    if (!contact || valid.length !== new Set(data.tagIds).size)
      return c.json({ error: "Contact or tag not found" }, 404);
    const outcome = await deps.db.transaction(async (tx) => {
      await tx
        .select({ id: contacts.id })
        .from(contacts)
        .where(and(eq(contacts.orgId, orgId), eq(contacts.id, contactId.data)))
        .for("update");
      const current = await tx
        .select({ tagId: contactPersonTags.tagId })
        .from(contactPersonTags)
        .where(
          and(eq(contactPersonTags.orgId, orgId), eq(contactPersonTags.contactId, contactId.data)),
        );
      const currentIds = current.map((row) => row.tagId).sort();
      if (currentIds.join("|") !== [...data.expected.tagIds].sort().join("|"))
        return { conflict: true, tagIds: currentIds };
      await tx
        .delete(contactPersonTags)
        .where(
          and(eq(contactPersonTags.orgId, orgId), eq(contactPersonTags.contactId, contactId.data)),
        );
      if (data.tagIds.length)
        await tx
          .insert(contactPersonTags)
          .values(
            [...new Set(data.tagIds)].map((tagId) => ({ orgId, contactId: contactId.data, tagId })),
          );
      await tx
        .update(contacts)
        .set({ updatedAt: new Date() })
        .where(eq(contacts.id, contactId.data));
      return { conflict: false, tagIds: data.tagIds };
    });
    if (outcome.conflict)
      return c.json(
        { error: "Tags changed while you were editing", current: { tagIds: outcome.tagIds } },
        409,
      );
    return c.json({ ok: true });
  });

  app.post("/v1/org/activities", async (c) => {
    const data = await parse(
      c,
      z.object({
        contactIds: z.array(id).min(1),
        kind: z.enum(["phone", "missed_phone", "meeting"]),
        summary: z.string().max(20000).default(""),
        transcript: z.string().max(200000).default(""),
        missedOutcome: missedOutcome.optional(),
        nextStatus: status.optional(),
        reminder: z
          .object({
            dueAt: z.iso.datetime(),
            message: z.string().max(2000).default(""),
          })
          .optional(),
        occurredAt: z.iso.datetime().optional(),
      }),
    );
    if (!data) return c.json({ error: "Invalid activity" }, 400);
    if (data.missedOutcome && data.kind !== "missed_phone")
      return c.json({ error: "Missed-call outcome requires a missed call" }, 400);
    if (data.reminder && data.kind !== "missed_phone")
      return c.json({ error: "Call-back reminder requires a missed call" }, 400);
    const orgId = c.get("org").id;
    const ids = [...new Set(data.contactIds)];
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
    if (valid.length !== ids.length) return c.json({ error: "Contact not found" }, 404);
    const row = await deps.db.transaction(async (tx) => {
      const [activity] = await tx
        .insert(contactActivities)
        .values({
          orgId,
          kind: data.kind,
          summary: data.summary,
          transcript: data.transcript,
          missedOutcome: data.missedOutcome ?? null,
          exportOwnerContactId: ids[0]!,
          occurredAt: data.occurredAt ? new Date(data.occurredAt) : new Date(),
          createdBy: c.get("user").id,
        })
        .returning();
      await tx
        .insert(activityContacts)
        .values(ids.map((contactId) => ({ orgId, activityId: activity.id, contactId })));
      await tx
        .update(contacts)
        .set({ updatedAt: new Date() })
        .where(and(eq(contacts.orgId, orgId), inArray(contacts.id, ids)));
      if (data.nextStatus) {
        const [primary] = await tx
          .select({ status: contacts.status, assigneeId: contacts.assigneeId })
          .from(contacts)
          .where(and(eq(contacts.orgId, orgId), eq(contacts.id, ids[0]!)));
        await tx
          .update(contacts)
          .set({
            status: data.nextStatus,
            assigneeId:
              primary?.status === "ikke_kontaktet" && !primary.assigneeId
                ? c.get("user").id
                : primary?.assigneeId,
            updatedAt: new Date(),
          })
          .where(and(eq(contacts.orgId, orgId), eq(contacts.id, ids[0]!)));
      }
      if (data.reminder)
        await tx.insert(contactReminders).values({
          orgId,
          userId: c.get("user").id,
          contactId: ids[0]!,
          dueAt: new Date(data.reminder.dueAt),
          message: data.reminder.message,
        });
      return activity;
    });
    if (data.kind !== "missed_phone")
      queueMicrotask(() => {
        void runContactAutomations(deps, orgId, ids);
      });
    return c.json(row, 201);
  });
  app.post("/v1/org/activities/:id", async (c) => {
    const activityId = id.safeParse(c.req.param("id"));
    const patch = z.object({
      summary: z.string().max(20000).optional(),
      transcript: z.string().max(200000).optional(),
      occurredAt: z.iso.datetime().optional(),
    });
    const data = await parse(c, patch.extend({ expected: patch }));
    if (!activityId.success || !data || Object.keys(data).length === 1)
      return c.json({ error: "Invalid activity change" }, 400);
    const { expected, ...changes } = data;
    const changedKeys = Object.keys(changes) as (keyof typeof changes)[];
    if (changedKeys.some((key) => !Object.hasOwn(expected, key)))
      return c.json({ error: "Current field values are required to save changes" }, 428);
    const orgId = c.get("org").id;
    const columns = {
      summary: contactActivities.summary,
      transcript: contactActivities.transcript,
      occurredAt: contactActivities.occurredAt,
    };
    const [row] = await deps.db
      .update(contactActivities)
      .set({
        ...(changes.summary !== undefined ? { summary: changes.summary } : {}),
        ...(changes.transcript !== undefined ? { transcript: changes.transcript } : {}),
        ...(changes.occurredAt ? { occurredAt: new Date(changes.occurredAt) } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(contactActivities.orgId, orgId),
          eq(contactActivities.id, activityId.data),
          ...changedKeys.map((key) =>
            key === "occurredAt"
              ? sql`${columns[key]} IS NOT DISTINCT FROM ${expected.occurredAt}::timestamptz`
              : sql`${columns[key]} IS NOT DISTINCT FROM ${expected[key]}`,
          ),
        ),
      )
      .returning();
    if (!row) {
      const [latest] = await deps.db
        .select()
        .from(contactActivities)
        .where(and(eq(contactActivities.orgId, orgId), eq(contactActivities.id, activityId.data)));
      return latest
        ? c.json({ error: "Activity changed while you were editing", current: latest }, 409)
        : c.json({ error: "Activity not found" }, 404);
    }
    const links = await deps.db
      .select({ contactId: activityContacts.contactId })
      .from(activityContacts)
      .where(and(eq(activityContacts.orgId, orgId), eq(activityContacts.activityId, row.id)));
    if (links.length)
      await deps.db
        .update(contacts)
        .set({ updatedAt: new Date() })
        .where(
          and(
            eq(contacts.orgId, orgId),
            inArray(
              contacts.id,
              links.map((x) => x.contactId),
            ),
          ),
        );
    if (row.kind !== "missed_phone")
      queueMicrotask(() => {
        void runContactAutomations(
          deps,
          orgId,
          links.map((link) => link.contactId),
        );
      });
    return c.json(row);
  });

  app.post("/v1/org/reminders/:id/dismiss", async (c) => {
    const reminderId = id.safeParse(c.req.param("id"));
    if (!reminderId.success) return c.json({ error: "Invalid reminder" }, 400);
    const [row] = await deps.db
      .update(contactReminders)
      .set({ dismissedAt: new Date() })
      .where(
        and(
          eq(contactReminders.id, reminderId.data),
          eq(contactReminders.orgId, c.get("org").id),
          eq(contactReminders.userId, c.get("user").id),
          isNull(contactReminders.dismissedAt),
        ),
      )
      .returning({ id: contactReminders.id });
    return row ? c.json({ dismissed: true }) : c.json({ error: "Reminder not found" }, 404);
  });

  app.post("/v1/org/reminders", async (c) => {
    const data = await parse(
      c,
      z.object({
        contactId: id,
        dueAt: z.iso.datetime(),
        message: z.string().max(2000).default(""),
      }),
    );
    if (!data) return c.json({ error: "Invalid reminder" }, 400);
    const orgId = c.get("org").id;
    const [contact] = await deps.db
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(
          eq(contacts.orgId, orgId),
          eq(contacts.id, data.contactId),
          ne(contacts.status, "duplicate"),
          isNull(contacts.deletedAt),
        ),
      );
    if (!contact) return c.json({ error: "Contact not found" }, 404);
    const [row] = await deps.db
      .insert(contactReminders)
      .values({
        orgId,
        userId: c.get("user").id,
        contactId: contact.id,
        dueAt: new Date(data.dueAt),
        message: data.message,
      })
      .returning();
    return c.json(row, 201);
  });

  app.post("/v1/org/activities/:id/delete", async (c) => {
    const activityId = id.safeParse(c.req.param("id"));
    if (!activityId.success) return c.json({ error: "Invalid activity" }, 400);
    const orgId = c.get("org").id;
    const deleted = await deps.db.transaction(async (tx) => {
      const links = await tx
        .select({ contactId: activityContacts.contactId })
        .from(activityContacts)
        .where(
          and(eq(activityContacts.orgId, orgId), eq(activityContacts.activityId, activityId.data)),
        );
      // Both references have restrictive foreign keys. Remove the draft with
      // its logged email and retain inbound suggestions without a dead link.
      await tx
        .delete(emailDrafts)
        .where(and(eq(emailDrafts.orgId, orgId), eq(emailDrafts.activityId, activityId.data)));
      await tx
        .update(inboundSuggestions)
        .set({ activityId: null })
        .where(
          and(
            eq(inboundSuggestions.orgId, orgId),
            eq(inboundSuggestions.activityId, activityId.data),
          ),
        );
      const [row] = await tx
        .delete(contactActivities)
        .where(and(eq(contactActivities.orgId, orgId), eq(contactActivities.id, activityId.data)))
        .returning({ id: contactActivities.id });
      if (!row) return null;
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
      return links;
    });
    if (deleted)
      queueMicrotask(() => {
        void runContactAutomations(
          deps,
          orgId,
          deleted.map((link) => link.contactId),
        );
      });
    return deleted ? c.json({ deleted: true }) : c.json({ error: "Activity not found" }, 404);
  });

  app.get("/v1/org/contacts/:id/duplicates", async (c) => {
    const contactId = id.safeParse(c.req.param("id"));
    if (!contactId.success) return c.json({ error: "Invalid contact" }, 400);
    const orgId = c.get("org").id;
    const [contact] = await deps.db
      .select()
      .from(contacts)
      .where(and(eq(contacts.orgId, orgId), eq(contacts.id, contactId.data)));
    if (!contact || contact.status === "duplicate" || contact.deletedAt)
      return c.json({ error: "Contact not found" }, 404);
    const possible = await deps.db
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.orgId, orgId),
          ne(contacts.id, contact.id),
          ne(contacts.status, "duplicate"),
          isNull(contacts.deletedAt),
          or(
            and(
              eq(contacts.normalizedName, contact.normalizedName),
              eq(contacts.companyId, contact.companyId),
            ),
            ...(contact.email ? [eq(contacts.email, contact.email)] : []),
            ...(contact.phoneNormalized
              ? [eq(contacts.phoneNormalized, contact.phoneNormalized)]
              : []),
          ),
        ),
      );
    return c.json(
      possible.filter(
        (row) =>
          (row.normalizedName === contact.normalizedName && row.companyId === contact.companyId) ||
          (contact.email && row.email?.toLowerCase() === contact.email.toLowerCase()) ||
          (phoneKey(contact.phone) && phoneKey(row.phone) === phoneKey(contact.phone)),
      ),
    );
  });
  app.post("/v1/org/duplicates/merge", async (c) => {
    const data = await parse(
      c,
      z.object({
        primaryId: id,
        duplicateId: id,
        fields: z.array(z.enum(["name", "companyId", "email", "phone", "description"])).default([]),
        activityIds: z.array(id).default([]),
      }),
    );
    if (!data || data.primaryId === data.duplicateId)
      return c.json({ error: "Choose two different contacts" }, 400);
    const orgId = c.get("org").id;
    const [primary, duplicate] = await Promise.all(
      [data.primaryId, data.duplicateId].map((contactId) =>
        deps.db
          .select()
          .from(contacts)
          .where(
            and(
              eq(contacts.orgId, orgId),
              eq(contacts.id, contactId),
              ne(contacts.status, "duplicate"),
              isNull(contacts.deletedAt),
            ),
          )
          .limit(1)
          .then((rows) => rows[0]),
      ),
    );
    if (!primary || !duplicate)
      return c.json({ error: "Both contacts must be active in this team" }, 404);
    const matching =
      (primary.normalizedName === duplicate.normalizedName &&
        primary.companyId === duplicate.companyId) ||
      (!!primary.email && primary.email.toLowerCase() === duplicate.email?.toLowerCase()) ||
      (!!phoneKey(primary.phone) && phoneKey(primary.phone) === phoneKey(duplicate.phone));
    if (!matching) return c.json({ error: "Contacts do not match duplicate criteria" }, 400);
    const uniqueActivities = [...new Set(data.activityIds)];
    const linked = uniqueActivities.length
      ? await deps.db
          .select({ activityId: activityContacts.activityId })
          .from(activityContacts)
          .where(
            and(
              eq(activityContacts.orgId, orgId),
              eq(activityContacts.contactId, duplicate.id),
              inArray(activityContacts.activityId, uniqueActivities),
            ),
          )
      : [];
    if (linked.length !== uniqueActivities.length)
      return c.json({ error: "Selected activity is not linked to duplicate" }, 400);
    const fieldPatch: Partial<typeof primary> = {};
    for (const field of data.fields)
      (fieldPatch as Record<string, unknown>)[field] = duplicate[field];
    if (data.fields.includes("name")) fieldPatch.normalizedName = norm(duplicate.name);
    if (data.fields.includes("phone")) fieldPatch.phoneNormalized = phoneKey(duplicate.phone);
    await deps.db.transaction(async (tx) => {
      await tx
        .update(contacts)
        .set({ ...fieldPatch, updatedAt: new Date() })
        .where(eq(contacts.id, primary.id));
      const duplicateFavorites = await tx
        .select({ userId: favoriteContacts.userId })
        .from(favoriteContacts)
        .where(
          and(eq(favoriteContacts.orgId, orgId), eq(favoriteContacts.contactId, duplicate.id)),
        );
      if (duplicateFavorites.length) {
        await tx
          .insert(favoriteContacts)
          .values(
            duplicateFavorites.map(({ userId }) => ({
              orgId,
              userId,
              contactId: primary.id,
            })),
          )
          .onConflictDoNothing();
        await tx
          .delete(favoriteContacts)
          .where(
            and(eq(favoriteContacts.orgId, orgId), eq(favoriteContacts.contactId, duplicate.id)),
          );
      }
      for (const activityId of uniqueActivities) {
        await tx
          .update(contactActivities)
          .set({ exportOwnerContactId: primary.id })
          .where(
            and(
              eq(contactActivities.id, activityId),
              eq(contactActivities.exportOwnerContactId, duplicate.id),
            ),
          );
        await tx
          .insert(activityContacts)
          .values({ orgId, activityId, contactId: primary.id })
          .onConflictDoNothing();
        await tx
          .delete(activityContacts)
          .where(
            and(
              eq(activityContacts.orgId, orgId),
              eq(activityContacts.activityId, activityId),
              eq(activityContacts.contactId, duplicate.id),
            ),
          );
      }
      await tx
        .update(contacts)
        .set({ status: "duplicate", duplicateOfId: primary.id, updatedAt: new Date() })
        .where(eq(contacts.id, duplicate.id));
    });
    if (uniqueActivities.length)
      queueMicrotask(() => {
        void runContactAutomations(deps, orgId, [primary.id]);
      });
    return c.json({ primaryId: primary.id, duplicateId: duplicate.id });
  });
}
