# Team workspace multiplayer

Postgres and the Hono API remain authoritative for data and permissions. Migrations
`0020`–`0026` add private Realtime policies, committed row-change signals,
durable collaborative documents, and revision-based shared views. Run
`bun --env-file=.env run db:migrate` before starting an updated server.

## Change signals

Database triggers call `realtime.send` in the same transaction as each write.
Rolled-back writes emit nothing. The private `team:<team-uuid>` Broadcast topic
receives only `{teamId, entity, id, operation, revision}`. It never carries
record contents. Realtime RLS grants team members and class admins read access;
clients have no Broadcast send policy. The team channel also grants authorized
Presence send/read. The separate private `doc:<team>:<kind>:<id>` topics carry
Yjs updates only to authorized teammates who open that editor. The API checks
team access again before reading or writing a document.

The client subscribes only to its selected team, removes the previous channel on
switch or logout, and refreshes Realtime authentication when the Auth token
changes. Events coalesce for 100 ms. Contact and activity row updates fetch just
the changed row; relationship changes invalidate their TanStack Query slices.
The initial subscription, reconnect, and window focus trigger API refetches.
Active team queries, including contacts, activities, library, sessions, drafts,
search results, AI results, LOIs, and settings, retain 60-second polling; the
inbox polls every 30 seconds. Team settings and cross-team overlap can rely on
their polling paths without a prompt live update.

## Editing and conflicts

Saved shared research notes, activity summaries and transcripts, and LOI section
and signature text use Yjs. The server stores full Yjs state and mirrors the
materialized text to the existing row inside one transaction. A new research
note still requires its first explicit Save. Disconnected or conflicting local
text is held locally and shown beside the server text; applying it again is an
explicit user action. A socket update never replaces an unsaved local edit.

Scalar contact, activity, organization, tag relationship, LOI, and saved-view
edits use server-enforced expected values or a revision. A stale write receives
409 and the latest value. Valid edits to different contact fields can proceed
independently. Dragging a board card remains optimistic and rolls back if the
server rejects its status change.

Presence advertises only the member ID, current contact ID, and editor ID.
The UI renders avatars for teammates on the contact. No document text travels
in Presence.

## Verification

Run `bun --env-file=.env scripts/verify-multiplayer.ts` against the local
Supabase stack. The script creates two teammates and one member of another
team, then removes them. It checks private channel authorization, rejection of
forged change signals, cross-team isolation, create/edit/move/link/delete,
inbound-webhook routing, Presence, concurrent Yjs edits, scalar/tag/view
conflicts, direct database writes as a background-job equivalent, and
reconnect/API recovery. Run `bun run typecheck`, `bun run test`, and
`bun run build` after code changes.
