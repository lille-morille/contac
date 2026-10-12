import { contactMatchesEmail, emailList, type ForwardedEmail } from "@contac/core";
import { useQueryClient } from "@tanstack/react-query";
import { Mail, ShieldCheck, Users } from "lucide-react";
import { useState } from "react";
import { request } from "../lib/api.ts";
import { Button } from "./ui/button.tsx";
import { Card } from "./ui/card.tsx";
import { DateTimePicker } from "./ui/date-time-picker.tsx";
import { Input } from "./ui/input.tsx";
import { MultiSelect } from "./ui/multi-select.tsx";
import { Select } from "./ui/select.tsx";
import { Textarea } from "./ui/textarea.tsx";
import { feedbackKindLabel, type FeedbackInboxItem } from "./feedback.tsx";
import { contactStatusName, type ContactStatus } from "./contact-status.tsx";

export type InboxData = {
  overlaps: {
    contactId: string;
    contactName: string;
    otherContactId: string;
    otherTeamName: string;
    otherStatus: ContactStatus;
  }[];
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
    matchedContactIds?: string[];
    forwardedIntent?: boolean;
    forwardedMessage?: ForwardedEmail | null;
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
type ReviewedEmail = {
  fromEmail: string;
  toEmails: string;
  ccEmails: string;
  subject: string;
  body: string;
  occurredAt: string;
};
const localTime = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? ""
    : new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
function initialReview(item: InboxData["suggestions"][number]): ReviewedEmail {
  const candidate = item.forwardedMessage;
  return {
    fromEmail: candidate?.fromEmail ?? (item.forwardedIntent ? "" : (item.fromEmail ?? "")),
    toEmails:
      candidate?.toEmails.join(", ") ?? (item.forwardedIntent ? "" : item.toEmails.join(", ")),
    ccEmails:
      candidate?.ccEmails.join(", ") ?? (item.forwardedIntent ? "" : item.ccEmails.join(", ")),
    subject: candidate?.subject ?? item.subject ?? "",
    body: candidate?.body ?? item.body ?? "",
    occurredAt: localTime(candidate?.occurredAt ?? item.receivedAt),
  };
}

export function InboxItems({
  orgId,
  inbox,
  adminItems,
  feedbackItems,
  contacts,
  teams,
  onRefresh,
  onOpenContact,
}: {
  orgId: string;
  inbox: InboxData | undefined;
  adminItems: AdminInboxItem[] | undefined;
  feedbackItems: FeedbackInboxItem[] | undefined;
  contacts: Contact[];
  teams: { id: string; name: string }[];
  onRefresh: () => Promise<unknown>;
  onOpenContact: (contactId: string) => void;
}) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [reviews, setReviews] = useState<Record<string, ReviewedEmail>>({});
  const [openReviews, setOpenReviews] = useState<Record<string, boolean>>({});
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
      await qc.invalidateQueries({ queryKey: ["feedback-inbox"] });
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
      {!!inbox?.overlaps?.length && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Kontakter hos flere team
          </h3>
          <div className="space-y-2">
            {inbox.overlaps.map((item) => {
              const key = `${item.contactId}:${item.otherContactId}`;
              return (
                <Card key={key} className="p-3 text-sm">
                  <p className="flex items-center gap-2 font-medium">
                    <Users size={16} /> {item.contactName} finnes også hos {item.otherTeamName}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Status hos det andre teamet: {contactStatusName(item.otherStatus)}.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => onOpenContact(item.contactId)}>
                      Åpne kontakt
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === key}
                      onClick={() =>
                        void action(
                          "/org/overlap-alerts/dismiss",
                          { contactId: item.contactId, otherContactId: item.otherContactId },
                          key,
                        )
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
      {!!feedbackItems?.length && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Svar på tilbakemeldinger
          </h3>
          <div className="space-y-2">
            {feedbackItems.map((item) => (
              <Card key={item.id} className="p-3 text-sm">
                <p className="font-medium">
                  Takk for tilbakemeldingen! Innspillet ditt er nå implementert.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{feedbackKindLabel(item.kind)}</p>
                <p className="mt-2 whitespace-pre-wrap break-words">{item.content}</p>
                <p className="mt-1 text-xs text-muted-foreground">{date(item.completedAt)}</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  disabled={busy === item.id}
                  onClick={() => void action(`/feedback/inbox/${item.id}/acknowledge`, {}, item.id)}
                >
                  Fjern fra innboks
                </Button>
              </Card>
            ))}
          </div>
        </section>
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
                  ? (item.matchedContactIds ??
                    contacts
                      .filter(
                        (contact) =>
                          contact.status !== "duplicate" &&
                          contactMatchesEmail(contact.email, {
                            fromEmail: item.fromEmail ?? "",
                            toEmails: item.toEmails,
                            ccEmails: item.ccEmails,
                          }),
                      )
                      .map((contact) => contact.id))
                  : [];
              const values = selected[item.id] ?? matches;
              const review = reviews[item.id] ?? initialReview(item);
              const showReview = !!item.forwardedIntent || !!openReviews[item.id];
              const reviewReady =
                !!review.fromEmail.trim() &&
                emailList(review.toEmails).length > 0 &&
                !!review.body.trim() &&
                !!review.occurredAt &&
                !Number.isNaN(new Date(review.occurredAt).getTime());
              const changeReview = (change: Partial<ReviewedEmail>) =>
                setReviews((current) => ({
                  ...current,
                  [item.id]: { ...review, ...change },
                }));
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
                      {showReview ? (
                        <div className="mt-3 space-y-3 rounded-xl border border-border bg-muted/30 p-3">
                          <p className="text-sm font-medium">
                            Kontroller den opprinnelige e-posten
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {item.forwardedMessage?.confidence === "certain"
                              ? "Kontroller innholdet før du legger det til i kontaktloggen."
                              : item.forwardedIntent
                                ? "Vi kunne ikke lese videresendingen sikkert. Fyll inn originalen før du lagrer."
                                : "Rediger feltene før du legger e-posten til i kontaktloggen."}
                          </p>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <label className="text-xs font-medium">
                              Fra
                              <Input
                                className="mt-1"
                                type="email"
                                value={review.fromEmail}
                                onChange={(event) =>
                                  changeReview({ fromEmail: event.target.value })
                                }
                              />
                            </label>
                            <label className="text-xs font-medium">
                              Til
                              <Input
                                className="mt-1"
                                value={review.toEmails}
                                onChange={(event) => changeReview({ toEmails: event.target.value })}
                              />
                            </label>
                            <label className="text-xs font-medium">
                              Kopi (valgfritt)
                              <Input
                                className="mt-1"
                                value={review.ccEmails}
                                onChange={(event) => changeReview({ ccEmails: event.target.value })}
                              />
                            </label>
                            <div className="text-xs font-medium">
                              Dato og tidspunkt
                              <DateTimePicker
                                value={review.occurredAt}
                                onChange={(next) => changeReview({ occurredAt: localTime(next) })}
                                ariaLabel="Dato og tidspunkt for e-post"
                                field
                              />
                            </div>
                          </div>
                          <label className="block text-xs font-medium">
                            Emne
                            <Input
                              className="mt-1"
                              value={review.subject}
                              onChange={(event) => changeReview({ subject: event.target.value })}
                            />
                          </label>
                          <label className="block text-xs font-medium">
                            Melding
                            <Textarea
                              className="mt-1 min-h-32"
                              value={review.body}
                              onChange={(event) => changeReview({ body: event.target.value })}
                            />
                          </label>
                          <details className="text-xs text-muted-foreground">
                            <summary className="cursor-pointer">Vis mottatt videresending</summary>
                            <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-words">
                              {item.body || "Tom melding"}
                            </p>
                          </details>
                        </div>
                      ) : (
                        <div className="mt-2">
                          <p className="max-h-40 overflow-y-auto whitespace-pre-wrap">
                            {item.body || "Tom melding"}
                          </p>
                          <Button
                            size="sm"
                            variant="link"
                            className="mt-1 px-0"
                            onClick={() =>
                              setOpenReviews((current) => ({ ...current, [item.id]: true }))
                            }
                          >
                            Rediger e-post før lagring
                          </Button>
                        </div>
                      )}
                      <div className="mt-3">
                        {!values.length && (
                          <p className="mb-2 text-xs text-muted-foreground">
                            Ingen kontakt ble matchet. Velg kontakt for å ta inn e-posten i
                            kontaktloggen.
                          </p>
                        )}
                        <MultiSelect
                          label="Knytt til kontakter"
                          emptyLabel="Velg kontakter"
                          positionerClassName="z-[80]"
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
                        disabled={
                          busy === item.id || !values.length || (showReview && !reviewReady)
                        }
                        onClick={() =>
                          void action(
                            `/org/email-suggestions/${item.id}/accept`,
                            {
                              contactIds: values,
                              ...(showReview
                                ? {
                                    message: {
                                      fromEmail: review.fromEmail.trim(),
                                      toEmails: emailList(review.toEmails),
                                      ccEmails: emailList(review.ccEmails),
                                      subject: review.subject.trim(),
                                      body: review.body.trim(),
                                      occurredAt: new Date(review.occurredAt).toISOString(),
                                    },
                                  }
                                : {}),
                            },
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
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Select
                    aria-label="Velg team"
                    className="min-w-40 flex-1"
                    positionerClassName="z-[80]"
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
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === item.id}
                    onClick={() => void action(`/class/inbox/${item.id}/dismiss`, {}, item.id)}
                  >
                    Fjern fra innboks
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
