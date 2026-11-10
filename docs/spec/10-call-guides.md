# 10 — Call guides

**Status:** Reviewed and assigned for implementation on 2026-11-10. Track completed units in the table below.

A team writes call guides: documents of talking points that a member reads during a live conversation. A team can keep several, each named for the kind of contact or conversation it suits. Terms are defined in [GLOSSARY.md](../../GLOSSARY.md). The storage decision is in [ADR 0001](../adr/0001-call-guides-stored-as-markdown-without-live-co-editing.md).

The UI label is `Samtaleguide` (plural `Samtaleguider`). Preserve the Anvinn-derived design tokens and generic UI components.

### Review units

| Unit | Contents | Dependencies | Done |
| --- | --- | --- | --- |
| A | Team feature flag, call guide table, API, change signals | None | Done in code; migration not applied to any Supabase database |
| B | `Samtaleguider` page with list and rich text editor | A | Done in code; browser acceptance against a live API pending |
| C | Call guide panel in the live conversation composer | A | Done in code; browser acceptance pending |

## A. Data, access, and staged rollout

1. **Ownership.** A call guide belongs to one team. Every team member can see, create, edit, reorder, and delete every guide of their team, with the same access rule as contacts. The class admin has the access they have to other team data. There are no private or class-level guides.
2. **Fields.** A guide has a title, a Markdown body, a position within the team, a revision, and created/updated metadata. A new guide has the title `Uten tittel`, an empty body, and the last position.
3. **Markdown is the stored format.** The body is stored as Markdown text. There is no Yjs document for a guide.
4. **Saving.** Title and body writes carry the expected revision. A stale write receives 409 with the latest committed guide, and the client shows that version, as other scalar fields do today. Reordering saves the whole team order in one write.
5. **Deletion.** Deleting a guide is permanent. There is no deleted view or restore.
6. **Change signals.** Guide writes emit the existing team change signal with a new entity name. The signal carries no title or body.
7. **Team feature flag.** Call guides are a staged rollout. A team has the feature only when a per-team flag stored in the database is set. The API enforces the flag: for a team without it, every call guide endpoint responds as if the route did not exist. The workspace receives the team's flags with its existing team data and hides the sidebar entry and the call panel without the flag.
8. **Enabling.** A script sets or clears the flag for a team by team ID. There is no settings UI for it. The first team is "Syretest 5 gruppe 5". This is not an A/B test: there are no variants and no measurement.
9. **Full rollout.** Rolling out to every team later means removing the gate. The design must not make guides depend on the flag in any other way.

**Acceptance examples:** A member of a team without the flag sees no `Samtaleguider` entry, and a direct API request for guides returns 404. After the script enables the flag, the same member sees the entry after a reload. Two members save the same guide from the same revision: the second receives 409 and then sees the first member's text.

## B. `Samtaleguider` page

1. **Navigation.** Add `Samtaleguider` to the team sidebar. The page is linkable, and the selected guide is part of the URL.
2. **Layout.** The guide list is on the left and the editor for the selected guide on the right. On narrow widths the list is above the editor or behind a control. With no guides, the page shows an empty state with a `Lag samtaleguide` action.
3. **List.** The list shows each title in team order. Members drag guides to reorder them, with a keyboard-accessible alternative. The order is shared by the team and is the tab order in the call panel.
4. **Editor.** The title is an inline field above the body. The body is a rich text editor in the style of Notion: the member edits formatted text, never Markdown source.
5. **Blocks and marks.** Headings level 1 to 3, paragraphs, bold, italic, links, bullet lists, numbered lists, quotes, and dividers. Callouts are included only if they serialize to Markdown and parse back unchanged. There are no checklists, images, tables, embeds, nested pages, or drag handles for blocks.
6. **Input.** A `/` menu inserts blocks. Markdown typing shortcuts work, such as `# ` for a heading, `- ` for a bullet list, `1. ` for a numbered list, `> ` for a quote, and `**text**` for bold. Pasted Markdown and pasted rich text become the supported blocks; unsupported content becomes plain paragraphs.
7. **Round trip.** Every supported block and mark survives save and reload unchanged. A Markdown body written by another client that uses only supported syntax is displayed and saved without loss.
8. **Autosave.** Edits save automatically after a short pause and when leaving the editor. The page shows saving, saved, and failed states. A failed save keeps the member's text and retries.
9. **Presence.** While a member has a guide open in the editor, teammates on that guide see that member's avatar. This is a hint to avoid simultaneous edits, not a lock.
10. **Delete.** A delete action on the guide asks for confirmation that names the guide and states that deletion is permanent.

**Acceptance examples:** A member types `## Åpning`, a bullet list, and a bold phrase, reloads, and sees the same formatting. A member drags the third guide to the top and a teammate's list and call panel show the new order. Deleting the selected guide selects the next one.

## C. Call guide panel in a live conversation

1. **When it appears.** The panel appears while the composer is open in `Telefonsamtale` or `Nytt møte` mode on a contact, if the team has the feature and at least one guide. It does not appear for email.
2. **Placement.** The panel sits beside the composer in contact detail and stacks below it on narrow widths. It never covers the phone number, summary, or transcript fields. It opens automatically when the live conversation starts.
3. **Tabs.** One tab per guide, in team order, labelled with the title. Tabs scroll horizontally when they overflow. The panel remembers each member's last selected guide and selects it next time; if that guide no longer exists, it selects the first.
4. **Read-only.** The panel renders the guide with the same formatting as the editor. Nothing in it can be edited or ticked. A `Rediger` link opens that guide on the `Samtaleguider` page without discarding the activity draft.
5. **Collapse.** The member can collapse and expand the panel. The collapsed state is remembered per member.
6. **No guides.** If the team has the feature but no guides, the composer shows only a small `Lag samtaleguide` link to the page.
7. **Live updates.** When a teammate saves a guide during the conversation, the panel shows the new text without changing the selected tab or scroll position. If the open guide is deleted, the panel selects the first remaining guide, or shows the no-guides state.
8. **Drafts.** The panel has no effect on the activity draft, the timer, or what is saved in the activity.

**Acceptance examples:** Pressing `r` on a contact opens the phone composer with the guide panel showing the member's last-used guide. Switching tabs and then starting a call on another contact opens the newly selected guide. A team without the flag sees the composer exactly as before.

## Out of scope

- Matching guides to contacts by person tag, domain, or status.
- Placeholders filled from the contact.
- Live co-editing of a guide.
- Guides in the report export, AI context, semantic search, or the cross-team read-only view.
- MCP tools for reading or writing guides. This is the expected follow-up, since the body is Markdown.
- A settings UI for team feature flags.
