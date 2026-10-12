import { CONTACT_DESCRIPTION_MAX_LENGTH } from "@contac/core";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, KeyRound } from "lucide-react";
import { useState } from "react";
import { request } from "../lib/api.ts";
import { copyText } from "../lib/clipboard.ts";
import { useOrg } from "../lib/org.tsx";
import { Button } from "./ui/button.tsx";
import { Card } from "./ui/card.tsx";

type AgentAccess = { teamId: string | null; teamName: string | null; connectionCount: number };
const MCP_URL = "https://api.contac.plingapp.no/mcp";
const CODEX_SETUP = `codex mcp add contac --url ${MCP_URL}\ncodex mcp login contac --oauth-client-registration dcr`;
const CLAUDE_SETUP = `claude mcp add --transport http --scope user contac ${MCP_URL}`;

export function agentInstructions(teamName: string, teamId: string) {
  const safeName = teamName
    .replace(/[\r\n`*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `## Contac agent access

Expected Contac team: **${safeName}** (\`${teamId}\`).

The Contac connection follows the team currently selected in the Contac workspace. Switching teams there also switches existing agent connections. This block records the team selected when it was copied; copy an updated block after switching teams.

Contac is the team's contact and conversation log. The connection accesses exactly one selected team at a time. Call \`get_team_identity\` before any other Contac tool in every new conversation or session. Compare its \`teamId\` with \`${teamId}\`. If verification fails or the IDs differ, tell the user which team is connected when known, and stop using Contac. A changed team name is a human-readable cross-check; the immutable ID decides the match.

Pass \`${teamId}\` as \`expectedTeamId\` to every subsequent Contac data tool. Do not continue if a tool rejects the team ID.

Search the team's contacts with \`search_contacts\` and inspect likely matches with \`get_contact\` before creating a person. Use \`list_contacts\` for complete paginated browsing. Use \`list_team_reference\` to find organizations and tags. Create evidence-grounded contacts with \`create_contact\` or \`batch_create_contacts\`; the tools report duplicate candidates for review. Keep \`description\` (Kort beskrivelse) to a short, evidence-based Norwegian phrase of at most ${CONTACT_DESCRIPTION_MAX_LENGTH} characters. Put longer agent research in \`internalInformation\` as plain text. This is the one internal field for team notes and agent context; the editor does not render Markdown, so avoid Markdown syntax. It is available to internal AI but excluded from the contact log and exports. Use \`update_contact\` to change an existing contact's editable fields, status, assignee, tags, or internal information; pass the \`updatedAt\` returned by \`get_contact\` as \`expectedUpdatedAt\` and reread on conflict. Save an unsent email draft with \`create_email_draft\`: give the contact number, subject, and raw content without a sign-off or signature; Contac fills the email addresses. Record a phone call, missed call, or meeting with \`add_activity\` linked to existing contacts. Use \`list_activities\` and \`get_contact\` to read conversation history. Use \`list_calendar_events\` and \`get_calendar_event\` to read shared meetings and deadlines, and \`create_calendar_event\`, \`update_calendar_event\`, or \`delete_calendar_event\` to manage them. For edits and deletion, pass the event's \`updatedAt\` as \`expectedUpdatedAt\`. Use \`list_calendar_reminders\` and \`get_calendar_reminder\` to read your private contact reminders, then \`create_calendar_reminder\`, \`update_calendar_reminder\`, \`dismiss_calendar_reminder\`, or \`delete_calendar_reminder\` to manage them.

The agent cannot edit existing activities, change team settings, delete contacts or activities, or read another user's reminders. Ask a team member to make those changes in Contac. Never create a duplicate or invent contact details. Do not put credentials in this file.
`;
}

export function ProfileAgentAccess() {
  const state = useOrg();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const access = useQuery({
    queryKey: ["profile-agent-access", state.user?.id, state.org?.id],
    queryFn: () => request<AgentAccess>("/profile/agent-access"),
    enabled: !!state.user?.id,
  });
  const team = state.org;
  const synchronized = !!team && access.data?.teamId === team.id;
  const instructions = synchronized ? agentInstructions(team.name, team.id) : "";
  async function revoke() {
    setBusy(true);
    setError("");
    try {
      await request("/profile/agent-revoke", undefined, {});
      await access.refetch();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }
  async function copy(value: string, label: string) {
    try {
      await copyText(value);
      setCopied(label);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <KeyRound size={18} className="text-primary" />
        <h2 className="font-semibold">Agenttilgang</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Agenttilgangen følger teamet du har valgt i Contac. Bytt team øverst på teamfanen i
        Innstillinger; eksisterende agenttilkoblinger bytter da team også.
      </p>
      {team && (
        <>
          <p className="mt-3 text-sm">
            Tilkoblet team: <strong>{team.name}</strong> ·{" "}
            <code className="break-all">{team.id}</code>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {access.data?.connectionCount ?? 0} aktive OAuth-tilkoblinger. Hver forespørsel sjekker
            medlemskap og teamvalg på nytt.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border p-3 text-sm">
              <h3 className="font-semibold">Codex</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Kjør kommandoene og logg inn i nettleseren.
              </p>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-muted p-2 text-xs">
                {CODEX_SETUP}
              </pre>
              <Button
                className="mt-2"
                size="sm"
                variant="outline"
                onClick={() => void copy(CODEX_SETUP, "codex")}
              >
                {copied === "codex" ? <Check size={14} /> : <Copy size={14} />} Kopier kommandoer
              </Button>
            </div>
            <div className="rounded-xl border border-border p-3 text-sm">
              <h3 className="font-semibold">Claude</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                For Claude Code, kjør kommandoen og fullfør OAuth via /mcp. I Claude på web, legg
                til URL-en som en egendefinert connector og velg innlogging.
              </p>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-muted p-2 text-xs">
                {CLAUDE_SETUP}
              </pre>
              <Button
                className="mt-2"
                size="sm"
                variant="outline"
                onClick={() => void copy(CLAUDE_SETUP, "claude")}
              >
                {copied === "claude" ? <Check size={14} /> : <Copy size={14} />} Kopier kommando
              </Button>
            </div>
          </div>
          {!synchronized && !access.isError && (
            <p role="status" className="mt-3 text-sm text-muted-foreground">
              Bekrefter at agenttilgangen følger valgt team …
            </p>
          )}
          {synchronized && (
            <div className="mt-5">
              <h3 className="text-sm font-semibold">Instruksjoner til CLAUDE.md eller AGENTS.md</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Kopier blokken inn i agentens prosjektinstruksjoner. Den inneholder team-ID, men
                ingen hemmeligheter.
              </p>
              <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-muted p-3 text-xs">
                {instructions}
              </pre>
              <Button
                className="mt-2"
                size="sm"
                variant="outline"
                onClick={() => void copy(instructions, "instructions")}
              >
                {copied === "instructions" ? <Check size={14} /> : <Copy size={14} />} Kopier
                instruksjoner
              </Button>
            </div>
          )}
          {(access.data?.connectionCount ?? 0) > 0 && (
            <Button
              className="mt-5"
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={() => void revoke()}
            >
              Koble fra mine agenter
            </Button>
          )}
        </>
      )}
      {access.isError && (
        <p role="alert" className="mt-3 text-sm text-risk">
          {access.error.message}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-risk">
          {error}
        </p>
      )}
    </Card>
  );
}
