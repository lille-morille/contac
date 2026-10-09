import { CONTACT_DESCRIPTION_MAX_LENGTH } from "@contac/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlignLeft,
  ArrowLeft,
  Building2,
  CalendarDays,
  ChevronDown,
  ListFilter,
  Mail,
  BookOpen,
  Phone,
  Pencil,
  Check,
  ShieldCheck,
  Star,
  Tag as TagIcon,
  Tags,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Avatar } from "../../components/ui/avatar.tsx";
import { EmailComposer } from "../../components/email-composer.tsx";
import {
  ContactAiPanel,
  ContactAiFieldSuggestions,
  type ReferralPrefill,
} from "../../components/contact-ai-panel.tsx";
import { LiveText } from "../../components/live-text.tsx";
import { CrossTeamOverlap } from "../../components/cross-team-overlap.tsx";
import { Badge } from "../../components/ui/badge.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Card } from "../../components/ui/card.tsx";
import { Checkbox } from "../../components/ui/checkbox.tsx";
import { DateTimePicker } from "../../components/ui/date-time-picker.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../../components/ui/dialog.tsx";
import { Select } from "../../components/ui/select.tsx";
import { profileAvatarUrl, request } from "../../lib/api.ts";
import { HighlightedText } from "../../lib/search-highlight.tsx";
import { useOrg } from "../../lib/org.tsx";
import { useTeamRealtime } from "../../lib/team-realtime.tsx";
import {
  ActivityComposer,
  ContactOrganizationPicker,
  ContactReminderCard,
} from "./activity-editor.tsx";
import { ContactDetailField, InlineText, detailFieldClass } from "./contact-list.tsx";
import {
  activityPresentation,
  assigneeOptions,
  dateTimeLabel,
  statusOptions,
  type Activity,
  type Contact,
  type Data,
  type LibraryItem,
} from "./model.tsx";
import { PersonTagEditor } from "./tag-editor.tsx";
import {
  AdditionalInformation,
  StikkordEditor,
  SharedNote,
  ActivityAttachments,
  DuplicateCompare,
} from "./contact-detail-sections.tsx";
export function ContactDetail({
  contact: c,
  missing,
  data,
  favorite,
  mutate,
  onBack,
  onOpen,
  onDelete,
  onAcceptReferral,
  composerShortcut,
  busy,
  focusedActivityId,
  focusedPassage,
  focusedQuery,
  notificationPermission,
  onEnableNotifications,
}: {
  contact: Contact | null;
  missing: boolean;
  data: Data;
  favorite: boolean;
  mutate: <T = unknown>(path: string, body: unknown) => Promise<T>;
  onBack: () => void;
  onOpen: (id: string) => void;
  onDelete: (contact: Contact) => void;
  onAcceptReferral: (referral: ReferralPrefill) => void;
  composerShortcut: { contactId: string; kind: "phone" | "email"; nonce: number } | null;
  busy: boolean;
  focusedActivityId: string | null;
  focusedPassage: string | null;
  focusedQuery: string | null;
  notificationPermission: NotificationPermission | "unsupported";
  onEnableNotifications: () => void;
}) {
  const state = useOrg();
  const { peers } = useTeamRealtime();
  const contactQueryClient = useQueryClient();
  const [compare, setCompare] = useState<string | null>(null);
  const [deletingActivity, setDeletingActivity] = useState<Activity | null>(null);
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
  const [expandedActivityIds, setExpandedActivityIds] = useState<string[]>([]);
  const [selectedQuote, setSelectedQuote] = useState<{
    activityId: string;
    quote: string;
    x: number;
    y: number;
  } | null>(null);
  const duplicates = useQuery({
    queryKey: ["duplicates", state.org?.id, c?.id, c?.updatedAt],
    queryFn: () => request<Contact[]>(`/org/contacts/${c!.id}/duplicates`, state.org!.id),
    enabled: !!c && c.status !== "duplicate" && !!state.org,
    refetchInterval: 60_000,
  });
  const library = useQuery({
    queryKey: ["library", state.org?.id],
    queryFn: () => request<LibraryItem[]>("/org/library", state.org!.id),
    enabled: !!state.org,
    refetchInterval: 60_000,
  });
  const contactId = c?.id;
  useEffect(() => setSelectedQuote(null), [contactId]);
  useEffect(() => {
    if (!selectedQuote) return;
    const dismissOutside = (event: globalThis.PointerEvent) => {
      if (
        !(event.target instanceof Element) ||
        !event.target.closest("[data-activity-quote-action]")
      )
        setSelectedQuote(null);
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedQuote(null);
    };
    const dismiss = () => setSelectedQuote(null);
    document.addEventListener("pointerdown", dismissOutside);
    window.addEventListener("keydown", dismissOnEscape);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      window.removeEventListener("keydown", dismissOnEscape);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [selectedQuote]);
  useEffect(() => {
    if (!focusedActivityId || !contactId) return;
    const timer = window.setTimeout(() => {
      const target = document.querySelector<HTMLElement>(
        focusedActivityId === "note"
          ? "[data-note-source]"
          : focusedActivityId === "additional_info"
            ? "[data-additional-info]"
            : `[data-activity-id="${focusedActivityId}"]`,
      );
      (target?.querySelector<HTMLElement>("[data-search-match]") ?? target)?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "center",
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [focusedActivityId, focusedPassage, focusedQuery, contactId]);
  if (!c)
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">
          {missing ? "Kontakten finnes ikke i dette teamet" : "Laster kontakt …"}
        </h1>
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft size={16} /> Tilbake
        </Button>
      </div>
    );
  const company = data.companies.find((x) => x.id === c.companyId);
  const creator = data.contactCreators.find((member) => member.userId === c.createdBy);
  const creatorName = creator?.name || "Ukjent bruker";
  const personTagIds = data.contactPersonTags
    .filter((tag) => tag.contactId === c.id)
    .map((tag) => tag.tagId);
  const domainIds = data.companyDomains
    .filter((link) => link.companyId === c.companyId)
    .map((link) => link.domainId)
    .sort()
    .slice(0, 1);
  const aiField = (
    field:
      | "email"
      | "phone"
      | "description"
      | "companyId"
      | "personTagIds"
      | "domainIds"
      | "stikkord",
    currentValue: string | string[] | null,
  ) =>
    c.status === "duplicate" ? null : (
      <ContactAiFieldSuggestions
        contactId={c.id}
        field={field}
        currentValue={currentValue}
        companies={data.companies}
        domains={data.domains}
        tags={data.personTags}
      />
    );
  const timeline = data.activities
    .filter((a) => data.activityContacts.some((x) => x.activityId === a.id && x.contactId === c.id))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const related = data.contacts.filter(
    (x) =>
      !!c.companyId && x.id !== c.id && x.companyId === c.companyId && x.status !== "duplicate",
  );
  const timelineIds = new Set(timeline.map((activity) => activity.id));
  const contactLibrary = (library.data ?? []).filter(
    (item) => item.contactId === c.id || (!!item.activityId && timelineIds.has(item.activityId)),
  );
  const viewingPeers = peers.filter(
    (peer, index, rows) =>
      peer.contactId === c.id &&
      peer.userId !== state.user?.id &&
      rows.findIndex((item) => item.userId === peer.userId && item.contactId === c.id) === index,
  );
  const affectedContactNames = deletingActivity
    ? data.activityContacts
        .filter((link) => link.activityId === deletingActivity.id)
        .map((link) => data.contacts.find((contact) => contact.id === link.contactId)?.name)
        .filter((name): name is string => !!name)
    : [];
  const captureActivityQuote = (
    element: HTMLElement,
    activityId: string,
    point?: { x: number; y: number },
  ) => {
    if (c.status === "duplicate") return;
    const field = element.querySelector("textarea");
    const fieldQuote =
      field && element.contains(document.activeElement)
        ? field.value.slice(field.selectionStart, field.selectionEnd).trim()
        : "";
    const selection = window.getSelection();
    const domQuote =
      element.contains(selection?.anchorNode ?? null) &&
      element.contains(selection?.focusNode ?? null)
        ? (selection?.toString().trim() ?? "")
        : "";
    const quote = element.hasAttribute("data-activity-preview")
      ? domQuote.replace(/…$/, "").trimEnd()
      : fieldQuote || domQuote;
    if (!quote) {
      setSelectedQuote(null);
      return;
    }
    const rect =
      field?.getBoundingClientRect() ??
      (selection && selection.rangeCount > 0
        ? selection.getRangeAt(0).getBoundingClientRect()
        : null);
    const x = point?.x ?? (rect ? rect.left + Math.min(rect.width / 2, 120) : 0);
    const y = point?.y ?? (rect ? rect.top + 24 : 0);
    const horizontalMargin = Math.min(105, window.innerWidth / 2);
    setSelectedQuote({
      activityId,
      quote,
      x: Math.max(horizontalMargin, Math.min(window.innerWidth - horizontalMargin, x)),
      y: Math.max(12, Math.min(window.innerHeight - 12, y)),
    });
  };
  const captureTouchQuote = (
    element: HTMLElement,
    activityId: string,
    point?: { x: number; y: number },
  ) => window.setTimeout(() => captureActivityQuote(element, activityId, point), 50);
  return (
    <>
      <Button variant="ghost" size="sm" onClick={onBack}>
        ← Tilbake
      </Button>
      <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          {!focusedActivityId && focusedPassage && (
            <p className="rounded-xl bg-primary/10 p-3 text-sm">
              <mark className="bg-primary/20">Søketreff: {focusedPassage}</mark>
            </p>
          )}
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold">
                  {c.name}{" "}
                  <span className="text-base font-normal text-muted-foreground">
                    #{c.contactNumber}
                  </span>
                </h1>
                <p className="text-muted-foreground">{company?.name}</p>
              </div>
              {c.status !== "duplicate" && (
                <div data-contact-detail-actions className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    aria-label={favorite ? "Fjern fra favoritter" : "Legg til i favoritter"}
                    aria-pressed={favorite}
                    onClick={() =>
                      void mutate(`/contacts/${c.id}/favorite`, { favorite: !favorite })
                    }
                  >
                    <Star size={16} className={favorite ? "fill-current text-primary" : ""} />
                    {favorite ? "Favoritt" : "Legg til favoritter"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => onDelete(c)}
                  >
                    <Trash2 size={16} /> Slett kontakt
                  </Button>
                </div>
              )}
            </div>
            {viewingPeers.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Users size={14} aria-hidden />
                {viewingPeers.map((peer) => {
                  const member = data.members.find((item) => item.userId === peer.userId);
                  const name = member?.name ?? "Teammedlem";
                  return (
                    <span
                      key={peer.userId}
                      className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-1"
                    >
                      <Avatar
                        name={name}
                        src={profileAvatarUrl(member?.avatarPath)}
                        className="size-5"
                      />
                      {name}
                      {peer.editingId ? " redigerer" : " ser på"}
                    </span>
                  );
                })}
              </div>
            )}
            {c.status === "duplicate" && (
              <p className="mt-3 rounded-xl bg-muted p-3 text-sm">
                Dette er et arkivert duplikat.{" "}
                <button
                  className="text-primary underline"
                  onClick={() => c.duplicateOfId && onOpen(c.duplicateOfId)}
                >
                  Åpne hovedkontakt
                </button>
              </p>
            )}
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <ContactDetailField icon={UserRound} label="Navn">
                <InlineText
                  value={c.name}
                  className={detailFieldClass}
                  disabled={c.status === "duplicate"}
                  ariaLabel="Navn"
                  onSave={(name, old) =>
                    void mutate(`/contacts/${c.id}`, { name, expected: { name: old } })
                  }
                />
              </ContactDetailField>
              <ContactDetailField icon={Building2} label="Organisasjon">
                <div>
                  <ContactOrganizationPicker
                    contact={c}
                    companies={data.companies}
                    mutate={mutate}
                    disabled={c.status === "duplicate"}
                  />
                  {aiField("companyId", c.companyId)}
                </div>
              </ContactDetailField>
              <ContactDetailField icon={Mail} label="E-post">
                <div>
                  <InlineText
                    value={c.email}
                    className={detailFieldClass}
                    disabled={c.status === "duplicate"}
                    ariaLabel="E-post"
                    onSave={(email, old) =>
                      void mutate(`/contacts/${c.id}`, { email, expected: { email: old } })
                    }
                  />
                  {aiField("email", c.email)}
                </div>
              </ContactDetailField>
              <ContactDetailField icon={Phone} label="Telefon">
                <div>
                  <InlineText
                    value={c.phone}
                    className={detailFieldClass}
                    disabled={c.status === "duplicate"}
                    ariaLabel="Telefon"
                    onSave={(phone, old) =>
                      void mutate(`/contacts/${c.id}`, { phone, expected: { phone: old } })
                    }
                  />
                  {aiField("phone", c.phone)}
                </div>
              </ContactDetailField>
              <ContactDetailField
                icon={AlignLeft}
                label="Kort beskrivelse"
                className="sm:col-span-2"
              >
                <div>
                  <InlineText
                    value={c.description}
                    className={detailFieldClass}
                    disabled={c.status === "duplicate"}
                    ariaLabel="Kort beskrivelse"
                    maxLength={CONTACT_DESCRIPTION_MAX_LENGTH}
                    onSave={(description, old) =>
                      void mutate(`/contacts/${c.id}`, {
                        description,
                        expected: { description: old },
                      })
                    }
                  />
                  {aiField("description", c.description)}
                </div>
              </ContactDetailField>
              <ContactDetailField icon={Tags} label="Persontagger" className="sm:col-span-2">
                <div className="flex flex-wrap gap-2 py-1">
                  {data.personTags.map((tag) => {
                    const selected = data.contactPersonTags.some(
                      (x) => x.contactId === c.id && x.tagId === tag.id,
                    );
                    return (
                      <button
                        key={tag.id}
                        disabled={c.status === "duplicate"}
                        aria-pressed={selected}
                        aria-label={`${selected ? "Fjern" : "Legg til"} ${tag.name}`}
                        title={
                          tag.description
                            ? `${tag.name}: ${tag.description}`
                            : `${tag.name}: ingen beskrivelse`
                        }
                        className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50 ${selected ? "border-primary bg-primary text-primary-foreground hover:bg-primary-hover" : "border-border bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground"}`}
                        onClick={() =>
                          void mutate(`/contacts/${c.id}/tags`, {
                            tagIds: selected
                              ? data.contactPersonTags
                                  .filter((x) => x.contactId === c.id && x.tagId !== tag.id)
                                  .map((x) => x.tagId)
                              : [
                                  ...data.contactPersonTags
                                    .filter((x) => x.contactId === c.id)
                                    .map((x) => x.tagId),
                                  tag.id,
                                ],
                          })
                        }
                      >
                        {selected && <X size={11} strokeWidth={2.5} aria-hidden />}
                        {tag.name}
                      </button>
                    );
                  })}
                  {c.status !== "duplicate" && (
                    <PersonTagEditor
                      contactId={c.id}
                      tags={data.personTags}
                      selectedIds={data.contactPersonTags
                        .filter((tag) => tag.contactId === c.id)
                        .map((tag) => tag.tagId)}
                      mutate={mutate}
                      busy={busy}
                    />
                  )}
                </div>
                {aiField("personTagIds", personTagIds)}
              </ContactDetailField>
              <ContactDetailField icon={TagIcon} label="Domene" className="sm:col-span-2">
                <div className="flex flex-wrap gap-1.5 py-1">
                  {domainIds.map((id) => {
                    const domain = data.domains.find((item) => item.id === id);
                    return domain ? (
                      <Badge key={id} variant="neutral">
                        {domain.name}
                      </Badge>
                    ) : null;
                  })}
                  {!domainIds.length && (
                    <span className="text-xs text-muted-foreground">Uten domene</span>
                  )}
                </div>
                {aiField("domainIds", domainIds)}
              </ContactDetailField>
            </div>
            {c.status !== "duplicate" && (
              <ContactAiPanel
                contact={c}
                companies={data.companies}
                domains={data.domains}
                tags={data.personTags}
                contacts={data.contacts.map((contact) => ({ id: contact.id, name: contact.name }))}
                onAcceptReferral={onAcceptReferral}
                onOpenContact={onOpen}
              />
            )}
          </Card>
          <SharedNote
            key={c.id}
            contact={c}
            mutate={mutate}
            focused={focusedActivityId === "note"}
            focusedPassage={focusedActivityId === "note" ? focusedPassage : null}
            focusedQuery={focusedQuery}
          />
          <AdditionalInformation
            contactId={c.id}
            entries={data.additionalInfo.filter((entry) => entry.contactId === c.id)}
            contacts={data.contacts}
            onOpen={onOpen}
            mutate={mutate}
            busy={busy}
            disabled={c.status === "duplicate"}
            focusedPassage={focusedActivityId === "additional_info" ? focusedPassage : null}
          />
          <StikkordEditor
            contact={c}
            mutate={mutate}
            busy={busy}
            suggestions={aiField("stikkord", c.stikkord)}
          />
          {c.status !== "duplicate" && (
            <EmailComposer
              contact={c}
              shortcutRequest={
                composerShortcut?.kind === "email" ? composerShortcut.nonce : undefined
              }
              onActivity={() =>
                contactQueryClient.invalidateQueries({ queryKey: ["contact-data", state.org?.id] })
              }
            />
          )}
          <Card className="p-5">
            <h2 className="font-semibold">Aktivitet</h2>
            {c.status !== "duplicate" && (
              <ActivityComposer
                contact={c}
                shortcutRequest={
                  composerShortcut?.kind === "phone" ? composerShortcut.nonce : undefined
                }
                related={related}
                assigneeName={
                  (
                    data.members.find((member) => member.userId === c.assigneeId) ??
                    data.contactAssignees.find((member) => member.userId === c.assigneeId)
                  )?.name ?? undefined
                }
                mutate={mutate}
                busy={busy}
                notificationPermission={notificationPermission}
                onEnableNotifications={onEnableNotifications}
              />
            )}
            <div className="mt-4 space-y-3">
              {timeline.map((a) => {
                const editing = editingActivityId === a.id;
                const longActivity =
                  a.summary.length + a.transcript.length > 600 ||
                  `${a.summary}\n${a.transcript}`.split("\n").length > 12;
                const expanded =
                  editing || focusedActivityId === a.id || expandedActivityIds.includes(a.id);
                const presentation = activityPresentation(a);
                const ActivityIcon = presentation.icon;
                return (
                  <div
                    key={a.id}
                    data-activity-id={a.id}
                    className={`rounded-xl border border-l-[3px] border-border bg-card p-4 shadow-sm ${presentation.borderClass} ${focusedActivityId === a.id ? "activity-focus-flash" : ""}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3
                        className={`flex items-center gap-2.5 text-lg font-semibold tracking-tight sm:text-xl ${presentation.titleClass}`}
                      >
                        <span
                          className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${presentation.badgeClass}`}
                        >
                          <ActivityIcon size={19} strokeWidth={2.2} aria-hidden />
                        </span>
                        {presentation.label}
                      </h3>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        {editing ? (
                          <DateTimePicker
                            key={`${a.id}:${a.occurredAt}`}
                            value={a.occurredAt}
                            disabled={c.status === "duplicate"}
                            onChange={(occurredAt) => mutate(`/activities/${a.id}`, { occurredAt })}
                          />
                        ) : (
                          <span className="mr-1 inline-flex items-center gap-1.5 whitespace-nowrap">
                            <CalendarDays size={14} aria-hidden /> {dateTimeLabel(a.occurredAt)}
                          </span>
                        )}
                        {c.status !== "duplicate" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground hover:text-primary"
                            aria-label={
                              editing ? "Lukk redigering av aktivitet" : "Rediger aktivitet"
                            }
                            title={editing ? "Ferdig" : "Rediger aktivitet"}
                            aria-pressed={editing}
                            onClick={() => setEditingActivityId(editing ? null : a.id)}
                          >
                            {editing ? <Check size={17} /> : <Pencil size={17} />}
                          </Button>
                        )}
                        {editing && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground hover:text-risk"
                            aria-label="Slett aktivitet"
                            title="Slett aktivitet"
                            disabled={busy}
                            onClick={() => setDeletingActivity(a)}
                          >
                            <Trash2 size={16} />
                          </Button>
                        )}
                      </div>
                    </div>
                    {a.kind === "email" &&
                      (() => {
                        const email = data.emailActivities.find((row) => row.activityId === a.id);
                        return email ? (
                          <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
                            <HighlightedText
                              text={`Fra: ${email.fromEmail} · Til: ${email.toEmails.join(", ")}${email.ccEmails.length ? ` · Kopi: ${email.ccEmails.join(", ")}` : ""}\nEmne: ${email.subject || "Uten emne"}`}
                              passage={focusedActivityId === a.id ? focusedPassage : null}
                              query={focusedActivityId === a.id ? focusedQuery : null}
                            />
                          </p>
                        ) : null;
                      })()}
                    {longActivity && !expanded && (
                      <p
                        data-activity-preview
                        className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-foreground"
                        onMouseUp={(event) =>
                          captureActivityQuote(event.currentTarget, a.id, {
                            x: event.clientX,
                            y: event.clientY,
                          })
                        }
                        onTouchEnd={(event) => {
                          const touch = event.changedTouches.item(0);
                          captureTouchQuote(
                            event.currentTarget,
                            a.id,
                            touch ? { x: touch.clientX, y: touch.clientY } : undefined,
                          );
                        }}
                      >
                        {[a.summary, a.transcript]
                          .filter(Boolean)
                          .join("\n")
                          .slice(0, 220)
                          .trimEnd()}
                        <span aria-hidden="true" className="select-none">
                          …
                        </span>
                      </p>
                    )}
                    {longActivity && !editing && focusedActivityId !== a.id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2"
                        aria-expanded={expanded}
                        aria-controls={`activity-content-${a.id}`}
                        onClick={() =>
                          setExpandedActivityIds((current) =>
                            expanded ? current.filter((id) => id !== a.id) : [...current, a.id],
                          )
                        }
                      >
                        <ChevronDown size={15} className={expanded ? "rotate-180" : ""} />
                        {expanded ? "Vis mindre" : "Vis hele aktiviteten"}
                      </Button>
                    )}
                    <div id={`activity-content-${a.id}`} hidden={longActivity && !expanded}>
                      <div
                        onMouseUp={(event) =>
                          captureActivityQuote(event.currentTarget, a.id, {
                            x: event.clientX,
                            y: event.clientY,
                          })
                        }
                        onTouchEnd={(event) => {
                          const touch = event.changedTouches.item(0);
                          captureTouchQuote(
                            event.currentTarget,
                            a.id,
                            touch ? { x: touch.clientX, y: touch.clientY } : undefined,
                          );
                        }}
                        onKeyUp={(event) => {
                          if (
                            event.shiftKey ||
                            ((event.ctrlKey || event.metaKey) && event.key === "a")
                          )
                            captureActivityQuote(event.currentTarget, a.id);
                        }}
                      >
                        <LiveText
                          kind="summary"
                          id={a.id}
                          initialText={a.summary}
                          highlightPassage={focusedActivityId === a.id ? focusedPassage : null}
                          highlightQuery={focusedActivityId === a.id ? focusedQuery : null}
                          disabled={c.status === "duplicate"}
                          readOnly={!editing}
                          className={
                            editing
                              ? "mt-3 min-h-20"
                              : "mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-foreground"
                          }
                        />
                      </div>
                      {a.kind !== "missed_phone" && (editing || !!a.transcript) && (
                        <section className="mt-3">
                          <h4 className="text-sm font-medium">Transkripsjon</h4>
                          <div
                            onMouseUp={(event) =>
                              captureActivityQuote(event.currentTarget, a.id, {
                                x: event.clientX,
                                y: event.clientY,
                              })
                            }
                            onTouchEnd={(event) => {
                              const touch = event.changedTouches.item(0);
                              captureTouchQuote(
                                event.currentTarget,
                                a.id,
                                touch ? { x: touch.clientX, y: touch.clientY } : undefined,
                              );
                            }}
                            onKeyUp={(event) => {
                              if (
                                event.shiftKey ||
                                ((event.ctrlKey || event.metaKey) && event.key === "a")
                              )
                                captureActivityQuote(event.currentTarget, a.id);
                            }}
                          >
                            <LiveText
                              kind="transcript"
                              id={a.id}
                              initialText={a.transcript}
                              highlightPassage={focusedActivityId === a.id ? focusedPassage : null}
                              highlightQuery={focusedActivityId === a.id ? focusedQuery : null}
                              disabled={c.status === "duplicate"}
                              readOnly={!editing}
                              className={
                                editing
                                  ? "mt-2 min-h-40"
                                  : "mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-foreground"
                              }
                            />
                          </div>
                        </section>
                      )}
                      <ActivityAttachments
                        activity={a}
                        files={data.activityFiles.filter((file) => file.activityId === a.id)}
                        mutate={mutate}
                        disabled={c.status === "duplicate" || !editing}
                      />
                    </div>
                  </div>
                );
              })}
              {!timeline.length && (
                <p className="text-sm text-muted-foreground">Ingen aktivitet registrert.</p>
              )}
            </div>
          </Card>
        </div>
        <aside className="space-y-4">
          <Card className="p-4">
            <h2 className="font-semibold">Egenskaper</h2>
            <div className="mt-3 space-y-2">
              <ContactDetailField icon={ListFilter} label="Status" compact>
                <Select
                  value={c.status}
                  className={detailFieldClass}
                  aria-label="Status"
                  onValueChange={(value) => void mutate(`/contacts/${c.id}`, { status: value })}
                  items={statusOptions}
                  disabled={c.status === "duplicate"}
                />
              </ContactDetailField>
              <ContactDetailField icon={UserRound} label="Ansvarlig" compact>
                <Select
                  value={c.assigneeId ?? ""}
                  className={detailFieldClass}
                  aria-label="Ansvarlig"
                  onValueChange={(value) =>
                    void mutate(`/contacts/${c.id}`, { assigneeId: value || null })
                  }
                  items={assigneeOptions(
                    data.members,
                    data.contactAssignees.find((member) => member.userId === c.assigneeId),
                  )}
                  disabled={c.status === "duplicate"}
                />
              </ContactDetailField>
              <ContactDetailField icon={ShieldCheck} label="Ekstern AI" compact>
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox
                    checked={c.allowExternalAi}
                    onCheckedChange={(checked) =>
                      void mutate(`/contacts/${c.id}`, { allowExternalAi: checked })
                    }
                    disabled={c.status === "duplicate"}
                    aria-label="Tillat ekstern AI for kontakt"
                  />
                  {c.allowExternalAi ? "Tillatt" : "Ikke tillatt"}
                </label>
              </ContactDetailField>
            </div>
            <div className="mt-3 flex min-w-0 items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
              <Avatar
                name={creatorName}
                src={profileAvatarUrl(creator?.avatarPath)}
                className="size-5"
              />
              <span className="truncate" title={`Opprettet av ${creatorName}`}>
                Opprettet av {creatorName}
              </span>
            </div>
          </Card>
          {contactLibrary.length > 0 && (
            <Card className="p-4">
              <h2 className="flex items-center gap-2 font-semibold">
                <BookOpen size={16} className="text-primary" /> Sitater ({contactLibrary.length})
              </h2>
              <div className="mt-3 space-y-2">
                {contactLibrary.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="block w-full rounded-xl border border-border p-3 text-left text-sm transition-colors hover:border-primary/30 hover:bg-primary/5"
                    onClick={() =>
                      document
                        .querySelector<HTMLElement>(
                          item.activityId
                            ? `[data-activity-id="${item.activityId}"]`
                            : "[data-note-source]",
                        )
                        ?.scrollIntoView({ behavior: "smooth", block: "center" })
                    }
                  >
                    <span className="block whitespace-pre-wrap break-words">{item.quote}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {item.sourceKind === "note" ? "Notat" : "Aktivitet"}
                      {item.sourceDeleted
                        ? " · Kilde slettet"
                        : item.sourceEdited
                          ? " · Kilde endret"
                          : ""}
                    </span>
                  </button>
                ))}
              </div>
            </Card>
          )}
          {c.status !== "duplicate" && (
            <ContactReminderCard
              contactId={c.id}
              reminders={data.reminders.filter((reminder) => reminder.contactId === c.id)}
              mutate={mutate}
              busy={busy}
              notificationPermission={notificationPermission}
              onEnableNotifications={onEnableNotifications}
            />
          )}
          {c.status !== "duplicate" && (
            <CrossTeamOverlap contactId={c.id} updatedAt={c.updatedAt} />
          )}
          {related.length > 0 && (
            <Card className="p-4">
              <h2 className="font-semibold">{company?.name}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Relaterte kontakter ({related.length})
              </p>
              <div className="mt-3 space-y-1">
                {related.map((x) => (
                  <button
                    key={x.id}
                    className="block w-full rounded-lg px-2 py-1 text-left text-sm hover:bg-muted"
                    onClick={() => onOpen(x.id)}
                  >
                    {x.name}
                  </button>
                ))}
              </div>
            </Card>
          )}
          {c.status !== "duplicate" && !!duplicates.data?.length && (
            <Card className="p-4">
              <h2 className="font-semibold">Mulige duplikater</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Navn + organisasjon, telefon eller e-post.
              </p>
              <div className="mt-3 space-y-2">
                {duplicates.data?.map((x) => (
                  <div key={x.id} className="flex items-center justify-between gap-2 text-sm">
                    <span>{x.name}</span>
                    <Button size="sm" variant="outline" onClick={() => setCompare(x.id)}>
                      Sammenlign
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </aside>
      </div>
      <div className="h-[65vh] min-h-[28rem]" aria-hidden="true" />
      {selectedQuote &&
        createPortal(
          <div
            data-activity-quote-action
            role="toolbar"
            aria-label="Sitat fra aktivitet"
            className="glass-strong fixed z-[80] rounded-xl border border-border p-1 shadow-lg"
            style={{
              left: selectedQuote.x,
              top: selectedQuote.y < 60 ? selectedQuote.y + 12 : selectedQuote.y - 10,
              transform: selectedQuote.y < 60 ? "translateX(-50%)" : "translate(-50%, -100%)",
            }}
          >
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={async () => {
                try {
                  await mutate("/library", {
                    sourceKind: "activity",
                    contactId: c.id,
                    activityId: selectedQuote.activityId,
                    quote: selectedQuote.quote,
                  });
                  setSelectedQuote(null);
                } catch {
                  // The page-level mutation displays the error; keep the action available.
                }
              }}
            >
              <BookOpen size={14} /> Legg til i sitater
            </Button>
          </div>,
          document.body,
        )}
      <Dialog open={!!compare} onOpenChange={(open) => !open && setCompare(null)}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogTitle>Sammenlign kontakter</DialogTitle>
          {compare && (
            <DuplicateCompare
              left={c}
              right={data.contacts.find((x) => x.id === compare)!}
              data={data}
              mutate={mutate}
              onDone={() => {
                setCompare(null);
                onBack();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={!!deletingActivity} onOpenChange={(open) => !open && setDeletingActivity(null)}>
        <DialogContent>
          <DialogTitle>Slett aktivitet?</DialogTitle>
          <DialogDescription>
            {affectedContactNames.length > 1
              ? `Aktiviteten er delt med ${affectedContactNames.join(", ")}. Den slettes fra alle disse kontaktloggene.`
              : `Aktiviteten slettes fra kontaktloggen til ${affectedContactNames[0] ?? c.name}.`}{" "}
            Dette kan ikke angres.
          </DialogDescription>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeletingActivity(null)} disabled={busy}>
              Avbryt
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                if (!deletingActivity) return;
                try {
                  await mutate(`/activities/${deletingActivity.id}/delete`, {});
                  setDeletingActivity(null);
                } catch {
                  // mutate shows the error in the page banner; keep the dialog open.
                }
              }}
            >
              Slett aktivitet
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
