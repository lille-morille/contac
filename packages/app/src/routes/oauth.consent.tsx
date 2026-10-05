import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "../components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card.tsx";
import { Input } from "../components/ui/input.tsx";
import { Label } from "../components/ui/label.tsx";
import { request } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import { getSupabase } from "../lib/supabase.ts";

type Details = { clientName: string; email: string; scope: string };
type AgentAccess = { teamId: string | null; teamName: string | null; connectionCount: number };

export const Route = createFileRoute("/oauth/consent")({
  validateSearch: (search: Record<string, unknown>) => ({
    authorization_id: typeof search.authorization_id === "string" ? search.authorization_id : "",
  }),
  component: OAuthConsent,
});

function returnToClient(value: string) {
  const url = new URL(value);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))
  )
    throw new Error("Ugyldig returadresse fra OAuth-tjenesten");
  window.location.assign(url.toString());
}

function OAuthConsent() {
  const { session, loading } = useAuth();
  const { authorization_id: authorizationId } = Route.useSearch();
  const [details, setDetails] = useState<Details | null>(null);
  const [code, setCode] = useState("");
  const [agentAccess, setAgentAccess] = useState<AgentAccess | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (loading || !session || !authorizationId) return;
    let live = true;
    void getSupabase()
      .auth.oauth.getAuthorizationDetails(authorizationId)
      .then(({ data, error }) => {
        if (!live) return;
        if (error || !data) {
          setError(error?.message ?? "Kunne ikke hente tilkoblingen");
        } else if ("redirect_url" in data) {
          try {
            returnToClient(data.redirect_url);
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
          }
        } else {
          setDetails({
            clientName: data.client.name || "MCP-klient",
            email: data.user.email,
            scope: data.scope,
          });
        }
      });
    return () => {
      live = false;
    };
  }, [authorizationId, loading, session]);

  useEffect(() => {
    if (!session) return;
    let live = true;
    void request<AgentAccess>("/profile/agent-access")
      .then((access) => {
        if (live) setAgentAccess(access);
      })
      .catch((cause) => {
        if (live) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      live = false;
    };
  }, [session]);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const match = /^cc1\.([\da-f-]{36})\.([A-Za-z0-9_-]+)$/.exec(code.trim());
      const shortCode = code.trim().toLowerCase();
      if (!match && !/^[a-z0-9-]{8,64}$/.test(shortCode))
        throw new Error("Ugyldig gjenopprettingskode eller passkode");
      const result = await getSupabase().auth.signInWithPassword({
        email: `${match ? match[1] : shortCode}@accounts.contac.invalid`,
        password: match ? match[2] : code.trim(),
      });
      if (result.error) throw result.error;
      setCode("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function decide(action: "approve" | "deny") {
    setBusy(true);
    setError("");
    try {
      if (action === "deny") {
        const { data, error } = await getSupabase().auth.oauth.denyAuthorization(authorizationId, {
          skipBrowserRedirect: true,
        });
        if (error || !data) throw error ?? new Error("Kunne ikke avslå tilkoblingen");
        returnToClient(data.redirect_url);
      } else {
        const result = await request<{ redirectUrl: string }>("/mcp/oauth/authorize", undefined, {
          authorizationId,
        });
        returnToClient(result.redirectUrl);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center px-5 py-8">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-2xl">Koble en agent til Contac</CardTitle>
          <p className="text-sm text-muted-foreground">
            Godkjenn tilgangen med kontoen din og teamet du har valgt under Profil → Agenttilgang.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {!authorizationId && !loading ? (
            <p role="alert" className="text-sm text-destructive">
              Tilkoblingslenken mangler en gyldig forespørsel.
            </p>
          ) : loading ? (
            <p className="text-sm text-muted-foreground">Laster inn …</p>
          ) : !session ? (
            <form className="space-y-3" onSubmit={(event) => void signIn(event)}>
              <label className="block space-y-2">
                <Label>Gjenopprettingskode eller passkode</Label>
                <Input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                />
              </label>
              <Button type="submit" disabled={busy}>
                Logg inn for å fortsette
              </Button>
            </form>
          ) : details ? (
            <>
              <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm">
                <p>
                  <strong>{details.clientName}</strong> vil koble seg til Contac.
                </p>
                <p className="mt-1 text-muted-foreground">Du er logget inn som {details.email}.</p>
                <p className="mt-3">
                  Agenten kan lese teamets kontakter, organisasjoner, aktiviteter og sitater, samt
                  opprette kontakter og aktiviteter. Den kan ikke endre eller slette eksisterende
                  data.
                </p>
              </div>
              {agentAccess?.teamId ? (
                <p className="rounded-xl bg-primary-soft p-3 text-sm">
                  Valgt team: <strong>{agentAccess.teamName}</strong> ({agentAccess.teamId}).
                  Endring av team i profilen gjelder også eksisterende tilkoblinger.
                </p>
              ) : (
                <p role="alert" className="rounded-xl bg-warn-soft p-3 text-sm">
                  Velg et team under Profil → Agenttilgang i Contac før du godkjenner.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={busy || !agentAccess?.teamId}
                  onClick={() => void decide("approve")}
                >
                  Tillat tilgang
                </Button>
                <Button variant="outline" disabled={busy} onClick={() => void decide("deny")}>
                  Avslå
                </Button>
              </div>
            </>
          ) : !error ? (
            <p className="text-sm text-muted-foreground">Henter tilkoblingsdetaljer …</p>
          ) : null}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
