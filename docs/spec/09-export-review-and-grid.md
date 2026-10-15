# 09 — Grid export and shared review workflow

**Status:** Reviewed in conversation and assigned for implementation on 2026-10-14.

## Export layouts and preview

Keep the existing portrait Typst contact cards and add a landscape grid option. The team's saved export settings select the layout. Both layouts use the same contacts, inclusion, section order, columns, summaries, takeaways, and permanent-number citation targets. The Export page offers an on-demand PDF preview compiled from the same Typst source as the download, so page breaks and wrapping are visible. CSV remains a rectangular contact table; the existing LaTeX format remains available.

Reviewed landscape refinement (2026-10-15): place Kort beskrivelse beneath Kontaktperson instead of giving it a separate column, narrow Selskap, Status, and Kontaktinfo, and give Sammendrag substantially more width. Show the grid number at 14 pt without bold or a `K-` prefix. Make landscape section titles prominent and register them as level-two headings beneath the contact-log appendix so they appear in the appendix contents.

Reviewed export-language refinement (2026-10-15): save Norwegian or English as a team export setting, defaulting existing settings to Norwegian. Translate generated column labels, status and relevance values, automatic section headings, and Typst messages consistently in preview and exported formats. Preserve user-written contact content and custom labels. Switch the untouched default report title with the language.

Reviewed Typst appendix refinement (2026-10-15): render the saved contact-log title as a level-one heading using the surrounding document's heading style. The contact-log sections remain level-two headings beneath it in the appendix contents. The report template uses this heading directly instead of adding a separate appendix title page or duplicate title.

## Shared content and readiness

Sammendrag and Key takeaways remain single shared fields on each contact. New contacts begin with `export_status = not_ready`. Changes to name, organization, description, Sammendrag, Key takeaways, company name, or conversation evidence reset readiness to `not_ready`. New or changed activities and changed activity links count as evidence changes. Workflow status, assignee, email address, phone number, relevance, and internal research notes do not reset readiness. The three states are `not_ready`, `ready`, and `needs_review`. An uncertain agent sets `needs_review` with a reason; a human can review and mark the contact ready on the Export page. Changing a contact during review must invalidate a stale completion.

Export warns about included contacts that are not ready before download or copy. The user may continue after seeing the warning. The Export page shows state counts, filters, and a quick ready action.

## Agent workflow

Provide team-scoped MCP tools to read and patch saved export settings with revision checks, inspect an export outline, start a durable review backlog, claim the next contact, and read progress. The default backlog contains contacts included in the current export; `all_active` is an option. Claims expire and are assigned atomically so independent agents can share a run ID. `next_contact` may complete a claim as ready without a preceding `update_contact` call when the existing text is good. Agents pass a claim token when editing and again when advancing. Source changes during a claim prevent completion. Contacts that forbid third-party AI are routed to human review.

The standard skill in `skills/contac-export-review/SKILL.md` is the writing guide. The MCP server serves that same file as a prompt and a read-only guide tool. It instructs agents to use documented conversation evidence, write themed plain-text summaries in the team's first-person voice, write short `- ` takeaway bullets, remove links and formatting, preserve uncertainty, and use `needs_review` when evidence is insufficient.
