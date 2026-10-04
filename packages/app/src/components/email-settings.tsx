import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { request } from "../lib/api.ts";
import { useOrg } from "../lib/org.tsx";
import { Card } from "./ui/card.tsx";
import { Checkbox } from "./ui/checkbox.tsx";
type Settings = { captureAddress: string | null; autoShareLogs: boolean };

export function TeamEmailSettings() {
  const { org } = useOrg();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const settings = useQuery({
    queryKey: ["email-settings", org?.id],
    queryFn: () => request<Settings>("/org/email-settings", org!.id),
    enabled: !!org,
    refetchInterval: 60_000,
  });
  async function update(value: boolean) {
    if (!org) return;
    setBusy(true);
    setError("");
    try {
      await request("/org/email-settings", org.id, { autoShareLogs: value });
      await qc.invalidateQueries({ queryKey: ["email-settings", org.id] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="p-5">
      <h2 className="font-semibold">E-post og deling med andre team</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Teamets Bcc-adresse legges automatisk til når et utkast åpnes i e-postklienten.
      </p>
      <p className="mt-3 break-all rounded-xl bg-muted p-3 text-sm">
        {settings.data?.captureAddress ?? "Inngående e-post er ikke konfigurert ennå."}
      </p>
      <label className="mt-4 flex items-start gap-2 text-sm">
        <Checkbox
          checked={settings.data?.autoShareLogs ?? false}
          disabled={busy || !settings.data}
          onCheckedChange={(checked) => void update(checked)}
          aria-label="Gi andre team automatisk lesetilgang til matchede kontaktlogger"
        />
        <span>
          Gi andre team automatisk lesetilgang til kontaktlogger for matchede personer. Ellers må
          noen i teamet godkjenne hver forespørsel. Lesetilgang inkluderer aktiviteter og vedlegg,
          men ikke det delte notatet.
        </span>
      </label>
      {error && (
        <p role="alert" className="mt-2 text-sm text-risk">
          {error}
        </p>
      )}
    </Card>
  );
}
