# Contac

A contact and interview log for university teams. The five implementation chunks cover class/team setup, contacts and views, activities, shared notes, the team library, reminders, check-in sessions, email drafts and intake, cross-team coordination, local semantic search, controlled AI, YAML export, and organization LOIs.

## Modules

- `packages/core`: class/team and contact schema, migration runner, shared Drizzle client.
- `packages/api`: Hono API, Supabase Auth verification, class/team permissions, secret invitation links, contacts, companies, domains, and duplicate merge.
- `packages/agent`: leased database worker, model adapter, scoped tool registry, retry, tool registry, and Realtime run events.
- `packages/app`: TanStack Start, React Query, the existing design tokens and UI components, contact board/list/detail, hierarchy, and settings.

## Local setup

1. Install Bun 1.3 and Docker. Run `bun install`.
2. Run `bun run supabase:start`. Copy `.env.example` to `.env`, fill the local publishable and secret keys printed by `bun run supabase:status`, and set a long random `CLASS_SETUP_CODE`.
3. Run `bun run db:migrate`. Add future schema changes as numbered SQL files in `packages/core/migrations` and update the matching Drizzle schema.
4. Run `bun run dev`. Open http://localhost:3000. The API is on :8787; Supabase Studio is on :57323. Choose **Klasseadministrator? Opprett klasse** on the login page and enter `CLASS_SETUP_CODE`, the class name, and your name. Save the issued recovery code before continuing. The class admin can then create teams and send the first team-admin invitation from Settings.
5. Set a long random `AI_ENCRYPTION_KEY` in `.env` before a team admin saves an OpenRouter token. Every external AI feature is off by default; the team admin selects low- and medium-capability models and enables features individually.
6. To test inbound email locally, configure `INBOUND_ADDRESS`, `SMTP_PORT`, `SMTP_HOST`, and `INBOUND_WEBHOOK_SECRET` as described in [the inbound mail deployment guide](docs/deploy-inbound-email.md). Public MX and port 25 are only needed for internet delivery.
7. Run `bun --env-file=.env scripts/smoke-contacts.ts` against an **empty** local class database to test account creation, team isolation, assignment, and duplicate movement. The script refuses to run if a class exists and removes all of its own test data. `bun run smoke:local` checks the older generic foundation.

The contact app creates name-only Supabase accounts through the API and presents a recovery code as the sole login secret. The code can be rotated in Profile settings. Treat it like a password and keep it safe.

## Production

See [the production deployment guide](docs/deploy-production.md) for the
current Dokploy, Supabase, DNS, and release configuration.

Use one production Supabase project and deploy the app and API images in `docker/`. Set `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `APP_ORIGIN`, `CLASS_SETUP_CODE`, and `AI_ENCRYPTION_KEY` on the API. Build the app with `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and `VITE_API_URL` as build args. Run `DATABASE_URL=... bun run db:migrate` before releasing a schema change. The generic agent worker remains in the scaffold; the contact AI features run through the API.

The database has read-only RLS policies for authenticated clients. All writes go through the API. Team invitations are one-use, seven-day secret links returned to an admin for sharing. The class admin can access every team. External AI features are individually configurable and off by default. Cross-team log access requires approval unless the owning team enables automatic sharing. The API image includes the Typst CLI and Liberation Sans font for LOI PDFs. Each team may edit its LOI Typst source, while new LOIs start from the supplied business-neutral template and can fork the team's latest sent LOI. See [the export and LOI specification](docs/spec/05-export-and-loi.md).

## Deliberately not carried over

Anvinn's tender and notice domain, scraper, source integrations, credits and payment logic, admin analytics dashboard, Norwegian copy, demo users, historic migrations, hardcoded domains, and deployment setup. The visual tokens and generic UI components were copied; branding can be changed through `packages/app/src/styles.css`.
