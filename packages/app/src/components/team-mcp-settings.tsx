import { Check, Copy, KeyRound, Trash2 } from "lucide-react";
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

const MCP_URL = "https://api.contac.plingapp.no/mcp";

function CopyField({
  label,
  value,
  onCopy,
  copied,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="flex gap-2">
        <Input readOnly value={value} aria-label={label} className="min-w-0 font-mono text-xs" />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={onCopy}
          aria-label={`Kopier ${label.toLowerCase()}`}
          title={`Kopier ${label.toLowerCase()}`}
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
        </Button>
      </span>
    </label>
  );
}

export function TeamMcpSettings({ orgId }: { orgId: string }) {
  const [rows, setRows] = useState<TokenRow[]>([]);
  const [name, setName] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  async function copy(value: string, label: string) {
    try {
      await copyText(value);
      setCopied(label);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function refresh() {
    setRows(await request<TokenRow[]>("/org/mcp-tokens", orgId));
  }
  useEffect(() => {
    setSecret("");
    setCopied("");
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
      setCopied("");
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
        <div className="mt-4 space-y-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <p className="text-sm font-medium">Kopier nøkkelen nå. Den vises bare én gang.</p>
          <CopyField
            label="MCP-adresse"
            value={MCP_URL}
            copied={copied === "url"}
            onCopy={() => void copy(MCP_URL, "url")}
          />
          <CopyField
            label="Teamnøkkel"
            value={secret}
            copied={copied === "token"}
            onCopy={() => void copy(secret, "token")}
          />
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <CopyField
              label="Headernavn"
              value="Authorization"
              copied={copied === "header"}
              onCopy={() => void copy("Authorization", "header")}
            />
            <CopyField
              label="Headerverdi"
              value={`Bearer ${secret}`}
              copied={copied === "bearer"}
              onCopy={() => void copy(`Bearer ${secret}`, "bearer")}
            />
          </div>
          <div className="grid gap-3 border-t border-border/70 pt-4 md:grid-cols-2">
            <div className="rounded-xl bg-card/70 p-3 text-sm">
              <h3 className="font-semibold">Claude</h3>
              <ol className="mt-2 list-inside list-decimal space-y-1.5 text-muted-foreground">
                <li>
                  Åpne Customize → Connectors → Add custom connector. For Team/Enterprise gjør en
                  eier dette i Organization settings → Connectors.
                </li>
                <li>Bruk MCP-adressen over og velg «No sign in».</li>
                <li>
                  Under «Request headers»: lim inn <strong>Authorization</strong> som navn og{" "}
                  <strong>Bearer …</strong> som verdi.
                </li>
                <li>Legg til koblingen og aktiver den i samtalens Connectors-meny.</li>
              </ol>
            </div>
            <div className="rounded-xl bg-card/70 p-3 text-sm">
              <h3 className="font-semibold">ChatGPT</h3>
              <ol className="mt-2 list-inside list-decimal space-y-1.5 text-muted-foreground">
                <li>Slå på Developer mode i ChatGPT Settings → Security and login.</li>
                <li>Åpne ChatGPT Plugins, trykk pluss og legg til MCP-adressen over.</li>
                <li>
                  Velg OAuth-tilkobling. Når Contac åpnes, logg inn med passkoden din og lim inn{" "}
                  <strong>teamnøkkelen</strong> over.
                </li>
                <li>Godkjenn tilgangen, fullfør koblingen og installer den i ChatGPT.</li>
              </ol>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Teamnøkkelen styrer begge tilkoblingene. Trekker du den tilbake, mister også
            ChatGPT-tilkoblingen tilgang.
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
