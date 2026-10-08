import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { useState } from "react";
import { request, uploadFile } from "../lib/api.ts";
import { useOrg } from "../lib/org.tsx";
import { Button } from "./ui/button.tsx";
import { Card } from "./ui/card.tsx";
import { Input } from "./ui/input.tsx";

type Settings = {
  businessName: string;
  logoFileId: string | null;
};

export function TeamLoiSettings() {
  const { org } = useOrg();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["loi-settings", org?.id],
    queryFn: () => request<Settings>("/org/loi-settings", org!.id),
    enabled: !!org,
    refetchInterval: 60_000,
  });
  const [draft, setDraft] = useState<Partial<Settings> | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const settings = { ...query.data, ...draft };
  async function save() {
    if (!org) return;
    setBusy(true);
    setMessage("");
    try {
      await request("/org/loi-settings", org.id, {
        businessName: settings.businessName ?? "",
        logoFileId: settings.logoFileId ?? null,
      });
      setDraft(null);
      await qc.invalidateQueries({ queryKey: ["loi-settings", org.id] });
      setMessage("Produktnavn og logo er lagret.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Kunne ikke lagre.");
    } finally {
      setBusy(false);
    }
  }
  async function logo(file: File) {
    if (!org) return;
    if (file.type !== "image/png" || file.size > 5 * 1024 * 1024) {
      setMessage("Velg en PNG-logo på maks 5 MiB.");
      return;
    }
    setBusy(true);
    try {
      const row = await uploadFile(org.id, file);
      setDraft((current) => ({ ...current, logoFileId: row.id }));
      setMessage("Logoen er lastet opp. Trykk Lagre for å bruke den.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Opplasting feilet.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="p-5">
      <h2 className="font-semibold">Produkt/teamnavn</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Navnet vises i sidepanelet og brukes som virksomhetsnavn i intensjonsavtaler. Det endrer
        ikke navnet på teamets arbeidsområde.
      </p>
      <label className="mt-4 block text-sm">
        Produkt/teamnavn
        <Input
          className="mt-1"
          value={settings.businessName ?? ""}
          onChange={(event) =>
            setDraft((current) => ({ ...current, businessName: event.target.value }))
          }
        />
      </label>
      <div className="mt-4 flex items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm hover:bg-muted">
          <Upload size={15} /> {settings.logoFileId ? "Bytt teamlogo" : "Last opp teamlogo"}
          <input
            className="sr-only"
            type="file"
            accept="image/png"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void logo(file);
              event.target.value = "";
            }}
          />
        </label>
        {settings.logoFileId && <span className="text-xs text-muted-foreground">PNG valgt</span>}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Brukes i intensjonsavtaler (LOI)</p>
      <Button
        className="mt-4"
        size="sm"
        disabled={busy || query.isLoading}
        onClick={() => void save()}
      >
        Lagre produktnavn og logo
      </Button>
      {message && (
        <p role="status" className="mt-2 text-sm">
          {message}
        </p>
      )}
    </Card>
  );
}
