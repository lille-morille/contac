# Inbound mail for Contac

Contac receives Bcc copies at `contac@plingapp.no`. It does not send or relay mail. In production, a dedicated mail service owns SMTP port 25; the API stores messages and routes inbox suggestions through its authenticated `/webhooks/inbound-email` endpoint.

## Local test

Start the API with `bun run dev:api`. Set `INBOUND_ADDRESS=contac@plingapp.no`, `SMTP_HOST=127.0.0.1`, `SMTP_PORT=2525`, `INBOUND_WEBHOOK_URL=http://127.0.0.1:8787/webhooks/inbound-email`, and the same long random `INBOUND_WEBHOOK_SECRET` for the API and mail service. Start the mail service with `bun run dev:mail`. Its health endpoint is at `http://127.0.0.1:8788/health` by default.

The mail service accepts only the configured recipient, limits messages to 1 MB, and posts parsed text to the API. It returns SMTP success only after the API reports success. If the API is unavailable or rejects the webhook, it returns temporary SMTP error `451`, leaving retry responsibility with the sender's mail server. Message ID (or raw-message hash when absent) deduplicates retries in the API.

## Dokploy and DNS

Build a separate Dokploy application with `docker/mail.Dockerfile`. Set one replica, `SMTP_HOST=0.0.0.0`, `SMTP_PORT=2525`, `MAIL_HEALTH_PORT=8788`, `INBOUND_ADDRESS=contac@plingapp.no`, and `INBOUND_WEBHOOK_SECRET`. Set `INBOUND_WEBHOOK_URL` to the API's **private, reachable** HTTP address ending in `/webhooks/inbound-email`; confirm the mail and API services share a network on which that address resolves. If no private route is available, use the API's public HTTPS URL with the same path. Publish public host TCP port 25 to mail container TCP port 2525. Use the mail service's HTTP port 8788 for a health check, without publishing it publicly. Because this is a single fixed host port, keep the mail service at one replica with `stop-first` updates.

The API retains `INBOUND_ADDRESS`, `INBOUND_EMAIL_DOMAIN`, and the same `INBOUND_WEBHOOK_SECRET`, but has no SMTP port mapping or `SMTP_HOST`/`SMTP_PORT` settings. The API can then use `start-first` rolling updates. Keep the webhook contract compatible across overlapping API versions.

Create an A/AAAA record for the mail host, such as `mx.plingapp.no`, pointing to the public server. Create an MX record for `plingapp.no` pointing to that host. MX applies to every address at that domain: the Contac listener rejects all recipients other than `contac@plingapp.no`. If other mailboxes on `plingapp.no` must continue working, use the existing mail server to forward only this address to Contac instead of replacing its MX destination. Open TCP 25 in the host firewall and confirm the hosting provider allows inbound mail on that port.

The SMTP listener does not advertise STARTTLS under Bun; place a mail proxy with TLS termination in front if encrypted SMTP transport is required. The webhook also supports parsed mail from a provider using its secret as a Bearer token.

## Production operation

The mail service owns host port 25 and forwards accepted messages to the API over the private network. Keep its webhook secret in sync with the API. Mail updates use `stop-first` because only one task can bind the fixed port. API updates use `start-first` and do not touch SMTP. The [cutover runbook](mail-service-cutover.md) records the original port handoff.
