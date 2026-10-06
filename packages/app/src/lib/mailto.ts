type MailtoDraft = {
  toEmails: string[];
  ccEmails: string[];
  bccEmails: string[];
  subject: string;
  body: string;
};

export function buildMailtoUrl(draft: MailtoDraft): string {
  const fields = [
    ["cc", draft.ccEmails.join(",")],
    ["bcc", draft.bccEmails.join(",")],
    ["subject", draft.subject],
    ["body", draft.body],
  ];
  const query = fields
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");
  const recipients = draft.toEmails.map(encodeURIComponent).join(",");
  return `mailto:${recipients}${query ? `?${query}` : ""}`;
}
