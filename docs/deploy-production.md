# Contac production deployment

The production app is hosted in the **Contac** project on Dokploy at
`dokploy.morille.no`. The source is the private GitHub repository
`lille-morille/contac`, branch `main`. Dokploy builds the web app from
`docker/app.Dockerfile` and the API from `docker/api.Dockerfile`.
This workspace has no writable Git metadata. Run
`scripts/publish-production-source.sh` after reviewed source changes to push
a clean snapshot to the private repository; Dokploy rebuilds from that branch.

The Supabase project is **Contac Production** (`cgnxlvvckwuejjddcyyq`) in the
paid `pling` organization, region `eu-north-1`. Pling STAGING is separate.
The API uses the Supabase session pooler on port 5432. Apply the checked-in
`packages/core/migrations` in order with `bun run db:migrate` before deploying
schema changes. Never commit production credentials.

## DNS records

Create these records in Domeneshop:

| Host | Type | Value |
| --- | --- | --- |
| `contac.plingapp.no` | A | `178.104.75.36` |
| `api.contac.plingapp.no` | A | `178.104.75.36` |
| `mx.plingapp.no` | A | `178.104.75.36` |
| `plingapp.no` (`@`) | MX | priority 10, `mx.plingapp.no` |

Dokploy has HTTPS routes for the web app on port 3000 and the API on port
8787. Let’s Encrypt can issue certificates after the A records resolve. The API
publishes host TCP port 25 to its receive-only SMTP listener on container port
2525. The MX record affects every address at `plingapp.no`; Contac accepts only
`contac@plingapp.no`. If other mailboxes are needed, route that address through
an existing mail provider instead of pointing the domain-wide MX at Contac.

## Required configuration

The Dokploy API environment needs `DATABASE_URL`, `SUPABASE_URL`,
`SUPABASE_SECRET_KEY`, `APP_ORIGIN`, `CLASS_SETUP_CODE`, and
`AI_ENCRYPTION_KEY`. The inbox additionally needs `INBOUND_ADDRESS`,
`INBOUND_EMAIL_DOMAIN`, `INBOUND_WEBHOOK_SECRET`, `SMTP_HOST`, and `SMTP_PORT`.
The web Docker build needs `VITE_SUPABASE_URL`,
`VITE_SUPABASE_PUBLISHABLE_KEY`, and `VITE_API_URL`. These values are stored in
Dokploy, not this repository.

## Release check

After DNS propagation, check `https://api.contac.plingapp.no/health` and
`https://api.contac.plingapp.no/v1/setup`, then open
`https://contac.plingapp.no/`. The first class administrator can use the
`CLASS_SETUP_CODE` from the Dokploy API environment on the app's setup page.
Save the issued recovery code. Verify a test email to `contac@plingapp.no`
appears in the team inbox before relying on inbound mail.

The API's SMTP listener does not advertise STARTTLS under Bun. The deployment
guide in [deploy-inbound-email.md](deploy-inbound-email.md) describes a TLS
terminating proxy or authenticated webhook as alternatives when needed.
