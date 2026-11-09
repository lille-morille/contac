import { useEffect, useState } from "react";
import { Copy, Mail } from "lucide-react";
import { Button } from "./ui/button.tsx";
import { DateTimePicker } from "./ui/date-time-picker.tsx";
import { Input } from "./ui/input.tsx";
import { Textarea } from "./ui/textarea.tsx";
import { copyText } from "../lib/clipboard.ts";
import { clearDraft, readDraft, writeDraft } from "../lib/drafts.ts";
import { DiscardDraftDialog } from "./discard-draft-dialog.tsx";

type EmailDraft = {
  subject: string;
  fromEmail: string;
  to: string;
  body: string;
  occurredAt: string;
};

const inboundEmailAddress = "contac@plingapp.no";
const localDateTime = (date: Date) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

export function ManualEmailComposer({
  contactId,
  contactEmail,
  busy,
  mutate,
  draftKey,
  onClose,
}: {
  contactId: string;
  contactEmail?: string | null;
  busy: boolean;
  mutate: <T = unknown>(path: string, body: unknown) => Promise<T>;
  /** Browser storage key for keeping unsaved input when the page is left. */
  draftKey?: string;
  onClose: () => void;
}) {
  const [draft] = useState(() => (draftKey ? readDraft<EmailDraft>(draftKey) : null));
  const text = (value: unknown, fallback: string) => (typeof value === "string" ? value : fallback);
  const [subject, setSubject] = useState(text(draft?.subject, ""));
  const [fromEmail, setFromEmail] = useState(text(draft?.fromEmail, contactEmail ?? ""));
  const [to, setTo] = useState(text(draft?.to, ""));
  const [body, setBody] = useState(text(draft?.body, ""));
  const [occurredAt, setOccurredAt] = useState(() =>
    text(draft?.occurredAt, localDateTime(new Date())),
  );
  const [saving, setSaving] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  const [discardOpen, setDiscardOpen] = useState(false);
  const hasContent = Boolean(
    subject.trim() || to.trim() || body.trim() || fromEmail.trim() !== (contactEmail ?? "").trim(),
  );
  useEffect(() => {
    if (!draftKey) return;
    if (hasContent) writeDraft(draftKey, { subject, fromEmail, to, body, occurredAt });
    else clearDraft(draftKey);
  }, [draftKey, hasContent, subject, fromEmail, to, body, occurredAt]);
  function close() {
    if (draftKey) clearDraft(draftKey);
    onClose();
  }
  async function save() {
    if (saving || busy || !body.trim() || !occurredAt) return;
    setSaving(true);
    try {
      await mutate("/email-activities", {
        contactIds: [contactId],
        subject: subject.trim(),
        fromEmail: fromEmail.trim(),
        toEmails: to.split(/[,;\s]+/).filter(Boolean),
        body: body.trim(),
        occurredAt: new Date(occurredAt).toISOString(),
      });
      close();
    } catch {
      // The page displays the mutation error; retain the pasted email for retry.
    } finally {
      setSaving(false);
    }
  }
  return (
    <form
      className="mt-4 space-y-4 rounded-xl bg-muted/50 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Mail size={16} /> Registrer e-post
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={saving || busy}
          onClick={() => (hasContent ? setDiscardOpen(true) : close())}
        >
          Avbryt
        </Button>
      </div>
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          En enklere måte er å videresende e-posten hit. Når Contac kan lese originalen og matche én
          kontakt du er ansvarlig for, legges den til automatisk. Ellers kan du kontrollere den i
          innboksen før den lagres:
        </p>
        <div className="flex flex-wrap gap-2">
          <Input
            className="min-w-48 flex-1 bg-card"
            value={inboundEmailAddress}
            readOnly
            aria-label="Videresend e-post til"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              void copyText(inboundEmailAddress).then(
                () => setCopyMessage("E-postadressen er kopiert"),
                () => setCopyMessage("Kunne ikke kopiere e-postadressen"),
              )
            }
          >
            <Copy size={15} /> Kopier
          </Button>
        </div>
        {copyMessage && (
          <p role="status" className="text-xs text-muted-foreground">
            {copyMessage}
          </p>
        )}
      </div>
      <label className="block text-sm font-medium">
        Emne (valgfritt)
        <Input
          className="mt-2 bg-card"
          value={subject}
          maxLength={500}
          onChange={(e) => setSubject(e.target.value)}
        />
      </label>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-sm font-medium">
          Fra (valgfritt)
          <Input
            className="mt-2 bg-card"
            type="email"
            value={fromEmail}
            onChange={(e) => setFromEmail(e.target.value)}
          />
        </label>
        <label className="block text-sm font-medium">
          Til (valgfritt)
          <Input
            className="mt-2 bg-card"
            value={to}
            placeholder="E-postadresser, adskilt med komma"
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      </div>
      <div className="block text-sm font-medium">
        Dato og tidspunkt
        <DateTimePicker
          value={occurredAt}
          onChange={(next) => setOccurredAt(localDateTime(new Date(next)))}
          ariaLabel="Dato og tidspunkt for e-post"
          disabled={saving || busy}
          field
        />
      </div>
      <label className="block text-sm font-medium">
        E-postinnhold
        <Textarea
          className="mt-2 min-h-48 bg-card"
          required
          maxLength={250_000}
          placeholder="Lim inn e-posten her …"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </label>
      <p className="text-xs text-muted-foreground">
        Maks 250 000 tegn. Utkastet lagres på denne enheten.
      </p>
      <Button type="submit" disabled={busy || saving || !body.trim() || !occurredAt}>
        {saving ? "Lagrer …" : "Legg til i kontaktlogg"}
      </Button>
      <DiscardDraftDialog open={discardOpen} onOpenChange={setDiscardOpen} onDiscard={close} />
    </form>
  );
}
