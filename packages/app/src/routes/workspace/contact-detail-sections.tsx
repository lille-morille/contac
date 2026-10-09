import { useQueryClient } from "@tanstack/react-query";
import { BookOpen, FileText, Pencil, Upload, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import { LiveText } from "../../components/live-text.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Card } from "../../components/ui/card.tsx";
import { Checkbox } from "../../components/ui/checkbox.tsx";
import { Textarea } from "../../components/ui/textarea.tsx";
import { ApiError, request, uploadFile } from "../../lib/api.ts";
import { HighlightedText } from "../../lib/search-highlight.tsx";
import { useOrg } from "../../lib/org.tsx";
import {
  dateLabel,
  type Activity,
  type ActivityFile,
  type AdditionalInfo,
  type Contact,
  type Data,
} from "./model.tsx";
export function AdditionalInformation({
  contactId,
  entries,
  contacts,
  onOpen,
  mutate,
  busy,
  disabled,
  focusedPassage,
}: {
  contactId: string;
  entries: AdditionalInfo[];
  contacts: Contact[];
  onOpen: (id: string) => void;
  mutate: <T = unknown>(path: string, body: unknown) => Promise<T>;
  busy: boolean;
  disabled: boolean;
  focusedPassage: string | null;
}) {
  const [editing, setEditing] = useState<{ id: string; draft: string; expected: string } | null>(
    null,
  );
  async function save(entryId: string) {
    if (!editing || editing.id !== entryId || !editing.draft.trim()) return;
    try {
      await mutate(`/contacts/${contactId}/additional-info/${entryId}`, {
        markdown: editing.draft.trim(),
        expected: { markdown: editing.expected },
      });
      setEditing(null);
    } catch {
      // Keep the draft visible; the page-level banner explains the failure.
    }
  }
  if (entries.length === 0) return null;
  return (
    <Card className="p-5" data-additional-info>
      <h2 className="font-semibold">Tilleggsinformasjon</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Informasjon lagt til av en agent eller fra en henvisning. Teamets notat er separat.
      </p>
      {focusedPassage && (
        <p className="mt-3 rounded-xl bg-primary/10 p-3 text-sm">
          <mark className="bg-primary/20">Søketreff: {focusedPassage}</mark>
        </p>
      )}
      <div className="mt-3 space-y-3">
        {entries.map((entry) => {
          const source = contacts.find((item) => item.id === entry.sourceContactId);
          const active = editing?.id === entry.id;
          return (
            <section key={entry.id} className="rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-medium text-muted-foreground">
                  {entry.source === "agent" ? "Lagt til av agent" : "Referert til av"}
                  {entry.source === "referral" && source && (
                    <button
                      type="button"
                      className="ml-1 text-primary underline"
                      onClick={() => onOpen(source.id)}
                    >
                      {source.name}
                    </button>
                  )}
                  {entry.source === "referral" && !source && " · kildekontakt utilgjengelig"}
                </div>
                {!active && !disabled && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setEditing({ id: entry.id, draft: entry.markdown, expected: entry.markdown })
                    }
                  >
                    <Pencil size={14} /> Rediger
                  </Button>
                )}
              </div>
              {active ? (
                <div className="mt-2 space-y-2">
                  {entry.markdown !== editing.expected && (
                    <p className="rounded-lg bg-warn-soft p-2 text-xs">
                      Oppdatert av et annet teammedlem. Avbryt eller kopier utkastet før du prøver
                      igjen.
                    </p>
                  )}
                  <Textarea
                    autoFocus
                    value={editing.draft}
                    onChange={(event) => setEditing({ ...editing, draft: event.target.value })}
                    maxLength={20000}
                    aria-label="Rediger tilleggsinformasjon som Markdown"
                    className="min-h-32"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={busy || !editing.draft.trim()}
                      onClick={() => void save(entry.id)}
                    >
                      Lagre
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
                      Avbryt
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 break-words text-sm leading-6 [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_h1]:font-semibold [&_h2]:font-semibold [&_li]:ml-5 [&_ol]:list-decimal [&_p]:my-2 [&_ul]:list-disc">
                  <ReactMarkdown skipHtml>{entry.markdown}</ReactMarkdown>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </Card>
  );
}
export function StikkordEditor({
  contact,
  mutate,
  busy,
  suggestions,
}: {
  contact: Contact;
  mutate: <T = unknown>(path: string, body: unknown) => Promise<T>;
  busy: boolean;
  suggestions: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(contact.stikkord ?? "");
  const [expected, setExpected] = useState(contact.stikkord);
  const [newer, setNewer] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!editing) {
      setDraft(contact.stikkord ?? "");
      setExpected(contact.stikkord);
    }
  }, [contact.stikkord, editing]);
  async function save() {
    setError("");
    try {
      await mutate(`/contacts/${contact.id}`, {
        stikkord: draft.trim() || null,
        expected: { stikkord: expected },
      });
      setEditing(false);
      setNewer(null);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        const current = cause.details.current as { stikkord?: string | null } | undefined;
        setNewer(current?.stikkord ?? "");
        setExpected(current?.stikkord ?? null);
      } else setError(cause instanceof Error ? cause.message : "Kunne ikke lagre stikkord.");
    }
  }
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Stikkord</h2>
        {!editing && contact.status !== "duplicate" && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Rediger stikkord"
            onClick={() => setEditing(true)}
          >
            <Pencil size={16} />
          </Button>
        )}
      </div>
      {editing ? (
        <div className="mt-3 space-y-2">
          <Textarea
            value={draft}
            maxLength={300}
            rows={3}
            onChange={(event) => setDraft(event.target.value)}
            aria-label="Stikkord"
            placeholder="Korte stikkord om kontakten"
          />
          <p className="text-right text-xs text-muted-foreground">{draft.length}/300</p>
          {newer !== null && (
            <div className="rounded-xl border border-warn bg-warn-soft p-3 text-sm">
              <p className="font-medium">Nyere lagret tekst</p>
              <p className="mt-1 whitespace-pre-wrap">{newer || "(tomt)"}</p>
              <p className="mt-2 text-xs">Utkastet ditt er beholdt. Lagre igjen for å bruke det.</p>
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-risk">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={busy || draft.trim() === (expected ?? "")}
              onClick={() => void save()}
            >
              Lagre
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditing(false);
                setNewer(null);
              }}
            >
              Avbryt
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-3 whitespace-pre-wrap break-words text-sm">
          {contact.stikkord || <span className="text-muted-foreground">Ingen stikkord ennå.</span>}
        </p>
      )}
      {suggestions}
    </Card>
  );
}

export function SharedNote({
  contact,
  mutate,
  focused,
  focusedPassage,
  focusedQuery,
}: {
  contact: Contact;
  mutate: <T = unknown>(path: string, body: unknown) => Promise<T>;
  focused: boolean;
  focusedPassage: string | null;
  focusedQuery: string | null;
}) {
  const qc = useQueryClient();
  const { org } = useOrg();
  const [draftEdit, setDraftEdit] = useState<string | null>(null);
  const draft = draftEdit ?? contact.sharedNote;
  const [baseSavedAt, setBaseSavedAt] = useState(contact.sharedNoteSavedAt);
  const [quote, setQuote] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const saved = !!contact.sharedNoteSavedAt;
  async function save() {
    if (saving || draft === contact.sharedNote || !org) return;
    setSaving(true);
    setSaveError("");
    try {
      const savedNote = await request<Contact>(`/org/contacts/${contact.id}/note`, org.id, {
        text: draft,
        expectedSavedAt: baseSavedAt,
      });
      qc.setQueryData<Pick<Data, "contacts">>(["contact-data", org.id, "core"], (old) =>
        old
          ? {
              ...old,
              contacts: old.contacts.map((row) =>
                row.id === contact.id
                  ? { ...row, ...savedNote, sortUpdatedAt: savedNote.updatedAt }
                  : row,
              ),
            }
          : old,
      );
      setBaseSavedAt(savedNote.sharedNoteSavedAt);
      setDraftEdit(null);
    } catch (cause) {
      if (cause instanceof Error && cause.message.includes("Note changed")) {
        setDraftEdit(null);
        if (cause instanceof ApiError && typeof cause.details.currentText === "string") {
          setBaseSavedAt(
            typeof cause.details.currentSavedAt === "string" ? cause.details.currentSavedAt : null,
          );
          qc.setQueryData<Pick<Data, "contacts">>(["contact-data", org.id, "core"], (old) =>
            old
              ? {
                  ...old,
                  contacts: old.contacts.map((row) =>
                    row.id === contact.id
                      ? {
                          ...row,
                          sharedNote: cause.details.currentText as string,
                          sharedNoteSavedAt: cause.details.currentSavedAt as string | null,
                        }
                      : row,
                  ),
                }
              : old,
          );
        } else {
          void qc.invalidateQueries({ queryKey: ["contact-data", org.id, "core"] });
        }
      } else {
        setSaveError(cause instanceof Error ? cause.message : "Kunne ikke lagre notatet.");
      }
    } finally {
      setSaving(false);
    }
  }
  if (saved)
    return (
      <Card data-note-source className={`p-5 ${focused ? "activity-focus-flash" : ""}`}>
        <h2 className="font-semibold">Notat</h2>
        <p className="text-xs text-muted-foreground">
          Blir ikke inkludert i kontaktloggen eller til AI.
        </p>
        <p className="text-xs text-muted-foreground">Endringer lagres fortløpende for teamet.</p>
        {focusedPassage && (
          <p className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-primary/5 p-3 text-sm">
            <HighlightedText
              text={contact.sharedNote}
              passage={focusedPassage}
              query={focusedQuery}
            />
          </p>
        )}
        <LiveText
          kind="note"
          id={contact.id}
          initialText={contact.sharedNote}
          highlightPassage={focusedPassage}
          highlightQuery={focusedQuery}
          disabled={contact.status === "duplicate"}
          className="mt-3 min-h-28"
          onSelect={(event) => {
            const field = event.currentTarget;
            setQuote(field.value.slice(field.selectionStart, field.selectionEnd).trim());
          }}
        />
        {quote && contact.status !== "duplicate" && (
          <Button
            className="mt-3"
            size="sm"
            variant="secondary"
            onClick={async () => {
              try {
                await mutate("/library", { sourceKind: "note", contactId: contact.id, quote });
                setQuote("");
              } catch {
                /* The page-level mutation displays the error. */
              }
            }}
          >
            <BookOpen size={14} /> Legg til i sitater
          </Button>
        )}
      </Card>
    );
  return (
    <Card data-note-source className={`p-5 ${focused ? "activity-focus-flash" : ""}`}>
      <h2 className="font-semibold">Notat</h2>
      <p className="text-xs text-muted-foreground">
        Blir ikke inkludert i kontaktloggen eller til AI.
      </p>
      <p className="text-xs text-muted-foreground">
        {saved
          ? "Endringer lagres når feltet mister fokus."
          : "Første notat lagres når du trykker Lagre."}
      </p>
      <Textarea
        value={draft}
        onChange={(e) => {
          if (draftEdit === null) setBaseSavedAt(contact.sharedNoteSavedAt);
          setDraftEdit(e.target.value);
        }}
        className="mt-3 min-h-28"
        onBlur={() => {
          if (saved && draft !== contact.sharedNote) void save();
        }}
        onSelect={(event) => {
          const field = event.currentTarget;
          setQuote(field.value.slice(field.selectionStart, field.selectionEnd).trim());
        }}
        disabled={contact.status === "duplicate"}
      />
      {saveError && (
        <p role="alert" className="mt-2 text-xs text-risk">
          {saveError}
        </p>
      )}
      {!saved && contact.status !== "duplicate" && (
        <Button
          className="mt-3"
          size="sm"
          disabled={saving || !draft.trim()}
          onClick={() => void save()}
        >
          Lagre notat
        </Button>
      )}
      {quote && saved && draft === contact.sharedNote && (
        <Button
          className="mt-3"
          size="sm"
          variant="secondary"
          onClick={async () => {
            try {
              await mutate("/library", { sourceKind: "note", contactId: contact.id, quote });
              setQuote("");
            } catch {
              /* The page-level mutation displays the error. */
            }
          }}
        >
          <BookOpen size={14} /> Legg til i sitater
        </Button>
      )}
    </Card>
  );
}
export function ActivityAttachments({
  activity,
  files,
  mutate,
  disabled,
}: {
  activity: Activity;
  files: ActivityFile[];
  mutate: <T = unknown>(path: string, body: unknown) => Promise<T>;
  disabled: boolean;
}) {
  const { org } = useOrg();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  async function attach(file: File | undefined) {
    if (!file || !org) return;
    if (
      !["application/pdf", "image/png", "image/jpeg"].includes(file.type) ||
      file.size > 10 * 1024 * 1024
    ) {
      setError("Velg PDF, PNG eller JPEG på maks 10 MB.");
      return;
    }
    setUploading(true);
    setError("");
    try {
      const uploaded = await uploadFile(org.id, file);
      await mutate(`/activities/${activity.id}/files`, { fileId: uploaded.id });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke laste opp dokumentet.");
    } finally {
      setUploading(false);
    }
  }
  async function open(fileId: string) {
    if (!org) return;
    const preview = window.open("", "_blank");
    try {
      const { url } = await request<{ url: string }>(`/org/files/${fileId}/url`, org.id);
      if (preview) {
        preview.opener = null;
        preview.location.replace(url);
      } else {
        window.location.assign(url);
      }
    } catch (cause) {
      preview?.close();
      setError(cause instanceof Error ? cause.message : "Kunne ikke åpne dokumentet.");
    }
  }
  if (disabled && !files.length && !error) return null;
  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Vedlegg</span>
        {!disabled && (
          <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs hover:bg-muted">
            <Upload size={13} /> {uploading ? "Laster opp …" : "Legg til PDF eller bilde"}
            <input
              type="file"
              accept="application/pdf,image/png,image/jpeg"
              className="sr-only"
              disabled={uploading}
              onChange={(event) => {
                void attach(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-risk">
          {error}
        </p>
      )}
      {files.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {files.map((file) => (
            <div
              key={file.id}
              className="inline-flex items-center gap-1 rounded-lg bg-muted px-2 py-1 text-xs"
            >
              <button
                type="button"
                className="inline-flex items-center gap-1 hover:text-primary"
                onClick={() => void open(file.id)}
              >
                <FileText size={14} /> {file.name}
              </button>
              {!disabled && (
                <button
                  type="button"
                  aria-label={`Fjern ${file.name}`}
                  onClick={() =>
                    void mutate(`/activities/${activity.id}/files/${file.id}/remove`, {})
                  }
                >
                  <X size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
export function DuplicateCompare({
  left,
  right,
  data,
  mutate,
  onDone,
}: {
  left: Contact;
  right: Contact;
  data: Data;
  mutate: <T = unknown>(path: string, body: unknown) => Promise<T>;
  onDone: () => void;
}) {
  const [primaryId, setPrimaryId] = useState(left.id);
  const [fields, setFields] = useState<string[]>([]);
  const [activityIds, setActivityIds] = useState<string[]>([]);
  const primary = primaryId === left.id ? left : right;
  const duplicate = primaryId === left.id ? right : left;
  const sourceActivities = data.activities.filter((a) =>
    data.activityContacts.some(
      (link) => link.activityId === a.id && link.contactId === duplicate.id,
    ),
  );
  const options = ["name", "companyId", "email", "phone", "description"] as const;
  const labels = {
    name: "Navn",
    companyId: "Organisasjon",
    email: "E-post",
    phone: "Telefon",
    description: "Beskrivelse",
  };
  const display = (contact: Contact, field: (typeof options)[number]) =>
    field === "companyId"
      ? (data.companies.find((x) => x.id === contact.companyId)?.name ?? "—")
      : String(contact[field] || "—");
  async function merge() {
    await mutate("/duplicates/merge", {
      primaryId,
      duplicateId: duplicate.id,
      fields,
      activityIds,
    });
    onDone();
  }
  return (
    <div className="mt-4 space-y-4">
      <p className="text-sm text-muted-foreground">
        Velg hvilken kontakt som beholdes. Den andre arkiveres som duplikat. Velg felt og
        aktiviteter som skal flyttes.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {[left, right].map((c) => (
          <button
            key={c.id}
            className={`rounded-xl border p-3 text-left ${primaryId === c.id ? "border-primary bg-primary-soft" : "border-border"}`}
            onClick={() => {
              setPrimaryId(c.id);
              setFields([]);
              setActivityIds([]);
            }}
          >
            <span className="font-medium">{c.name}</span>
            <span className="block text-xs">
              {data.companies.find((x) => x.id === c.companyId)?.name}
            </span>
            <span className="mt-2 block text-xs">
              {primaryId === c.id ? "Beholdes" : "Arkiveres"}
            </span>
          </button>
        ))}
      </div>
      <div className="space-y-1">
        {options.map((field) => (
          <label
            key={field}
            className="grid grid-cols-[1fr_1fr_1fr] items-center gap-2 border-b py-2 text-xs"
          >
            <span className="font-medium">{labels[field]}</span>
            <span className="break-words text-muted-foreground">{display(primary, field)}</span>
            <span className="break-words">
              <Checkbox
                disabled={!duplicate[field]}
                checked={fields.includes(field)}
                onCheckedChange={(checked) =>
                  setFields(checked ? [...fields, field] : fields.filter((x) => x !== field))
                }
                aria-label={`Kopier ${labels[field]} fra duplikatet`}
              />{" "}
              {display(duplicate, field)}{" "}
              {duplicate[field] && (
                <span className="text-muted-foreground">
                  · {primary[field] ? "Erstatt" : "Fyll tomt felt"}
                </span>
              )}
            </span>
          </label>
        ))}
      </div>
      <div>
        <h3 className="font-medium">Aktiviteter på duplikatet</h3>
        {sourceActivities.map((a) => (
          <label key={a.id} className="mt-2 flex gap-2 rounded-lg bg-muted p-2 text-sm">
            <Checkbox
              checked={activityIds.includes(a.id)}
              onCheckedChange={(checked) =>
                setActivityIds(
                  checked ? [...activityIds, a.id] : activityIds.filter((x) => x !== a.id),
                )
              }
              aria-label={`Flytt aktivitet fra ${dateLabel(a.occurredAt)}`}
            />
            <span>
              {dateLabel(a.occurredAt)} · {a.kind} · {a.summary || "Uten sammendrag"}
            </span>
          </label>
        ))}
      </div>
      <Button onClick={() => void merge()} variant="destructive">
        Bekreft duplikat
      </Button>
    </div>
  );
}
