import { CalendarDays, ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import { useState } from "react";
import { Button } from "./button.tsx";
import { Input } from "./input.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "./popover.tsx";

const weekdays = ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"];
const monthFormat = new Intl.DateTimeFormat("nb-NO", { month: "long", year: "numeric" });
const dayFormat = new Intl.DateTimeFormat("nb-NO", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const shortFormat = new Intl.DateTimeFormat("nb-NO", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function localValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function validTime(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  return !!match && Number(match[1]) <= 23 && Number(match[2]) <= 59;
}

export function DateTimeRangePicker({
  start,
  end,
  onChange,
}: {
  start: string;
  end: string;
  onChange: (start: string, end: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<"start" | "end">("start");
  const [draftStart, setDraftStart] = useState(start);
  const [draftEnd, setDraftEnd] = useState(end);
  const [startHour, setStartHour] = useState(start.slice(11, 13));
  const [startMinute, setStartMinute] = useState(start.slice(14, 16));
  const [endHour, setEndHour] = useState(end.slice(11, 13));
  const [endMinute, setEndMinute] = useState(end.slice(14, 16));
  const [viewMonth, setViewMonth] = useState(() => {
    const date = new Date(start);
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });
  const [error, setError] = useState("");
  const firstWeekday = (viewMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
  const startDate = draftStart.slice(0, 10);
  const endDate = draftEnd.slice(0, 10);

  function changeTime(part: "start" | "end", unit: "hour" | "minute", value: string) {
    if (!/^\d{0,2}$/.test(value)) return;
    const update =
      part === "start"
        ? unit === "hour"
          ? setStartHour
          : setStartMinute
        : unit === "hour"
          ? setEndHour
          : setEndMinute;
    update(value);
    setError("");
  }

  function selectDay(date: Date) {
    const datePart = localValue(date).slice(0, 10);
    if (active === "start") {
      const nextStart = `${datePart}${draftStart.slice(10)}`;
      setDraftStart(nextStart);
      const selectedStart = new Date(`${datePart}T${startHour}:${startMinute}`);
      if (selectedStart >= new Date(`${draftEnd.slice(0, 10)}T${endHour}:${endMinute}`)) {
        const nextEnd = localValue(new Date(selectedStart.getTime() + 60 * 60_000));
        setDraftEnd(nextEnd);
        setEndHour(nextEnd.slice(11, 13));
        setEndMinute(nextEnd.slice(14, 16));
      }
      setActive("end");
    } else {
      setDraftEnd(`${datePart}${draftEnd.slice(10)}`);
    }
    setError("");
  }

  function save() {
    const nextStart = `${draftStart.slice(0, 10)}T${startHour}:${startMinute}`;
    const nextEnd = `${draftEnd.slice(0, 10)}T${endHour}:${endMinute}`;
    const begin = new Date(nextStart);
    const finish = new Date(nextEnd);
    if (
      !validTime(`${startHour}:${startMinute}`) ||
      !validTime(`${endHour}:${endMinute}`) ||
      !Number.isFinite(begin.getTime()) ||
      !Number.isFinite(finish.getTime()) ||
      finish <= begin
    ) {
      setError("Sluttid må være etter starttid.");
      return;
    }
    onChange(nextStart, nextEnd);
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setDraftStart(start);
          setDraftEnd(end);
          setStartHour(start.slice(11, 13));
          setStartMinute(start.slice(14, 16));
          setEndHour(end.slice(11, 13));
          setEndMinute(end.slice(14, 16));
          setActive("start");
          const date = new Date(start);
          setViewMonth(new Date(date.getFullYear(), date.getMonth(), 1));
          setError("");
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger
        type="button"
        aria-label="Velg start og slutt"
        className="mt-1 flex min-h-9 w-full items-center gap-2 rounded-xl border border-input bg-card px-3.5 py-2 text-left text-sm transition-colors hover:border-primary/25 focus-visible:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
        <span>
          {shortFormat.format(new Date(start))} – {shortFormat.format(new Date(end))}
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-[min(21rem,calc(100vw-2rem))] p-3" positionerClassName="z-[60]">
        <div className="grid grid-cols-2 gap-2">
          {(["start", "end"] as const).map((part) => (
            <button
              key={part}
              type="button"
              aria-pressed={active === part}
              className={`rounded-lg border px-2 py-1.5 text-left text-xs transition-colors ${active === part ? "border-primary bg-primary-soft" : "border-border hover:bg-muted"}`}
              onClick={() => {
                setActive(part);
                const date = new Date(part === "start" ? draftStart : draftEnd);
                setViewMonth(new Date(date.getFullYear(), date.getMonth(), 1));
              }}
            >
              <span className="block text-muted-foreground">
                {part === "start" ? "Start" : "Slutt"}
              </span>
              <span className="font-medium">
                {dayFormat.format(new Date(part === "start" ? draftStart : draftEnd))}
              </span>
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Forrige måned"
            onClick={() =>
              setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))
            }
          >
            <ChevronLeft size={16} />
          </Button>
          <span className="text-sm font-medium capitalize">{monthFormat.format(viewMonth)}</span>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Neste måned"
            onClick={() =>
              setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))
            }
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
            const key = localValue(date).slice(0, 10);
            const selected = key === startDate || key === endDate;
            const inRange = key > startDate && key < endDate;
            return (
              <button
                key={index}
                type="button"
                aria-label={dayFormat.format(date)}
                aria-pressed={selected}
                className={`mx-auto my-0.5 size-8 rounded-lg text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${selected ? "bg-primary text-primary-foreground" : inRange ? "bg-primary-soft text-primary" : "hover:bg-muted"}`}
                onClick={() => selectDay(date)}
              >
                {day}
              </button>
            );
          })}
        </div>
        <div className="mt-3 grid grid-cols-[auto_1fr_1fr] items-end gap-2 border-t border-border pt-3">
          <Clock3 className="mb-2.5 size-4 text-muted-foreground" />
          {(["start", "end"] as const).map((part) => (
            <div key={part} className="min-w-0 text-xs font-medium">
              {part === "start" ? "Starttid" : "Sluttid"}
              <div className="mt-1 flex items-center gap-1">
                {(["hour", "minute"] as const).map((unit, index) => (
                  <div key={unit} className="contents">
                    {index > 0 && <span aria-hidden="true">:</span>}
                    <Input
                      className="min-w-0 px-1 text-center"
                      type="text"
                      inputMode="numeric"
                      maxLength={2}
                      aria-label={`${part === "start" ? "Start" : "Slutt"}${unit === "hour" ? "time" : "minutt"}`}
                      value={
                        part === "start"
                          ? unit === "hour"
                            ? startHour
                            : startMinute
                          : unit === "hour"
                            ? endHour
                            : endMinute
                      }
                      onChange={(event) => changeTime(part, unit, event.target.value)}
                      onBlur={(event) => {
                        if (event.target.value.length === 1)
                          changeTime(part, unit, event.target.value.padStart(2, "0"));
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        {error && (
          <p role="alert" className="mt-2 text-xs text-risk">
            {error}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Avbryt
          </Button>
          <Button size="sm" onClick={save}>
            Bruk tidspunkt
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
