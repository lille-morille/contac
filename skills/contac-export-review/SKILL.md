---
name: contac-export-review
description: Review and improve a Contac team's shared contact-log summaries, key takeaways, relevance, and export readiness through its MCP tools. Use for a full or partial export review, including parallel agent work.
metadata:
  version: 2026-10-14
---

# Contac export review

The contact's Sammendrag and Key takeaways are shared source fields. Edit them in place; there are no report-specific copies. The goal is an accurate, readable final contact log.

## Start and coordinate

Call `get_team_identity` before any other Contac tool and compare its immutable team ID with the expected ID. Stop if they differ. Read `get_export_workspace`. Ask the user once about audience, language, desired detail, and any case-specific emphasis that cannot be inferred. Norwegian and a concise university report are the defaults. Do not pause for approval on each contact.

Call `start_export_review` with scope `included` unless the user wants all active contacts. Give parallel workers the same run ID. Each worker calls `next_contact` to receive one claim and its complete eligible evidence. Keep the claim token. Do not assign contact ranges yourself.

For each claim, compare the existing Sammendrag, Key takeaways, and relevance with the documented evidence. If they already meet the rules below, call `next_contact` with `finishClaimToken`; no `update_contact` call is needed. If they need changes, call `update_contact` with `expectedUpdatedAt` and `reviewClaimToken`, then call `next_contact` with `finishClaimToken`. A stale-write or stale-claim error requires fresh context before completion. If unsure, call `next_contact` with `outcome: needs_review` and a short, specific `reason`.

The context intentionally excludes internal research notes. Never infer that those notes describe a conversation. An activity shared with someone who forbids external AI can be omitted from the context; do not guess its contents. A contact that forbids external AI must be reviewed by a person.

## Write Sammendrag

Write plain prose organized by themes and findings, not an activity timeline. Preserve concrete facts, important details, differences of opinion, uncertainty, and who said something when attribution matters. Include the team's action or next step only when it is documented; label a proposed next step as a proposal. Use the team's first-person voice: `vi` in Norwegian or `we` in English for team actions. Use `jeg` or `I` only for an explicitly identified individual's account. Never refer to the team as “the students.”

Remove URLs, Markdown headings, bold, code fences, and formatting marks. Do not paste transcripts or email bodies. Do not add claims from internal information, assumptions, or general industry knowledge. If there is no reliable conversation evidence, leave the summary empty and mark `needs_review` with a reason.

## Write Key takeaways

Use three to five short plain-text bullet lines when evidence supports them; fewer are fine for thin conversations. Begin every line with `- `. Put one substantive finding on each line. Capture the most consequential needs, constraints, evidence, disagreement, and open questions. Do not repeat the contact's biography, status, or generic praise. Separate a hypothesis or proposed action from a reported fact. Remove URLs and other formatting.

Set relevance to `high` for concrete new needs or findings, `medium` for useful but limited insight, and `low` when little new information was obtained. Do not rate by contact status, conversation length, or commercial promise. Preserve a manual rating unless the evidence clearly calls for correction.

## Finish

Use `get_export_review_status` to check that the run has no pending or claimed items. Use `preview_export` to inspect order, sections, layout, and remaining unready contacts. Report the contacts needing human review with their reasons. The Export page shows the generated PDF preview and warns before downloading or copying a log with unready contacts.
