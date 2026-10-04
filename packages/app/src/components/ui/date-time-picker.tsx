import { CalendarDays, ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import { useState } from "react";
import { Button } from "./button.tsx";
import { Input } from "./input.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "./popover.tsx";

const weekdays = ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"];
const dateTimeFormat = new Intl.DateTimeFormat("nb-NO", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const monthFormat = new Intl.DateTimeFormat("nb-NO", { month: "long", year: "numeric" });
const dayFormat = new Intl.DateTimeFormat("nb-NO", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function DateTimePicker({
  value,
  onChange,
  disabled = false,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => Promise<unknown> | void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => new Date(value));
  const [viewMonth, setViewMonth] = useState(() => {
    const date = new Date(value);
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });
  const [hour, setHour] = useState(() => String(new Date(value).getHours()).padStart(2, "0"));
  const [minute, setMinute] = useState(() => String(new Date(value).getMinutes()).padStart(2, "0"));
  const [today, setToday] = useState(() => new Date());
  const [saving, setSaving] = useState(false);
  const selected = new Date(value);
  const firstWeekday = (viewMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
  const changeMonth = (offset: number) =>
    setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + offset, 1));
  const validTime =
    /^\d{1,2}$/.test(hour) &&
    Number(hour) <= 23 &&
    /^\d{1,2}$/.test(minute) &&
    Number(minute) <= 59;

  async function save() {
    if (!validTime) return;
    const next = new Date(
      draft.getFullYear(),
      draft.getMonth(),
      draft.getDate(),
      Number(hour),
      Number(minute),
    );
    if (Math.floor(next.getTime() / 60000) === Math.floor(selected.getTime() / 60000)) {
      setOpen(false);
      return;
    }
    setSaving(true);
    try {
      await onChange(next.toISOString());
      setOpen(false);
    } catch {
      // The caller reports the request error; leave the picker open for retry.
    } finally {
      setSaving(false);
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          const date = new Date(value);
          setDraft(date);
          setViewMonth(new Date(date.getFullYear(), date.getMonth(), 1));
          setHour(String(date.getHours()).padStart(2, "0"));
          setMinute(String(date.getMinutes()).padStart(2, "0"));
          setToday(new Date());
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger
        type="button"
        disabled={disabled}
        aria-label={`${ariaLabel ?? "Tidspunkt for aktivitet"}: ${dateTimeFormat.format(selected)}`}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <CalendarDays size={14} />
        {dateTimeFormat.format(selected)}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[19rem] p-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Dato og klokkeslett</h3>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => {
              const now = new Date();
              setDraft(now);
              setViewMonth(new Date(now.getFullYear(), now.getMonth(), 1));
              setHour(String(now.getHours()).padStart(2, "0"));
              setMinute(String(now.getMinutes()).padStart(2, "0"));
            }}
          >
            Nå
          </Button>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Forrige måned"
            onClick={() => changeMonth(-1)}
          >
            <ChevronLeft size={16} />
          </Button>
          <span className="text-sm font-medium capitalize">{monthFormat.format(viewMonth)}</span>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Neste måned"
            onClick={() => changeMonth(1)}
          >
            <ChevronRight size={16} />
          </Button>
        </div>
        <div className="mt-1 grid grid-cols-7 text-center">
          {weekdays.map((weekday) => (
            <span key={weekday} className="py-1 text-[11px] text-muted-foreground">
              {weekday}
            </span>
          ))}
          {Array.from({ length: 42 }, (_, index) => {
            const day = index - firstWeekday + 1;
            if (day < 1 || day > daysInMonth) return <span key={index} />;
            const date = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day);
            const isSelected =
              draft.getFullYear() === date.getFullYear() &&
              draft.getMonth() === date.getMonth() &&
              draft.getDate() === date.getDate();
            const isToday =
              today.getFullYear() === date.getFullYear() &&
              today.getMonth() === date.getMonth() &&
              today.getDate() === date.getDate();
            return (
              <button
                key={index}
                type="button"
                aria-label={dayFormat.format(date)}
                aria-pressed={isSelected}
                className={`mx-auto my-0.5 size-8 rounded-lg text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${isSelected ? "bg-primary text-primary-foreground" : isToday ? "bg-primary-soft font-semibold text-primary hover:bg-primary-soft/70" : "hover:bg-muted"}`}
                onClick={() =>
                  setDraft(new Date(date.getFullYear(), date.getMonth(), date.getDate()))
                }
              >
                {day}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
          <Clock3 size={16} className="shrink-0 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Klokkeslett</span>
          <Input
            type="text"
            inputMode="numeric"
            maxLength={2}
            value={hour}
            onChange={(event) => {
              if (/^\d{0,2}$/.test(event.target.value)) setHour(event.target.value);
            }}
            aria-label="Time"
            className="ml-auto w-12 px-2 text-center"
          />
          <span>:</span>
          <Input
            type="text"
            inputMode="numeric"
            maxLength={2}
            value={minute}
            onChange={(event) => {
              if (/^\d{0,2}$/.test(event.target.value)) setMinute(event.target.value);
            }}
            aria-label="Minutt"
            className="w-12 px-2 text-center"
          />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Avbryt
          </Button>
          <Button size="sm" disabled={saving || !validTime} onClick={() => void save()}>
            Lagre
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
