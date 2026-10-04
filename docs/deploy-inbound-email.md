# Inbound mail for Contac

Contac receives Bcc copies at `contac@plingapp.no`. It does not send or relay mail.

## Local test

Set `INBOUND_ADDRESS=contac@plingapp.no`, `SMTP_HOST=127.0.0.1`, `SMTP_PORT=2525`, and a long random `INBOUND_WEBHOOK_SECRET` in `.env`. Start the API; it also starts the SMTP listener. Only the configured recipient is accepted. The listener caps messages at 1 MB, parses the text body, and stores and routes the message before returning SMTP success. Failed storage/routing returns a temporary SMTP error so the sender can retry. Message ID (or raw-message hash when absent) deduplicates retries.

## Dokploy and DNS

For production, set `SMTP_HOST=0.0.0.0` in the API container and map **public host TCP port 25** to **container TCP port 2525**. The API image exposes 2525. Open TCP 25 in the host firewall and confirm the hosting provider allows inbound mail on that port.

Create an A/AAAA record for the mail host, such as `mx.plingapp.no`, pointing to the public server. Create an MX record for `plingapp.no` pointing to that host. MX applies to every address at that domain: the Contac listener rejects all recipients other than `contac@plingapp.no`. If other mailboxes on `plingapp.no` must continue working, use the existing mail server to forward only this address to Contac instead of replacing its MX destination.

Set `INBOUND_ADDRESS=contac@plingapp.no`, `SMTP_PORT=2525`, and `INBOUND_WEBHOOK_SECRET` in Dokploy. The SMTP listener does not advertise STARTTLS under Bun; place a mail proxy with TLS termination in front if encrypted SMTP transport is required. The `/webhooks/inbound-email` endpoint can receive parsed mail from a provider instead, using the secret as a Bearer token.

The web application URL `contac.plingapp.no` is separate from MX delivery. Configure its HTTPS/DNS routing when deploying the app.
