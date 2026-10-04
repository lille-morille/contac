import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, RotateCcw, Sparkles } from "lucide-react";
import { useState } from "react";
import { request } from "../lib/api.ts";
import { useOrg } from "../lib/org.tsx";
import { Button } from "./ui/button.tsx";
import { Card } from "./ui/card.tsx";
import { Checkbox } from "./ui/checkbox.tsx";

type Feature = "stikkord" | "contact_fields" | "hierarchy";
type Suggestion = {
  id: string;
  feature: Feature;
  sourceVersion: string;
  payload: Record<string, unknown>;
  status: "pending" | "applied" | "dismissed";
  stale: boolean;
  createdAt: string;
};
type Edit = {
  id: string;
  feature: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  createdAt: string;
  revertedAt: string | null;
};
type Contact = {
  id: string;
  allowExternalAi: boolean;
  email: string | null;
  phone: string | null;
  position: string | null;
  description: string | null;
  companyId: string;
  departmentId: string | null;
  stikkord: string | null;
  stikkordGeneratedAt?: string | null;
};
type Item = { id: string; name: string };
const labels: Record<string, string> = {
  stikkord: "Stikkord",
  contact_fields: "Kontaktfelter",
  hierarchy: "Hierarki",
  email: "E-post",
  phone: "Telefon",
  position: "Stilling",
  description: "Kort beskrivelse",
  companyId: "Organisasjon",
  departmentId: "Avdeling",
  departmentName: "Ny avdeling",
  domainIds: "Domener",
  personTagIds: "Persontagger",
};
function display(
  value: unknown,
  key: string,
  data: { companies: Item[]; departments: Item[]; domains: Item[]; tags: Item[] },
) {
  const list =
    key === "companyId"
      ? data.companies
      : key === "departmentId"
        ? data.departments
        : key === "domainIds"
          ? data.domains
          : key === "personTagIds"
            ? data.tags
            : [];
  if (Array.isArray(value))
    return (
      value.map((item) => list.find((row) => row.id === item)?.name ?? String(item)).join(", ") ||
      "Ingen"
    );
  if (typeof value === "string") return list.find((row) => row.id === value)?.name ?? value;
  if (typeof value === "boolean") return value ? "Tillatt" : "Blokkert";
  return "Tomt";
}
export function ContactAiPanel({
  contact,
  companies,
  departments,
  domains,
  tags,
  personTagIds,
  domainIds,
}: {
  contact: Contact;
  companies: Item[];
  departments: Item[];
  domains: Item[];
  tags: Item[];
  personTagIds: string[];
  domainIds: string[];
}) {
  const { org } = useOrg();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selection, setSelection] = useState<Record<string, string[]>>({});
  const settings = useQuery({
    queryKey: ["checkin-ai", org?.id],
    queryFn: () =>
      request<{ modes: Record<Feature, string>; hasToken: boolean }>("/org/checkin-ai", org!.id),
    enabled: !!org,
    refetchInterval: 60_000,
  });
  const state = useQuery({
    queryKey: ["contact-ai", org?.id, contact.id],
    queryFn: () =>
      request<{
        suggestions: Suggestion[];
        edits: Edit[];
        stikkordStale: boolean;
        hasConversations: boolean;
      }>(`/org/ai/contacts/${contact.id}`, org!.id),
    enabled: !!org,
    refetchInterval: 30_000,
  });
  const data = { companies, departments, domains, tags };
  const currentValue = (key: string) =>
    key === "departmentName"
      ? (departments.find((item) => item.id === contact.departmentId)?.name ?? null)
      : key === "personTagIds"
        ? personTagIds
        : key === "domainIds"
          ? domainIds
          : contact[key as keyof Contact];
  async function action(path: string, body: unknown) {
    if (!org) return;
    setBusy(true);
    setError("");
    try {
      await request(path, org.id, body);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["contact-ai", org.id, contact.id] }),
        qc.invalidateQueries({ queryKey: ["contact-data", org.id] }),
        qc.invalidateQueries({ queryKey: ["ai-usage", org.id] }),
      ]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke utføre AI-handling");
    } finally {
      setBusy(false);
    }
  }
  const pending = state.data?.suggestions.filter((item) => item.status === "pending") ?? [];
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <Bot size={17} className="text-primary" />
        <h2 className="font-semibold">AI-forslag</h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Kun tillatte samtaler brukes. Delte notater og ubesvarte anrop brukes aldri.
      </p>
      {!contact.allowExternalAi && (
        <p className="mt-3 rounded-xl bg-muted p-3 text-sm">
          Ekstern AI er blokkert for denne kontakten.
        </p>
      )}
      {contact.allowExternalAi && (
        <div className="mt-4 flex flex-wrap gap-2">
          {(["stikkord", "contact_fields", "hierarchy"] as Feature[]).map((feature) => (
            <Button
              key={feature}
              variant="outline"
              size="sm"
              disabled={
                busy ||
                !state.data?.hasConversations ||
                settings.data?.modes[feature] !== "manual" ||
                !settings.data?.hasToken
              }
              onClick={() => void action(`/org/ai/contacts/${contact.id}/generate`, { feature })}
            >
              <Sparkles size={14} />{" "}
              {feature === "stikkord"
                ? "Lag stikkord"
                : feature === "contact_fields"
                  ? "Foreslå felter"
                  : "Foreslå hierarki"}
            </Button>
          ))}
        </div>
      )}
      {contact.stikkord && (
        <p className="mt-2 text-xs text-muted-foreground">
          Stikkord:{" "}
          {state.data?.stikkordStale ? "nyere samtaler finnes · generer på nytt" : "oppdatert"}
          {contact.stikkordGeneratedAt
            ? ` · ${new Date(contact.stikkordGeneratedAt).toLocaleString("nb-NO")}`
            : ""}
        </p>
      )}
      {!state.data?.hasConversations && (
        <p className="mt-2 text-xs text-muted-foreground">
          Legg til en tillatt samtale for å bruke disse funksjonene.
        </p>
      )}
      {pending.length > 0 && (
        <div className="mt-5 space-y-3">
          <h3 className="text-sm font-semibold">Forslag til gjennomgang</h3>
          {pending.map((item) => {
            const payload = item.payload;
            const hierarchy = payload.hierarchy as Record<string, unknown> | undefined;
            const proposed =
              item.feature === "stikkord"
                ? { stikkord: payload.text }
                : item.feature === "contact_fields"
                  ? ((payload.fields as Record<string, unknown>) ?? {})
                  : (hierarchy ?? {});
            const keys = Object.keys(proposed).filter((key) => {
              const next = proposed[key];
              if (next === null || next === undefined || next === "") return false;
              if (Array.isArray(next) && !next.length) return false;
              const current = currentValue(key);
              if (Array.isArray(next) && Array.isArray(current))
                return [...next].sort().join("\u0000") !== [...current].sort().join("\u0000");
              return (
                String(next).trim().toLocaleLowerCase("nb-NO") !==
                String(current ?? "")
                  .trim()
                  .toLocaleLowerCase("nb-NO")
              );
            });
            if (!keys.length) return null;
            const selected = selection[item.id] ?? keys;
            return (
              <div key={item.id} className="rounded-xl border border-border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <strong>{labels[item.feature]}</strong>
                  <span className="text-xs text-muted-foreground">
                    {new Date(item.createdAt).toLocaleString("nb-NO")}
                  </span>
                </div>
                {!!payload.model && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {String(payload.model)} ·{" "}
                    {(() => {
                      const usage = payload.usage as {
                        prompt_tokens?: number;
                        completion_tokens?: number;
                        cost?: number;
                      } | null;
                      return usage
                        ? `${(usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0)} tokens · ${typeof usage.cost === "number" ? `${usage.cost.toFixed(5)} USD` : "ukjent kostnad"}`
                        : "bruk ikke rapportert";
                    })()}
                  </p>
                )}
                {item.stale && (
                  <p className="mt-1 text-xs text-warn">
                    Kilden er endret siden forslaget ble laget. Kontroller innholdet før du bruker
                    det.
                  </p>
                )}
                {!!payload.evidence && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Begrunnelse: {String(payload.evidence)}
                  </p>
                )}
                <div className="mt-2 space-y-2">
                  {keys.map((key) => (
                    <label key={key} className="flex items-start gap-2 rounded-lg bg-muted/50 p-2">
                      <Checkbox
                        aria-label={`Bruk forslag for ${labels[key] ?? key}`}
                        checked={selected.includes(key)}
                        onCheckedChange={(checked) =>
                          setSelection((prev) => ({
                            ...prev,
                            [item.id]: checked
                              ? [...selected, key]
                              : selected.filter((value) => value !== key),
                          }))
                        }
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-medium">{labels[key] ?? key}</span>
                        <span className="block text-xs text-muted-foreground">
                          Nå: {display(currentValue(key), key, data)}
                        </span>
                        <span className="block break-words">
                          Forslag: {display(proposed[key], key, data)}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    disabled={busy || !selected.length}
                    onClick={() =>
                      void action(`/org/ai/suggestions/${item.id}/apply`, { fields: selected })
                    }
                  >
                    Bruk valgte
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void action(`/org/ai/suggestions/${item.id}/dismiss`, {})}
                  >
                    Avvis
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {!!state.data?.edits.length && (
        <details className="mt-5 border-t border-border pt-3">
          <summary className="cursor-pointer text-sm font-medium">
            Endringslogg · {state.data.edits.length}
          </summary>
          <p className="mt-2 text-xs text-muted-foreground">
            Gjenopprett bruker øyeblikksbildet før AI-endringen. Senere endringer i de samme feltene
            erstattes også.
          </p>
          <div className="mt-2 space-y-2">
            {state.data.edits.map((edit) => (
              <div key={edit.id} className="rounded-lg border border-border p-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span>
                    {labels[edit.feature] ??
                      (edit.feature === "ai_permission" ? "AI-tillatelse" : edit.feature)}{" "}
                    · {new Date(edit.createdAt).toLocaleString("nb-NO")}
                    {edit.revertedAt ? " · gjenopprettet" : ""}
                  </span>
                  {!edit.revertedAt && edit.feature !== "ai_permission" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            "Gjenopprett øyeblikksbildet? Senere endringer i disse feltene blir overskrevet.",
                          )
                        )
                          void action(`/org/ai/edits/${edit.id}/revert`, {});
                      }}
                    >
                      <RotateCcw size={13} /> Gjenopprett
                    </Button>
                  )}
                </div>
                <div className="mt-1 space-y-0.5 text-muted-foreground">
                  {Object.keys(edit.after)
                    .filter(
                      (key) =>
                        !["stikkordSourceVersion", "stikkordGeneratedAt"].includes(key) &&
                        JSON.stringify(edit.before[key]) !== JSON.stringify(edit.after[key]),
                    )
                    .map((key) => (
                      <p key={key}>
                        {labels[key] ?? key}: {display(edit.before[key], key, data).slice(0, 150)} →{" "}
                        {display(edit.after[key], key, data).slice(0, 150)}
                      </p>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-risk">
          {error}
        </p>
      )}
    </Card>
  );
}
