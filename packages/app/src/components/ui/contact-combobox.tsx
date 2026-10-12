import { Command } from "cmdk";
import { Check, ChevronsUpDown, UserRound, X } from "lucide-react";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "./popover.tsx";

type Option = { id: string; name: string };

export function ContactCombobox({
  contacts,
  value,
  onChange,
}: {
  contacts: Option[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = contacts.find((contact) => contact.id === value);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
      }}
    >
      <PopoverTrigger
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-label="Kontakt (valgfritt)"
        className="mt-1 flex h-9 w-full items-center gap-2 rounded-xl border border-input bg-card px-3.5 text-left text-sm transition-colors hover:border-primary/25 focus-visible:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <UserRound className="size-4 shrink-0 text-muted-foreground" />
        <span className={`min-w-0 flex-1 truncate ${selected ? "" : "text-muted-foreground"}`}>
          {selected?.name ?? "Ingen kontakt"}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(20rem,calc(100vw-2rem))] p-1.5"
        positionerClassName="z-[60]"
      >
        <Command loop label="Søk etter kontakt">
          <Command.Input
            autoFocus
            value={search}
            onValueChange={setSearch}
            placeholder="Søk etter kontakt…"
            className="h-9 w-full border-b border-border bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground"
          />
          <Command.List className="max-h-60 overflow-y-auto p-1">
            <Command.Empty className="px-2 py-3 text-sm text-muted-foreground">
              Ingen kontakter funnet.
            </Command.Empty>
            <Command.Item
              value="Ingen kontakt"
              onSelect={() => {
                onChange("");
                setOpen(false);
              }}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm outline-none data-[selected=true]:bg-primary-soft"
            >
              <X className="size-4 text-muted-foreground" />
              <span className="flex-1">Ingen kontakt</span>
              {!value && <Check className="size-4 text-primary" />}
            </Command.Item>
            {contacts.map((contact) => (
              <Command.Item
                key={contact.id}
                value={`${contact.name} ${contact.id}`}
                keywords={[contact.name]}
                onSelect={() => {
                  onChange(contact.id);
                  setOpen(false);
                }}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm outline-none data-[selected=true]:bg-primary-soft"
              >
                <UserRound className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{contact.name}</span>
                {value === contact.id && <Check className="size-4 shrink-0 text-primary" />}
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
