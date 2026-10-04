export const normalizeEmail = (value: string) => value.trim().toLowerCase();

export function emailList(value: string | string[]): string[] {
  const parts = Array.isArray(value)
    ? value.flatMap((part) => part.split(/[,;\n]/))
    : value.split(/[,;\n]/);
  return [...new Set(parts.map(normalizeEmail).filter(Boolean))];
}

export function sameEmailSet(left: string[], right: string[]): boolean {
  const a = emailList(left).sort();
  const b = emailList(right).sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function contactMatchesEmail(
  contactEmail: string | null,
  message: { fromEmail: string; toEmails: string[]; ccEmails: string[] },
): boolean {
  return (
    !!contactEmail &&
    [message.fromEmail, ...message.toEmails, ...message.ccEmails]
      .map(normalizeEmail)
      .includes(normalizeEmail(contactEmail))
  );
}
