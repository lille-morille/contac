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
| `list_contacts` | Paginated active contacts and their fields |
| `get_contact` | Full contact, organization, department, tags, note, activities, email records, transcripts, participants, and attachment metadata |
| `list_team_reference` | Organizations, departments, domains, and person tags |
| `list_library_items` | Paginated library quotes |
| `list_activities` | Paginated team activity text |
| `get_attachment_link` | 60-second download URL for a team activity attachment |
| `create_contact` | Create a contact, optionally creating/reusing an organization |
| `add_activity` | Add a phone call, missed call, or meeting linked to existing contacts |

The MCP token cannot edit or delete existing contacts, activities, or files; it
cannot change status, assignment, tags, or team settings. It does not expose
personal reminders, private sender address settings, inbound inbox suggestions,
AI credentials, or another team's data. Duplicate contacts are excluded from
the contact tools. The token's creator is recorded as the creator of records
written through the token, and the token's last-use time is shown in settings.

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
team ID. The endpoint accepts no browser Origin other than the app origin.
