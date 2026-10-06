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
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import type { Hono } from "hono";
import type { ApiDeps, ApiEnv } from "./types.ts";

type SearchDocument = {
  key: string;
  orgId: string;
  contactId: string;
  activityId: string | null;
  kind: "contact" | "activity" | "note" | "additional_info";
  body: string;
  version: string;
};

const modelId = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";
type LocalExtractor = (
  input: string,
  options: { pooling: "mean"; normalize: true },
) => Promise<{ data: Float32Array }>;
let extractorPromise: Promise<LocalExtractor> | null = null;
async function embed(input: string): Promise<number[]> {
  const transformers = await import("@huggingface/transformers");
  const make = transformers.pipeline as unknown as (
    task: string,
    model: string,
    options: { dtype: string },
  ) => Promise<LocalExtractor>;
  extractorPromise ??= make("feature-extraction", modelId, { dtype: "q8" });
  const extractor = await extractorPromise!;
  const tensor = await extractor(input.slice(0, 2500), { pooling: "mean", normalize: true });
  return Array.from(tensor.data as Float32Array);
}
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
function cosine(a: number[], b: number[]) {
  if (a.length !== b.length) return 0;
  let score = 0;
  for (let i = 0; i < a.length; i++) score += a[i]! * b[i]!;
  return score;
}
const normal = (value: string) => value.toLocaleLowerCase("nb-NO").normalize("NFKC");

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
    const tags = tagRows.filter((row) => row.contactId === contact.id).map((row) => row.name);
    const domains = domainRows
      .filter((row) => row.companyId === contact.companyId)
      .map((row) => row.name);
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
    for (const entry of additionalInfoRows.filter((entry) => entry.contactId === contact.id))
      add(contact.id, null, "additional_info", entry.markdown);
  }
  for (const { contactId, activity } of links) {
    if (!active.has(contactId)) continue;
    const mail = emailRows.find((row) => row.activityId === activity.id);
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
  })();
  indexing.set(orgId, promise);
  try {
    await promise;
  } finally {
    indexing.delete(orgId);
  }
}

export function registerSearchRoutes(app: Hono<ApiEnv>, deps: ApiDeps) {
  app.get("/v1/org/search", async (c) => {
    const query = (c.req.query("q") ?? "").trim().slice(0, 500);
    if (query.length < 2) return c.json({ results: [], model: modelId });
    const orgId = c.get("org").id;
    const approvals = await deps.db
      .select({
        ownerOrgId: logAccessRequests.ownerOrgId,
        ownerContactId: logAccessRequests.ownerContactId,
      })
      .from(logAccessRequests)
      .where(
        and(eq(logAccessRequests.requesterOrgId, orgId), eq(logAccessRequests.status, "approved")),
      );
    const orgIds = [...new Set([orgId, ...approvals.map((item) => item.ownerOrgId)])];
    try {
      for (const id of orgIds) await ensureIndexed(deps, id);
    } catch {
      return c.json(
        { error: "Local search model is unavailable. Check server model download/cache." },
        503,
      );
    }
    const [rows, people, vector] = await Promise.all([
      deps.db.select().from(searchChunks).where(inArray(searchChunks.orgId, orgIds)),
      deps.db
        .select({
          id: contacts.id,
          orgId: contacts.orgId,
          name: contacts.name,
          status: contacts.status,
          companyName: companies.name,
        })
        .from(contacts)
        .innerJoin(companies, eq(companies.id, contacts.companyId))
        .where(and(inArray(contacts.orgId, orgIds), isNull(contacts.deletedAt))),
      embed(query),
    ]);
    const approved = new Set(approvals.map((item) => item.ownerContactId));
    const byId = new Map(people.map((person) => [person.id, person]));
    const words = normal(query)
      .split(/\s+/)
      .filter((word) => word.length > 2);
    const results = rows
      .filter(
        (row) =>
          row.orgId === orgId ||
          (approved.has(row.contactId) &&
            row.sourceKind !== "note" &&
            row.sourceKind !== "additional_info"),
      )
      .filter((row) => {
        const person = byId.get(row.contactId);
        return !!person && person.status !== "duplicate";
      })
      .map((row) => {
        const person = byId.get(row.contactId)!;
        const body = normal(row.body);
        const lexical = words.length
          ? words.filter((word) => body.includes(word)).length / words.length
          : 0;
        return {
          contactId: row.contactId,
          activityId: row.activityId,
          kind: row.sourceKind,
          passage: row.body,
          contactName: person.name,
          companyName: person.companyName,
          ownerOrgId: person.orgId,
          score: cosine(vector, row.embedding) + lexical * 0.2,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 30);
    return c.json({ results, model: modelId });
  });
}
