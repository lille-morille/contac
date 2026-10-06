import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Button } from "../components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card.tsx";
import { Input } from "../components/ui/input.tsx";
import { Label } from "../components/ui/label.tsx";
import { request } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import { copyText } from "../lib/clipboard.ts";
import { useOrg } from "../lib/org.tsx";
import { getSupabase } from "../lib/supabase.ts";

export const Route = createFileRoute("/invite")({ component: Invite });
function Invite() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const { refresh, select } = useOrg();
  const token =
    typeof window === "undefined"
      ? ""
      : (new URLSearchParams(window.location.search).get("token") ?? "");
  const info = useQuery({
    queryKey: ["invite", token],
    queryFn: () => request<{ teamName: string }>(`/invitations/${encodeURIComponent(token)}`),
    enabled: !!token,
  });
  const [name, setName] = useState("");
  const [issued, setIssued] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (session) {
        const result = await request<{ orgId: string }>("/invitations/accept", undefined, {
          token,
        });
        await refresh();
        await select(result.orgId);
        void navigate({ to: "/" });
      } else if (!issued) {
        const result = await request<{ recoveryCode: string }>("/invitations/join", undefined, {
          token,
          name,
        });
        setIssued(result.recoveryCode);
      } else {
        const match = /^cc1\.([\da-f-]{36})\.([A-Za-z0-9_-]+)$/.exec(issued);
        if (!match) throw new Error("Ugyldig kode");
        const result = await getSupabase().auth.signInWithPassword({
          email: `${match[1]}@accounts.contac.invalid`,
          password: match[2],
        });
        if (result.error) throw result.error;
        await refresh();
        void navigate({ to: "/" });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-5">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Bli med i {info.data?.teamName ?? "teamet"}</CardTitle>
          <p className="text-sm text-muted-foreground">Hemmelig invitasjonslenke</p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(e) => void submit(e)}>
            {!token || info.error ? (
              <p role="alert" className="text-destructive">
                Ugyldig eller utløpt invitasjonslenke. Be teamet om en ny lenke.
              </p>
            ) : null}
            {!session && !issued && (
              <label className="block space-y-2">
                <Label>Ditt navn</Label>
                <Input required value={name} onChange={(e) => setName(e.target.value)} />
              </label>
            )}
            {issued && (
              <div className="rounded-xl bg-warn-soft p-3">
                <p className="font-medium">Lagre gjenopprettingskoden</p>
                <code className="mt-2 block break-all text-sm">{issued}</code>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => void copyText(issued)}
                >
                  Kopier
                </Button>
                <p className="mt-2 text-xs">
                  Etter innlogging fullfører du profilen med navn, e-post og profilbilde.
                </p>
              </div>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={!info.data || busy}>
              {issued
                ? "Jeg har lagret koden – åpne"
                : session
                  ? "Godta invitasjon"
                  : "Opprett konto"}
            </Button>
          </form>
          <p className="mt-4 text-xs text-muted-foreground">
            <Link to="/login">Har du konto? Logg inn først</Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
