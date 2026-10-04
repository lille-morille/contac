# Contac product brief for implementation agents

Contac is a contact and interview log for university teams exploring industry problems and business ideas. The class contains several teams. Students coordinate outreach so the same person is not repeatedly contacted by unaware teams. Each team has its own contacts, organizations, activities, notes, and library; the class layer exposes limited overlap metadata and controlled access to another team's log.

The product is split into five specifications. **Chunks 01–05 are implemented** in the current workspace:

1. `docs/spec/01-class-contacts-and-views.md`
2. `docs/spec/02-activities-library-and-sessions.md`
3. `docs/spec/03-email-and-cross-team.md`
4. `docs/spec/04-search-and-ai.md`
5. `docs/spec/05-export-and-loi.md`

The team workspace also has multiplayer change signals, collaborative text,
Presence, and scalar conflict handling. See [docs/multiplayer.md](docs/multiplayer.md)
for the event contract, authorization, recovery behavior, and verification steps.

The `docs/wireframes/` images are layout references, and each specification links its relevant images. The supplied Linear screenshots are stored in `docs/references/` and linked from the relevant specs. Existing design tokens and generic UI components in `packages/app` provide styling; the wireframes do not define a new visual system. The organization map uses restrained, consistent domain colors at the user's request. Linear screenshots are interaction/layout inspiration, not a source of additional statuses or product data.

## Scaffold versus product

The repository contains a Bun monorepo with `packages/core` (Drizzle schema/migrations), `packages/api` (Hono/Supabase authorization), `packages/agent` (generic worker), and `packages/app` (TanStack Start UI). Migrations `0003` through `0019` add the class/team, contact, profile, activity, library, session, email, cross-team, local search, controlled AI, single-email, export-owner, and LOI foundations. Accounts use recovery-code access and secret invitations. New users must finish onboarding with a name, unique profile email, and photo; existing users without photos get an icon avatar. The profile email is the only draft From address and Bcc matching identity. The generic conversation/message schema and Anthropic worker remain from the scaffold; they do not fulfill broader OpenRouter requirements. Chunk 02 adds activity attachments, shared-note conflict handling, team library snapshots, reminders, check-in sessions, and manually enabled OpenRouter check-in summaries. Chunk 03 adds manual email drafts, opt-in email drafting AI, receive-only SMTP intake, a unified inbox, class-wide overlap alerts, and lasting read-only grants. Chunk 04 adds local Norwegian semantic search, per-feature AI modes, low/medium model configuration, ZDR-only OpenRouter routing, contact and group summaries, field/hierarchy suggestions, usage reporting, and AI edit snapshots with restore. Chunk 05 adds information-preserving YAML export and organization LOIs with the supplied Typst layout and reusable default sections. Public MX and port 25 setup remain deployment tasks.

## Product rules that cross chunks

- A contact belongs to one team and one organization. It starts unassigned in `Ikke kontaktet`; the member who first moves it out becomes its assignee. All team members may edit it. The assignee is responsible for follow-up.
- A shared activity is one record linked to one or more contacts. Its transcript/summary is edited once; its contact timeline appearances do not create export duplicates.
- Each team has a shared contact note. Research notes are excluded from AI summaries, deterministic full-log export, and check-in activity selection, but are included in local search and may be quoted in the team library.
- External AI is off for every feature by default and requires a team admin's OpenRouter token. A contact may forbid third-party AI; local search remains available. Automatic AI changes need a visible edit log and snapshot restore.
- Class-wide contact overlap exposes only agreed metadata until the other team grants ongoing read-only log access. The class admin can inspect and edit all data and settings.
- Keep work within the assigned chunk. Track any review decision still marked open in the relevant spec instead of silently inventing a rule.
