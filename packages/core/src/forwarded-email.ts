import { extractEmailAddresses } from "./email.ts";

export type ForwardedEmail = {
  source: "inline" | "attachment";
  confidence: "certain" | "review";
  fromEmail: string;
  toEmails: string[];
  ccEmails: string[];
  subject: string;
  body: string;
  occurredAt: string | null;
};

const labels: Record<string, "from" | "to" | "cc" | "subject" | "date"> = {
  from: "from",
  fra: "from",
  von: "from",
  de: "from",
  da: "from",
  to: "to",
  til: "to",
  an: "to",
  à: "to",
  para: "to",
  a: "to",
  cc: "cc",
  kopi: "cc",
  copia: "cc",
  subject: "subject",
  emne: "subject",
  betreff: "subject",
  objet: "subject",
  asunto: "subject",
  oggetto: "subject",
  date: "date",
  dato: "date",
  datum: "date",
  sent: "date",
  sendt: "date",
  gesendet: "date",
  envoyé: "date",
  fecha: "date",
  data: "date",
};

const forwardSubject = /^(?:\s*(?:fwd?|wg|tr|rv|enc|vs)\s*:\s*)+/i;
const forwardMarker =
  /\b(?:forwarded|videre(?:sendt|sendt melding)|weitergeleitet|transféré|reenvia(?:do|da)|inoltrat[ao])\b/i;

function parsedDate(value: string): string | null {
  const normalized = value
    .replace(/\s+at\s+/i, " ")
    .replace(
      /\bGMT([+-])(\d{1,2})(?::?(\d{2}))?\b/i,
      (_, sign: string, hour: string, minute: string | undefined) =>
        `${sign}${hour.padStart(2, "0")}${minute ?? "00"}`,
    );
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

type Header = "from" | "to" | "cc" | "subject" | "date";
type Candidate = {
  start: number;
  end: number;
  fields: Partial<Record<Header, string>>;
  body: string;
};

function headerCandidates(lines: string[]): Candidate[] {
  const result: Candidate[] = [];
  for (let start = 0; start < lines.length; start++) {
    const first = lines[start]!.replace(/^\s*>+\s?/, "").match(/^([^:]{1,24}):\s*(.*)$/);
    if (!first || !labels[first[1]!.trim().toLocaleLowerCase()]) continue;
    const fields: Partial<Record<Header, string>> = {};
    let end = start;
    for (; end < Math.min(lines.length, start + 14); end++) {
      const line = lines[end]!.replace(/^\s*>+\s?/, "");
      if (!line.trim()) break;
      const match = line.match(/^([^:]{1,24}):\s*(.*)$/);
      const field = match && labels[match[1]!.trim().toLocaleLowerCase()];
      if (field && !fields[field]) fields[field] = match![2]!.trim();
      else if (/^\s+\S/.test(line) && end > start) {
        const previous = Object.keys(fields).at(-1) as Header | undefined;
        if (previous) fields[previous] += ` ${line.trim()}`;
      } else break;
    }
    if (Object.keys(fields).length < 3 || !fields.from || !fields.to) continue;
    const body = lines
      .slice(end + (lines[end]?.trim() ? 0 : 1))
      .join("\n")
      .trim();
    if (!body) continue;
    result.push({ start, end, fields, body });
    start = end;
  }
  return result;
}

export function parseInlineForward(
  body: string,
  outerSubject: string,
): { forwarded: boolean; message: ForwardedEmail | null } {
  const normalized = body.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const candidates = headerCandidates(lines);
  const forwarded =
    forwardSubject.test(outerSubject) ||
    forwardMarker.test(lines.slice(0, 20).join("\n")) ||
    candidates.length > 0;
  if (!candidates.length) return { forwarded, message: null };
  const candidate = candidates[0]!;
  const fromEmail = extractEmailAddresses(candidate.fields.from ?? "")[0] ?? "";
  const toEmails = extractEmailAddresses(candidate.fields.to ?? "");
  const ccEmails = extractEmailAddresses(candidate.fields.cc ?? "");
  const occurredAt = parsedDate(candidate.fields.date ?? "");
  const complete =
    !!fromEmail &&
    toEmails.length > 0 &&
    !!candidate.fields.subject &&
    !!occurredAt &&
    candidates.length === 1 &&
    !lines[candidate.end]?.trim();
  return {
    forwarded: true,
    message: {
      source: "inline",
      confidence: complete ? "certain" : "review",
      fromEmail,
      toEmails,
      ccEmails,
      subject: candidate.fields.subject ?? "",
      body: candidate.body.slice(0, 250_000),
      occurredAt,
    },
  };
}
