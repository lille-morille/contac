import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Button } from "../components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card.tsx";
import { Input } from "../components/ui/input.tsx";
import { Label } from "../components/ui/label.tsx";
import { request } from "../lib/api.ts";
import { copyText } from "../lib/clipboard.ts";
import { getSupabase } from "../lib/supabase.ts";

export const Route = createFileRoute("/login")({ component: Login });
function Login() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [mode, setMode] = useState<"login" | "setup">("login");
  const [setupCode, setSetupCode] = useState("");
  const [className, setClassName] = useState("");
  const [name, setName] = useState("");
  const [issued, setIssued] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function signIn(recoveryCode: string) {
    const match = /^cc1\.([\da-f-]{36})\.([A-Za-z0-9_-]+)$/.exec(recoveryCode.trim());
    const shortCode = recoveryCode.trim().toLowerCase();
    if (!match && !/^[a-z0-9-]{8,64}$/.test(shortCode))
      throw new Error("Ugyldig gjenopprettingskode eller passkode");
    const result = await getSupabase().auth.signInWithPassword({
      email: `${match ? match[1] : shortCode}@accounts.contac.invalid`,
      password: match ? match[2] : recoveryCode.trim(),
    });
    if (result.error) throw result.error;
    void navigate({ to: "/" });
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "setup" && !issued) {
        const result = await request<{ recoveryCode: string }>("/setup", undefined, {
          setupCode,
          className,
          name,
        });
        setIssued(result.recoveryCode);
      } else await signIn(issued || code);
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
          <CardTitle className="text-2xl">
            {mode === "setup" ? "Opprett klasse" : "Velkommen tilbake"}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {mode === "setup"
              ? "Klasseadministratoren setter opp arbeidsområdet."
              : "Logg inn med din personlige gjenopprettingskode eller passkode."}
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={(event) => void submit(event)} className="space-y-4">
            {issued ? (
              <div className="rounded-xl bg-warn-soft p-3">
                <p className="font-medium">Kopier koden nå</p>
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
                  Koden gir full tilgang til kontoen din. Lagre den trygt.
                </p>
                <p className="mt-2 text-xs">
                  Etter innlogging fullfører du profilen med navn, e-post og profilbilde.
                </p>
              </div>
            ) : mode === "setup" ? (
              <>
                <label className="block space-y-2">
                  <Label>Oppsettkode</Label>
                  <Input
                    required
                    value={setupCode}
                    onChange={(e) => setSetupCode(e.target.value)}
                  />
                </label>
                <label className="block space-y-2">
                  <Label>Klassenavn</Label>
                  <Input
                    required
                    value={className}
                    onChange={(e) => setClassName(e.target.value)}
                  />
                </label>
                <label className="block space-y-2">
                  <Label>Ditt navn</Label>
                  <Input required value={name} onChange={(e) => setName(e.target.value)} />
                </label>
              </>
            ) : (
              <label className="block space-y-2">
                <Label>Gjenopprettingskode eller passkode</Label>
                <Input
                  required
                  type="password"
                  autoComplete="current-password"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </label>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button disabled={busy} className="w-full" type="submit">
              {issued
                ? "Jeg har lagret koden – åpne"
                : mode === "setup"
                  ? "Opprett klasse"
                  : "Logg inn"}
            </Button>
          </form>
          <button
            type="button"
            className="mt-4 text-sm text-primary"
            onClick={() => {
              setMode(mode === "login" ? "setup" : "login");
              setIssued("");
              setError("");
            }}
          >
            {mode === "login" ? "Klasseadministrator? Opprett klasse" : "Tilbake til innlogging"}
          </button>
          <p className="mt-4 text-xs text-muted-foreground">
            Har du fått en invitasjon? Åpne den hemmelige lenken. <Link to="/">Tilbake</Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
