import { Copy, KeyRound, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { request } from "../lib/api.ts";
import { copyText } from "../lib/clipboard.ts";
import { Button } from "./ui/button.tsx";
import { Card } from "./ui/card.tsx";
import { Input } from "./ui/input.tsx";

type TokenRow = {
  id: string;
  name: string;
  tokenPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export function TeamMcpSettings({ orgId }: { orgId: string }) {
  const [rows, setRows] = useState<TokenRow[]>([]);
  const [name, setName] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    setRows(await request<TokenRow[]>("/org/mcp-tokens", orgId));
  }
  useEffect(() => {
    setSecret("");
    void refresh().catch((cause) =>
      setError(cause instanceof Error ? cause.message : String(cause)),
    );
  }, [orgId]);

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const row = await request<{ token: string }>("/org/mcp-tokens", orgId, { name });
      setSecret(row.token);
      setName("");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }
  async function revoke(id: string) {
    if (
      !window.confirm(
        "Trekke tilbake denne nøkkelen? Tilkoblede agenter mister tilgangen umiddelbart.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await request(`/org/mcp-tokens/${id}/revoke`, orgId, {});
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <KeyRound size={18} className="text-primary" />
        <h2 className="font-semibold">Agenttilgang (MCP)</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Nøkler gir lesetilgang til teamets kontaktdata og kan opprette kontakter og aktiviteter. De
        kan ikke endre eller slette eksisterende data. Lag én nøkkel per agentintegrasjon.
      </p>
      <form className="mt-4 flex gap-2" onSubmit={(event) => void create(event)}>
        <Input
          required
          maxLength={100}
          placeholder="Navn på integrasjonen"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Button type="submit" disabled={busy || !name.trim()}>
          Lag nøkkel
        </Button>
      </form>
      {secret && (
        <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-3">
          <p className="text-sm font-medium">Kopier nøkkelen nå. Den vises bare én gang.</p>
          <div className="mt-2 flex gap-2">
            <Input
              readOnly
              value={secret}
              aria-label="Ny MCP-nøkkel"
              className="font-mono text-xs"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => void copyText(secret)}
              aria-label="Kopier nøkkel"
            >
              <Copy size={16} />
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            MCP-adresse: https://api.contac.plingapp.no/mcp · Authorization: Bearer &lt;nøkkel&gt;
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="mt-4 space-y-2">
        {rows
          .filter((row) => !row.revokedAt)
          .map((row) => (
            <div
              key={row.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium">
                  {row.name}{" "}
                  <span className="font-mono text-xs text-muted-foreground">
                    {row.tokenPrefix}…
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {row.lastUsedAt
                    ? `Sist brukt ${new Date(row.lastUsedAt).toLocaleString("nb-NO")}`
                    : "Ikke brukt ennå"}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void revoke(row.id)}
                aria-label={`Trekk tilbake ${row.name}`}
              >
                <Trash2 size={15} /> Trekk tilbake
              </Button>
            </div>
          ))}
      </div>
    </Card>
  );
}
