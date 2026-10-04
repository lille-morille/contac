# 04 — Local search and controlled AI features

**Status:** Chunk 04 implemented locally. Depends on eligible contacts, activities, permissions, and email intake from specs 01–03.

## Images for this chunk

- [Semantic search wireframe](../wireframes/search.png) — results, highlighted passages, and contact/activity preview.
- [Check-in session wireframe](../wireframes/checkin-session.png) — manual AI summary action and excluded activity state.

## Search

Search should work well for Norwegian phrasing and near-matches in meaning, such as recalling an approximate statement about costs and quality. Semantic/vector search must run without sending content to a third-party search or model service when a contact forbids third-party AI. The API runs a local multilingual MiniLM embedding model, caches vectors per passage, and updates changed passages when searched. Its first search downloads model weights to the server; later inference stays local. Search covers contact fields, activity transcripts, activity summaries/notes, accepted emails, and shared research notes. Uploaded-document text is not indexed in this chunk; documents remain attachable. Duplicate contacts are excluded. Team boundaries and specifically granted cross-team read access are enforced in search results. A cross-team grant does not expose the owning team's shared research note.

Show result cards with the relevant passage highlighted. A click opens the contact page, scrolls to the matched activity (or shared note), and highlights the passage there. Preserve enough link state, such as a query parameter, for the highlight/scroll to survive navigation. For a semantic result, highlight the retrieved relevant passage; an exact substring match is not required. Shared activities should link to the appropriate contact view of their one underlying record.

The global search entry is an icon-only button to the right of **Contac** in the sidebar header, and ⌘K or Ctrl+K opens the same command dialog from anywhere in the signed-in workspace. The dialog has animated entry and exit, keyboard navigation, Enter to open, and Escape to close. It searches pages, actions, current-team contacts and organizations, saved views, and team switching immediately. After a short debounce it also shows results from the existing local semantic index, including conversations, accepted emails, and shared research notes. Selecting a result opens its contact and matched source; a granted cross-team result opens the read-only log. **Vis alle søkeresultater** opens the full search page with the query prefilled. The old sidebar **Søk** destination is removed; the full search page remains reachable through the command dialog.

## AI configuration and safeguards

External AI is **off by default for every feature**. A team admin provides the team's OpenRouter token; no AI feature may spend tokens until that feature is separately enabled. Each feature exposes a mode selector:

| Mode | Trigger | Effect |
| --- | --- | --- |
| Off | None | No external AI call |
| Manual suggestion | Member presses a button | Suggestion only; member applies it |
| Automatic suggestion | Relevant source changes | Suggestion only; member applies it |
| Safe auto | Relevant source changes | Fill remaining blank fields automatically; stop extracting them once filled and do not create suggestions for applied values |
| Dangerous | Relevant source changes | May replace existing values, including human edits |

Modes are per feature, not one blanket permission for all AI. Email drafting, check-in summaries, and group findings have **Off/Manual** only. Group findings regenerate only on a member's click, even when contacts change. AI never sends email or externally shares a log. Display OpenRouter-reported model, tokens, and cost in a team usage view; label cost unavailable if the provider does not return it. A team setting chooses whether **new contacts** allow third-party AI by default; the initial default is allowed. Each contact has a clear allow/block control. Team members can edit contacts, but changing this control is audited.

The team configures exactly two model roles: **low** for field extraction and hierarchy classification, and **medium** for email drafts and summaries. Suggested low/medium defaults are `openai/gpt-4.1-nano` and `openai/gpt-4.1-mini`; the admin can accept both with one button or type other model IDs. Nano is positioned for inexpensive classification/autocompletion and Mini provides more capacity for drafting and summarizing ([Nano pricing and capabilities](https://openrouter.ai/openai/gpt-4.1-nano/performance?sort=throughput), [Mini pricing and capabilities](https://openrouter.ai/openai/gpt-4.1-mini/performance)). Every app OpenRouter request sets `provider.zdr: true` and `provider.data_collection: "deny"`, so routing fails if a compliant endpoint is unavailable. These controls mean the external inference provider does not retain or collect content under OpenRouter's endpoint policy; they do not keep content on the Contac server ([OpenRouter ZDR explanation](https://openrouter.ai/blog/insights/zero-data-retention/)). The local search model sends no search text to OpenRouter.

For a shared activity, the strictest linked contact AI control applies by default. A user may explicitly override the activity-level decision. An activity blocked from external AI cannot enter contact or organization summaries, check-in summaries, field suggestions, email drafting context, or other OpenRouter requests. Local semantic search may still index and find it. Research notes never enter external-AI context even when a contact allows AI. Transcription is performed outside this application; the team decides whether a transcript may be imported before upload. There is no separate transcript-consent workflow in Contac.

Every automatically **applied** AI change appears in a visible edit log with the before snapshot and a restore action. Restore replaces the record with the saved snapshot immediately before that AI edit; if there were later edits, clearly warn that restoring also replaces those later changes. Keep this simple snapshot behavior rather than building a merge engine.

## Features

1. **Stikkordgenerering:** A concise, optional contact finding summary drawn from all eligible conversations. Completed calls, meetings, and accepted/marked-sent emails are assumed conversations. Missed calls and shared research notes are excluded. If there are no eligible conversations, generation is unavailable. Show when the saved result was generated and when newer conversations make it stale.
2. **Contact-field suggestions:** From a new eligible conversation, suggest missing email, phone, position, department, organization, and a one-line person description when evidence supports it. In Safe auto, extraction targets only blank fields and stops when they are filled. A suggested value equal to the current value is discarded. Mode controls govern whether fields can be filled or overwritten. Preserve human visibility into source evidence and changes.
3. **Hierarchy suggestions:** Suggest the organization/department placement and relevant domain or person tags based on eligible information. Automatic replacement follows the selected mode.
4. **Group findings:** Generate a saved summary of key findings for contacts in one organization or one top-level domain. An organization can sit in several domains; each contact is counted once in a specific summary. Exclude blocked contacts/activities and show what was omitted.
5. **Email drafting:** Generate a draft from a custom prompt, contact fields, and the latest eligible communication. Follow-up prompts revise the draft. The member reviews and opens it in their email app; AI never sends it.
6. **Check-in summary:** A member chooses eligible activities in a session and generates a saved summary. See spec 02. Blocked activities remain visible in the feed but cannot be selected.

## Deterministic full log

The full contact-log representation is code-generated, chronological, structured, and information-preserving. It is not an AI summary and does not spend tokens. It includes the full eligible activity record but excludes the separate research note and duplicate contacts. The compact `stikkord` is distinct from this full log. The full representation appears on the contact page and in export; see spec 05.

## Acceptance examples

1. All AI feature modes are Off on a new team, so creating a contact or activity makes no OpenRouter call.
2. A contact blocked from third-party AI remains findable by local semantic search but is omitted from an organization AI summary.
3. A shared meeting linked to one blocked contact is blocked by default for both linked contacts; a member can explicitly override the activity decision.
4. Dangerous mode replaces a filled description. The edit log shows the prior snapshot and allows restoring it.

## Decisions and scope

- Accepted and manually marked-sent emails count as conversations for `stikkord`.
- Automatic contact features trigger when an eligible phone call, meeting, or email activity is created or edited. Group findings are manual only.
- Saved stikkord and group findings remain available and are marked stale when source versions change. Members can regenerate them.
- Team usage reports the last 100 recorded calls with provider-reported tokens and cost where available. No separate team budget cap is built into this chunk; team admins can set limits on their OpenRouter key.
