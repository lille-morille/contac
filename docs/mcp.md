# Contac MCP for personal agents

The remote Streamable HTTP endpoint is `https://api.contac.plingapp.no/mcp`.
Agent access belongs to a user and follows the team currently selected in the
Contac workspace. Switch teams at the top of **Innstillinger → [team name]**;
there is no separate agent team picker. The same existing OAuth connection
follows a changed workspace team selection on its next request. There is no
team API key. **Koble fra mine agenter** revokes every personal client
connection; the next MCP request is denied. Team membership or classroom-admin
access is checked on every request.

## Install

Before connecting a client, the production Supabase project must have **OAuth 2.1
Server** and **Dynamic Client Registration** enabled under **Authentication →
OAuth Server**. Set its authorization path to `/oauth/consent`, and set the Auth
Site URL to `https://contac.plingapp.no`. Check the upstream discovery document:

```sh
curl -fsS https://cgnxlvvckwuejjddcyyq.supabase.co/.well-known/oauth-authorization-server/auth/v1 \
  | jq -e '.registration_endpoint and (.code_challenge_methods_supported | index("S256"))'
```

This must succeed before `codex mcp login`. A 404 `feature_disabled` response
means the OAuth server is off; a missing `registration_endpoint` means dynamic
registration is unavailable. Contac's own protected-resource metadata can
still return 200 in either case.

Codex CLI and the IDE extension share MCP configuration. These commands were
verified against the local Codex CLI's `mcp add` and `mcp login` help:

```sh
codex mcp add contac --url https://api.contac.plingapp.no/mcp
codex mcp login contac --oauth-client-registration dcr
```

Claude Code supports a remote HTTP server with user scope:

```sh
claude mcp add --transport http --scope user contac https://api.contac.plingapp.no/mcp
```

Run `/mcp` in Claude Code to finish OAuth sign-in. For Claude Desktop or the web,
add the same URL under **Customize → Connectors → Add custom connector**, choose
**Register automatically** for the OAuth client, and sign in with Contac.
Claude Desktop's remote connector is served through the Claude account, so use
this connector flow rather than a local desktop extension. On Team and
Enterprise plans a Claude organization owner must first add the connector under
organization settings; each member then connects
with their own Contac account. The profile page provides copy buttons for the
commands and the team-specific `CLAUDE.md` / `AGENTS.md` instructions. The UI
does not promise one-click installation.

OAuth is provided by the Contac Supabase Auth project. Production requires the
OAuth 2.1 server, dynamic client registration, an asymmetric signing key,
and the Auth Site URL `https://contac.plingapp.no` with authorization path
`/oauth/consent`. The API serves protected-resource metadata at
`https://api.contac.plingapp.no/.well-known/oauth-protected-resource/mcp`.
Supabase OAuth access tokens may use its standard `authenticated` audience or
the MCP resource audience when `private.mcp_access_token_hook` from migration
0031 is enabled under **Authentication → Hooks**. The API
requires the signed OAuth `client_id`, a matching Contac user-client grant, and
current team access in either case; a normal workspace session has no OAuth
client ID and cannot access MCP.
Set `MCP_PUBLIC_BASE_URL` for staging if its API origin differs. A user must
have selected a workspace team before approving OAuth consent. The OAuth grant is bound
to that user and client, not to a named team token.

Migration 0042 removes all old named team tokens and token-bound OAuth grants.
Existing clients must reconnect with their own user account and update tool
calls to include `expectedTeamId`. There is no compatibility window for the
old Bearer key. Re-copy agent instructions after changing the selected team.

## Team identity and tools

An agent calls `get_team_identity` before any other Contac tool in a new
conversation or session. The response is the immutable team ID and current
workspace team name derived from the authenticated connection. If the ID does
not match the ID in its copied instructions, or verification fails, the agent
must tell the user and stop using Contac. A rename changes the name only, not
the ID. Every other tool requires `expectedTeamId` and rejects a mismatch
before it queries or writes data.

| Tool | Access |
| --- | --- |
| `get_team_identity` | Verify the connected team ID and workspace name |
| `search_contacts` | Find team contacts and matching contact, activity, or internal-information passages by meaning and keywords |
| `list_contacts` | Paginated active contacts and their fields |
| `get_contact` | Contact, organization, tags, internal information, contact summary, key takeaways, activities, email records, transcripts, participants, and attachment metadata |
| `list_team_reference` | Organizations (with `domainsRevision`), domains (with `revision`), links, and person tags |
| `create_domain` | Create or reuse a normalized-name domain in the connected team |
| `update_domain` | Edit a domain with its expected revision |
| `set_company_domains` | Atomically replace one organization's complete domain set with its expected revision |
| `batch_set_company_domains` | Preview or apply up to 100 explicit organization replacements with per-item results |
| `list_library_items` | Paginated library quotes |
| `list_activities` | Paginated team activity text |
| `get_attachment_link` | Short-lived download URL for a team activity attachment |
| `create_contact` | Create one evidence-based contact with an organization and optional internal plain-text information |
| `update_contact` | Change an active contact's editable fields, including relevance, tags, or internal information |
| `batch_update_contacts` | Update up to 100 contacts with an updated or error result per input |
| `batch_create_contacts` | Create up to 100 contacts with a created, duplicate, or error result per input |
| `add_activity` | Add a phone call, missed call, or meeting linked to existing contacts |

The agent cannot delete contacts, edit or delete activities, change team settings,
or read personal reminders, inbox suggestions, AI credentials, or another team's data. Duplicate contacts are
excluded from ordinary reads. Use `search_contacts` before paginating through
`list_contacts` when looking for a person or topic. It accepts `query` (2–500
characters), optional `limit` (1–30, default 10), and `expectedTeamId`. Results
include a matching passage, score, contact ID, and optional activity ID; follow
up with `get_contact` for full context. MCP search is limited to the connected
team, including its internal information; it does not return
cross-team grants. `create_contact` and `batch_create_contacts`
check active team contacts by normalized name plus organization, email, or
phone; likely matches are returned for review rather than created. Batch
results preserve the input index and allow valid nonduplicates to succeed
when other items fail. Search existing contacts first.

Domain tools use the connected team and require `expectedTeamId`. Read
`list_team_reference` before editing. `create_domain` accepts `name` and optional
`description` (1–500 characters) and palette `color`; a duplicate after Unicode
normalization, case folding, and whitespace normalization returns `reused` and
does not edit the existing domain. `update_domain` accepts `domainId`,
`expectedRevision`, and at least one of `name`, `description` (or `null` to
clear), and `color`. The palette is `blue`, `orange`, `mint`, `pink`, `violet`,
`coral`, `yellow`, `lime`, `cyan`, and `slate`.

`set_company_domains` accepts `companyId`, zero or one ID in `domainIds`, and
`expectedRevision` from `companies[].domainsRevision`. An empty array removes
the domain link. The batch tool accepts `items` with these same three fields
and optional `dryRun` (default `false`). Each result includes its input index,
organization ID and name, status, previous named links and revision, and
resulting named links and revision. Failed or stale items include an error and
do not change that organization's links; other items continue. A dry run
returns `wouldChange` and leaves every revision and link unchanged. Read
`list_team_reference` again after a write to verify the saved result. These
tools only mutate domains or organization-domain links; contact records and
person tags are untouched.

To release the unified internal field and contact summary, apply migration `0050_contact_summary_and_internal_note.sql` with
`DATABASE_URL=... bun run db:migrate` before deploying the updated API and web
app. The connected MCP uses the API's `/mcp` endpoint, so there is no separate
MCP server to deploy; refresh the client's tool catalog after the API rollout.

For `update_contact`, read the contact with `get_contact` and pass its
`contact.updatedAt` as `expectedUpdatedAt`. If another edit happened meanwhile,
the tool rejects the update; read the latest contact and retry. Omit fields that
should stay unchanged. `tagIds` replaces the complete tag set. Edit the
single internal field with `internalInformation`. `relevance` accepts `high`,
`medium`, `low`, or `null` to clear it. A non-null value is marked as manually
set, so summary AI preserves it. Clearing the value allows AI to suggest it
again. `batch_update_contacts` accepts `expectedTeamId` and a `contacts` array
of up to 100 items with `contactId`, `expectedUpdatedAt`, and any editable
fields from `update_contact`. It applies each item separately and returns its
input index and result; stale or invalid items do not stop the others.
The normal seven statuses are accepted; `duplicate` requires the separate
confirmed duplicate flow. The first change from `ikke_kontaktet` assigns an
unassigned contact to the acting user, as in the workspace. Organization,
assignee, and tag IDs must belong to the connected team. Shared-note changes
also reset the live collaborative note so open editors receive the new text.

For both creation tools, `description` (`Kort beskrivelse`) is a concise,
evidence-based Norwegian phrase about the person's role or relevant context,
limited to 120 characters. The API rejects a longer description; batch
creation reports an error for that item and continues with other items. Put
longer research in `internalInformation` instead.

`internalInformation` is the one editable internal field. It includes former
team notes and agent/referral information, preserving source labels in migrated
text. It is available to MCP and built-in AI context, but excluded from the
contact log and exports. Write it as plain text without Markdown syntax; the
editor displays formatting characters literally. The former create-only `additionalInfo` parameter is
accepted for compatibility and is placed in this field.
Use it for relevant background beyond `Kort beskrivelse`, a natural way to
start a conversation, and two to four specific questions the team could ask
the person. Mark questions or hypotheses as suggestions and distinguish them
from known facts. Omit sections when there is no useful evidence.

Both creation tools accept an optional initial `status` and `assigneeId` per
contact. `status` defaults to `ikke_kontaktet`; `duplicate` is not accepted.
`assigneeId` must identify a member of the connected team. If a contact is
created in another status without an explicit assignee, the connected user is
assigned, matching the first status-change rule.

The profile instructions are generated from the workspace's currently selected
team name and immutable ID, and explicitly say that the connection follows the
workspace team. They contain no credentials. If the selected team changes,
previously copied instructions continue to expect the old ID and cause a safe
stop until replaced. Re-copy the block after switching teams.

Official setup references: [Codex MCP CLI](https://developers.openai.com/learn/docs-mcp),
[Claude custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp),
[Supabase MCP OAuth](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication).
