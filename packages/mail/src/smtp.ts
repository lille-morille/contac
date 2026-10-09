import { createHash } from "node:crypto";
import { simpleParser, type AddressObject, type Attachment } from "mailparser";
import { SMTPServer } from "smtp-server";

export const MAX_MESSAGE_BYTES = 10_000_000;

type WebhookFetch = (url: string, init: RequestInit) => Promise<Response>;

export type SmtpConfig = {
  address: string;
  webhookUrl: string;
  secret: string;
  fetchWebhook?: WebhookFetch;
};

const addresses = (value: AddressObject | AddressObject[] | undefined) =>
  (value ? (Array.isArray(value) ? value : [value]) : []).flatMap((entry) =>
    entry.value
      .map((person) => person.address?.toLowerCase())
      .filter((email): email is string => !!email),
  );

function bodyText(text: string | undefined, html: string | false | undefined) {
  if (text?.trim()) return text.trim().slice(0, 250_000);
  if (!html) return "";
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(?:p|div|li|tr|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n[\s\n]+/g, "\n")
    .trim()
    .slice(0, 250_000);
}

async function attachedForward(attachments: Attachment[]) {
  const messages = attachments.filter(
    (attachment) =>
      attachment.contentType.toLowerCase() === "message/rfc822" ||
      attachment.filename?.toLowerCase().endsWith(".eml"),
  );
  if (messages.length !== 1) return { forwarded: messages.length > 0, message: null };
  try {
    const original = await simpleParser(messages[0]!.content);
    const fromEmail = addresses(original.from)[0] ?? "";
    const toEmails = addresses(original.to);
    const body = bodyText(original.text, original.html);
    return {
      forwarded: true,
      message: {
        source: "attachment" as const,
        confidence:
          fromEmail && toEmails.length && original.subject && original.date && body
            ? ("certain" as const)
            : ("review" as const),
        fromEmail,
        toEmails,
        ccEmails: addresses(original.cc),
        subject: original.subject ?? "",
        body,
        occurredAt: original.date?.toISOString() ?? null,
      },
    };
  } catch {
    return { forwarded: true, message: null };
  }
}

export function createSmtpServer({
  address,
  webhookUrl,
  secret,
  fetchWebhook = fetch,
}: SmtpConfig) {
  address = address.trim().toLowerCase();
  const smtp = new SMTPServer({
    banner: "Contac receive-only inbox",
    disabledCommands: ["AUTH"],
    // Bun cannot reliably upgrade this socket to STARTTLS. A terminating SMTP
    // proxy is required if transport encryption is needed before the app.
    hideSTARTTLS: true,
    size: MAX_MESSAGE_BYTES,
    maxClients: 30,
    onRcptTo(recipient, _session, callback) {
      if (recipient.address.toLowerCase() === address) return callback();
      return callback(Object.assign(new Error("Mailbox not found"), { responseCode: 550 }));
    },
    onData(stream, session, callback) {
      const chunks: Buffer[] = [];
      let bytes = 0;
      let oversized = false;
      let replied = false;
      const finish = (error?: Error) => {
        if (replied) return;
        replied = true;
        if (error) callback(error);
        else callback();
      };
      stream.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > MAX_MESSAGE_BYTES) {
          oversized = true;
          chunks.length = 0;
        } else if (!oversized) chunks.push(Buffer.from(chunk));
      });
      stream.on("error", () =>
        finish(Object.assign(new Error("Could not read message"), { responseCode: 451 })),
      );
      stream.on("end", () => {
        if (oversized)
          return finish(
            Object.assign(new Error("Message exceeds 10 MB size limit"), { responseCode: 552 }),
          );
        void (async () => {
          try {
            const raw = Buffer.concat(chunks);
            const mail = await simpleParser(raw);
            const fromEmail =
              mail.from?.value[0]?.address?.toLowerCase() ||
              (session.envelope.mailFrom ? session.envelope.mailFrom.address.toLowerCase() : "");
            if (!fromEmail) throw new Error("Missing sender address");
            const providerMessageId =
              mail.messageId?.trim() || `sha256:${createHash("sha256").update(raw).digest("hex")}`;
            const attached = await attachedForward(mail.attachments);
            const response = await fetchWebhook(webhookUrl, {
              method: "POST",
              headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
              signal: AbortSignal.timeout(30_000),
              body: JSON.stringify({
                providerMessageId,
                fromEmail,
                toEmails: addresses(mail.to),
                ccEmails: addresses(mail.cc),
                bccEmails: [
                  ...new Set([
                    ...addresses(mail.bcc),
                    ...session.envelope.rcptTo.map((item) => item.address.toLowerCase()),
                  ]),
                ],
                subject: mail.subject ?? "",
                body: bodyText(mail.text, mail.html),
                receivedAt: mail.date?.toISOString() ?? new Date().toISOString(),
                rawMimeBase64: raw.toString("base64"),
                forwardedAttachment: attached.message,
                forwardedAttachmentPresent: attached.forwarded,
              }),
            });
            const result: unknown = response.ok ? await response.json().catch(() => null) : null;
            const stored =
              result !== null &&
              typeof result === "object" &&
              (("accepted" in result && result.accepted === true) ||
                ("duplicate" in result && result.duplicate === true));
            if (!response.ok || !stored) {
              console.error(`smtp: inbound storage/routing failed (${response.status})`);
              return finish(
                Object.assign(new Error("Temporary ingest failure"), { responseCode: 451 }),
              );
            }
            // Acknowledge only after the message and its routing state are stored.
            finish();
          } catch (cause) {
            console.error("smtp: message handling failed", cause);
            finish(Object.assign(new Error("Temporary ingest failure"), { responseCode: 451 }));
          }
        })();
      });
    },
  });
  return smtp;
}
