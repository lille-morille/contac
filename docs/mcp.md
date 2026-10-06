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
| `list_contacts` | Paginated active contacts and their fields |
| `get_contact` | Contact, organization, tags, shared note, separate additional information, activities, email records, transcripts, participants, and attachment metadata |
| `list_team_reference` | Organizations, domains, and person tags |
| `list_library_items` | Paginated library quotes |
| `list_activities` | Paginated team activity text |
| `get_attachment_link` | Short-lived download URL for a team activity attachment |
| `create_contact` | Create one evidence-based contact with an organization and optional separate Markdown information |
| `batch_create_contacts` | Create up to 100 contacts with a created, duplicate, or error result per input |
| `add_activity` | Add a phone call, missed call, or meeting linked to existing contacts |

The agent cannot edit or delete existing contacts or activities, change status
or assignment, edit shared notes or settings, or read personal reminders, inbox
suggestions, AI credentials, or another team's data. Duplicate contacts are
excluded from ordinary reads. `create_contact` and `batch_create_contacts`
check active team contacts by normalized name plus organization, email, or
phone; likely matches are returned for review rather than created. Batch
results preserve the input index and allow valid nonduplicates to succeed
when other items fail. Search existing contacts first.

`additionalInfo` accepts up to 20,000 characters of Markdown, appears under
**Tilleggsinformasjon** with an agent source label, and is editable by team
members. It is included in the owning team's local search and `get_contact`,
but excluded from built-in AI and deterministic YAML export. Keep it factual
and separate from the team's shared note.

The profile instructions are generated from the workspace's currently selected
team name and immutable ID, and explicitly say that the connection follows the
workspace team. They contain no credentials. If the selected team changes,
previously copied instructions continue to expect the old ID and cause a safe
stop until replaced. Re-copy the block after switching teams.

Official setup references: [Codex MCP CLI](https://developers.openai.com/learn/docs-mcp),
[Claude custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp),
[Supabase MCP OAuth](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication).
