import { ManualEmailComposer } from "../../components/manual-email-composer.tsx";
import { ChevronDown, Copy, Mail, PhoneCall, Plus, Upload, Users } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ContactStatusIcon,
  type ContactStatus as Status,
} from "../../components/contact-status.tsx";
import { Button, buttonVariants } from "../../components/ui/button.tsx";
import { Card } from "../../components/ui/card.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../../components/ui/dialog.tsx";
import { Input } from "../../components/ui/input.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover.tsx";
import { Textarea } from "../../components/ui/textarea.tsx";
import { copyText } from "../../lib/clipboard.ts";
import { useOrg } from "../../lib/org.tsx";
import { CallTimer, ConversationParticipantsPicker, detailFieldClass } from "./contact-list.tsx";
import {
  dateTimeLabel,
  missedOutcomeLabels,
  nextReminderTime,
  type Company,
  type Contact,
  type MissedOutcome,
  type Reminder,
} from "./model.tsx";
import { BrowserNotificationPrompt, ReminderTimeField } from "./shell-parts.tsx";
import { CalendarEventForm } from "./calendar.tsx";
export function ActivityComposer({
  contact,
  related,
  assigneeName,
  mutate,
  busy,
  notificationPermission,
  onEnableNotifications,
  shortcutRequest,
}: {
  contact: Contact;
  related: Contact[];
  assigneeName?: string;
  mutate: <T = unknown>(path: string, body: unknown) => Promise<T>;
  busy: boolean;
  notificationPermission: NotificationPermission | "unsupported";
  onEnableNotifications: () => void;
  shortcutRequest?: number;
}) {
  const { user } = useOrg();
  const [mode, setMode] = useState<"phone" | "meeting" | "email" | null>(null);
  const [takeoverOpen, setTakeoverOpen] = useState(false);
  const [startedAt, setStartedAt] = useState("");
  const [outcome, setOutcome] = useState<MissedOutcome | null>(null);
  const [summary, setSummary] = useState("");
  const [transcript, setTranscript] = useState("");
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const [nextStatus, setNextStatus] = useState<Status | null>(null);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderAt, setReminderAt] = useState(nextReminderTime);
  const [reminderMessage, setReminderMessage] = useState("");
  const [phoneCopyMessage, setPhoneCopyMessage] = useState("");
  const [fileError, setFileError] = useState("");
  const callComposerRef = useRef<HTMLDivElement>(null);
  const scrolledShortcut = useRef<number | null>(null);

  function start(nextMode: "phone" | "meeting") {
    setMode(nextMode);
    setStartedAt(new Date().toISOString());
    setOutcome(null);
    setSummary("");
    setTranscript("");
    setExtraIds([]);
    setNextStatus(null);
    setReminderEnabled(false);
    setReminderAt(nextReminderTime());
    setReminderMessage("");
    setPhoneCopyMessage("");
    setFileError("");
  }
  useEffect(() => {
    if (shortcutRequest) start("phone");
  }, [shortcutRequest]);
  const scrollToCallComposer = useCallback(() => {
    if (!shortcutRequest || mode !== "phone" || scrolledShortcut.current === shortcutRequest)
      return;
    const composer = callComposerRef.current;
    if (!composer) return;
    scrolledShortcut.current = shortcutRequest;
    composer.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
    composer.querySelector<HTMLTextAreaElement>("textarea")?.focus({ preventScroll: true });
  }, [shortcutRequest, mode]);
  useEffect(() => {
    const frame = window.requestAnimationFrame(scrollToCallComposer);
    return () => window.cancelAnimationFrame(frame);
  }, [scrollToCallComposer]);
  async function importTranscript(file: File | undefined) {
    if (!file) return;
    if (!/\.(txt|md|srt|vtt)$/i.test(file.name)) {
      setFileError("Velg en tekstfil (TXT, MD, SRT eller VTT).");
      return;
    }
    const content = await file.text();
    if (content.length + transcript.length > 200_000) {
      setFileError("Transkripsjonen kan ikke være lengre enn 200 000 tegn.");
      return;
    }
    setTranscript((current) => (current ? `${current}\n\n${content}` : content));
    setFileError("");
  }
  async function saveActivity(status?: Status) {
    if (!mode) return;
    try {
      await mutate("/activities", {
        contactIds: [contact.id, ...(outcome ? [] : extraIds)],
        kind: outcome ? "missed_phone" : mode,
        summary: summary.trim(),
        transcript: outcome ? "" : transcript.trim(),
        missedOutcome: outcome ?? undefined,
        occurredAt: startedAt,
        nextStatus: status,
        reminder:
          outcome && reminderEnabled
            ? { dueAt: reminderAt, message: reminderMessage.trim() }
            : undefined,
      });
      setMode(null);
      if (contact.assigneeId && contact.assigneeId !== user?.id) {
        setTakeoverOpen(true);
      }
    } catch {
      // The page-level mutation displays the error and keeps this draft for retry.
    }
  }

  const completed = mode === "meeting" || !outcome;
  const statusChoices: { value: Status; title: string; explanation: string }[] = [
    {
      value: "ikke_kontakt_igjen",
      title: "Ikke kontakt igjen",
      explanation: "Personen ønsker ikke å bli kontaktet på nytt",
    },
    {
      value: "avsluttet",
      title: "Avsluttet",
      explanation: "Vi har fått det vi trenger, og trenger ikke ringe på nytt",
    },
    {
      value: "kan_kontaktes_igjen",
      title: "Kan kontaktes igjen",
      explanation: "Relevant for videre kontakt, for eksempel som potensiell kunde",
    },
  ];
  const chosenStatus = statusChoices.find((choice) => choice.value === nextStatus);
  return (
    <>
      <AnimatePresence mode="wait" initial={false}>
        {!mode ? (
          <motion.div
            key="activity-start"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="mt-4 flex flex-wrap gap-2"
          >
            <Button onClick={() => start("phone")}>
              <PhoneCall size={16} /> Start telefonsamtale
            </Button>
            <Button variant="outline" onClick={() => start("meeting")}>
              <Users size={16} /> Registrer møte
            </Button>
            <Button variant="outline" onClick={() => setMode("email")}>
              <Mail size={16} /> Registrer e-post
            </Button>
          </motion.div>
        ) : mode === "email" ? (
          <ManualEmailComposer
            contactId={contact.id}
            contactEmail={contact.email}
            busy={busy}
            mutate={mutate}
            onClose={() => setMode(null)}
          />
        ) : (
          <motion.div
            key="activity-composer"
            ref={callComposerRef}
            data-call-composer={mode === "phone" ? "" : undefined}
            onAnimationComplete={scrollToCallComposer}
            layout="size"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ layout: { type: "spring", stiffness: 280, damping: 34 } }}
            className="mt-4 scroll-mt-6 space-y-4 rounded-xl bg-muted/50 p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold">
                  {mode === "phone" ? <PhoneCall size={16} /> : <Users size={16} />}
                  {mode === "phone" ? "Telefonsamtale startet" : "Nytt møte"}
                </p>
                <p className="text-xs text-muted-foreground">Startet {dateTimeLabel(startedAt)}</p>
                {mode === "phone" && !outcome && <CallTimer startedAt={startedAt} />}
              </div>
              <Button variant="ghost" size="sm" onClick={() => setMode(null)}>
                Avbryt
              </Button>
            </div>
            {mode === "phone" && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary-soft p-4">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">Telefonnummer</p>
                  <p className="break-all text-xl font-semibold tabular-nums">
                    {contact.phone?.trim() || "Telefonnummer mangler"}
                  </p>
                  {phoneCopyMessage && (
                    <p role="status" className="mt-1 text-xs text-muted-foreground">
                      {phoneCopyMessage}
                    </p>
                  )}
                </div>
                {contact.phone?.trim() && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        void copyText(contact.phone!.trim()).then(
                          () => setPhoneCopyMessage("Nummer kopiert"),
                          () => setPhoneCopyMessage("Kunne ikke kopiere nummeret"),
                        )
                      }
                    >
                      <Copy size={15} /> Kopier nummer
                    </Button>
                    <a
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                      href={`tel:${contact.phone.trim().replace(/[^\d+#*]/g, "")}`}
                      aria-label={`Ring ${contact.name}`}
                    >
                      <PhoneCall size={15} /> Ring
                    </a>
                  </div>
                )}
              </div>
            )}
            {mode === "phone" && (
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  Fikk du ikke snakket med personen?
                </p>
                <div className="flex flex-wrap gap-2">
                  {outcome && (
                    <Button variant="outline" size="sm" onClick={() => setOutcome(null)}>
                      Samtale gjennomført
                    </Button>
                  )}
                  {(Object.entries(missedOutcomeLabels) as [MissedOutcome, string][]).map(
                    ([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={outcome === value}
                        className={`rounded-xl border px-3 py-1.5 text-sm transition-colors ${outcome === value ? "border-primary bg-primary-soft font-medium text-primary" : "border-border bg-card hover:border-primary/30"}`}
                        onClick={() => {
                          setOutcome(value);
                          setReminderEnabled(false);
                        }}
                      >
                        {label}
                      </button>
                    ),
                  )}
                </div>
              </div>
            )}
            <label className="block text-sm font-medium">
              {completed ? "Notater og sammendrag" : "Notat (valgfritt)"}
              {completed && (
                <span className="mt-1 block text-xs font-normal text-muted-foreground">
                  Dette havner i loggen på kontaktlogg-eksport
                </span>
              )}
              <Textarea
                className="mt-2 min-h-32 bg-card"
                placeholder={
                  completed
                    ? "Skriv notater under samtalen eller oppsummer det viktigste …"
                    : "Hva skjedde?"
                }
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                maxLength={20_000}
              />
            </label>
            <AnimatePresence mode="wait" initial={false}>
              {completed ? (
                <motion.div
                  key="conversation-fields"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="space-y-4"
                >
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="text-sm font-medium" htmlFor="activity-transcript">
                        Transkripsjon (valgfritt)
                      </label>
                      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs hover:border-primary/30">
                        <Upload size={14} /> Last opp tekstfil
                        <input
                          type="file"
                          accept=".txt,.md,.srt,.vtt,text/plain,text/markdown"
                          className="sr-only"
                          onChange={(event) => {
                            void importTranscript(event.target.files?.[0]);
                            event.target.value = "";
                          }}
                        />
                      </label>
                    </div>
                    <Textarea
                      id="activity-transcript"
                      className="mt-2 min-h-28 bg-card"
                      placeholder="Lim inn transkripsjon, eller last opp TXT, MD, SRT eller VTT …"
                      value={transcript}
                      onChange={(event) => setTranscript(event.target.value)}
                      maxLength={200_000}
                    />
                    {fileError && (
                      <p role="alert" className="mt-1 text-xs text-risk">
                        {fileError}
                      </p>
                    )}
                  </div>
                  <ConversationParticipantsPicker
                    people={related}
                    selectedIds={extraIds}
                    onChange={setExtraIds}
                  />
                  <div>
                    <p className="mb-2 text-sm font-medium">
                      Hva skal statusen være etter samtalen?
                    </p>
                    <div className="grid gap-2 md:grid-cols-3">
                      {statusChoices.map((choice) => (
                        <button
                          key={choice.value}
                          type="button"
                          aria-pressed={nextStatus === choice.value}
                          className={`rounded-xl border p-3 text-left transition-colors ${nextStatus === choice.value ? "border-primary bg-primary-soft" : "border-border bg-card hover:border-primary/30"}`}
                          onClick={() => setNextStatus(choice.value)}
                        >
                          <span className="flex items-center gap-2 text-sm font-medium">
                            <ContactStatusIcon status={choice.value} size={16} /> {choice.title}
                          </span>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {choice.explanation}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="missed-call-fields"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="rounded-xl border border-border bg-card p-3"
                >
                  <p className="text-sm font-medium">Vil du bli påminnet om å prøve igjen?</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      variant={reminderEnabled ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => setReminderEnabled((enabled) => !enabled)}
                      aria-pressed={reminderEnabled}
                    >
                      {reminderEnabled ? "Fjern påminnelse" : "Legg til påminnelse"}
                    </Button>
                  </div>
                  <AnimatePresence initial={false}>
                    {reminderEnabled && (
                      <motion.div
                        key="reminder-fields"
                        initial={{ opacity: 0, height: 0, y: -6 }}
                        animate={{ opacity: 1, height: "auto", y: 0 }}
                        exit={{ opacity: 0, height: 0, y: -6 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="overflow-hidden"
                      >
                        <div className="space-y-2 pt-3">
                          <ReminderTimeField value={reminderAt} onChange={setReminderAt} />
                          <Input
                            value={reminderMessage}
                            onChange={(event) => setReminderMessage(event.target.value)}
                            maxLength={2000}
                            placeholder="Ring opp igjen (valgfritt)"
                            aria-label="Påminnelsesmelding"
                          />
                          <BrowserNotificationPrompt
                            permission={notificationPermission}
                            onEnable={onEnableNotifications}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
            <div className="grid gap-2 border-t border-border pt-3 md:grid-cols-2">
              <button
                type="button"
                disabled={busy}
                className="rounded-xl border border-primary bg-primary-soft p-3 text-left text-sm font-medium text-primary transition-colors hover:bg-primary-soft/70 disabled:opacity-50"
                onClick={() =>
                  void saveActivity(completed ? (nextStatus ?? undefined) : "follow_up")
                }
              >
                <span className="flex items-center gap-2">
                  {chosenStatus && <ContactStatusIcon status={chosenStatus.value} size={16} />}
                  {completed
                    ? chosenStatus
                      ? `Legg til aktivitet og flytt til ${chosenStatus.title}`
                      : "Legg til aktivitet"
                    : "Flytt til Follow up / Ring igjen og legg til aktivitet"}
                </span>
              </button>
              {(outcome || nextStatus) && (
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-xl border border-border bg-card p-3 text-left text-sm font-medium transition-colors hover:border-primary/30 disabled:opacity-50"
                  onClick={() => void saveActivity()}
                >
                  Legg til aktivitet uten statusendring
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <Dialog open={takeoverOpen} onOpenChange={setTakeoverOpen}>
        <DialogContent>
          <DialogTitle>Ta over som ansvarlig?</DialogTitle>
          <DialogDescription>
            Aktiviteten er lagt til. {assigneeName || "En annen person"} er ansvarlig for å følge
            opp denne kontakten. Vil du ta over ansvaret?
          </DialogDescription>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" disabled={busy} onClick={() => setTakeoverOpen(false)}>
              Behold ansvarlig
            </Button>
            <Button
              disabled={busy || !user?.id}
              onClick={async () => {
                if (!user?.id) return;
                try {
                  await mutate(`/contacts/${contact.id}`, { assigneeId: user.id });
                  setTakeoverOpen(false);
                } catch {
                  // The page-level mutation displays the error; keep the prompt open.
                }
              }}
            >
              Ta over
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
export function ContactReminderCard({
  contactId,
  contacts,
  reminders,
  mutate,
  busy,
  notificationPermission,
  onEnableNotifications,
}: {
  contactId: string;
  contacts: Contact[];
  reminders: Reminder[];
  mutate: <T = unknown>(path: string, body: unknown) => Promise<T>;
  busy: boolean;
  notificationPermission: NotificationPermission | "unsupported";
  onEnableNotifications: () => void;
}) {
  const [dueAt, setDueAt] = useState(nextReminderTime);
  const [message, setMessage] = useState("");
  const [meetingOpen, setMeetingOpen] = useState(false);
  async function createReminder() {
    try {
      await mutate("/reminders", { contactId, dueAt, message: message.trim() });
      setDueAt(nextReminderTime());
      setMessage("");
    } catch {
      // The page-level mutation displays the error and keeps the entered reminder.
    }
  }
  return (
    <Card className="p-4">
      <h2 className="font-semibold">Legg til påminnelse</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Blir sendt til innboksen. Kun du ser denne påminnelsen.
      </p>
      <div className="mt-3 space-y-2">
        <ReminderTimeField value={dueAt} onChange={setDueAt} />
        <Input
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={2000}
          placeholder="Ring opp igjen (valgfritt)"
          aria-label="Påminnelsesmelding"
        />
        <Button size="sm" disabled={busy} onClick={() => void createReminder()}>
          Legg til påminnelse
        </Button>
        <BrowserNotificationPrompt
          permission={notificationPermission}
          onEnable={onEnableNotifications}
        />
      </div>
      {reminders.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-xs font-medium text-muted-foreground">Dine påminnelser</p>
          {reminders.map((reminder) => (
            <p key={reminder.id} className="mt-1 text-xs">
              {dateTimeLabel(reminder.dueAt)}
              {reminder.message ? ` · ${reminder.message}` : ""}
            </p>
          ))}
        </div>
      )}
      <div className="mt-4 border-t border-border pt-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">Planlegg møte</h2>
            <p className="text-xs text-muted-foreground">Synlig for hele teamet i kalenderen.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setMeetingOpen((open) => !open)}>
            {meetingOpen ? "Lukk" : "Planlegg møte"}
          </Button>
        </div>
        {meetingOpen && (
          <div className="mt-3">
            <CalendarEventForm
              contacts={contacts}
              contactId={contactId}
              onSaved={() => setMeetingOpen(false)}
              onCancel={() => setMeetingOpen(false)}
            />
          </div>
        )}
      </div>
    </Card>
  );
}
export function ContactOrganizationPicker({
  contact,
  companies,
  mutate,
  disabled,
}: {
  contact: Contact;
  companies: Company[];
  mutate: <T = unknown>(path: string, body: unknown) => Promise<T>;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const current = companies.find((company) => company.id === contact.companyId);
  const query = search.trim().toLocaleLowerCase("nb-NO");
  const matches = companies.filter((company) =>
    company.name.toLocaleLowerCase("nb-NO").includes(query),
  );
  const existing = companies.find(
    (company) => company.name.trim().toLocaleLowerCase("nb-NO") === query,
  );
  async function select(companyId: string) {
    if (companyId === contact.companyId) {
      setOpen(false);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await mutate(`/contacts/${contact.id}`, { companyId });
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke velge organisasjon.");
    } finally {
      setSaving(false);
    }
  }
  async function create() {
    if (!search.trim()) return;
    setSaving(true);
    setError("");
    try {
      const company = await mutate<{ id: string }>("/companies", { name: search.trim() });
      await mutate(`/contacts/${contact.id}`, { companyId: company.id });
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke opprette organisasjonen.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setSearch("");
          setError("");
        }
      }}
    >
      <PopoverTrigger
        type="button"
        disabled={disabled}
        className={`${detailFieldClass} flex w-full items-center justify-between rounded-lg text-left text-sm`}
        aria-label="Organisasjon"
      >
        <span className="truncate">{current?.name ?? "Velg organisasjon"}</span>
        <ChevronDown size={14} className="shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2">
        <Input
          autoFocus
          role="combobox"
          aria-label="Søk eller opprett organisasjon"
          aria-expanded={open}
          aria-controls="contact-organization-options"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            if (existing) void select(existing.id);
            else if (search.trim()) void create();
          }}
        />
        <div
          id="contact-organization-options"
          role="listbox"
          className="mt-2 max-h-56 overflow-y-auto"
        >
          {matches.map((company) => (
            <button
              key={company.id}
              type="button"
              role="option"
              aria-selected={company.id === contact.companyId}
              disabled={saving}
              className="block w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted"
              onClick={() => void select(company.id)}
            >
              {company.name}
            </button>
          ))}
        </div>
        {search.trim() && !existing && (
          <Button
            className="mt-2 w-full"
            variant="outline"
            size="sm"
            disabled={saving}
            onClick={() => void create()}
          >
            <Plus size={14} /> Opprett «{search.trim()}»
          </Button>
        )}
        {error && (
          <p role="alert" className="mt-2 text-xs text-risk">
            {error}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
