import { LayoutGrid } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/button.tsx";
import { DateTimePicker } from "../../components/ui/date-time-picker.tsx";
import { reminderPresetTime, reminderPresets, type Page, type ReminderPreset } from "./model.tsx";
export function ReminderTimeField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [quickSelection, setQuickSelection] = useState<{
    preset: ReminderPreset;
    value: string;
  } | null>(null);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5" aria-label="Hurtigvalg for påminnelse">
        {reminderPresets.map((preset) => (
          <Button
            key={preset.value}
            type="button"
            variant={
              quickSelection?.preset === preset.value && quickSelection.value === value
                ? "secondary"
                : "outline"
            }
            size="sm"
            className="h-7 px-2.5 text-xs"
            aria-pressed={quickSelection?.preset === preset.value && quickSelection.value === value}
            onClick={() => {
              const next = reminderPresetTime(preset.value);
              setQuickSelection({ preset: preset.value, value: next });
              onChange(next);
            }}
          >
            {preset.label}
          </Button>
        ))}
      </div>
      <DateTimePicker value={value} onChange={onChange} ariaLabel="Tidspunkt for påminnelse" />
    </div>
  );
}
export function BrowserNotificationPrompt({
  permission,
  onEnable,
}: {
  permission: NotificationPermission | "unsupported";
  onEnable: () => void;
}) {
  if (permission === "granted")
    return (
      <p className="text-xs text-muted-foreground">
        Nettleservarsler er aktivert mens Contac er åpen.
      </p>
    );
  if (permission === "denied")
    return (
      <p className="text-xs text-muted-foreground">
        Nettleservarsler er blokkert. Du kan tillate dem i nettleserens innstillinger.
      </p>
    );
  if (permission === "unsupported")
    return (
      <p className="text-xs text-muted-foreground">
        Nettleservarsler krever en sikker HTTPS-adresse og en støttet nettleser.
      </p>
    );
  return (
    <div className="space-y-1.5">
      <Button type="button" variant="outline" size="sm" onClick={onEnable}>
        Aktiver nettleservarsler
      </Button>
      <p className="text-xs text-muted-foreground">
        Du får et varsel ved forfall mens Contac er åpen.
      </p>
    </div>
  );
}
export const sidebarSpring = { type: "spring" as const, stiffness: 400, damping: 30 };
export function SidebarActivePill() {
  return (
    <motion.span
      layoutId="sidebar-active-pill"
      transition={sidebarSpring}
      className="sidebar-active-pill absolute inset-0 rounded-xl bg-card shadow-sm"
      aria-hidden
    />
  );
}
export function SidebarTeamName({ name }: { name: string }) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [fit, setFit] = useState({ fontSize: 16, wrap: false });

  useEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;
    let active = true;

    const resize = () => {
      if (!active) return;
      const availableWidth = container.clientWidth - 2;
      const textWidth = measure.getBoundingClientRect().width;
      if (availableWidth <= 0 || textWidth <= 0) return;

      const fittedSize = Math.min(16, Math.floor((16 * availableWidth * 10) / textWidth) / 10);
      const next = { fontSize: Math.max(10, fittedSize), wrap: fittedSize < 10 };
      setFit((current) =>
        current.fontSize === next.fontSize && current.wrap === next.wrap ? current : next,
      );
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    void document.fonts?.ready.then(resize);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [name]);

  return (
    <span ref={containerRef} className="relative min-w-0 flex-1">
      <span
        ref={measureRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute whitespace-nowrap text-[16px] font-semibold"
      >
        {name}
      </span>
      <strong
        className={`block font-semibold leading-tight ${fit.wrap ? "break-words" : "whitespace-nowrap"}`}
        style={{ fontSize: fit.fontSize }}
      >
        {name}
      </strong>
    </span>
  );
}
export function SidebarNavSection({
  title,
  items,
  activeItem,
  onSelect,
}: {
  title: string;
  items: [Page, string, typeof LayoutGrid][];
  activeItem: string;
  onSelect: (page: Page) => void;
}) {
  return (
    <section className="mt-3">
      <h2 className="sr-only">{title}</h2>
      <nav className="space-y-1" aria-label={title}>
        {items.map(([key, label, Icon]) => {
          const active = activeItem === key;
          return (
            <button
              key={key}
              type="button"
              className={`relative flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors ${active ? "font-medium text-foreground" : "text-muted-foreground hover:bg-card/70 hover:text-foreground"}`}
              onClick={() => onSelect(key)}
            >
              {active && <SidebarActivePill />}
              <Icon
                size={17}
                className={`relative z-10 shrink-0 ${active ? "text-primary" : ""}`}
              />
              <span className="relative z-10 truncate">{label}</span>
            </button>
          );
        })}
      </nav>
    </section>
  );
}
