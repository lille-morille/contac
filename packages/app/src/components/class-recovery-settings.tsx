import { useQuery } from "@tanstack/react-query";
import { Copy, KeyRound } from "lucide-react";
import { useState } from "react";
import { request } from "../lib/api.ts";
import { copyText } from "../lib/clipboard.ts";
import { Button } from "./ui/button.tsx";
import { Card } from "./ui/card.tsx";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog.tsx";

type ClassMember = {
  userId: string;
  role: "admin" | "member";
  name: string | null;
  email: string | null;
};

function memberLabel(member: ClassMember) {
  return member.name?.trim() || member.email?.trim() || member.userId;
}

export function ClassRecoverySettings({ classId }: { classId: string }) {
  const members = useQuery({
    queryKey: ["class-members", classId],
    queryFn: () => request<ClassMember[]>("/class/members"),
  });
  const [target, setTarget] = useState<ClassMember | null>(null);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  function close() {
    setTarget(null);
    setRecoveryCode("");
    setError("");
    setCopied(false);
  }

  async function generate() {
    if (!target) return;
    setBusy(true);
    setError("");
    try {
      const result = await request<{ recoveryCode: string }>(
        `/class/members/${target.userId}/recovery-code`,
        undefined,
        {},
      );
      setRecoveryCode(result.recoveryCode);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke lage ny kode.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await copyText(recoveryCode);
      setCopied(true);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke kopiere koden.");
    }
  }

  return (
    <>
      <Card className="p-5">
        <h2 className="font-semibold">Gjenopprett tilgang</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Lag en ny innloggingskode for en person som har mistet sin. Del koden direkte med
          personen.
        </p>
        {members.isPending && <p className="mt-4 text-sm text-muted-foreground">Laster brukere…</p>}
        {members.error && (
          <p role="alert" className="mt-4 text-sm text-risk">
            Kunne ikke hente brukerne i klassen.
          </p>
        )}
        {members.data?.length === 0 && (
          <p className="mt-4 text-sm text-muted-foreground">Ingen brukere i klassen.</p>
        )}
        {members.data && members.data.length > 0 && (
          <div className="mt-4 max-h-80 space-y-2 overflow-y-auto">
            {members.data.map((member) => (
              <div
                key={member.userId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3"
              >
                <div className="min-w-0">
                  <p className="font-medium">{memberLabel(member)}</p>
                  {member.name && member.email && (
                    <p className="text-xs text-muted-foreground">{member.email}</p>
                  )}
                  {member.role === "admin" && (
                    <p className="text-xs text-muted-foreground">Klasseadministrator</p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setTarget(member);
                    setRecoveryCode("");
                    setError("");
                    setCopied(false);
                  }}
                >
                  <KeyRound /> Lag ny kode
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Dialog open={!!target} onOpenChange={(open) => !open && !busy && close()}>
        <DialogContent>
          <DialogTitle>Ny kode for {target ? memberLabel(target) : "brukeren"}</DialogTitle>
          {recoveryCode ? (
            <>
              <DialogDescription>
                Koden vises bare nå. Kopier den og del den direkte med riktig person.
              </DialogDescription>
              <code className="mt-4 block break-all rounded-xl bg-warn-soft p-3 text-sm">
                {recoveryCode}
              </code>
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="outline" onClick={() => void copy()}>
                  <Copy /> {copied ? "Kopiert" : "Kopier kode"}
                </Button>
                <Button onClick={close}>Ferdig</Button>
              </div>
            </>
          ) : (
            <>
              <DialogDescription>
                Den gamle koden slutter å virke når du lager en ny. Bekreft at du skal erstatte
                koden for denne brukeren.
              </DialogDescription>
              <p className="mt-3 break-all text-xs text-muted-foreground">
                Bruker-ID: {target?.userId}
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <Button variant="outline" disabled={busy} onClick={close}>
                  Avbryt
                </Button>
                <Button disabled={busy} onClick={() => void generate()}>
                  Lag ny kode
                </Button>
              </div>
            </>
          )}
          {error && (
            <p role="alert" className="mt-3 text-sm text-risk">
              {error}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
