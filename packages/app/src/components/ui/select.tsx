import { Select as S } from "@base-ui-components/react/select";
import { Check, ChevronDown } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { cn } from "../../lib/utils.ts";

export type SelectOption = {
  value: string;
  label: string;
  /** Optional leading visual (icon tile, <Avatar/> for user options, …). */
  icon?: ReactNode;
  /** Render a divider above this option (e.g. destructive actions at the end). */
  separatorBefore?: boolean;
  /** Extra item classes (e.g. risk tint for destructive options). */
  className?: string;
};

/**
 * Custom select on Base UI (contract: never the native picker). Options are
 * passed as data (`items`) so the trigger can mirror the selected option's
 * icon — user selects show the member's avatar on the left.
 */
export function Select({
  value,
  onValueChange,
  items,
  placeholder,
  className,
  positionerClassName,
  id,
  disabled,
  iconOnly = false,
  "aria-label": ariaLabel,
}: {
  value: string;
  onValueChange: (value: string) => void;
  items: SelectOption[];
  /** Shown muted in the trigger when the selected option has an empty label. */
  placeholder?: string;
  className?: string;
  positionerClassName?: string;
  id?: string;
  disabled?: boolean;
  iconOnly?: boolean;
  "aria-label"?: string;
}) {
  const selected = items.find((o) => o.value === value);
  const label = selected?.label || placeholder;
  return (
    <S.Root value={value} onValueChange={(v) => onValueChange(v ?? "")} disabled={disabled}>
      <S.Trigger
        id={id}
        aria-label={ariaLabel}
        title={iconOnly ? label : undefined}
        className={cn(
          "group/select-trigger flex h-9 w-full cursor-pointer items-center gap-2 rounded-xl border border-input bg-card pl-3.5 pr-2.5 text-sm transition-[color,border-color,box-shadow] duration-150 ease-out hover:border-primary/25 focus-visible:outline-none data-[popup-open]:border-primary/40 data-[popup-open]:ring-2 data-[popup-open]:ring-ring/40 focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring/50 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
          iconOnly && "size-9 justify-center gap-0 p-0",
          className,
        )}
      >
        {selected?.icon ? <span className="shrink-0">{selected.icon}</span> : null}
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-left",
            iconOnly && "sr-only",
            !selected?.label && "text-muted-foreground",
          )}
        >
          {label}
        </span>
        {!iconOnly && (
          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out group-data-[popup-open]/select-trigger:rotate-180" />
        )}
      </S.Trigger>
      <S.Portal>
        {/* z-[60]: selects must layer above dialogs (z-50). */}
        <S.Positioner
          sideOffset={6}
          alignItemWithTrigger={false}
          className={cn("z-[60]", positionerClassName)}
        >
          {/* Grows out of the trigger (--transform-origin) with a gentle spring
              overshoot on open, snappy on close — and its options cascade in
              (see select-item-in in styles.css). docs/11-design-language.md. */}
          <S.Popup className="glass-strong max-h-[min(var(--available-height),18rem)] min-w-[var(--anchor-width)] origin-[var(--transform-origin)] overflow-y-auto overscroll-contain rounded-2xl p-1.5 outline-none transition-[transform,opacity] duration-[230ms] ease-[cubic-bezier(0.34,1.35,0.5,1)] will-change-[transform,opacity] data-[starting-style]:scale-[0.92] data-[starting-style]:opacity-0 data-[ending-style]:scale-[0.96] data-[ending-style]:opacity-0 data-[ending-style]:duration-[130ms] data-[ending-style]:ease-[cubic-bezier(0.4,0,1,1)]">
            {items.map((o, i) => (
              <Fragment key={o.value}>
                {o.separatorBefore ? (
                  <div role="separator" className="mx-1.5 my-1.5 h-px bg-border" />
                ) : null}
                <S.Item
                  value={o.value}
                  // Per-item stagger: each option starts a touch after the last,
                  // capped so long lists never feel sluggish. The popup's own
                  // exit transition fades the cascade out on close.
                  style={{ animationDelay: `${40 + Math.min(i, 7) * 24}ms` }}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm outline-none select-none transition-colors duration-100 data-[highlighted]:bg-primary-soft motion-safe:animate-[select-item-in_260ms_cubic-bezier(0.16,1,0.3,1)_both]",
                    o.className,
                  )}
                >
                  {o.icon ? <span className="shrink-0">{o.icon}</span> : null}
                  <S.ItemText className="min-w-0 flex-1 truncate">{o.label}</S.ItemText>
                  <S.ItemIndicator className="ml-auto">
                    <Check className="size-4 text-primary" />
                  </S.ItemIndicator>
                </S.Item>
              </Fragment>
            ))}
          </S.Popup>
        </S.Positioner>
      </S.Portal>
    </S.Root>
  );
}
