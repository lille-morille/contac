import { ChevronDown, Users, X, type LucideIcon } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ContactStatusBadge } from "../../components/contact-status.tsx";
import { type ReferralPrefill } from "../../components/contact-ai-panel.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Checkbox } from "../../components/ui/checkbox.tsx";
import { Input } from "../../components/ui/input.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover.tsx";
import { Select } from "../../components/ui/select.tsx";
import {
  assigneeOptions,
  statusOptions,
  type Activity,
  type Contact,
  type Data,
} from "./model.tsx";
export function CreateContact({
  data,
  referral,
  mutate,
  onCreated,
  busy,
}: {
  data: Data;
  referral: ReferralPrefill | null;
  mutate: <T = unknown>(path: string, body: unknown) => Promise<T>;
  onCreated: (id: string, openDetail: boolean) => void;
  busy: boolean;
}) {
  const [name, setName] = useState(referral?.name ?? "");
  const [companyText, setCompanyText] = useState(referral?.companyName ?? "");
  const [companyId, setCompanyId] = useState(
    data.companies.find(
      (company) =>
        company.name.trim().toLocaleLowerCase("nb-NO") ===
        referral?.companyName.trim().toLocaleLowerCase("nb-NO"),
    )?.id ?? "",
  );
  const [email, setEmail] = useState(referral?.email ?? "");
  const [phone, setPhone] = useState(referral?.phone ?? "");
  const companies = data.companies
    .filter((c) =>
      c.name.toLocaleLowerCase("nb-NO").includes(companyText.toLocaleLowerCase("nb-NO")),
    )
    .slice(0, 8);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter;
    const openDetail = submitter instanceof HTMLButtonElement && submitter.value === "open";
    const row = await mutate<{ id: string }>("/contacts", {
      name,
      companyId: companyId || undefined,
      companyName: companyId ? undefined : companyText,
      email: email || null,
      phone: phone || null,
      referralSuggestionId: referral?.id,
    });
    onCreated(row.id, openDetail);
  }
  return (
    <form className="mt-4 space-y-3" onSubmit={(e) => void submit(e)}>
      <label className="block text-sm">
        Navn *<Input autoFocus required value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="block text-sm">
        Organisasjon *
        <Input
          required
          value={companyText}
          onChange={(e) => {
            setCompanyText(e.target.value);
            setCompanyId("");
          }}
          placeholder="Søk eller opprett"
        />
      </label>
      {!!companyText && !companyId && (
        <div className="max-h-32 overflow-y-auto rounded-xl border bg-card p-1">
          {companies.map((company) => (
            <button
              key={company.id}
              type="button"
              className="block w-full rounded-lg px-2 py-1 text-left text-sm hover:bg-muted"
              onClick={() => {
                setCompanyId(company.id);
                setCompanyText(company.name);
              }}
            >
              {company.name}
            </button>
          ))}
          <p className="px-2 py-1 text-xs text-muted-foreground">
            Ingen treff? «{companyText}» opprettes når du lagrer.
          </p>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          E-post
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="text-sm">
          Telefon
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          type="submit"
          name="createAction"
          value="stay"
          disabled={busy || !name.trim() || !companyText.trim()}
        >
          Legg til
        </Button>
        <Button
          type="submit"
          name="createAction"
          value="open"
          variant="outline"
          disabled={busy || !name.trim() || !companyText.trim()}
        >
          Legg til og åpne
        </Button>
      </div>
    </form>
  );
}
export function InlineText({
  value,
  onSave,
  className = "",
  disabled = false,
  ariaLabel,
  maxLength,
}: {
  value: string | null;
  onSave: (next: string, expected: string | null) => void;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
  maxLength?: number;
}) {
  const [draft, setDraft] = useState(value ?? "");
  const [focused, setFocused] = useState(false);
  const base = useRef(value);
  const counterId = useId();
  const overLimit = maxLength !== undefined && draft.length > maxLength;
  useEffect(() => {
    if (!focused && !overLimit) setDraft(value ?? "");
  }, [value, focused, overLimit]);
  return (
    <div>
      <Input
        value={draft}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-describedby={maxLength === undefined ? undefined : counterId}
        aria-invalid={overLimit || undefined}
        className={`border-transparent bg-transparent hover:bg-card focus:bg-card ${className}`}
        onFocus={() => {
          base.current = value;
          setFocused(true);
        }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(e) => {
          setFocused(false);
          if (
            !disabled &&
            (maxLength === undefined || e.target.value.length <= maxLength) &&
            e.target.value !== (base.current ?? "")
          )
            onSave(e.target.value, base.current);
        }}
      />
      {maxLength !== undefined && (
        <p
          id={counterId}
          className={`px-1 text-right text-xs ${overLimit ? "text-destructive" : "text-muted-foreground"}`}
          aria-live={overLimit ? "polite" : "off"}
        >
          {draft.length}/{maxLength} tegn{overLimit ? " · Kort ned før du lagrer" : ""}
        </p>
      )}
    </div>
  );
}
export const detailFieldClass =
  "h-8 min-w-0 border-transparent bg-transparent px-1 shadow-none hover:border-transparent hover:bg-muted/40 focus:border-transparent focus:bg-muted/40 focus-visible:border-transparent focus-visible:ring-0 focus-visible:ring-offset-0 data-[popup-open]:border-transparent data-[popup-open]:ring-0";
export function ContactDetailField({
  icon: Icon,
  label,
  children,
  compact = false,
  className = "",
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`grid min-h-12 min-w-0 items-center gap-2 rounded-xl border border-border bg-card px-3 py-1.5 transition-colors hover:border-primary/25 focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-ring/30 ${compact ? "grid-cols-[16px_64px_minmax(0,1fr)]" : "grid-cols-[18px_104px_minmax(0,1fr)]"} ${className}`}
    >
      <Icon size={compact ? 15 : 16} className="text-muted-foreground" aria-hidden />
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="min-w-0 text-sm">{children}</div>
    </div>
  );
}
export function ContactList({
  rows,
  data,
  mutate,
  onOpen,
  lastActivity,
  highlightId,
}: {
  rows: Contact[];
  data: Data;
  mutate: <T = unknown>(path: string, body: unknown) => Promise<T>;
  onOpen: (id: string) => void;
  lastActivity: (id: string, includeMissed?: boolean) => Activity | undefined;
  highlightId: string | null;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const assignees = assigneeOptions(data.members);
  const tagNames = new Map(data.personTags.map((tag) => [tag.id, tag.name]));
  return (
    <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-card shadow-card">
      <table className="w-full min-w-[850px] text-left text-sm">
        <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th className="w-[28%] px-4 py-3 font-medium">Kontakt</th>
            <th className="w-48 px-3 py-3 font-medium">Ansvarlig</th>
            <th className="w-52 px-3 py-3 font-medium">Status</th>
            <th className="w-[27%] px-3 py-3 font-medium">Key takeaways / siste samtale</th>
            <th className="w-44 px-3 py-3 font-medium">Tagger</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const company = data.companies.find((item) => item.id === c.companyId);
            const summary = c.stikkord || lastActivity(c.id)?.summary || "";
            const tags = data.contactPersonTags
              .filter((link) => link.contactId === c.id)
              .flatMap((link) => {
                const name = tagNames.get(link.tagId);
                return name ? [{ id: link.tagId, name }] : [];
              });
            return (
              <tr
                key={c.id}
                data-contact-item={c.id}
                className={`border-b border-border/70 align-top last:border-b-0 hover:bg-primary/5 focus-within:bg-primary/8 ${highlightId === c.id ? "new-contact-flash" : ""}`}
              >
                <td className="px-4 py-3">
                  <button
                    type="button"
                    aria-label={`Åpne kontakt: ${c.name}`}
                    className="block w-full rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    onClick={() => onOpen(c.id)}
                  >
                    <span className="block font-medium text-foreground">{c.name}</span>
                    {company && (
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {company.name}
                      </span>
                    )}
                    {c.description && (
                      <span className="mt-1 block line-clamp-2 text-xs leading-5 text-muted-foreground">
                        {c.description}
                      </span>
                    )}
                  </button>
                </td>
                <td className="px-3 py-3">
                  <Select
                    value={c.assigneeId ?? ""}
                    aria-label={`Ansvarlig for ${c.name}`}
                    onValueChange={(assigneeId) =>
                      void mutate(`/contacts/${c.id}`, { assigneeId: assigneeId || null })
                    }
                    items={assignees}
                    disabled={c.status === "duplicate"}
                  />
                </td>
                <td className="px-3 py-3">
                  {c.status === "duplicate" ? (
                    <ContactStatusBadge status="duplicate" />
                  ) : (
                    <Select
                      value={c.status}
                      aria-label={`Status for ${c.name}`}
                      onValueChange={(status) => void mutate(`/contacts/${c.id}`, { status })}
                      items={statusOptions}
                    />
                  )}
                </td>
                <td className="px-3 py-3">
                  {summary ? (
                    <button
                      type="button"
                      aria-expanded={expanded === c.id}
                      className={`w-full rounded-lg text-left leading-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${expanded === c.id ? "" : "line-clamp-2"}`}
                      onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                    >
                      {summary}
                    </button>
                  ) : (
                    <span className="text-muted-foreground">Ingen samtale registrert</span>
                  )}
                </td>
                <td className="px-3 py-3">
                  {tags.length ? (
                    <ul className="flex flex-wrap gap-1.5" aria-label={`Tagger for ${c.name}`}>
                      {tags.map((tag) => (
                        <li key={tag.id} className="rounded-full bg-muted px-2 py-0.5 text-xs">
                          {tag.name}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-muted-foreground">Ingen</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && (
        <p className="p-6 text-center text-sm text-muted-foreground">Ingen kontakter her ennå.</p>
      )}
    </div>
  );
}
export function ConversationParticipantsPicker({
  people,
  selectedIds,
  onChange,
}: {
  people: Contact[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const term = search.trim().toLocaleLowerCase("nb-NO");
  const shown = people.filter((person) =>
    `${person.name} ${person.description ?? ""} ${person.email ?? ""}`
      .toLocaleLowerCase("nb-NO")
      .includes(term),
  );
  return (
    <div className="space-y-2">
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) setSearch("");
        }}
      >
        <PopoverTrigger
          type="button"
          className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm transition-colors hover:border-primary/25 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          aria-label="Er andre med i samtalen?"
        >
          <Users size={16} className="text-muted-foreground" />
          Er andre med i samtalen?
          {selectedIds.length > 0 && (
            <span className="rounded-full bg-primary-soft px-1.5 py-0.5 text-xs text-primary">
              {selectedIds.length}
            </span>
          )}
          <ChevronDown size={14} className="text-muted-foreground" />
        </PopoverTrigger>
        <PopoverContent className="w-72 p-2">
          <p className="px-1 pb-2 text-xs text-muted-foreground">Personer i samme organisasjon</p>
          <Input
            autoFocus
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.preventDefault();
            }}
            placeholder="Søk etter person …"
            aria-label="Søk etter andre deltakere"
          />
          <div className="mt-2 max-h-60 space-y-0.5 overflow-y-auto">
            {shown.map((person) => (
              <label
                key={person.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted"
              >
                <Checkbox
                  checked={selectedIds.includes(person.id)}
                  onCheckedChange={(checked) =>
                    onChange(
                      checked
                        ? [...selectedIds, person.id]
                        : selectedIds.filter((id) => id !== person.id),
                    )
                  }
                  aria-label={person.name}
                />
                <span className="min-w-0">
                  <span className="block truncate">{person.name}</span>
                  {person.description && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {person.description}
                    </span>
                  )}
                </span>
              </label>
            ))}
            {shown.length === 0 && (
              <p className="px-2 py-3 text-xs text-muted-foreground">
                {people.length === 0 ? "Ingen andre kontakter i organisasjonen." : "Ingen treff."}
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedIds.map((id) => {
            const person = people.find((candidate) => candidate.id === id);
            return person ? (
              <button
                key={id}
                type="button"
                className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-1 text-xs text-primary hover:bg-primary-soft/70"
                aria-label={`Fjern ${person.name} fra samtalen`}
                onClick={() => onChange(selectedIds.filter((selectedId) => selectedId !== id))}
              >
                {person.name}
                <X size={12} />
              </button>
            ) : null;
          })}
        </div>
      )}
    </div>
  );
}
export function CallTimer({ startedAt }: { startedAt: string }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const tick = () => setSeconds(Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);
  return (
    <p className="text-xs text-primary">
      Pågår · {String(Math.floor(seconds / 60)).padStart(2, "0")}:
      {String(seconds % 60).padStart(2, "0")}
    </p>
  );
}
