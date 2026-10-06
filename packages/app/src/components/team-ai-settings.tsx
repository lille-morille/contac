import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { request } from "../lib/api.ts";
import { useOrg } from "../lib/org.tsx";
import { Button } from "./ui/button.tsx";
import { Card } from "./ui/card.tsx";
import { Input } from "./ui/input.tsx";
import { Select } from "./ui/select.tsx";

type Mode = "off" | "manual" | "suggest" | "safe_auto" | "dangerous";
type Feature =
  | "stikkord"
  | "contact_fields"
  | "contact_referral"
  | "hierarchy"
  | "group_findings"
  | "email_draft";
type Settings = {
  emailDraftEnabled: boolean;
  hasToken: boolean;
  lowModel: string;
  model: string;
  modes: Record<Feature, Mode>;
};
type Usage = {
  tokens: string;
  costUsd: string;
  missingTokens: number;
  missingCost: number;
};
const features: { key: Feature; label: string; description: string; manualOnly?: boolean }[] = [
  { key: "stikkord", label: "Stikkord", description: "Kort oppsummering av samtaler." },
  {
    key: "contact_fields",
    label: "Kontaktfelter",
    description: "Trekk ut e-post, telefon og kort beskrivelse fra samtaler.",
  },
  {
    key: "contact_referral",
    label: "Kontaktforslag fra samtaler",
    description:
      "Foreslå personer som bør kontaktes når samtalen gir konkret grunnlag. Oppretter aldri kontakter automatisk.",
  },
  {
    key: "hierarchy",
    label: "Hierarki og tagger",
    description: "Foreslå organisasjon, domene og persontagger.",
  },
  {
    key: "group_findings",
    label: "Gruppefunn",
    description: "Sammendrag for organisasjon eller domene; genereres bare ved klikk.",
    manualOnly: true,
  },
  {
    key: "email_draft",
    label: "E-postutkast",
    description: "Skriv forslag på forespørsel. Sending skjer i e-postappen.",
    manualOnly: true,
  },
];
const modeItems = [
  { value: "off", label: "Av" },
  { value: "manual", label: "Manuelt forslag" },
  { value: "suggest", label: "Automatisk forslag" },
  { value: "safe_auto", label: "Trygg automatikk · fyll tomme felt" },
  { value: "dangerous", label: "Farlig · kan overskrive" },
];
const recommended = { low: "openai/gpt-4.1-nano", medium: "openai/gpt-4.1-mini" };

export function TeamAiSettings() {
  const { org } = useOrg();
  const qc = useQueryClient();
  const settings = useQuery({
    queryKey: ["checkin-ai", org?.id],
    queryFn: () => request<Settings>("/org/checkin-ai", org!.id),
    enabled: !!org,
    refetchInterval: 60_000,
  });
  const [draftModes, setDraftModes] = useState<Partial<Record<Feature, Mode>>>({});
  const [lowModel, setLowModel] = useState<string | null>(null);
  const [mediumModel, setMediumModel] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const modes = { ...settings.data?.modes, ...draftModes } as Record<Feature, Mode>;
  async function save(clearToken = false) {
    if (!org) return;
    setBusy(true);
    setMessage("");
    try {
      await request("/org/checkin-ai", org.id, {
        emailDraftEnabled: !clearToken && modes.email_draft === "manual",
        modes: clearToken ? Object.fromEntries(features.map((item) => [item.key, "off"])) : modes,
        lowModel: lowModel ?? settings.data?.lowModel ?? recommended.low,
        model: mediumModel ?? settings.data?.model ?? recommended.medium,
        ...(token.trim() && !clearToken ? { token: token.trim() } : {}),
        ...(clearToken ? { clearToken: true } : {}),
      });
      setDraftModes({});
      setLowModel(null);
      setMediumModel(null);
      setToken("");
      await qc.invalidateQueries({ queryKey: ["checkin-ai", org.id] });
      setMessage(
        clearToken
          ? "Tokenet er fjernet og alle funksjoner er slått av."
          : "AI-innstillingene er lagret.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Kunne ikke lagre.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <Bot size={18} className="text-primary" />
        <h2 className="font-semibold">AI-funksjoner</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Alle funksjoner er av som standard. Teamets OpenRouter-token brukes bare for funksjoner dere
        aktiverer. Forespørsler krever null datalagring hos modelltilbyderen og nekter
        datainnsamling; de feiler hvis ingen slik rute finnes.
      </p>
      <label className="mt-4 block text-sm">
        OpenRouter-token
        <Input
          type="password"
          autoComplete="off"
          className="mt-1"
          placeholder={
            settings.data?.hasToken ? "Token lagret · skriv for å bytte" : "Legg inn teamets token"
          }
          value={token}
          onChange={(event) => setToken(event.target.value)}
        />
      </label>
      <details className="mt-5 rounded-xl border border-border bg-card p-4">
        <summary className="cursor-pointer text-sm font-medium">Avanserte innstillinger</summary>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            Lav modell · uttrekk og klassifisering
            <Input
              className="mt-1"
              value={lowModel ?? settings.data?.lowModel ?? recommended.low}
              onChange={(event) => setLowModel(event.target.value)}
            />
          </label>
          <label className="text-sm">
            Middels modell · utkast og sammendrag
            <Input
              className="mt-1"
              value={mediumModel ?? settings.data?.model ?? recommended.medium}
              onChange={(event) => setMediumModel(event.target.value)}
            />
          </label>
        </div>
        <div className="mt-3 rounded-xl border border-border bg-muted/50 p-3 text-sm">
          <p className="font-medium">Anbefalt rimelig standard</p>
          <p className="mt-1 text-muted-foreground">
            GPT-4.1 Nano er laget for lette uttrekk og klassifiseringer; GPT-4.1 Mini gir mer
            kapasitet til tekstutkast og sammendrag. Vi krever OpenRouters ZDR-rute og
            «data_collection: deny» uansett modell.
          </p>
          <Button
            className="mt-2"
            size="sm"
            variant="outline"
            onClick={() => {
              setLowModel(recommended.low);
              setMediumModel(recommended.medium);
            }}
          >
            Bruk anbefalte modeller
          </Button>
        </div>
        <div className="mt-5 space-y-3">
          {features.map((feature) => (
            <div
              key={feature.key}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3"
            >
              <div className="min-w-48 flex-1">
                <p className="text-sm font-medium">{feature.label}</p>
                <p className="text-xs text-muted-foreground">{feature.description}</p>
              </div>
              <Select
                value={modes[feature.key] ?? "off"}
                onValueChange={(value) =>
                  setDraftModes((prev) => ({ ...prev, [feature.key]: value as Mode }))
                }
                items={
                  feature.manualOnly
                    ? modeItems.slice(0, 2)
                    : feature.key === "contact_referral"
                      ? modeItems.slice(0, 3)
                      : modeItems
                }
                aria-label={`AI-modus for ${feature.label}`}
                className="min-w-48"
              />
            </div>
          ))}
        </div>
      </details>
      <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
        <ShieldCheck size={13} /> Nye kontakter tillater ekstern AI. Dette kan overstyres per
        kontakt og per aktivitet. Notater sendes aldri til AI.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button size="sm" disabled={busy || settings.isLoading} onClick={() => void save()}>
          Lagre AI-innstillinger
        </Button>
        {settings.data?.hasToken && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void save(true)}>
            Fjern token og slå av alt
          </Button>
        )}
      </div>
      {message && (
        <p role="status" className="mt-2 text-sm">
          {message}
        </p>
      )}
      <TeamAiUsage embedded />
    </Card>
  );
}

export function TeamAiUsage({ embedded = false }: { embedded?: boolean }) {
  const { org } = useOrg();
  const usage = useQuery({
    queryKey: ["ai-usage", org?.id],
    queryFn: () => request<Usage>("/org/ai/usage", org!.id),
    enabled: !!org,
    refetchInterval: 60_000,
  });
  const totalTokens = Number(usage.data?.tokens ?? 0);
  const knownCost = Number(usage.data?.costUsd ?? 0);
  const content = (
    <>
      <h3 className="text-sm font-semibold">AI-bruk · totalt for teamet</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        {totalTokens.toLocaleString("nb-NO")} tokens, USD {knownCost.toFixed(2)} brukt
      </p>
      {!!usage.data && (usage.data.missingTokens > 0 || usage.data.missingCost > 0) && (
        <p className="mt-1 text-xs text-muted-foreground">
          Ufullstendig sum: tokenbruk mangler for {usage.data.missingTokens} kall og kostnad for{" "}
          {usage.data.missingCost} kall.
        </p>
      )}
    </>
  );
  return embedded ? (
    <div className="mt-6 border-t border-border pt-4">{content}</div>
  ) : (
    <Card className="p-5">{content}</Card>
  );
}
