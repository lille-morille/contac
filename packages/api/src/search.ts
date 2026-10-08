import { createHash } from "node:crypto";
import {
  activityContacts,
  companies,
  companyDomains,
  contactActivities,
  contactAdditionalInfo,
  contactPersonTags,
  contacts,
  domainTags,
  emailActivities,
  logAccessRequests,
  personTags,
  searchChunks,
} from "@contac/core/db";
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type { Hono } from "hono";
import type { ApiDeps, ApiEnv } from "./types.ts";
import { embed, searchModelId } from "./embedding.ts";

type SearchDocument = {
  key: string;
  orgId: string;
  contactId: string;
  activityId: string | null;
  kind: "contact" | "activity" | "note" | "additional_info";
  body: string;
  version: string;
};

function fingerprint(body: string) {
  return createHash("sha256").update(body).digest("hex");
}
function passages(value: string) {
  const text = value.replace(/\s+/g, " ").trim();
  const chunks: string[] = [];
  for (let start = 0; start < text.length; start += 660) {
    chunks.push(text.slice(start, start + 760));
    if (chunks.length >= 100) break;
  }
  return chunks;
}
function groupBy<T>(rows: T[], key: (row: T) => string) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const id = key(row);
    const group = groups.get(id) ?? [];
    group.push(row);
    groups.set(id, group);
  }
  return groups;
}
async function documents(deps: ApiDeps, orgId: string): Promise<SearchDocument[]> {
  const [people, links, tagRows, domainRows, emailRows, additionalInfoRows] = await Promise.all([
    deps.db
      .select({ contact: contacts, company: companies.name })
      .from(contacts)
      .innerJoin(companies, eq(companies.id, contacts.companyId))
      .where(
        and(
          eq(contacts.orgId, orgId),
          ne(contacts.status, "duplicate"),
          isNull(contacts.deletedAt),
        ),
      ),
    deps.db
      .select({ contactId: activityContacts.contactId, activity: contactActivities })
      .from(activityContacts)
      .innerJoin(contactActivities, eq(contactActivities.id, activityContacts.activityId))
      .where(eq(activityContacts.orgId, orgId)),
    deps.db
      .select({ contactId: contactPersonTags.contactId, name: personTags.name })
      .from(contactPersonTags)
      .innerJoin(personTags, eq(personTags.id, contactPersonTags.tagId))
      .where(eq(contactPersonTags.orgId, orgId)),
    deps.db
      .select({ companyId: companyDomains.companyId, name: domainTags.name })
      .from(companyDomains)
      .innerJoin(domainTags, eq(domainTags.id, companyDomains.domainId))
      .where(eq(companyDomains.orgId, orgId)),
    deps.db
      .select({
        activityId: emailActivities.activityId,
        subject: emailActivities.subject,
        from: emailActivities.fromEmail,
        to: emailActivities.toEmails,
        cc: emailActivities.ccEmails,
      })
      .from(emailActivities)
      .where(eq(emailActivities.orgId, orgId)),
    deps.db.select().from(contactAdditionalInfo).where(eq(contactAdditionalInfo.orgId, orgId)),
  ]);
  const active = new Set(people.map((row) => row.contact.id));
  const tagsByContact = groupBy(tagRows, (row) => row.contactId);
  const domainsByCompany = groupBy(domainRows, (row) => row.companyId);
  const infoByContact = groupBy(additionalInfoRows, (row) => row.contactId);
  const emailByActivity = new Map(emailRows.map((row) => [row.activityId, row]));
  const result: SearchDocument[] = [];
  function add(
    contactId: string,
    activityId: string | null,
    kind: SearchDocument["kind"],
    body: string,
  ) {
    passages(body).forEach((passage, index) => {
      result.push({
        key: `${orgId}:${contactId}:${kind}:${activityId ?? "none"}:${index}`,
        orgId,
        contactId,
        activityId,
        kind,
        body: passage,
        version: fingerprint(passage),
      });
    });
  }
  for (const { contact, company } of people) {
    const tags = (tagsByContact.get(contact.id) ?? []).map((row) => row.name);
    const domains = (domainsByCompany.get(contact.companyId) ?? []).map((row) => row.name);
    add(
      contact.id,
      null,
      "contact",
      [
        contact.name,
        company,
        contact.email,
        contact.phone,
        contact.description,
        ...tags,
        ...domains,
      ]
        .filter(Boolean)
        .join(" · "),
    );
    if (contact.sharedNote.trim()) add(contact.id, null, "note", contact.sharedNote);
    for (const entry of infoByContact.get(contact.id) ?? [])
      add(contact.id, null, "additional_info", entry.markdown);
  }
  for (const { contactId, activity } of links) {
    if (!active.has(contactId)) continue;
    const mail = emailByActivity.get(activity.id);
    const body = [
      mail?.subject,
      mail?.from,
      ...(mail?.to ?? []),
      ...(mail?.cc ?? []),
      activity.summary,
      activity.transcript,
    ]
      .filter(Boolean)
      .join("\n");
    if (body.trim()) add(contactId, activity.id, "activity", body);
  }
  return result;
}

const indexing = new Map<string, Promise<void>>();
const lastIndexed = new Map<string, number>();
async function ensureIndexed(deps: ApiDeps, orgId: string) {
  if (indexing.has(orgId)) return indexing.get(orgId)!;
  const promise = (async () => {
    const source = await documents(deps, orgId);
    const existing = await deps.db
      .select({ key: searchChunks.sourceKey, version: searchChunks.sourceVersion })
      .from(searchChunks)
      .where(eq(searchChunks.orgId, orgId));
    const old = new Map(existing.map((row) => [row.key, row.version]));
    const current = new Set(source.map((doc) => doc.key));
    const obsolete = existing.filter((row) => !current.has(row.key)).map((row) => row.key);
    if (obsolete.length)
      await deps.db
        .delete(searchChunks)
        .where(and(eq(searchChunks.orgId, orgId), inArray(searchChunks.sourceKey, obsolete)));
    for (const doc of source) {
      if (old.get(doc.key) === doc.version) continue;
      const embedding = await embed(doc.body);
      await deps.db
        .insert(searchChunks)
        .values({
          orgId,
          contactId: doc.contactId,
          activityId: doc.activityId,
          sourceKind: doc.kind,
          sourceKey: doc.key,
          sourceVersion: doc.version,
          body: doc.body,
          embedding,
        })
        .onConflictDoUpdate({
          target: searchChunks.sourceKey,
          set: { sourceVersion: doc.version, body: doc.body, embedding },
        });
    }
    lastIndexed.set(orgId, Date.now());
  })();
  indexing.set(orgId, promise);
  try {
    await promise;
  } finally {
    indexing.delete(orgId);
  }
}

export type SearchResult = {
  contactId: string;
  activityId: string | null;
  kind: SearchDocument["kind"];
  passage: string;
  contactName: string;
  companyName: string;
  ownerOrgId: string;
  score: number;
};

export async function searchTeam(
  deps: ApiDeps,
  orgId: string,
  query: string,
  options: { includeShared?: boolean; limit?: number } = {},
): Promise<SearchResult[]> {
  query = query.trim().slice(0, 500);
  if (query.length < 2) return [];
  const includeShared = options.includeShared ?? true;
  const limit = Math.min(Math.max(options.limit ?? 30, 1), 30);
  const approvals = includeShared
    ? await deps.db
        .select({ ownerOrgId: logAccessRequests.ownerOrgId })
        .from(logAccessRequests)
        .where(
          and(
            eq(logAccessRequests.requesterOrgId, orgId),
            eq(logAccessRequests.status, "approved"),
          ),
        )
    : [];
  const orgIds = [...new Set([orgId, ...approvals.map((item) => item.ownerOrgId)])];
  // The index is durable in Postgres. Serve it immediately after a restart and
  // refresh changed passages after the response; an empty index must be built first.
  const refreshLater: string[] = [];
  for (const id of orgIds) {
    if (Date.now() - (lastIndexed.get(id) ?? 0) < 30_000) continue;
    const existing = await deps.db
      .select({ id: searchChunks.id })
      .from(searchChunks)
      .where(eq(searchChunks.orgId, id))
      .limit(1);
    if (existing.length) refreshLater.push(id);
    else await ensureIndexed(deps, id);
  }
  const vector = JSON.stringify(await embed(query));
  const access = includeShared
    ? sql`(
        sc.org_id = ${orgId}::uuid OR (
          sc.source_kind NOT IN ('note', 'additional_info') AND EXISTS (
            SELECT 1 FROM public.log_access_requests lar
            WHERE lar.requester_org_id = ${orgId}::uuid
              AND lar.owner_org_id = sc.org_id
              AND lar.owner_contact_id = sc.contact_id
              AND lar.status = 'approved'
          )
        )
      )`
    : sql`sc.org_id = ${orgId}::uuid`;
  const eligible = sql`
    FROM public.search_chunks sc
    JOIN public.contacts c ON c.id = sc.contact_id AND c.org_id = sc.org_id
    WHERE ${access} AND c.deleted_at IS NULL AND c.status <> 'duplicate'
  `;
  const rows = await deps.db.execute(sql<SearchResult>`
    WITH semantic AS (
      SELECT sc.id ${eligible}
      ORDER BY sc.embedding <=> ${vector}::extensions.vector(384)
      LIMIT 120
    ), lexical AS (
      SELECT sc.id ${eligible}
        AND to_tsvector('simple', sc.body) @@ websearch_to_tsquery('simple', ${query})
      ORDER BY ts_rank_cd(to_tsvector('simple', sc.body), websearch_to_tsquery('simple', ${query})) DESC
      LIMIT 120
    ), candidates AS (
      SELECT id FROM semantic UNION SELECT id FROM lexical
    )
    SELECT sc.contact_id AS "contactId", sc.activity_id AS "activityId",
      sc.source_kind AS kind, sc.body AS passage, c.name AS "contactName",
      co.name AS "companyName", sc.org_id AS "ownerOrgId",
      (1 - (sc.embedding <=> ${vector}::extensions.vector(384))
        + LEAST(ts_rank_cd(to_tsvector('simple', sc.body), websearch_to_tsquery('simple', ${query})), 1) * 0.2)::double precision AS score
    FROM candidates candidate
    JOIN public.search_chunks sc ON sc.id = candidate.id
    JOIN public.contacts c ON c.id = sc.contact_id AND c.org_id = sc.org_id
    JOIN public.companies co ON co.id = c.company_id AND co.org_id = sc.org_id
    WHERE ${access} AND c.deleted_at IS NULL AND c.status <> 'duplicate'
    ORDER BY score DESC, sc.id
    LIMIT ${limit}
  `);
  for (const id of refreshLater)
    setTimeout(() => {
      void ensureIndexed(deps, id).catch((error) =>
        console.error("Search index refresh failed", error),
      );
    }, 0);
  return Array.from(rows) as SearchResult[];
}

export function registerSearchRoutes(app: Hono<ApiEnv>, deps: ApiDeps) {
  app.get("/v1/org/search", async (c) => {
    const query = (c.req.query("q") ?? "").trim().slice(0, 500);
    try {
      const results = await searchTeam(deps, c.get("org").id, query);
      return c.json({ results, model: searchModelId });
    } catch (error) {
      console.error("Search failed", error);
      return c.json({ error: "Local search is temporarily unavailable." }, 503);
    }
  });
}
