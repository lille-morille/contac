import { useQuery } from "@tanstack/react-query";
import { Dialog as D } from "@base-ui-components/react/dialog";
import { Command } from "cmdk";
import {
  ArrowRight,
  FileText,
  LoaderCircle,
  Search,
  StickyNote,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { request } from "../lib/api.ts";
import type { SearchResult } from "./semantic-search.tsx";

export type PaletteGroup = "actions" | "pages" | "contacts" | "organizations" | "teams";

export type PaletteItem = {
  id: string;
  group: PaletteGroup;
  title: string;
  detail?: string;
  searchText?: string;
  phone?: string | null;
  icon: LucideIcon;
  recent?: boolean;
  run: () => void;
};

const groups: { id: PaletteGroup; label: string }[] = [
  { id: "actions", label: "Handlinger" },
  { id: "pages", label: "Sider" },
  { id: "contacts", label: "Kontakter" },
  { id: "organizations", label: "Organisasjoner" },
  { id: "teams", label: "Team" },
];

function normalized(value: string) {
  return value
    .toLocaleLowerCase("nb-NO")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ø/g, "o")
    .replace(/æ/g, "ae")
    .trim();
}

export function findPhoneMatch(phone: string, query: string): [number, number] | null {
  const queryDigits = query.replace(/\D/g, "");
  if (!queryDigits) return null;
  const positions: number[] = [];
  let digits = "";
  for (let index = 0; index < phone.length; index++) {
    const char = phone[index]!;
    if (!/[0-9]/.test(char)) continue;
    digits += char;
    positions.push(index);
  }
  const start = digits.indexOf(queryDigits);
  if (start < 0) return null;
  return [positions[start]!, positions[start + queryDigits.length - 1]! + 1];
}

export function matchesPaletteItem(
  item: Pick<PaletteItem, "title" | "detail" | "searchText" | "phone">,
  query: string,
) {
  const terms = normalized(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const content = normalized(`${item.title} ${item.detail ?? ""} ${item.searchText ?? ""}`);
  if (terms.every((term) => content.includes(term))) return true;
  if (!item.phone || !findPhoneMatch(item.phone, query)) return false;
  const textTerms = normalized(query.replace(/[\d+().\-/]/g, " "))
    .split(/\s+/)
    .filter(Boolean);
  return textTerms.every((term) => content.includes(term));
}

export function CommandPalette({
  open,
  onOpenChange,
  orgId,
  items,
  onFullSearch,
  onSearchResult,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  items: PaletteItem[];
  onFullSearch: (query: string) => void;
  onSearchResult: (result: SearchResult, query: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const term = search.trim();
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => setDebouncedSearch(term), 300);
    return () => window.clearTimeout(timer);
  }, [open, term]);
  useEffect(() => {
    if (open) return;
    const timer = window.setTimeout(() => {
      setSearch("");
      setDebouncedSearch("");
    }, 220);
    return () => window.clearTimeout(timer);
  }, [open]);
  const semantic = useQuery({
    queryKey: ["semantic-search", orgId, debouncedSearch],
    queryFn: () =>
      request<{ results: SearchResult[]; model: string }>(
        `/org/search?q=${encodeURIComponent(debouncedSearch)}`,
        orgId,
      ),
    enabled: open && debouncedSearch.length >= 2,
  });
  const visible = items.filter((item) =>
    term ? matchesPaletteItem(item, term) : item.group !== "contacts" || item.recent,
  );
  const semanticReady = term.length >= 2 && debouncedSearch === term;
  const semanticResults = semanticReady ? (semantic.data?.results ?? []) : [];

  function setOpen(next: boolean) {
    onOpenChange(next);
  }
  function select(run: () => void) {
    setOpen(false);
    run();
  }

  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Portal>
        <D.Backdrop className="fixed inset-0 z-[80] bg-foreground/40 backdrop-blur-sm transition-opacity duration-200 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 motion-reduce:transition-none" />
        <D.Popup className="glass-strong fixed left-1/2 top-[12vh] z-[80] w-[min(calc(100vw-2rem),44rem)] -translate-x-1/2 overflow-hidden rounded-2xl border border-border shadow-2xl outline-none transition-[opacity,transform] duration-200 ease-out data-[starting-style]:-translate-y-2 data-[starting-style]:scale-[0.97] data-[starting-style]:opacity-0 data-[ending-style]:-translate-y-2 data-[ending-style]:scale-[0.97] data-[ending-style]:opacity-0 motion-reduce:transition-none">
          <D.Title className="sr-only">Søk og kommandoer</D.Title>
          <D.Description className="sr-only">
            Søk etter sider, handlinger, kontakter, organisasjoner og innhold i kontaktloggen.
          </D.Description>
          <Command shouldFilter={false} loop label="Søk og kommandoer" className="min-w-0">
            <div className="flex h-14 items-center gap-3 border-b border-border px-4">
              <Search size={19} className="shrink-0 text-muted-foreground" />
              <Command.Input
                autoFocus
                value={search}
                onValueChange={setSearch}
                aria-label="Søk i Contac"
                placeholder="Søk i kontakter, sider, handlinger og samtaler …"
                className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
              <kbd className="hidden rounded-md border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground sm:inline">
                Esc
              </kbd>
            </div>
            <Command.List className="max-h-[min(62vh,30rem)] min-h-24 overflow-y-auto overscroll-contain p-2 [scroll-padding-block:0.5rem]">
              {groups.map((group) => {
                const groupItems = visible.filter((item) => item.group === group.id);
                if (!groupItems.length) return null;
                return (
                  <Command.Group
                    key={group.id}
                    heading={group.label}
                    className="pb-2 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground"
                  >
                    {groupItems.map((item) => {
                      const Icon = item.icon;
                      const phoneMatch = item.phone ? findPhoneMatch(item.phone, term) : null;
                      return (
                        <Command.Item
                          key={item.id}
                          value={item.id}
                          onSelect={() => select(item.run)}
                          className="flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-sm outline-none data-[selected=true]:bg-primary-soft data-[selected=true]:text-foreground"
                        >
                          <Icon size={17} className="shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{item.title}</span>
                            {item.detail && (
                              <span className="block truncate text-xs text-muted-foreground">
                                {item.detail}
                              </span>
                            )}
                            {item.phone && phoneMatch && (
                              <span className="block truncate text-xs text-muted-foreground">
                                Telefon: {item.phone.slice(0, phoneMatch[0])}
                                <mark className="rounded bg-primary/20 font-medium text-foreground">
                                  {item.phone.slice(...phoneMatch)}
                                </mark>
                                {item.phone.slice(phoneMatch[1])}
                              </span>
                            )}
                          </span>
                          <ArrowRight size={14} className="shrink-0 text-muted-foreground/70" />
                        </Command.Item>
                      );
                    })}
                  </Command.Group>
                );
              })}
              {term.length >= 2 && (
                <Command.Group
                  heading="Samtaler, notater og kontaktinfo"
                  className="pb-2 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground"
                >
                  <Command.Item
                    value="full-search"
                    onSelect={() => select(() => onFullSearch(term))}
                    className="flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 text-sm outline-none data-[selected=true]:bg-primary-soft"
                  >
                    <Search size={17} className="shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 truncate font-medium">
                      Vis alle søkeresultater for «{term}»
                    </span>
                    <ArrowRight size={14} className="shrink-0 text-muted-foreground" />
                  </Command.Item>
                  {(!semanticReady || semantic.isFetching) && (
                    <p className="flex items-center gap-2 px-2.5 py-2 text-xs text-muted-foreground">
                      <LoaderCircle size={14} className="animate-spin" /> Søker lokalt i
                      kontaktloggen …
                    </p>
                  )}
                  {semanticReady && semantic.isError && (
                    <p role="status" className="px-2.5 py-2 text-xs text-risk">
                      Innholdssøket er utilgjengelig. Prøv søkesiden eller søk etter navn.
                    </p>
                  )}
                  {semanticReady &&
                    !semantic.isFetching &&
                    !semantic.isError &&
                    !semanticResults.length && (
                      <p className="px-2.5 py-2 text-xs text-muted-foreground">
                        Ingen innholdstreff. Prøv andre ord eller åpne hele søket.
                      </p>
                    )}
                  {semanticResults.map((result, index) => {
                    const Icon =
                      result.kind === "activity"
                        ? FileText
                        : result.kind === "note"
                          ? StickyNote
                          : UserRound;
                    return (
                      <Command.Item
                        key={`${result.contactId}:${result.activityId}:${index}`}
                        value={`result:${result.contactId}:${result.activityId ?? "contact"}:${index}`}
                        onSelect={() => select(() => onSearchResult(result, term))}
                        className="flex cursor-pointer items-start gap-3 rounded-xl px-2.5 py-2 text-sm outline-none data-[selected=true]:bg-primary-soft"
                      >
                        <Icon size={17} className="mt-0.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">
                            {result.contactName} · {result.companyName}
                            {result.ownerOrgId !== orgId && (
                              <span className="font-normal text-muted-foreground"> · delt</span>
                            )}
                          </span>
                          <span className="block line-clamp-2 text-xs text-muted-foreground">
                            <mark className="rounded bg-primary/10 text-inherit">
                              {result.passage}
                            </mark>
                          </span>
                        </span>
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              )}
              {!visible.length && term.length < 2 && (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Ingen treff. Skriv minst to tegn for å søke i samtaler og notater.
                </p>
              )}
            </Command.List>
            <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
              <span>Semantisk innholdssøk kjøres lokalt</span>
              <span className="hidden sm:inline">↑ ↓ naviger · ↵ åpne · Esc lukk</span>
            </div>
          </Command>
        </D.Popup>
      </D.Portal>
    </D.Root>
  );
}
