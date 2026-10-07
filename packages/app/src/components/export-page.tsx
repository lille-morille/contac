import { ReportTemplateDownload } from "./report-template-download.tsx";
import { useOrg } from "../lib/org.tsx";
import {
  reportColumnIds,
  reportColumnLabels,
  type ReportColumnId,
  type ReportFormat,
  type ReportSettings,
} from "@contac/core";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Download, GripVertical, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { contactStatusName, type ContactStatus } from "./contact-status.tsx";
import { Button } from "./ui/button.tsx";
import { Card } from "./ui/card.tsx";
import { Checkbox } from "./ui/checkbox.tsx";
import { Input } from "./ui/input.tsx";
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
  logExcerpt: string;
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
      return contact.logExcerpt;
  }
}

function PreviewTable({
  contacts,
  columns,
}: {
  contacts: PreviewContact[];
  columns: ReportColumnId[];
}) {
  if (!contacts.length) return null;
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="min-w-full border-collapse text-left text-sm">
        <thead className="bg-primary text-primary-foreground">
          <tr>
            {columns.map((column) => (
              <th
                key={column}
                className="min-w-28 border-r border-primary-foreground/20 px-3 py-2 font-semibold last:border-r-0"
              >
                {reportColumnLabels[column]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {contacts.map((contact, index) => (
            <tr key={contact.id} className={index % 2 ? "bg-muted/40" : "bg-card"}>
              {columns.map((column) => (
                <td
                  key={column}
                  className="max-w-80 border-r border-t border-border px-3 py-2 align-top last:border-r-0"
                >
                  <span className="block max-h-24 overflow-hidden whitespace-pre-wrap break-words">
                    {previewCell(contact, column) || "—"}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ExportPage({ orgId }: { orgId: string }) {
  const { org } = useOrg();
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
  const [draggingId, setDraggingId] = useState<string | null>(null);
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
      return success;
    },
    [orgId],
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
  function moveColumn(column: ReportColumnId, direction: -1 | 1) {
    update((current) => {
      const columns = [...current.columns];
      const index = columns.indexOf(column);
      const target = index + direction;
      if (index < 0 || target < 1 || target >= columns.length) return current;
      [columns[index], columns[target]] = [columns[target]!, columns[index]!];
      return { ...current, columns };
    }, true);
  }

  const ordered = draft && workspace.data ? orderContacts(workspace.data.contacts, draft) : [];
  const excluded = new Set(draft?.excludedContactIds ?? []);
  const included = ordered.filter((contact) => !excluded.has(contact.id));
  const active = included.filter((contact) => contact.activityCount > 0);
  const inactive = included.filter((contact) => contact.activityCount === 0);
  const visible = ordered.filter((contact) =>
    `${contact.name} ${contact.companyName} ${contact.contactNumber}`
      .toLocaleLowerCase("nb")
      .includes(search.toLocaleLowerCase("nb")),
  );
  const compactColumns =
    draft?.columns.filter((column) => compactCandidates.includes(column)) ?? [];
  const formatLabels: Record<ReportFormat, { label: string; extension: string }> = {
    typst: { label: "Typst", extension: "typ" },
    latex: { label: "LaTeX", extension: "tex" },
    csv: { label: "CSV (kan lastes opp i Google Sheets)", extension: "csv" },
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
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Eksportformat">
          {(["typst", "latex", "csv"] as ReportFormat[]).map((choice) => (
            <Button
              key={choice}
              variant={choice === format ? "default" : "outline"}
              aria-pressed={choice === format}
              onClick={() => update((current) => ({ ...current, format: choice }), true)}
            >
              {formatLabels[choice].label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
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
          <Button
            variant="outline"
            disabled={working || included.length === 0}
            onClick={() =>
              void act(
                async () => copyText(await readOrgText(orgId, `/org/export/file?format=${format}`)),
                "Kontaktloggen er kopiert.",
              )
            }
          >
            Kopier til utklippstavle
          </Button>
          <Button
            variant="outline"
            disabled={working || included.length === 0}
            onClick={() =>
              void act(
                async () =>
                  copyHtmlTable(
                    await readOrgText(orgId, "/org/export/file?format=html"),
                    await readOrgText(orgId, "/org/export/file?format=csv"),
                  ),
                "Tabellen er kopiert for innliming i Google Docs.",
              )
            }
          >
            Kopier som tabell
          </Button>
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
      </Card>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <Card className="space-y-4 p-5">
          <h2 className="font-semibold">Kontakter og relevans</h2>
          <Input
            aria-label="Søk etter kontakt i eksportoppsettet"
            placeholder="Søk etter navn, selskap eller nummer"
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
          <div className="max-h-[32rem] space-y-1 overflow-y-auto pr-1">
            {visible.map((contact) => {
              const index = ordered.findIndex((item) => item.id === contact.id);
              const section = contact.activityCount > 0;
              const previous = ordered
                .slice(0, index)
                .reverse()
                .find((item) => item.activityCount > 0 === section);
              const next = ordered
                .slice(index + 1)
                .find((item) => item.activityCount > 0 === section);
              const checked = !draft.excludedContactIds.includes(contact.id);
              return (
                <div
                  key={contact.id}
                  draggable
                  onDragStart={() => setDraggingId(contact.id)}
                  onDragEnd={() => setDraggingId(null)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (
                      draggingId &&
                      (ordered.find((item) => item.id === draggingId)?.activityCount ?? 0) > 0 ===
                        section
                    )
                      moveContact(draggingId, contact.id);
                    setDraggingId(null);
                  }}
                  className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2"
                >
                  <GripVertical size={16} className="shrink-0 text-muted-foreground" aria-hidden />
                  <Checkbox
                    checked={checked}
                    aria-label={`Ta med K-${contact.contactNumber} ${contact.name}`}
                    onCheckedChange={(include) =>
                      update(
                        (current) => ({
                          ...current,
                          excludedContactIds: include
                            ? current.excludedContactIds.filter((id) => id !== contact.id)
                            : [...current.excludedContactIds, contact.id],
                        }),
                        true,
                      )
                    }
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      K-{contact.contactNumber} · {contact.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {contact.companyName} · {contactStatusName(contact.status)} ·{" "}
                      {contact.activityCount} aktiviteter
                    </span>
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={!previous}
                    aria-label={`Flytt ${contact.name} opp`}
                    onClick={() => previous && moveContact(contact.id, previous.id)}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={!next}
                    aria-label={`Flytt ${contact.name} ned`}
                    onClick={() => next && moveContact(next.id, contact.id)}
                  >
                    <ArrowDown />
                  </Button>
                </div>
              );
            })}
          </div>
          {visible.length === 0 && (
            <p className="text-sm text-muted-foreground">Ingen kontakter funnet.</p>
          )}
        </Card>
        <Card className="space-y-4 p-5">
          <h2 className="font-semibold">Innhold og kolonner</h2>
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
          <p className="text-xs text-muted-foreground">
            Nr. og Kontaktperson er alltid med. Kolonner kan flyttes med pilene.
          </p>
          <div className="space-y-1">
            {[
              ...draft.columns,
              ...reportColumnIds.filter((column) => !draft.columns.includes(column)),
            ].map((column) => {
              const selected = draft.columns.includes(column);
              const required = column === "number" || column === "name";
              const index = draft.columns.indexOf(column);
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
                          columns: checked
                            ? [...current.columns, column]
                            : current.columns.filter((value) => value !== column),
                        }),
                        true,
                      )
                    }
                  />
                  <span className="min-w-0 flex-1 text-sm">{reportColumnLabels[column]}</span>
                  {selected && (
                    <>
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={index <= 1}
                        aria-label={`Flytt ${reportColumnLabels[column]} opp`}
                        onClick={() => moveColumn(column, -1)}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={index < 1 || index >= draft.columns.length - 1}
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
        </Card>
      </div>
      <Card className="space-y-4 p-5">
        <div>
          <h2 className="font-semibold">Forhåndsvisning</h2>
          <p className="text-xs text-muted-foreground">
            Loggen er forkortet her. Eksporten inneholder hele teksten.
          </p>
        </div>
        {active.length > 0 && <PreviewTable contacts={active} columns={draft.columns} />}
        {inactive.length > 0 && (
          <>
            <h3 className="font-semibold">Uten aktivitet</h3>
            <PreviewTable contacts={inactive} columns={compactColumns} />
          </>
        )}
        {included.length === 0 && (
          <p className="text-sm text-muted-foreground">Velg minst én kontakt.</p>
        )}
      </Card>
      <Card className="space-y-3 p-5">
        <h2 className="font-semibold">Rapportverktøy</h2>
        <p className="text-sm text-muted-foreground">
          Last ned en mal, og erstatt <code>kontaktlogg.typ</code> med Typst-eksporten ovenfor.
          Sitater bruker permanente kontaktnumre, for eksempel <code>#cite-contact(12)</code>. Pakk
          ut signerte LOI-er i prosjektmappen for å legge alle sider til som vedlegg.
        </p>
        <div className="flex flex-wrap gap-2">
          <ReportTemplateDownload key={orgId} teamId={orgId} teamName={org?.name ?? ""} />
          <Button
            variant="outline"
            onClick={() =>
              void act(
                () => downloadOrgFile(orgId, "/org/export/signed-lois.zip", "signerte-loier.zip"),
                "Signerte LOI-er er lastet ned.",
              )
            }
          >
            Last ned signerte LOI-er
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              void act(
                async () => copyText(await readOrgText(orgId, "/org/export/contact-log.yaml")),
                "Den fullstendige YAML-kontaktloggen er kopiert.",
              )
            }
          >
            Kopier fullstendig YAML
          </Button>
        </div>
      </Card>
    </div>
  );
}
