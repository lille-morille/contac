# 02 — Activities, notes, quotes, reminders, and check-in sessions

**Status:** Chunk 02 implemented in the workspace. Accepted/sent email activities belong to spec 03; broader AI controls and search belong to spec 04.

## Images for this chunk

- [Team library wireframe](../wireframes/library.png) — quote snapshots and source state.
- [Check-in session wireframe](../wireframes/checkin-session.png) — activity feed, selection, and saved summary.
- [Unified inbox wireframe](../wireframes/inbox.png) — where a due personal reminder appears.

## Activities and timeline

A contact has a chronological activity log. This chunk supports completed phone conversations, missed calls, physical meetings, and documents attached to those records. Accepted/sent email activity belongs with email intake in spec 03. A missed-call quick action offers outcomes such as voicemail or no signal and may set `Follow up / Ring igjen`. The contact status remains manually editable. Calls and meetings can hold a pasted/imported transcript, a summary, direct notes written in a comfortable dashboard editor, or both. PDF, PNG, and JPEG files may be attached to an activity, up to 10 MB each; audio uploads are not required. Wispr Flow paste/import is the dependable path; a direct read integration is a later feasibility item, and no webhook sync is assumed.

Long contact activities are collapsed by default with a preview and an expand control that reveals the whole activity.

One activity may link to several contacts, as with a Teams call or a physical meeting. Its summary and transcript are a **single editable record**. Creating an activity from a contact links that contact by default; members can add other contacts. The activity has an editable display/occurred time initialized to its creation time. Contact timelines order by this editable time. The immutable creation time remains available to determine whether it was added during a check-in session. Shared activities use the strictest linked contact permission for external AI unless a member explicitly overrides the activity's setting; see spec 04.

When a member adds an activity from a contact currently assigned to someone else, save the activity and then ask whether they want to take over as assignee. Declining keeps the current assignee; activity creation alone never reassigns an already assigned contact.

The full contact log includes the activities in chronological display-time order and preserves their information. Shared research notes are deliberately separate from that full timeline; see below. Exporting a shared activity once is specified in spec 05.

## Shared research note

Each contact has one simple, public team textbox for freeform research. Any team member can edit it. The first text is not persisted until the member presses **Save**; after initial save, subsequent edits save when the field loses focus. Private notes were explicitly removed from scope.

The shared research note is visible to the team and searchable locally. It is excluded from the deterministic full contact log, exports, generated summaries, and AI context. Members may select and bookmark a passage in the team library. Edits to the note count toward Latest changed.

## Team quotes (Sitater)

Selecting text in an activity or shared note opens an action **Legg til i sitater**. The quote stores the selected text as a snapshot and a link to its exact source contact and activity/note. Quotes are shared within the team. If the source changes, show that it has been edited since bookmarking while keeping the original quote. If the source is deleted, keep the bookmark and show that the linked record was deleted. The snapshot does not silently inherit later source edits. A quote originating in a shared research note retains that provenance and must not be pulled into external-AI context through quotes.

## Personal reminders and inbox

A member can schedule a reminder for **themselves** on a contact, optionally with a message. The reminder has a date and time. At its due time it appears in that member's single in-app inbox until dismissed. There is no snooze and no assignment to another member. Inbox items also include relevant email suggestions, cross-team access requests, and class-admin messages; see spec 03. The contact status and assignee do not change merely because a reminder was created or dismissed.

Reminder forms offer quick times such as **Om én time** and **I morgen**, as well as a custom date and time. A member can explicitly grant browser notification permission on a secure HTTPS origin; a local browser notification appears when a reminder becomes due while Contac is open. The in-app reminder remains until dismissed, independently of the browser notification.

## Check-in sessions

Sessions are an optional team feature, off by default and enabled by a team admin in team settings. When enabled, any member can start or end a session for their team. Only one session may be active for a team at once. The navbar offers **Økter** for active and past sessions. A session feed lists contact activities **created during the session's interval**, even if an activity's display time was edited later. The feed notes when an activity was added during the session but its display time lies elsewhere. Such an activity starts unselected for summary generation, but a member can select it.

Members select feed activities and press **Generate summary**. The result is a saved snapshot, available when viewing that session. If selected source activities later change, the UI marks the snapshot stale and offers **Regenerate**. Summary generation is a separate AI feature, off by default in team settings and manually run by a user when enabled. Activities blocked from third-party AI remain visible in the feed but cannot be selected for an AI summary. Research notes are not session activities.

## Acceptance examples

1. A meeting linked to three contacts is edited once and appears in all three timelines.
2. A member bookmarks a passage from a meeting, then edits that meeting. The saved quote remains unchanged and gains an edited-source indicator.
3. A reminder for tomorrow at 10:00 appears only in its creator's inbox when due and stays until dismissed.
4. A member adds a meeting during an active session and later backdates its display time. It stays in the session feed with a timing note and is unchecked by default.

## Decisions made for chunk 02

- Activity attachments accept PDF, PNG, and JPEG up to 10 MB per file. Document text extraction remains optional in spec 04.
- Deleting an activity removes it from contact timelines. Library quotes stay as snapshots and show that the source was deleted.
- A stale shared-note save is blocked. The editor keeps the member's draft and displays the latest saved note for comparison before an explicit overwrite.
