import { contactMatchesEmail } from "@contac/core";
import { useQueryClient } from "@tanstack/react-query";
import { Mail, ShieldCheck, Users } from "lucide-react";
import { useState } from "react";
import { request } from "../lib/api.ts";
import { Button } from "./ui/button.tsx";
import { Card } from "./ui/card.tsx";
import { MultiSelect } from "./ui/multi-select.tsx";
import { Select } from "./ui/select.tsx";

export type InboxData = {
  suggestions: {
    id: string;
    kind: "email" | "alert";
    fromEmail: string | null;
    toEmails: string[];
    ccEmails: string[];
    subject: string | null;
    body: string | null;
    receivedAt: string;
    contactNames?: string[];
  }[];
  requests: {
    id: string;
    requesterName: string;
    contactName: string;
    requestedBy: string | null;
    createdAt: string;
  }[];
};
export type AdminInboxItem = {
  id: string;
  fromEmail: string;
  toEmails: string[];
  ccEmails: string[];
  subject: string;
  body: string;
  receivedAt: string;
};
type Contact = { id: string; name: string; email: string | null; status: string };
const date = (value: string) =>
  new Date(value).toLocaleString("nb-NO", { dateStyle: "medium", timeStyle: "short" });

export function InboxItems({
  orgId,
  inbox,
  adminItems,
  contacts,
  teams,
  onRefresh,
}: {
  orgId: string;
  inbox: InboxData | undefined;
  adminItems: AdminInboxItem[] | undefined;
  contacts: Contact[];
  teams: { id: string; name: string }[];
  onRefresh: () => Promise<unknown>;
}) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [routes, setRoutes] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  async function action(path: string, body: object, id: string) {
    setBusy(id);
    setError("");
    try {
      await request(path, orgId, body);
      await qc.invalidateQueries({ queryKey: ["inbox", orgId] });
      await qc.invalidateQueries({ queryKey: ["class-inbox"] });
      await qc.invalidateQueries({ queryKey: ["overlap", orgId] });
      await onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="mt-4 space-y-5">
      {error && (
        <p role="alert" className="text-sm text-risk">
          {error}
        </p>
      )}
      {!!inbox?.requests.length && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Forespørsler om kontaktlogg
          </h3>
          <div className="space-y-2">
            {inbox.requests.map((item) => (
              <Card key={item.id} className="p-3 text-sm">
                <p className="font-medium">
                  {item.requesterName} ber om lesetilgang til {item.contactName}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Fra {item.requestedBy ?? "et teammedlem"} · {date(item.createdAt)}. Godkjenning
                  gjelder også nye aktiviteter og kan ikke trekkes tilbake.
                </p>
                <Button
                  className="mt-2"
                  size="sm"
                  disabled={busy === item.id}
                  onClick={() =>
                    void action(`/org/log-access-requests/${item.id}/approve`, {}, item.id)
                  }
                >
                  <ShieldCheck size={14} /> Godkjenn
                </Button>
              </Card>
            ))}
          </div>
        </section>
      )}
      {!!inbox?.suggestions.length && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            E-post og varsler
          </h3>
          <div className="space-y-3">
            {inbox.suggestions.map((item) => {
              const matches =
                item.kind === "email"
                  ? contacts
                      .filter(
                        (contact) =>
                          contact.status !== "duplicate" &&
                          contactMatchesEmail(contact.email, {
                            fromEmail: item.fromEmail ?? "",
                            toEmails: item.toEmails,
                            ccEmails: item.ccEmails,
                          }),
                      )
                      .map((contact) => contact.id)
                  : [];
              const values = selected[item.id] ?? matches;
              return (
                <Card key={item.id} className="p-3 text-sm">
                  {item.kind === "alert" ? (
                    <>
                      <p className="flex items-center gap-2 font-medium">
                        <Users size={16} /> Registrert avsender har kontaktet noen i teamets
                        kontaktliste
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.contactNames?.join(", ") || "Kontakt i teamet"} ·{" "}
                        {date(item.receivedAt)}. E-postinnholdet er bare synlig i avsenderens team.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="flex items-center gap-2 font-medium">
                        <Mail size={16} /> {item.subject || "Uten emne"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Fra: {item.fromEmail} · Til: {item.toEmails.join(", ")} ·{" "}
                        {date(item.receivedAt)}
                      </p>
                      {item.ccEmails.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Kopi: {item.ccEmails.join(", ")}
                        </p>
                      )}
                      <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap">
                        {item.body || "Tom melding"}
                      </p>
                      <div className="mt-3">
                        <MultiSelect
                          label="Knytt til kontakter"
                          icon={<Users size={15} />}
                          value={values}
                          options={contacts
                            .filter((contact) => contact.status !== "duplicate")
                            .map((contact) => ({ value: contact.id, label: contact.name }))}
                          onChange={(next) =>
                            setSelected((current) => ({ ...current, [item.id]: next }))
                          }
                        />
                      </div>
                    </>
                  )}
                  <div className="mt-3 flex gap-2">
                    {item.kind === "email" && (
                      <Button
                        size="sm"
                        disabled={busy === item.id || !values.length}
                        onClick={() =>
                          void action(
                            `/org/email-suggestions/${item.id}/accept`,
                            { contactIds: values },
                            item.id,
                          )
                        }
                      >
                        Ta inn i kontaktlogg
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === item.id}
                      onClick={() =>
                        void action(`/org/email-suggestions/${item.id}/dismiss`, {}, item.id)
                      }
                    >
                      Fjern fra innboks
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      )}
      {!!adminItems?.length && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Klasseadministrator · umatchede e-poster
          </h3>
          <div className="space-y-3">
            {adminItems.map((item) => (
              <Card key={item.id} className="p-3 text-sm">
                <p className="font-medium">{item.subject || "Uten emne"}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Fra: {item.fromEmail} · Til: {item.toEmails.join(", ")} · {date(item.receivedAt)}
                </p>
                <p className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap">{item.body}</p>
                <div className="mt-3 flex gap-2">
                  <Select
                    aria-label="Velg team"
                    className="max-w-56"
                    value={routes[item.id] ?? ""}
                    onValueChange={(value) =>
                      setRoutes((current) => ({ ...current, [item.id]: value }))
                    }
                    items={[
                      { value: "", label: "Velg team" },
                      ...teams.map((team) => ({ value: team.id, label: team.name })),
                    ]}
                  />
                  <Button
                    size="sm"
                    disabled={!routes[item.id] || busy === item.id}
                    onClick={() =>
                      void action(
                        `/class/inbox/${item.id}/route`,
                        { orgId: routes[item.id] },
                        item.id,
                      )
                    }
                  >
                    Send til team
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
