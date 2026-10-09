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
For a local scalar write, the UI shows a pending value immediately, then places
the authoritative API response in the cache. A matching database change signal
does not fetch the same row again, even if it arrives before the HTTP response.
Other revisions still fetch the row. Derived views reconcile in the background;
the mutation promise does not wait for a refetch.
The initial subscription, reconnect, and window focus trigger API refetches.
Active team queries, including contacts, activities, library, sessions, drafts,
search results, AI results, LOIs, and settings, retain 60-second polling; the
inbox polls every 30 seconds. Team settings and cross-team overlap can rely on
their polling paths without a prompt live update.

## Editing and conflicts

Saved shared research notes, activity summaries and transcripts, and LOI section
and signature text use Yjs. The server stores full Yjs state and mirrors the
materialized text to the existing row inside one transaction. A new research
note still requires its first explicit Save. If a disconnected edit conflicts
with a committed document snapshot, the client reloads that snapshot and drops
the unsaved edit. Normal connected Yjs updates continue to merge. A socket
update does not replace text while a local write is still being sent.

Scalar contact, activity, organization, tag relationship, and LOI
edits use server-enforced expected values or a revision. A stale write receives
409 and the latest committed value. The workspace discards its pending value
and shows that server value without a conflict dialog. Server commit order,
not browser timestamps, determines which value is current. Valid edits to
different contact fields can proceed independently. Dragging a board card
remains optimistic and returns to the committed status if its write loses.

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
