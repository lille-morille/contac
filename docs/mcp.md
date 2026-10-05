# Contac MCP for team agents

Each team has its own remote MCP endpoint at `https://api.contac.plingapp.no/mcp`.
It uses Streamable HTTP. A team admin creates a named token in **Teaminnstillinger →
Agenttilgang (MCP)**. The secret is displayed once; store it in the agent client's
secret store. Send it as `Authorization: Bearer <token>` on every request. The URL
is the same for all teams: the token selects the team, so no team ID header is
needed. Revoke a token from the same settings page when an integration is no
longer needed. Revocation takes effect on the next request.

The token can call these tools:

| Tool | Access |
| --- | --- |
| `get_team_identity` | Authenticated connection's immutable team ID and current workspace name |
| `list_contacts` | Paginated active contacts and their fields |
| `get_contact` | Full contact, organization, tags, shared note, separate additional Markdown information, activities, email records, transcripts, participants, and attachment metadata |
| `list_team_reference` | Organizations, domains, and person tags |
| `list_library_items` | Paginated library quotes |
| `list_activities` | Paginated team activity text |
| `get_attachment_link` | 60-second download URL for a team activity attachment |
| `create_contact` | Create a contact, optionally creating/reusing an organization and attaching separate agent Markdown information |
| `batch_create_contacts` | Create up to 100 contacts with a created, duplicate, or error result for each input |
| `add_activity` | Add a phone call, missed call, or meeting linked to existing contacts |

The MCP token cannot edit or delete existing contacts, activities, or files; it
cannot change status, assignment, tags, or team settings. It does not expose
personal reminders, private sender address settings, inbound inbox suggestions,
AI credentials, or another team's data. Duplicate contacts are excluded from
the contact tools. The token's creator is recorded as the creator of records
written through the token, and the token's last-use time is shown in settings.

`create_contact.additionalInfo` accepts evidence-grounded Markdown up to 20,000
characters. It appears under **Tilleggsinformasjon** on the contact, separate
from the shared team note. Team members can edit it there. It is searchable in
the owning team and returned by `get_contact`, but is excluded from built-in AI
summaries and deterministic YAML export. Search for an existing person before
creating a contact.

`batch_create_contacts` accepts up to 100 objects with the same fields as
`create_contact`. Each is checked against active team contacts using normalized
name plus organization, email, or phone. Valid nonduplicates are created even
when another item fails. Results include the input index and either the new
contact ID and number, duplicate candidates for review, or a validation/write
error. The single-contact tool also returns duplicate candidates instead of
creating an obvious duplicate.

Call `get_team_identity` before other Contac tools in each new conversation.
Compare its `teamId` to the expected immutable team ID, and stop and notify the
user if it differs or the call fails. Every data tool now requires
`expectedTeamId`; the server checks it before reading or writing. Existing MCP
clients must update their tool calls to pass this argument. A team rename does
not change its ID. The returned name is the workspace team name, not the
optional product name used for the LOI.

Example generic MCP client configuration (client syntax varies):

```json
{
  "mcpServers": {
    "contac": {
      "url": "https://api.contac.plingapp.no/mcp",
      "headers": {
        "Authorization": "Bearer <team-token>"
      }
    }
  }
}
```

The API stores a SHA-256 hash of the token, never the secret. The token table
has RLS enabled and no `anon` or `authenticated` table access; the Hono API
checks team admin permission for token management. MCP requests are resolved
to exactly one team from the token, and database reads and writes include that
team ID. Requests that use a raw team key reject foreign browser Origins;
OAuth requests still require a valid signed token and team grant.

## Claude

For Claude's remote custom connector, open **Customize → Connectors → Add custom
connector**. On Team/Enterprise plans an owner first adds it under
**Organization settings → Connectors → Add → Custom → Web**. Use the MCP URL above,
choose **No sign in**, and add one **Request header** with name `Authorization`
and value `Bearer <team-token>`. Then enable the connector for a conversation.
The token creation screen has separate copy buttons for the URL, raw team token,
header name, and complete header value.

## ChatGPT

ChatGPT's remote MCP connection uses OAuth rather than a pasted API key. Enable
Developer mode, open **ChatGPT Plugins**, add the same MCP URL, and select the
OAuth connection. The Contac consent screen asks the user to log in with their
recovery code or passcode and paste the raw team token. The user must belong to
that team or be a class admin. Contac binds the OAuth client's ID and user ID to
the team token; the MCP API verifies the signed OAuth access token, current team
membership, and that the team token is not revoked on every request. A revoked
team token immediately blocks both Claude and ChatGPT connections using it.
The raw team token is sent only to Contac during consent, not to ChatGPT.

Production OAuth needs the Contac Production Supabase project to have its OAuth
2.1 server and dynamic client registration enabled. Enable the Custom Access
Token hook `private.mcp_access_token_hook` after applying migration 0031. This
binds OAuth access tokens to the Contac MCP resource; ordinary app tokens keep
their existing audience. The Auth Site URL must be
`https://contac.plingapp.no` and the OAuth authorization path must be
`/oauth/consent`. The project must use an asymmetric signing key. The MCP
resource metadata is served at
`https://api.contac.plingapp.no/.well-known/oauth-protected-resource/mcp`.
The OAuth issuer is the production project's Supabase Auth endpoint, configured
through `SUPABASE_URL`. The API's `MCP_PUBLIC_BASE_URL` may override the public
API origin for local or staging deployments; add the corresponding issuer and
resource URL to `private.mcp_oauth_config` before using OAuth there. Never
derive the public URL from request Host.
The `mcp_oauth_grants` table is API-only with RLS and no client role grants.
