import { Popover, PopoverContent, PopoverTrigger } from "./popover.tsx";
import { Checkbox } from "./checkbox.tsx";
import { Input } from "./input.tsx";
import { ChevronDown, X } from "lucide-react";
import { useState, type ReactNode } from "react";

export type MultiSelectOption = { value: string; label: string; icon?: ReactNode };

export function MultiSelect({
  label,
  icon,
  value,
  options,
  onChange,
  className = "",
  positionerClassName,
  emptyLabel = "Alle",
}: {
  label: string;
  icon: ReactNode;
  value: string[];
  options: MultiSelectOption[];
  onChange: (value: string[]) => void;
  className?: string;
  positionerClassName?: string;
  emptyLabel?: string;
}) {
  const [search, setSearch] = useState("");
  const shown = options.filter((option) =>
    option.label.toLocaleLowerCase("nb-NO").includes(search.toLocaleLowerCase("nb-NO")),
  );
  const selectedLabel =
    value.length === 0
      ? emptyLabel
      : value.length === 1
        ? (options.find((option) => option.value === value[0])?.label ?? "1 valgt")
        : `${value.length} valgt`;
  return (
    <Popover>
      <PopoverTrigger
        className={`flex h-9 items-center gap-2 rounded-xl border border-input bg-card px-3 text-sm transition-colors hover:border-primary/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${className}`}
        aria-label={`Filtrer ${label.toLocaleLowerCase("nb-NO")}: ${selectedLabel}`}
      >
        <span className="shrink-0 text-muted-foreground">{icon}</span>
        <span className="shrink-0 font-medium">{label}:</span>
        <span className="min-w-0 truncate text-muted-foreground">{selectedLabel}</span>
        <ChevronDown size={14} className="ml-auto shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" positionerClassName={positionerClassName}>
        <div className="flex items-center justify-between gap-2 px-1 pb-2">
          <strong className="text-sm">{label}</strong>
          {value.length > 0 && (
            <button
              type="button"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => onChange([])}
            >
              <X size={12} /> Nullstill
            </button>
          )}
        </div>
        {options.length > 8 && (
          <Input
            className="mb-2 h-8"
            placeholder={`Søk i ${label.toLocaleLowerCase("nb-NO")} …`}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        )}
        <div className="max-h-64 space-y-0.5 overflow-y-auto">
          {shown.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted"
            >
              <Checkbox
                checked={value.includes(option.value)}
                onCheckedChange={(checked) =>
                  onChange(
                    checked
                      ? [...value, option.value]
                      : value.filter((selected) => selected !== option.value),
                  )
                }
                aria-label={option.label}
              />
              {option.icon && <span className="shrink-0">{option.icon}</span>}
              <span className="truncate">{option.label}</span>
            </label>
          ))}
          {shown.length === 0 && (
            <p className="px-2 py-3 text-sm text-muted-foreground">Ingen treff</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
