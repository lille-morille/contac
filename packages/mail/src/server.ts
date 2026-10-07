import { createSmtpServer } from "./smtp.ts";

const address = process.env.INBOUND_ADDRESS?.trim();
const secret = process.env.INBOUND_WEBHOOK_SECRET;
const webhookUrl = process.env.INBOUND_WEBHOOK_URL;
if (!address || !secret || !webhookUrl)
  throw new Error("INBOUND_ADDRESS, INBOUND_WEBHOOK_SECRET and INBOUND_WEBHOOK_URL are required");
const url = new URL(webhookUrl);
if (url.pathname !== "/webhooks/inbound-email")
  throw new Error("INBOUND_WEBHOOK_URL must end in /webhooks/inbound-email");

const smtpHost = process.env.SMTP_HOST ?? "127.0.0.1";
const smtpPort = Number(process.env.SMTP_PORT ?? 2525);
const healthHost = process.env.MAIL_HEALTH_HOST ?? "0.0.0.0";
const healthPort = Number(process.env.MAIL_HEALTH_PORT ?? 8788);
const smtp = createSmtpServer({ address, secret, webhookUrl: url.toString() });
await new Promise<void>((resolve, reject) => {
  const onError = (cause: Error) => reject(cause);
  smtp.once("error", onError);
  smtp.listen(smtpPort, smtpHost, () => {
    smtp.off("error", onError);
    resolve();
  });
});
smtp.on("error", (cause) => console.error("smtp: server error", cause));
const health = Bun.serve({
  fetch(request) {
    if (new URL(request.url).pathname !== "/health") return new Response(null, { status: 404 });
    const ok = smtp.server.listening;
    return Response.json({ ok }, { status: ok ? 200 : 503 });
  },
  port: healthPort,
  hostname: healthHost,
});
console.log(`SMTP inbox listening on ${smtpHost}:${smtpPort} for ${address}`);
console.log(`Mail health listening on ${health.url}`);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    health.stop();
    smtp.close();
  });
