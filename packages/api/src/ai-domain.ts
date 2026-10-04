export function normalizeDomainName(value: string) {
  return value.trim().normalize("NFKC").toLocaleLowerCase("nb-NO").replace(/\s+/g, " ");
}

export function resolveDomainProposal(
  proposed: unknown,
  existing: { id: string; normalizedName: string }[],
) {
  const name = typeof proposed === "string" ? proposed.trim().slice(0, 100) : "";
  if (!name) return { domainId: null, newDomainName: null };
  const match = existing.find((domain) => domain.normalizedName === normalizeDomainName(name));
  return match
    ? { domainId: match.id, newDomainName: null }
    : { domainId: null, newDomainName: name };
}
