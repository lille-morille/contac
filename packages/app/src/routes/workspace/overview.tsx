import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Badge } from "../../components/ui/badge.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Card } from "../../components/ui/card.tsx";
import { Input } from "../../components/ui/input.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../components/ui/tooltip.tsx";
import { request } from "../../lib/api.ts";
import { copyText } from "../../lib/clipboard.ts";
import { typstQuoteSnippet } from "../../lib/typst-citation.ts";
import { useOrg } from "../../lib/org.tsx";
import { dateTimeLabel, type Company, type Contact, type LibraryItem } from "./model.tsx";
export function NoTeam() {
  const state = useOrg();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  async function create(e: FormEvent) {
    e.preventDefault();
    try {
      await request("/organizations", undefined, { name });
      await state.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }
  return (
    <main className="mx-auto grid min-h-screen max-w-md place-content-center gap-4 p-5">
      <h1 className="text-2xl font-semibold">Velkommen, {state.user?.name}</h1>
      {state.classSpace?.role === "admin" ? (
        <form className="space-y-3" onSubmit={(e) => void create(e)}>
          <p>Opprett klassens første team.</p>
          <Input
            required
            placeholder="Teamnavn"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit">Opprett team</Button>
        </form>
      ) : (
        <p>Åpne invitasjonslenken fra teamet for å bli med.</p>
      )}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
    </main>
  );
}
export function ContactCategorySelector({
  page,
  hasDuplicates,
  hasDeleted,
  onChange,
}: {
  page: "contacts" | "duplicates" | "deleted";
  hasDuplicates: boolean;
  hasDeleted: boolean;
  onChange: (page: "contacts" | "duplicates" | "deleted") => void;
}) {
  const categories = [
    { page: "contacts", label: "Aktive", disabled: false, tooltip: "" },
    {
      page: "duplicates",
      label: "Duplikate",
      disabled: !hasDuplicates,
      tooltip: "Det finnes ingen duplikate kontakter",
    },
    {
      page: "deleted",
      label: "Slettede",
      disabled: !hasDeleted,
      tooltip: "Det finnes ingen slettede kontakter",
    },
  ] as const;
  return (
    <TooltipProvider>
      <div
        role="group"
        aria-label="Kontaktkategori"
        className="ml-auto inline-flex items-center rounded-xl border border-border bg-muted p-0.5"
      >
        {categories.map((category) => {
          const button = (
            <button
              type="button"
              disabled={category.disabled}
              aria-pressed={page === category.page}
              onClick={() => onChange(category.page)}
              className={`inline-flex h-8 items-center rounded-[10px] px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 ${page === category.page ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {category.label}
            </button>
          );
          return category.disabled ? (
            <Tooltip key={category.page}>
              <TooltipTrigger
                render={
                  <span
                    tabIndex={0}
                    aria-label={category.tooltip}
                    className="inline-flex rounded-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  />
                }
              >
                {button}
              </TooltipTrigger>
              <TooltipContent side="bottom">{category.tooltip}</TooltipContent>
            </Tooltip>
          ) : (
            <span key={category.page} className="inline-flex">
              {button}
            </span>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

export function DeletedContactsPage({
  contacts,
  companies,
  loading,
  busy,
  onOpen,
  onRestore,
}: {
  contacts: Contact[];
  companies: Company[];
  loading: boolean;
  busy: boolean;
  onOpen: (id: string) => void;
  onRestore: (id: string) => void;
}) {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold">Slettede kontakter</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Gjenoppretting tar med kontaktens tidligere felter og samtaler.
      </p>
      {loading && <p className="mt-6 text-sm text-muted-foreground">Laster …</p>}
      {!loading && !contacts.length && (
        <p className="mt-6 rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
          Ingen slettede kontakter.
        </p>
      )}
      <div className="mt-5 space-y-2">
        {contacts.map((contact) => (
          <div
            key={contact.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-card"
          >
            <button
              type="button"
              className="min-w-0 text-left hover:text-primary"
              onClick={() => onOpen(contact.id)}
            >
              <span className="block font-medium">{contact.name}</span>
              <span className="block text-xs text-muted-foreground">
                {companies.find((company) => company.id === contact.companyId)?.name ??
                  "Organisasjon ukjent"}
                {contact.deletedAt ? ` · Slettet ${dateTimeLabel(contact.deletedAt)}` : ""}
              </span>
            </button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => onRestore(contact.id)}
            >
              Gjenopprett
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LibraryPage({
  onOpen,
  initialSearch,
  onSearchChange,
}: {
  onOpen: (contactId: string, activityId: string | null) => void;
  initialSearch: string;
  onSearchChange: (value: string) => void;
}) {
  const { org } = useOrg();
  const qc = useQueryClient();
  const [search, setSearch] = useState(initialSearch);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const library = useQuery({
    queryKey: ["library", org?.id],
    queryFn: () => request<LibraryItem[]>("/org/library", org!.id),
    enabled: !!org,
    refetchInterval: 60_000,
  });
  const entries = (library.data ?? []).filter((item) =>
    `${item.quote} ${item.contactName ?? ""}`
      .toLocaleLowerCase("nb-NO")
      .includes(search.toLocaleLowerCase("nb-NO")),
  );
  async function remove(id: string) {
    if (!org) return;
    const key = ["library", org.id];
    await qc.cancelQueries({ queryKey: key });
    const previous = qc.getQueryData<LibraryItem[]>(key);
    qc.setQueryData<LibraryItem[]>(key, (current) => current?.filter((item) => item.id !== id));
    try {
      await request(`/org/library/${id}/delete`, org.id, {});
    } catch (cause) {
      qc.setQueryData(key, previous);
      void qc.invalidateQueries({ queryKey: key });
      setError(cause instanceof Error ? cause.message : "Kunne ikke fjerne sitatet.");
    }
  }
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="sr-only">Sitater</h1>
      <Input
        className="max-w-sm"
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
          onSearchChange(event.target.value);
        }}
        placeholder="Søk i sitater …"
        aria-label="Søk i sitater"
      />
      {error && (
        <p role="alert" className="mt-3 text-sm text-risk">
          {error}
        </p>
      )}
      {library.isLoading ? (
        <p className="mt-6 text-sm text-muted-foreground">Laster sitater …</p>
      ) : entries.length ? (
        <div className="mt-5 columns-1 gap-3 sm:columns-2 xl:columns-3">
          {entries.map((item) => (
            <Card key={item.id} className="mb-3 break-inside-avoid p-5">
              <blockquote className="whitespace-pre-wrap border-l-2 border-primary pl-3 text-sm leading-relaxed">
                {item.quote}
              </blockquote>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>
                  {item.sourceKind === "note" ? "Notat" : "Aktivitet"} ·{" "}
                  {item.contactName ?? "Slettet kontakt"}
                </span>
                {item.sourceDeleted ? (
                  <Badge variant="neutral">Kilden er slettet</Badge>
                ) : item.sourceEdited ? (
                  <Badge variant="neutral">Endret etter lagring</Badge>
                ) : null}
              </div>
              <div className="mt-4 flex gap-2">
                {!item.sourceDeleted && item.contactId && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onOpen(item.contactId!, item.activityId)}
                  >
                    Åpne kilde
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => void remove(item.id)}>
                  Fjern sitat
                </Button>
              </div>
              <Button
                className="mt-2"
                size="sm"
                variant="outline"
                disabled={item.sourceDeleted || !item.contactId || !item.contactNumber}
                title={
                  item.sourceDeleted || !item.contactId || !item.contactNumber
                    ? "Kilden eller kontaktnummeret er ikke tilgjengelig"
                    : undefined
                }
                onClick={() => {
                  if (!item.contactId || !item.contactNumber) return;
                  void copyText(
                    typstQuoteSnippet({
                      quote: item.quote,
                      contactNumbers: [item.contactNumber],
                      contactId: item.contactId,
                      activityId: item.activityId,
                      libraryId: item.id,
                    }),
                  ).then(
                    () => setCopiedId(item.id),
                    () => setError("Kunne ikke kopiere Typst-sitatet."),
                  );
                }}
              >
                {copiedId === item.id ? "Typst-sitat kopiert" : "Kopier Typst-sitat"}
              </Button>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="mt-5 p-8 text-center text-sm text-muted-foreground">
          Ingen sitater ennå. Marker tekst i en aktivitet eller et notat og velg «Legg til i
          sitater».
        </Card>
      )}
      <p className="mt-4 text-xs text-muted-foreground">
        Notatsitater forblir utenfor AI-sammendrag.
      </p>
    </div>
  );
}
