import { Autocomplete as A } from "@base-ui-components/react/autocomplete";
import { Check, ChevronDown, UserRound } from "lucide-react";
import { useState } from "react";

export function FreeTextCombobox({
  id,
  value,
  onChange,
  options,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  disabled?: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const names = [...new Set(options.map((name) => name.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "nb"),
  );

  return (
    <A.Root
      items={names}
      openOnInputClick
      value={value}
      onValueChange={(next) => {
        setShowAll(false);
        onChange(next);
      }}
      onOpenChange={(open) => setShowAll(open)}
      filter={(name, query) =>
        showAll || name.toLocaleLowerCase("nb-NO").includes(query.toLocaleLowerCase("nb-NO"))
      }
      disabled={disabled}
    >
      <div className="mt-1 flex h-9 w-full items-center rounded-xl border border-input bg-card transition-[border-color,box-shadow] hover:border-primary/25 focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-ring/50 has-[:disabled]:opacity-50">
        <A.Input
          id={id}
          placeholder="Velg eller skriv navn"
          className="h-full min-w-0 flex-1 bg-transparent px-3.5 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
        />
        <A.Trigger
          type="button"
          aria-label="Vis navneforslag"
          className="flex h-full w-9 shrink-0 cursor-pointer items-center justify-center text-muted-foreground outline-none focus-visible:text-primary disabled:cursor-not-allowed"
        >
          <ChevronDown className="size-4" />
        </A.Trigger>
      </div>
      <A.Portal>
        <A.Positioner sideOffset={6} align="start" className="z-[60]">
          <A.Popup className="glass-strong max-h-[min(var(--available-height),18rem)] min-w-[var(--anchor-width)] overflow-y-auto rounded-2xl p-1.5 text-sm outline-none transition-[transform,opacity] duration-150 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0">
            <A.Empty className="px-2.5 py-2 text-xs text-muted-foreground">
              Ingen treff. Du kan skrive navnet selv.
            </A.Empty>
            <A.List>
              {(name: string) => (
                <A.Item
                  key={name}
                  value={name}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none transition-colors data-[highlighted]:bg-primary-soft"
                >
                  <UserRound size={15} className="shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{name}</span>
                  {name === value && <Check size={15} className="shrink-0 text-primary" />}
                </A.Item>
              )}
            </A.List>
          </A.Popup>
        </A.Positioner>
      </A.Portal>
    </A.Root>
  );
}
