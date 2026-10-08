import { ReportTemplateDownload } from "./report-template-download.tsx";
import { useOrg } from "../lib/org.tsx";
import {
  reportColumnIds,
  reportColumnLabels,
  type ReportColumnId,
  type ReportFormat,
  type ReportSettings,
} from "@contac/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ChevronDown, Copy, Download, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { contactStatusName, type ContactStatus } from "./contact-status.tsx";
import { Button } from "./ui/button.tsx";
import { Card } from "./ui/card.tsx";
import { Checkbox } from "./ui/checkbox.tsx";
import { Input } from "./ui/input.tsx";
import { Textarea } from "./ui/textarea.tsx";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog.tsx";
import { ApiError, downloadOrgFile, readOrgText, request } from "../lib/api.ts";
import { copyHtmlTable, copyText } from "../lib/clipboard.ts";

type PreviewContact = {
  id: string;
  contactNumber: number;
  name: string;
  companyName: string;
  status: ContactStatus;
  assigneeName: string | null;
  email: string | null;
  phone: string | null;
  description: string | null;
  personTags: string[];
  domains: string[];
  stikkord: string | null;
  activityCount: number;
  log: string;
  logEntries: {
    activityId: string;
    kind: "full" | "reference";
    heading: string;
    body: string;
    before: string[];
    summary: string | null;
    after: string[];
  }[];
};
type ExportWorkspace = {
  settings: ReportSettings;
  revision: number;
  contacts: PreviewContact[];
};
type SaveState = "saved" | "pending" | "saving" | "conflict" | "error";

const statusRank: Record<string, number> = {
  kan_kontaktes_igjen: 0,
  avsluttet: 1,
  follow_up: 2,
  venter_pa_svar: 3,
  skal_ringe: 4,
  ikke_kontaktet: 5,
  ikke_kontakt_igjen: 6,
};
const compactCandidates: ReportColumnId[] = [
  "number",
  "name",
  "organization",
  "contactInfo",
  "status",
  "stikkord",
];
const detailColumns = new Set<ReportColumnId>(["description", "stikkord", "log"]);
const columnDescriptions: Partial<Record<ReportColumnId, string>> = {
  number: "Unik ID for hver kontakt, blir brukt til å referere til kontakten i teksten",
  contactInfo: "Mobilnummer og/eller epost",
  stikkord: "Key takeaways fra hele kontakten",
  log: "Full logg med alle aktiviteter (telefonsamtaler, møter, eposter)",
  description: "Én setning om personen. F.eks. stilling/avdeling/ekspertområde",
  personTags: "Tags på personen, som beslutningstaker eller portvokter",
  domains: 'Hvilket domene selskapet tilhører, f.eks. "Fiskeoppdrett"',
};

function ExportSection({ title, children }: { title: string; children: ReactNode }) {
  const [expanded, setExpanded] = useState(true);
  const contentId = useId();
  return (
    <Card>
      <h2>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 rounded-2xl p-5 text-left font-semibold outline-none hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring"
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={() => setExpanded((current) => !current)}
        >
          {title}
          <ChevronDown
            aria-hidden="true"
            className={`size-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "" : "-rotate-90"}`}
          />
        </button>
      </h2>
      <div id={contentId} hidden={!expanded} className="space-y-4 px-5 pb-5">
        {children}
      </div>
    </Card>
  );
}

function layoutColumns(columns: ReportColumnId[]): ReportColumnId[] {
  return [
    ...columns.filter((column) => !detailColumns.has(column)),
    ...columns.filter((column) => detailColumns.has(column)),
  ];
}

function orderContacts(contacts: PreviewContact[], settings: ReportSettings) {
  const manual = new Map(settings.contactOrder.map((id, index) => [id, index]));
  return [...contacts].sort((a, b) => {
    const section = Number(b.activityCount > 0) - Number(a.activityCount > 0);
    if (section) return section;
    if (settings.orderMode === "manual") {
      const aIndex = manual.get(a.id);
      const bIndex = manual.get(b.id);
      if (aIndex !== undefined && bIndex !== undefined) return aIndex - bIndex;
      if (aIndex !== undefined) return -1;
      if (bIndex !== undefined) return 1;
    }
    return (
      (statusRank[a.status] ?? 99) - (statusRank[b.status] ?? 99) ||
      a.name.localeCompare(b.name, "nb") ||
      a.contactNumber - b.contactNumber
    );
  });
}

function previewCell(contact: PreviewContact, column: ReportColumnId): string {
  switch (column) {
    case "number":
      return `K-${contact.contactNumber}`;
    case "assignee":
      return contact.assigneeName ?? "";
    case "organization":
      return contact.companyName;
    case "name":
      return contact.name;
    case "contactInfo":
      return [contact.email, contact.phone].filter(Boolean).join(" · ");
    case "status":
      return contactStatusName(contact.status);
    case "description":
      return contact.description ?? "";
    case "personTags":
      return contact.personTags.join(", ");
    case "domains":
      return contact.domains.join(", ");
    case "stikkord":
      return contact.stikkord ?? "";
    case "log":
      return contact.log;
  }
}

function InlineReportEditor({
  value,
  label,
  field,
  maxLength,
  onSave,
  onRefresh,
}: {
  value: string | null;
  label: string;
  field: "stikkord" | "summary";
  maxLength: number;
  onSave: (next: string, expected: string | null) => Promise<void>;
  onRefresh: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [expected, setExpected] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [remote, setRemote] = useState<string | null | undefined>(undefined);
  const cancelBlurRef = useRef(false);

  useEffect(() => {
    if (editing) return;
    setDraft(value ?? "");
    setExpected(value);
  }, [value, editing]);

  async function save(currentExpected = expected, resolveConflict = false) {
    if (saving || (remote !== undefined && !resolveConflict)) return;
    if (draft === (currentExpected ?? "")) {
      setEditing(false);
      setError("");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(draft, currentExpected);
      setEditing(false);
      setRemote(undefined);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        const current = cause.details.current as Record<string, unknown> | undefined;
        const latest = current?.[field];
        if (typeof latest === "string" || latest === null) {
          setRemote(latest);
          setError("Teksten ble endret av noen andre. Velg hvilken versjon du vil bruke.");
        } else setError(cause.message);
      } else setError(cause instanceof Error ? cause.message : "Kunne ikke lagre teksten.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {editing ? (
        <Textarea
          autoFocus
          aria-label={label}
          value={draft}
          maxLength={maxLength}
          rows={field === "stikkord" ? 3 : 6}
          disabled={saving}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            if (cancelBlurRef.current) {
              cancelBlurRef.current = false;
              return;
            }
            void save();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              cancelBlurRef.current = true;
              setEditing(false);
              setRemote(undefined);
              setError("");
            }
          }}
        />
      ) : (
        <button
          type="button"
          aria-label={`Rediger ${label}`}
          title="Klikk for å redigere"
          className="w-full cursor-text rounded text-left whitespace-pre-wrap break-words hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary"
          onClick={() => {
            cancelBlurRef.current = false;
            setEditing(true);
          }}
        >
          {value || <span className="text-muted-foreground">Klikk for å legge til tekst.</span>}
        </button>
      )}
      {saving && <p className="mt-1 text-xs text-muted-foreground">Lagrer …</p>}
      {error && (
        <p role="alert" className="mt-1 text-xs text-risk">
          {error}
        </p>
      )}
      {remote !== undefined && (
        <div className="mt-2 rounded-lg border border-warn bg-warn-soft p-2 text-xs">
          <p className="font-semibold">Nyere lagret tekst</p>
          <p className="mt-1 whitespace-pre-wrap">{remote || "(tomt)"}</p>
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setDraft(remote ?? "");
                setExpected(remote);
                setRemote(undefined);
                setEditing(false);
                setError("");
                onRefresh();
              }}
            >
              Bruk nyeste
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setRemote(undefined);
                setExpected(remote);
                void save(remote, true);
              }}
            >
              Lagre min tekst
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function PreviewCards({
  contacts,
  columns,
  excluded,
  onMove,
  onToggle,
  onOpen,
  onSaveStikkord,
  onSaveSummary,
  onRefresh,
}: {
  contacts: PreviewContact[];
  columns: ReportColumnId[];
  excluded: Set<string>;
  onMove: (id: string, target: string) => void;
  onToggle: (id: string, include: boolean) => void;
  onOpen: (id: string) => void;
  onSaveStikkord: (id: string, next: string, expected: string | null) => Promise<void>;
  onSaveSummary: (id: string, next: string, expected: string) => Promise<void>;
  onRefresh: () => void;
}) {
  if (!contacts.length) return null;
  return (
    <div className="max-h-[75vh] space-y-3 overflow-y-auto rounded-xl border border-border bg-muted/20 p-3">
      {contacts.map((contact, index) => {
        const previous = contacts[index - 1];
        const next = contacts[index + 1];
        const metadata = columns.filter(
          (column) =>
            column !== "number" &&
            column !== "description" &&
            column !== "stikkord" &&
            column !== "log" &&
            (column === "name" || previewCell(contact, column)),
        );
        const details = columns.filter(
          (column) =>
            (column === "description" || column === "stikkord" || column === "log") &&
            (column === "stikkord" || previewCell(contact, column)),
        );
        return (
          <article key={contact.id} className="rounded-xl border border-border bg-card p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
              <span className="text-xs font-semibold text-primary">{contact.contactNumber}</span>
              <div className="flex items-center gap-1">
                <label className="mr-2 flex cursor-pointer items-center gap-2 text-xs">
                  <Checkbox
                    checked={!excluded.has(contact.id)}
                    aria-label={`Inkluder i loggen: K-${contact.contactNumber} ${contact.name}`}
                    onCheckedChange={(include) => onToggle(contact.id, !!include)}
                  />
                  Inkluder i loggen
                </label>
                <Button size="sm" variant="outline" onClick={() => onOpen(contact.id)}>
                  Åpne
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={!previous}
                  aria-label={`Flytt ${contact.name} opp`}
                  onClick={() => previous && onMove(contact.id, previous.id)}
                >
                  <ArrowUp />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={!next}
                  aria-label={`Flytt ${contact.name} ned`}
                  onClick={() => next && onMove(next.id, contact.id)}
                >
                  <ArrowDown />
                </Button>
              </div>
            </div>
            <div className="grid gap-x-6 gap-y-3 py-3 sm:grid-cols-2">
              {metadata.map((column) => (
                <div key={column} className="min-w-0">
                  <div className="text-xs font-semibold text-primary">
                    {reportColumnLabels[column]}
                  </div>
                  <div className="whitespace-pre-wrap break-words">
                    {previewCell(contact, column) || "—"}
                  </div>
                </div>
              ))}
            </div>
            {details.map((column) => (
              <div key={column} className="mb-2 rounded-lg bg-muted/50 p-3 last:mb-0">
                <div className="mb-1 font-semibold text-primary">{reportColumnLabels[column]}</div>
                {column === "stikkord" ? (
                  <InlineReportEditor
                    value={contact.stikkord}
                    label={`Stikkord for ${contact.name}`}
                    field="stikkord"
                    maxLength={300}
                    onSave={(next, expected) => onSaveStikkord(contact.id, next, expected)}
                    onRefresh={onRefresh}
                  />
                ) : column === "log" && contact.logEntries.length ? (
                  <div className="space-y-3">
                    {contact.logEntries.map((entry, entryIndex) => (
                      <div
                        key={entry.activityId}
                        className={`border-t border-border/70 pt-2 ${entryIndex === 0 ? "border-t-0 pt-0" : ""}`}
                      >
                        <div className="font-semibold text-primary">{entry.heading}</div>
                        {entry.kind === "full" ? (
                          <>
                            {entry.before.map((line, index) => (
                              <div key={index} className="whitespace-pre-wrap break-words">
                                {line}
                              </div>
                            ))}
                            <div className="text-xs font-medium text-muted-foreground">
                              Sammendrag/notater
                            </div>
                            <InlineReportEditor
                              value={entry.summary}
                              label={`Notater for ${entry.heading} hos ${contact.name}`}
                              field="summary"
                              maxLength={20000}
                              onSave={(next, expected) =>
                                onSaveSummary(entry.activityId, next, expected ?? "")
                              }
                              onRefresh={onRefresh}
                            />
                            {entry.after.map((line, index) => (
                              <div key={index} className="whitespace-pre-wrap break-words">
                                {line}
                              </div>
                            ))}
                          </>
                        ) : (
                          <div className="whitespace-pre-wrap break-words">{entry.body}</div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap break-words">
                    {previewCell(contact, column)}
                  </div>
                )}
              </div>
            ))}
          </article>
        );
      })}
    </div>
  );
}

export function ExportPage({
  orgId,
  onOpenContact,
}: {
  orgId: string;
  onOpenContact: (id: string) => void;
}) {
  const { org } = useOrg();
  const queryClient = useQueryClient();
  const workspace = useQuery({
    queryKey: ["report-workspace", orgId],
    queryFn: () => request<ExportWorkspace>("/org/export/workspace", orgId),
  });
  const [draft, setDraft] = useState<ReportSettings | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [working, setWorking] = useState(false);
  const [tableSelected, setTableSelected] = useState(false);
  const [copiedFormat, setCopiedFormat] = useState<"typst" | "latex" | "table" | null>(null);
  const draftRef = useRef<ReportSettings | null>(null);
  const revisionRef = useRef(0);
  const dirtyRef = useRef(false);
  const conflictRef = useRef<ExportWorkspace | null>(null);
  const inFlightRef = useRef<Promise<boolean> | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const incoming = workspace.data;
    if (!incoming || incoming.revision < revisionRef.current) return;
    if (inFlightRef.current) return;
    if (dirtyRef.current) {
      if (incoming.revision > revisionRef.current) {
        conflictRef.current = incoming;
        setSaveState("conflict");
      }
      return;
    }
    draftRef.current = incoming.settings;
    revisionRef.current = incoming.revision;
    setDraft(incoming.settings);
    setSaveState("saved");
  }, [workspace.data]);

  const persist = useCallback(
    async function persistChanges(): Promise<boolean> {
      if (conflictRef.current) return false;
      if (inFlightRef.current) {
        const result = await inFlightRef.current;
        return result && (dirtyRef.current ? persistChanges() : true);
      }
      if (!dirtyRef.current || !draftRef.current) return true;
      const sending = draftRef.current;
      dirtyRef.current = false;
      setSaveState("saving");
      const task = request<{ revision: number; settings: ReportSettings }>(
        "/org/export/settings",
        orgId,
        { expectedRevision: revisionRef.current, settings: sending },
      )
        .then((result) => {
          revisionRef.current = result.revision;
          setSaveState(dirtyRef.current ? "pending" : "saved");
          return true;
        })
        .catch((cause) => {
          dirtyRef.current = true;
          if (cause instanceof ApiError && cause.status === 409) {
            const remote = cause.details as unknown as ExportWorkspace;
            conflictRef.current = remote;
            setSaveState("conflict");
          } else {
            setSaveState("error");
            setError(cause instanceof Error ? cause.message : "Kunne ikke lagre eksportoppsettet.");
          }
          return false;
        });
      const tracked = task.finally(() => {
        if (inFlightRef.current === tracked) inFlightRef.current = null;
      });
      inFlightRef.current = tracked;
      const success = await tracked;
      if (success && dirtyRef.current) return persistChanges();
      if (success) void queryClient.invalidateQueries({ queryKey: ["report-workspace", orgId] });
      return success;
    },
    [orgId, queryClient],
  );

  const scheduleSave = useCallback(
    (next: ReportSettings, immediate = false) => {
      draftRef.current = next;
      dirtyRef.current = true;
      setDraft(next);
      setSaveState(conflictRef.current ? "conflict" : "pending");
      setError("");
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(
        () => {
          timerRef.current = null;
          void persist();
        },
        immediate ? 0 : 400,
      );
    },
    [persist],
  );

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      if (dirtyRef.current && !conflictRef.current) void persist();
    },
    [persist],
  );

  async function flushSave() {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    if (!(await persist())) throw new Error("Lagre eksportoppsettet før du eksporterer.");
  }
  async function act(action: () => Promise<void>, success: string) {
    setWorking(true);
    setError("");
    setMessage("");
    try {
      await flushSave();
      await action();
      setMessage(success);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Eksporten mislyktes.");
    } finally {
      setWorking(false);
    }
  }
  function update(change: (current: ReportSettings) => ReportSettings, immediate = false) {
    if (draftRef.current) scheduleSave(change(draftRef.current), immediate);
  }
  function moveContact(id: string, target: string) {
    if (!draft || id === target) return;
    const ids = ordered.map((contact) => contact.id);
    const from = ids.indexOf(id);
    const to = ids.indexOf(target);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1);
    ids.splice(to, 0, id);
    update((current) => ({ ...current, orderMode: "manual", contactOrder: ids }), true);
  }
  function toggleContact(id: string, include: boolean) {
    update(
      (current) => ({
        ...current,
        excludedContactIds: include
          ? current.excludedContactIds.filter((value) => value !== id)
          : [...current.excludedContactIds, id],
      }),
      true,
    );
  }
  function moveColumn(column: ReportColumnId, direction: -1 | 1) {
    update((current) => {
      const columns = layoutColumns(current.columns);
      const index = columns.indexOf(column);
      const target = index + direction;
      if (
        index < 0 ||
        target < 1 ||
        target >= columns.length ||
        detailColumns.has(column) !== detailColumns.has(columns[target]!)
      )
        return current;
      [columns[index], columns[target]] = [columns[target]!, columns[index]!];
      return { ...current, columns };
    }, true);
  }

  async function refreshContactData() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["report-workspace", orgId] }),
      queryClient.invalidateQueries({ queryKey: ["contact-data", orgId] }),
    ]);
  }
  async function saveStikkord(id: string, next: string, expected: string | null) {
    await request(`/org/contacts/${id}`, orgId, {
      stikkord: next.trim() || null,
      expected: { stikkord: expected },
    });
    await refreshContactData();
  }
  async function saveSummary(id: string, next: string, expected: string) {
    await request(`/org/activities/${id}`, orgId, {
      summary: next,
      expected: { summary: expected },
    });
    await refreshContactData();
  }

  const ordered = draft && workspace.data ? orderContacts(workspace.data.contacts, draft) : [];
  const excluded = new Set(draft?.excludedContactIds ?? []);
  const included = ordered.filter((contact) => !excluded.has(contact.id));
  const visible = ordered.filter((contact) =>
    `${contact.name} ${contact.companyName} ${contact.contactNumber} ${contact.log}`
      .toLocaleLowerCase("nb")
      .includes(search.toLocaleLowerCase("nb")),
  );
  const visibleActive = visible.filter((contact) => contact.activityCount > 0);
  const visibleInactive = visible.filter((contact) => contact.activityCount === 0);
  const compactColumns =
    draft?.columns.filter((column) => compactCandidates.includes(column)) ?? [];
  const formatLabels: Record<ReportFormat, { label: string; extension: string }> = {
    typst: { label: "Typst", extension: "typ" },
    latex: { label: "LaTeX", extension: "tex" },
    csv: { label: "CSV", extension: "csv" },
  };

  if (workspace.isError)
    return (
      <p role="alert" className="text-risk">
        Kunne ikke laste eksportoppsettet.
      </p>
    );
  if (workspace.isPending || !draft)
    return <div className="p-5 text-sm text-muted-foreground">Laster eksportoppsett …</div>;
  const format = draft.format;
  const extension = formatLabels[format].extension;
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Eksport</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Oppsettet deles av teamet og lagres automatisk. Hver eksport bruker de nyeste
          kontaktdataene.
        </p>
      </header>
      <ExportSection title="Eksport og rapport">
        <div
          className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
          role="group"
          aria-label="Eksportformat"
        >
          {(["typst", "latex", "csv"] as ReportFormat[]).map((choice) => (
            <Button
              key={choice}
              className="h-auto min-h-16 flex-col items-start gap-1 px-4 py-3 text-left"
              variant={!tableSelected && choice === format ? "default" : "outline"}
              aria-pressed={!tableSelected && choice === format}
              onClick={() => {
                setTableSelected(false);
                update((current) => ({ ...current, format: choice }), true);
              }}
            >
              <span>{formatLabels[choice].label}</span>
              <span className="text-xs font-normal opacity-75">
                {choice === "csv"
                  ? "Kan lastes opp i Google Sheets"
                  : "Last ned eller kopier kildekoden"}
              </span>
            </Button>
          ))}
          <Button
            className="h-auto min-h-16 flex-col items-start gap-1 px-4 py-3 text-left"
            variant={tableSelected ? "default" : "outline"}
            aria-pressed={tableSelected}
            onClick={() => setTableSelected(true)}
          >
            <span>Kopier som tabell</span>
            <span className="text-xs font-normal opacity-75">Lim inn i Google Docs eller Word</span>
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {!tableSelected && (
            <Button
              disabled={working || included.length === 0}
              onClick={() =>
                void act(
                  () =>
                    downloadOrgFile(
                      orgId,
                      `/org/export/file?format=${format}`,
                      `kontaktlogg.${extension}`,
                    ),
                  `Kontaktloggen er lastet ned som .${extension}.`,
                )
              }
            >
              <Download /> Last ned som .{extension}-fil
            </Button>
          )}
          {(tableSelected || format !== "csv") && (
            <Button
              variant={tableSelected ? "default" : "outline"}
              disabled={working || included.length === 0}
              onClick={() =>
                void act(async () => {
                  if (tableSelected) {
                    const [html, csv] = await Promise.all([
                      readOrgText(orgId, "/org/export/file?format=html"),
                      readOrgText(orgId, "/org/export/file?format=csv"),
                    ]);
                    await copyHtmlTable(html, csv);
                    setCopiedFormat("table");
                  } else if (format !== "csv") {
                    await copyText(await readOrgText(orgId, `/org/export/file?format=${format}`));
                    setCopiedFormat(format);
                  }
                }, "Kontaktloggen er kopiert.")
              }
            >
              <Copy /> {tableSelected ? "Kopier tabell" : "Kopier til utklippstavle"}
            </Button>
          )}
        </div>
        <p role="status" className="text-xs text-muted-foreground">
          {saveState === "saved"
            ? "Alle endringer er lagret"
            : saveState === "saving"
              ? "Lagrer …"
              : saveState === "pending"
                ? "Endringer venter på lagring …"
                : saveState === "conflict"
                  ? "Teamet endret oppsettet samtidig."
                  : "Lagring mislyktes."}
        </p>
        {saveState === "conflict" && (
          <div className="flex flex-wrap gap-2 rounded-xl bg-warn-soft p-3 text-sm">
            <span className="w-full">
              Velg hvilken versjon som skal brukes. Dine endringer er bevart her.
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const remote = conflictRef.current;
                if (!remote) return;
                draftRef.current = remote.settings;
                revisionRef.current = remote.revision;
                dirtyRef.current = false;
                conflictRef.current = null;
                setDraft(remote.settings);
                setSaveState("saved");
              }}
            >
              Last inn teamets versjon
            </Button>
            <Button
              size="sm"
              onClick={() => {
                const remote = conflictRef.current;
                if (!remote) return;
                revisionRef.current = remote.revision;
                conflictRef.current = null;
                dirtyRef.current = true;
                void persist();
              }}
            >
              Lagre mine endringer
            </Button>
          </div>
        )}
        {saveState === "error" && (
          <Button size="sm" variant="outline" onClick={() => void persist()}>
            Prøv lagring igjen
          </Button>
        )}
        {message && (
          <p role="status" className="text-sm">
            {message}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-risk">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <ReportTemplateDownload key={orgId} teamId={orgId} teamName={org?.name ?? ""} />
          <Button
            variant="outline"
            disabled={working}
            onClick={() =>
              void act(
                () => downloadOrgFile(orgId, "/org/export/signed-lois.zip", "signerte-loier.zip"),
                "Signerte LOI-er er lastet ned.",
              )
            }
          >
            <Download /> Last ned signerte LOI-er
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Pakk ut signerte LOI-er i rapportens prosjektmappe for å legge alle sider til som vedlegg.
        </p>
      </ExportSection>
      <div className="space-y-5">
        <ExportSection title="Innhold og kolonner">
          <label className="block text-sm font-medium">
            Tittel
            <Input
              className="mt-1"
              value={draft.title}
              onChange={(event) => update((current) => ({ ...current, title: event.target.value }))}
              onBlur={() => void persist()}
            />
          </label>
          <label className="block text-sm font-medium">
            Undertittel
            <Input
              className="mt-1"
              value={draft.subtitle}
              onChange={(event) =>
                update((current) => ({ ...current, subtitle: event.target.value }))
              }
              onBlur={() => void persist()}
            />
          </label>
          <div className="space-y-1">
            {[
              ...layoutColumns(draft.columns),
              ...reportColumnIds.filter((column) => !draft.columns.includes(column)),
            ].map((column) => {
              const selected = draft.columns.includes(column);
              const required = column === "number" || column === "name";
              const shownColumns = layoutColumns(draft.columns);
              const index = shownColumns.indexOf(column);
              const previous = shownColumns[index - 1];
              const next = shownColumns[index + 1];
              return (
                <div
                  key={column}
                  className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-muted/40"
                >
                  <Checkbox
                    checked={selected}
                    disabled={required}
                    aria-label={`Vis ${reportColumnLabels[column]}`}
                    onCheckedChange={(checked) =>
                      update(
                        (current) => ({
                          ...current,
                          columns: layoutColumns(
                            checked
                              ? [...current.columns, column]
                              : current.columns.filter((value) => value !== column),
                          ),
                        }),
                        true,
                      )
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <span className="text-sm">{reportColumnLabels[column]}</span>
                    {columnDescriptions[column] && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {columnDescriptions[column]}
                      </p>
                    )}
                  </div>
                  {selected && (
                    <>
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={
                          index <= 1 || detailColumns.has(previous!) !== detailColumns.has(column)
                        }
                        aria-label={`Flytt ${reportColumnLabels[column]} opp`}
                        onClick={() => moveColumn(column, -1)}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={!next || detailColumns.has(next) !== detailColumns.has(column)}
                        aria-label={`Flytt ${reportColumnLabels[column]} ned`}
                        onClick={() => moveColumn(column, 1)}
                      >
                        <ArrowDown />
                      </Button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </ExportSection>
        <ExportSection title="Kontakter og relevans">
          <p className="text-xs text-muted-foreground">
            Hele loggen vises i kontaktkortene. Bla nedover for å se alle oppføringer.
          </p>
          <Input
            aria-label="Søk etter kontakt i eksportoppsettet"
            placeholder="Søk etter navn, selskap, nummer eller logginnhold"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {included.length} av {ordered.length} kontakter er med
            </span>
            <div className="flex flex-wrap gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  update(
                    (current) => ({
                      ...current,
                      excludedContactIds: [],
                    }),
                    true,
                  )
                }
              >
                Ta med alle
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  update(
                    (current) => ({
                      ...current,
                      excludedContactIds: ordered.map((contact) => contact.id),
                    }),
                    true,
                  )
                }
              >
                Fjern alle
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  update(
                    (current) => ({
                      ...current,
                      orderMode: "default",
                      contactOrder: [],
                    }),
                    true,
                  )
                }
              >
                <RotateCcw /> Tilbakestill rekkefølge
              </Button>
            </div>
          </div>
          {visibleActive.length > 0 && (
            <PreviewCards
              contacts={visibleActive}
              columns={draft.columns}
              excluded={excluded}
              onMove={moveContact}
              onToggle={toggleContact}
              onOpen={onOpenContact}
              onSaveStikkord={saveStikkord}
              onSaveSummary={saveSummary}
              onRefresh={() => void refreshContactData()}
            />
          )}
          {visibleInactive.length > 0 && (
            <>
              <h3 className="font-semibold">Uten aktivitet</h3>
              <PreviewCards
                contacts={visibleInactive}
                columns={compactColumns}
                excluded={excluded}
                onMove={moveContact}
                onToggle={toggleContact}
                onOpen={onOpenContact}
                onSaveStikkord={saveStikkord}
                onSaveSummary={saveSummary}
                onRefresh={() => void refreshContactData()}
              />
            </>
          )}
          {visible.length === 0 && (
            <p className="text-sm text-muted-foreground">Ingen kontakter funnet.</p>
          )}
          {included.length === 0 && (
            <p className="text-sm text-muted-foreground">Velg minst én kontakt.</p>
          )}
        </ExportSection>
      </div>
      <Dialog open={copiedFormat !== null} onOpenChange={(open) => !open && setCopiedFormat(null)}>
        <DialogContent>
          <DialogTitle>
            {copiedFormat === "table" ? "Tabellen er kopiert" : "Kontaktloggen er kopiert"}
          </DialogTitle>
          <DialogDescription>
            {copiedFormat === "table"
              ? "Slik limer du tabellen inn i dokumentet ditt."
              : `Slik bruker du den kopierte ${copiedFormat === "typst" ? "Typst" : "LaTeX"}-koden.`}
          </DialogDescription>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm">
            {copiedFormat === "table" ? (
              <>
                <li>Åpne dokumentet i Google Docs eller Word.</li>
                <li>Plasser markøren der kontaktloggen skal stå.</li>
                <li>
                  Lim inn med ⌘V på Mac eller Ctrl+V på Windows. Behold formateringen for å få en
                  tabell.
                </li>
              </>
            ) : copiedFormat === "typst" ? (
              <>
                <li>
                  Opprett eller åpne filen <code>kontaktlogg.typ</code> i Typst-prosjektet ditt.
                </li>
                <li>Lim inn koden med ⌘V på Mac eller Ctrl+V på Windows, og lagre filen.</li>
                <li>
                  Legg til <code>#include "kontaktlogg.typ"</code> der kontaktloggen skal vises i
                  rapporten, eller kompiler filen alene.
                </li>
              </>
            ) : (
              <>
                <li>
                  Opprett en ny <code>kontaktlogg.tex</code>-fil i LaTeX eller Overleaf.
                </li>
                <li>Lim inn koden med ⌘V på Mac eller Ctrl+V på Windows, og lagre filen.</li>
                <li>
                  Kompiler filen som et eget dokument. PDF-en kan deretter legges ved rapporten.
                </li>
              </>
            )}
          </ol>
          <Button className="mt-5" onClick={() => setCopiedFormat(null)}>
            Ferdig
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
