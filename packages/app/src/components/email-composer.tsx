import { emailList, normalizeEmail } from "@contac/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, ExternalLink, Send, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { request } from "../lib/api.ts";
import { buildMailtoUrl } from "../lib/mailto.ts";
import { useOrg } from "../lib/org.tsx";
import { Button } from "./ui/button.tsx";
import { Card } from "./ui/card.tsx";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog.tsx";
import { Input } from "./ui/input.tsx";
import { Textarea } from "./ui/textarea.tsx";

type Draft = {
  id: string;
  contactId: string;
  fromEmail: string;
  toEmails: string[];
  ccEmails: string[];
  bccEmails: string[];
  subject: string;
  body: string;
  markedSentAt: string | null;
  openedAt: string | null;
  createdBy: string;
  updatedAt: string;
};
type Settings = { captureAddress: string | null };
const blank = {
  id: "",
  sent: false,
  readOnly: false,
  fromEmail: "",
  to: "",
  cc: "",
  bcc: "",
  subject: "",
  body: "",
};

export function EmailComposer({
  contact,
  onActivity,
  shortcutRequest,
}: {
  contact: { id: string; name: string; email: string | null; allowExternalAi: boolean };
  onActivity: () => Promise<unknown>;
  shortcutRequest?: number;
}) {
  const { org, user } = useOrg();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiCandidate, setAiCandidate] = useState<{
    body: string;
    promptTokens: number | null;
    completionTokens: number | null;
  } | null>(null);
  const settings = useQuery({
    queryKey: ["email-settings", org?.id],
    queryFn: () => request<Settings>("/org/email-settings", org!.id),
    enabled: !!org,
    refetchInterval: 60_000,
  });
  const aiSettings = useQuery({
    queryKey: ["checkin-ai", org?.id],
    queryFn: () =>
      request<{ emailDraftEnabled: boolean; hasToken: boolean; model: string }>(
        "/org/checkin-ai",
        org!.id,
      ),
    enabled: !!org,
    refetchInterval: 60_000,
  });
  const drafts = useQuery({
    queryKey: ["email-drafts", org?.id, contact.id],
    queryFn: () => request<Draft[]>(`/org/email-drafts?contactId=${contact.id}`, org!.id),
    enabled: !!org,
    refetchInterval: 60_000,
  });
  const profileEmail = user?.email ?? "";

  function start(value?: Draft) {
    setError("");
    setAiPrompt("");
    setAiCandidate(null);
    setDraft(
      value
        ? {
            id: value.id,
            sent: !!value.markedSentAt,
            readOnly: value.createdBy !== user?.id,
            fromEmail: value.fromEmail,
            to: value.toEmails.join(", "),
            cc: value.ccEmails.join(", "),
            bcc: value.bccEmails
              .filter((address) => address !== settings.data?.captureAddress)
              .join(", "),
            subject: value.subject,
            body: value.body,
          }
        : { ...blank, fromEmail: profileEmail, to: contact.email ?? "" },
    );
    setOpen(true);
  }
  useEffect(() => {
    if (!shortcutRequest) return;
    document.querySelector<HTMLElement>("[data-email-composer]")?.scrollIntoView({
      behavior: "auto",
      block: "start",
    });
    start();
    // Each request is a user action; contact changes remount the detail page.
  }, [shortcutRequest]);
  async function save(): Promise<Draft> {
    if (!org) throw new Error("Velg et team");
    const fromEmail = normalizeEmail(draft.fromEmail);
    if (!fromEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail))
      throw new Error("Skriv inn en gyldig avsenderadresse");
    const toEmails = emailList(draft.to);
    if (!toEmails.length) throw new Error("Skriv inn minst én mottaker");
    const row = await request<Draft>("/org/email-drafts", org.id, {
      ...(draft.id ? { id: draft.id } : {}),
      contactId: contact.id,
      fromEmail,
      toEmails,
      ccEmails: emailList(draft.cc),
      bccEmails: emailList([draft.bcc, settings.data?.captureAddress ?? ""]),
      subject: draft.subject,
      body: draft.body,
    });
    setDraft((current) => ({ ...current, id: row.id }));
    await qc.invalidateQueries({ queryKey: ["email-drafts", org.id, contact.id] });
    return row;
  }
  async function action(kind: "save" | "open" | "sent") {
    if (!org) return;
    setBusy(true);
    setError("");
    try {
      const row = await save();
      if (kind === "open") {
        await request(`/org/email-drafts/${row.id}/opened`, org.id, {});
        window.location.href = buildMailtoUrl(row);
      } else if (kind === "sent") {
        await request(`/org/email-drafts/${row.id}/mark-sent`, org.id, {});
        await onActivity();
      }
      await qc.invalidateQueries({ queryKey: ["email-drafts", org.id, contact.id] });
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }
  async function removeDraft() {
    if (!org || !draft.id || !window.confirm("Slette dette utkastet?")) return;
    setBusy(true);
    setError("");
    try {
      await request(`/org/email-drafts/${draft.id}/delete`, org.id, {});
      await qc.invalidateQueries({ queryKey: ["email-drafts", org.id, contact.id] });
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }
  async function suggest() {
    if (!org || !aiPrompt.trim()) return;
    setBusy(true);
    setError("");
    try {
      const result = await request<{
        body: string;
        promptTokens: number | null;
        completionTokens: number | null;
      }>("/org/email-ai/suggest", org.id, {
        contactId: contact.id,
        prompt: aiPrompt,
        currentBody: aiCandidate?.body ?? draft.body,
        subject: draft.subject,
      });
      setAiCandidate(result);
      setAiPrompt("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card data-email-composer className="scroll-mt-6 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">E-postutkast</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Utkast blir først del av kontaktloggen når du markerer dem som sendt eller Bcc-kopien
            kommer inn.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => start()}>
          <Mail size={15} /> Skriv e-post
        </Button>
      </div>
      <div className="mt-3 space-y-2">
        {drafts.data?.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => start(item)}
            className="flex w-full items-center justify-between rounded-xl border border-border px-3 py-2 text-left text-sm hover:bg-muted/60"
          >
            <span className="min-w-0 truncate">
              {item.subject || "Uten emne"} · {item.toEmails.join(", ")}
            </span>
            <span className="ml-2 shrink-0 text-xs text-muted-foreground">
              {item.markedSentAt
                ? "Sendt"
                : item.createdBy === user?.id
                  ? "Ditt utkast"
                  : "Teamutkast"}
            </span>
          </button>
        ))}
        {!drafts.data?.length && (
          <p className="text-sm text-muted-foreground">Ingen utkast ennå.</p>
        )}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogTitle>{draft.id ? "Rediger e-post" : "Ny e-post til " + contact.name}</DialogTitle>
          <DialogDescription>
            Åpne i e-postklienten for å sende. Contac sender ikke e-post.
          </DialogDescription>
          <div className="mt-5 grid gap-3">
            {(
              [
                ["Fra", "fromEmail"],
                ["Til", "to"],
                ["Kopi (Cc)", "cc"],
                ["Blindkopi (Bcc)", "bcc"],
                ["Emne", "subject"],
              ] as const
            ).map(([label, key]) => (
              <label key={key} className="grid gap-1 text-sm">
                <span>{label}</span>
                <Input
                  type={key === "fromEmail" ? "email" : "text"}
                  disabled={draft.sent || draft.readOnly}
                  value={draft[key]}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, [key]: event.target.value }))
                  }
                />
              </label>
            ))}
            {settings.data?.captureAddress ? (
              <p className="text-xs text-muted-foreground">
                {settings.data.captureAddress} legges automatisk til i Bcc når du åpner utkastet i
                e-post. Det gjør det enkelt å føre den sendte kopien tilbake til loggen.
              </p>
            ) : (
              <p className="text-xs text-warn">
                Innboksadressen er ikke konfigurert. Du kan fortsatt åpne e-posten og merke den som
                sendt manuelt.
              </p>
            )}
            <label className="grid gap-1 text-sm">
              <span>Melding</span>
              <Textarea
                className="min-h-56"
                disabled={draft.sent || draft.readOnly}
                value={draft.body}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, body: event.target.value }))
                }
              />
            </label>
            {!draft.sent && !draft.readOnly && (
              <div className="rounded-xl border border-border p-3">
                <p className="text-sm font-medium">AI-forslag til e-post</p>
                {contact.allowExternalAi ? (
                  aiSettings.data?.emailDraftEnabled &&
                  aiSettings.data.hasToken &&
                  aiSettings.data.model ? (
                    <>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Bruker kontaktfeltene og den nyeste samtalen eller sendte e-posten som
                        tillater ekstern AI. Bare når du trykker Generer.
                      </p>
                      <Textarea
                        className="mt-3 min-h-20"
                        placeholder="Hva skal e-posten si? Du kan gi flere instruksjoner etterpå."
                        value={aiPrompt}
                        onChange={(event) => setAiPrompt(event.target.value)}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2"
                        disabled={busy || !aiPrompt.trim()}
                        onClick={() => void suggest()}
                      >
                        Generer forslag
                      </Button>
                      {aiCandidate && (
                        <div className="mt-3 rounded-xl bg-muted p-3 text-sm">
                          <p className="whitespace-pre-wrap">{aiCandidate.body}</p>
                          <p className="mt-2 text-xs text-muted-foreground">
                            Tokenforbruk: {aiCandidate.promptTokens ?? "?"} inn ·{" "}
                            {aiCandidate.completionTokens ?? "?"} ut
                          </p>
                          <Button
                            size="sm"
                            className="mt-2"
                            onClick={() => {
                              setDraft((current) => ({ ...current, body: aiCandidate.body }));
                              setAiCandidate(null);
                            }}
                          >
                            Bruk forslaget i utkastet
                          </Button>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Av som standard. E-postforslag og OpenRouter-token kan aktiveres i
                      Teaminnstillinger.
                    </p>
                  )
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Ekstern AI er slått av for denne kontakten.
                  </p>
                )}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Fra-adressen foreslås fra profilen din, men kan endres. Velg riktig avsenderkonto i
              e-postklienten. Bcc-kopier knyttes til den verifiserte avsenderkontoen som faktisk
              sender e-posten. «Åpne i e-post» er ikke bevis på at meldingen er sendt.
            </p>
          </div>
          {error && (
            <p role="alert" className="mt-3 text-sm text-risk">
              {error}
            </p>
          )}
          {draft.readOnly ? (
            <p className="mt-4 rounded-xl bg-muted p-3 text-sm">
              Dette utkastet ble opprettet av et annet teammedlem og vises her som del av
              kontaktarbeidet.
            </p>
          ) : draft.sent ? (
            <p className="mt-4 rounded-xl bg-muted p-3 text-sm">
              Dette utkastet er markert som sendt og ligger i kontaktloggen.
            </p>
          ) : (
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              {draft.id && (
                <Button variant="destructive" disabled={busy} onClick={() => void removeDraft()}>
                  <Trash2 size={15} /> Slett utkast
                </Button>
              )}
              <Button variant="outline" disabled={busy} onClick={() => void action("save")}>
                Lagre utkast
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => void action("sent")}>
                <Send size={15} /> Merk som sendt
              </Button>
              <Button disabled={busy} onClick={() => void action("open")}>
                <ExternalLink size={15} /> Åpne i e-post
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
