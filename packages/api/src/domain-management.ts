import { companies, companyDomains, domainTags } from "@contac/core/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { ApiDeps } from "./types.ts";

export type DomainReplacement = {
  companyId: string;
  domainIds: string[];
  expectedRevision: number;
};

export async function replaceCompanyDomains(
  db: ApiDeps["db"],
  orgId: string,
  input: DomainReplacement,
  dryRun = false,
) {
  return db.transaction(async (tx) => {
    // All writers lock the organization before reading or replacing its links.
    const [company] = await tx
      .select({
        id: companies.id,
        name: companies.name,
        domainsRevision: companies.domainsRevision,
      })
      .from(companies)
      .where(and(eq(companies.orgId, orgId), eq(companies.id, input.companyId)))
      .for("update");
    if (!company) return { status: "error" as const, error: "Organization not found in this team" };

    const current = await tx
      .select({ id: domainTags.id, name: domainTags.name })
      .from(companyDomains)
      .innerJoin(
        domainTags,
        and(eq(domainTags.id, companyDomains.domainId), eq(domainTags.orgId, orgId)),
      )
      .where(and(eq(companyDomains.orgId, orgId), eq(companyDomains.companyId, company.id)));
    const sorted = (rows: typeof current) => [...rows].sort((a, b) => a.id.localeCompare(b.id));
    const previous = { revision: company.domainsRevision, domains: sorted(current) };
    const base = { company: { id: company.id, name: company.name }, previous };
    if (company.domainsRevision !== input.expectedRevision)
      return {
        ...base,
        status: "conflict" as const,
        error:
          "Organization domains changed since they were read. Call list_team_reference and retry.",
        resulting: previous,
      };
    if (new Set(input.domainIds).size !== input.domainIds.length)
      return {
        ...base,
        status: "error" as const,
        error: "Duplicate domain ID in replacement",
        resulting: previous,
      };
    const desired = input.domainIds.length
      ? await tx
          .select({ id: domainTags.id, name: domainTags.name })
          .from(domainTags)
          .where(and(eq(domainTags.orgId, orgId), inArray(domainTags.id, input.domainIds)))
      : [];
    if (desired.length !== input.domainIds.length)
      return {
        ...base,
        status: "error" as const,
        error: "A domain was not found in this team; no links were changed",
        resulting: previous,
      };
    const next = sorted(desired);
    const unchanged =
      next.map((row) => row.id).join("|") === previous.domains.map((row) => row.id).join("|");
    const resulting = {
      revision: company.domainsRevision + (unchanged || dryRun ? 0 : 1),
      domains: next,
    };
    if (dryRun) return { ...base, status: "dry_run" as const, resulting, wouldChange: !unchanged };
    if (unchanged) return { ...base, status: "unchanged" as const, resulting };
    await tx
      .delete(companyDomains)
      .where(and(eq(companyDomains.orgId, orgId), eq(companyDomains.companyId, company.id)));
    if (next.length)
      await tx.insert(companyDomains).values(
        next.map((domain) => ({
          orgId,
          companyId: company.id,
          domainId: domain.id,
        })),
      );
    await tx
      .update(companies)
      .set({ domainsRevision: sql`${companies.domainsRevision} + 1` })
      .where(and(eq(companies.orgId, orgId), eq(companies.id, company.id)));
    return { ...base, status: "updated" as const, resulting };
  });
}
