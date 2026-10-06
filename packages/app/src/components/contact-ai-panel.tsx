import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, RotateCcw, Sparkles } from "lucide-react";
import { useState } from "react";
import { request } from "../lib/api.ts";
import { useOrg } from "../lib/org.tsx";
import { Button } from "./ui/button.tsx";
import { Card } from "./ui/card.tsx";

type Feature = "stikkord" | "contact_fields" | "hierarchy" | "contact_referral";
type Suggestion = {
  id: string;
  feature: Feature;
  sourceVersion: string;
  payload: Record<string, unknown>;
  status: "pending" | "applied" | "dismissed";
  stale: boolean;
  createdAt: string;
};
export type ReferralPrefill = {
  id: string;
  sourceContactId: string;
  name: string;
  companyName: string;
  email: string;
  phone: string;
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
  description: string | null;
  companyId: string;
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
  description: "Kort beskrivelse",
  companyId: "Organisasjon",
  domainIds: "Domener",
  newDomainName: "Nytt domene",
  personTagIds: "Persontagger",
};
function display(
  value: unknown,
  key: string,
  data: { companies: Item[]; domains: Item[]; tags: Item[] },
) {
  const list =
    key === "companyId"
      ? data.companies
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
  domains,
  tags,
  contacts,
  onAcceptReferral,
  onOpenContact,
}: {
  contact: Contact;
  companies: Item[];
  domains: Item[];
  tags: Item[];
  contacts: Item[];
  onAcceptReferral: (referral: ReferralPrefill) => void;
  onOpenContact: (id: string) => void;
}) {
  const { org } = useOrg();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
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
  const data = { companies, domains, tags };
  async function action(path: string, body: unknown) {
    if (!org) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await request<unknown>(path, org.id, body);
      if (path.endsWith("/generate") && Array.isArray(result))
        setMessage(
          result.length
            ? `${result.length} kontaktforslag funnet.`
            : "Ingen nye kontaktforslag i de gjennomgåtte samtalene.",
        );
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
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <Bot size={17} className="text-primary" />
        <h2 className="font-semibold">AI-verktøy</h2>
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
          {(["stikkord", "contact_fields", "hierarchy", "contact_referral"] as Feature[]).map(
            (feature) => (
              <Button
                key={feature}
                variant="outline"
                size="sm"
                disabled={
                  busy ||
                  (feature !== "hierarchy" && !state.data?.hasConversations) ||
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
                    : feature === "hierarchy"
                      ? "Foreslå hierarki"
                      : "Foreslå kontakter"}
              </Button>
            ),
          )}
        </div>
      )}
      {(state.data?.suggestions ?? [])
        .filter(
          (suggestion) =>
            suggestion.feature === "contact_referral" &&
            suggestion.status === "pending" &&
            !suggestion.stale,
        )
        .map((suggestion) => {
          const payload = suggestion.payload;
          const existingId =
            typeof payload.existingContactId === "string" ? payload.existingContactId : null;
          const existing = contacts.find((item) => item.id === existingId);
          return (
            <section
              key={suggestion.id}
              className="mt-4 rounded-xl border border-primary/25 bg-primary-soft/40 p-3 text-sm"
            >
              <p className="font-medium">Foreslått kontakt: {String(payload.name ?? "")}</p>
              {!!payload.companyName && (
                <p className="text-xs text-muted-foreground">{String(payload.companyName)}</p>
              )}
              <p className="mt-2">{String(payload.reason ?? "")}</p>
              <blockquote className="mt-2 border-l-2 border-primary/30 pl-2 text-xs text-muted-foreground">
                «{String(payload.passage ?? "")}»
              </blockquote>
              <div className="mt-3 flex flex-wrap gap-2">
                {existing ? (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={async () => {
                      if (!org) return;
                      setBusy(true);
                      try {
                        const result = await request<{ contactId: string }>(
                          `/org/ai/referrals/${suggestion.id}/use-existing`,
                          org.id,
                          {},
                        );
                        await qc.invalidateQueries({
                          queryKey: ["contact-ai", org.id, contact.id],
                        });
                        onOpenContact(result.contactId);
                      } catch (cause) {
                        setError(
                          cause instanceof Error ? cause.message : "Kunne ikke åpne kontakten.",
                        );
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Åpne eksisterende: {existing.name}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() =>
                      onAcceptReferral({
                        id: suggestion.id,
                        sourceContactId: contact.id,
                        name: String(payload.name ?? ""),
                        companyName: String(payload.companyName ?? ""),
                        email: String(payload.email ?? ""),
                        phone: String(payload.phone ?? ""),
                      })
                    }
                  >
                    Opprett kontakt
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void action(`/org/ai/suggestions/${suggestion.id}/dismiss`, {})}
                >
                  Avvis
                </Button>
              </div>
            </section>
          );
        })}
      {contact.stikkord && (
        <p className="mt-2 text-xs text-muted-foreground">
          Stikkord:{" "}
          {!contact.stikkordGeneratedAt
            ? "manuelt redigert"
            : state.data?.stikkordStale
              ? "nyere samtaler finnes · generer på nytt"
              : "oppdatert"}
          {contact.stikkordGeneratedAt
            ? ` · ${new Date(contact.stikkordGeneratedAt).toLocaleString("nb-NO")}`
            : ""}
        </p>
      )}
      {!state.data?.hasConversations && (
        <p className="mt-2 text-xs text-muted-foreground">
          Hierarki kan foreslås fra kontaktfeltene. Legg til en tillatt samtale for stikkord og
          feltforslag.
        </p>
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
      {message && (
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          {message}
        </p>
      )}
    </Card>
  );
}

type SuggestionField =
  | "email"
  | "phone"
  | "description"
  | "companyId"
  | "personTagIds"
  | "domainIds"
  | "stikkord";

export function ContactAiFieldSuggestions({
  contactId,
  field,
  currentValue,
  companies,
  domains,
  tags,
}: {
  contactId: string;
  field: SuggestionField;
  currentValue: string | string[] | null;
  companies: Item[];
  domains: Item[];
  tags: Item[];
}) {
  const { org } = useOrg();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const state = useQuery({
    queryKey: ["contact-ai", org?.id, contactId],
    queryFn: () => request<{ suggestions: Suggestion[] }>(`/org/ai/contacts/${contactId}`, org!.id),
    enabled: !!org,
    refetchInterval: 30_000,
  });
  const data = { companies, domains, tags };
  const sameValue = (proposed: unknown) =>
    Array.isArray(proposed) && Array.isArray(currentValue)
      ? [...proposed].sort().join("\u0000") === [...currentValue].sort().join("\u0000")
      : String(proposed ?? "")
          .trim()
          .toLocaleLowerCase("nb-NO") ===
        String(currentValue ?? "")
          .trim()
          .toLocaleLowerCase("nb-NO");
  const proposals = (state.data?.suggestions ?? []).flatMap((item) => {
    if (item.status !== "pending") return [];
    const values =
      item.feature === "stikkord"
        ? { stikkord: item.payload.text }
        : item.feature === "contact_fields"
          ? ((item.payload.fields as Record<string, unknown>) ?? {})
          : ((item.payload.hierarchy as Record<string, unknown>) ?? {});
    const keys = field === "domainIds" ? ["domainIds", "newDomainName"] : [field];
    return keys.flatMap((key) => {
      const value = values[key];
      if (value === null || value === undefined || value === "") return [];
      if (Array.isArray(value) && !value.length) return [];
      if (key !== "newDomainName" && sameValue(value)) return [];
      return [{ item, key, value }];
    });
  });
  async function act(id: string, key: string, decision: "apply" | "dismiss", stale: boolean) {
    if (!org) return;
    if (
      decision === "apply" &&
      stale &&
      !window.confirm("Kilden er endret siden forslaget ble laget. Bruke forslaget likevel?")
    )
      return;
    setBusy(true);
    setError("");
    try {
      await request(
        `/org/ai/suggestions/${id}/${decision}`,
        org.id,
        decision === "apply" ? { fields: [key] } : { field: key },
      );
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["contact-ai", org.id, contactId] }),
        qc.invalidateQueries({ queryKey: ["contact-data", org.id] }),
      ]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke behandle forslaget.");
    } finally {
      setBusy(false);
    }
  }
  if (!proposals.length && !error) return null;
  return (
    <div className="space-y-2 py-1">
      {proposals.map(({ item, key, value }) => (
        <div
          key={`${item.id}:${key}`}
          className="rounded-lg border border-primary/25 bg-primary-soft/40 p-2 text-xs"
        >
          <div className="flex items-start gap-1.5">
            <Sparkles size={13} className="mt-0.5 shrink-0 text-primary" />
            <span className="min-w-0 break-words">
              <strong>Forslag: </strong>
              {key === "newDomainName" ? "Nytt domene: " : ""}
              {display(value, key, data)}
            </span>
          </div>
          {key === "newDomainName" && typeof item.payload.hierarchy === "object" && (
            <p className="mt-1 text-muted-foreground">
              {String(
                (item.payload.hierarchy as Record<string, unknown>).newDomainDescription ?? "",
              )}
            </p>
          )}
          {!!item.payload.evidence && (
            <p className="mt-1 break-words text-muted-foreground">
              Kilde: {String(item.payload.evidence)}
            </p>
          )}
          {item.stale && (
            <p className="mt-1 text-warn">
              Kilden er endret. Kontroller forslaget før du bruker det.
            </p>
          )}
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              disabled={busy}
              onClick={() => void act(item.id, key, "apply", item.stale)}
            >
              Bruk
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => void act(item.id, key, "dismiss", item.stale)}
            >
              Avvis
            </Button>
          </div>
        </div>
      ))}
      {error && (
        <p role="alert" className="text-xs text-risk">
          {error}
        </p>
      )}
    </div>
  );
}
