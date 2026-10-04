import { createHash } from "node:crypto";
import { simpleParser, type AddressObject } from "mailparser";
import { SMTPServer } from "smtp-server";
import type { Hono } from "hono";
import type { ApiEnv } from "./types.ts";

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
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 250_000);
}

export function startSmtpServer(app: Hono<ApiEnv>) {
  const address = process.env.INBOUND_ADDRESS?.trim().toLowerCase();
  if (!address) return null;
  const secret = process.env.INBOUND_WEBHOOK_SECRET;
  if (!secret) throw new Error("INBOUND_WEBHOOK_SECRET is required when INBOUND_ADDRESS is set");
  const port = Number(process.env.SMTP_PORT ?? 2525);
  const host = process.env.SMTP_HOST ?? "127.0.0.1";
  const smtp = new SMTPServer({
    banner: "Contac receive-only inbox",
    disabledCommands: ["AUTH"],
    // Bun cannot reliably upgrade this socket to STARTTLS. A terminating SMTP
    // proxy is required if transport encryption is needed before the app.
    hideSTARTTLS: true,
    size: 1_000_000,
    maxClients: 30,
    onRcptTo(recipient, _session, callback) {
      if (recipient.address.toLowerCase() === address) return callback();
      return callback(Object.assign(new Error("Mailbox not found"), { responseCode: 550 }));
    },
    onData(stream, session, callback) {
      const chunks: Buffer[] = [];
      let replied = false;
      const finish = (error?: Error) => {
        if (replied) return;
        replied = true;
        if (error) callback(error);
        else callback();
      };
      stream.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      stream.on("error", () =>
        finish(Object.assign(new Error("Could not read message"), { responseCode: 451 })),
      );
      stream.on("end", () => {
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
            const response = await app.request("/webhooks/inbound-email", {
              method: "POST",
              headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
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
              }),
            });
            if (!response.ok) {
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
  smtp.on("error", (cause) => console.error("smtp: server error", cause));
  smtp.listen(port, host, () =>
    console.log(`SMTP inbox listening on ${host}:${port} for ${address}`),
  );
  return smtp;
}
