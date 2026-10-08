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

/** Local address classifier for forwarded text, including Outlook mailto copies. */
export function extractEmailAddresses(body: string): string[] {
  return emailList(
    body.match(
      /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)+/gi,
    ) ?? [],
  );
}

/** Match headers first, then the owning team's validated AI extraction. */
export function matchingInboundContacts<T extends { email: string | null }>(
  contacts: T[],
  message: {
    fromEmail: string;
    toEmails: string[];
    ccEmails: string[];
    body?: string;
    extractedEmails?: string[];
  },
): T[] {
  const direct = contacts.filter((contact) => contactMatchesEmail(contact.email, message));
  if (direct.length) return direct;
  const extracted = new Set(emailList(message.extractedEmails ?? []));
  return contacts.filter(
    (contact) => contact.email && extracted.has(normalizeEmail(contact.email)),
  );
}
