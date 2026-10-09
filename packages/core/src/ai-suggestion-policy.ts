export function canSuggestContactField(field: string, current: unknown): boolean {
  if (field === "companyId") return false;
  if (["description", "sammendrag", "stikkord", "relevance"].includes(field)) return true;
  return Array.isArray(current) ? current.length === 0 : !String(current ?? "").trim();
}

export function eligibleContactFields(
  proposed: Record<string, string>,
  current: { email?: string | null; phone?: string | null; description?: string | null },
) {
  return Object.fromEntries(
    Object.entries(proposed).filter(
      ([field]) =>
        ["email", "phone", "description"].includes(field) &&
        canSuggestContactField(field, current[field as keyof typeof current]),
    ),
  );
}
