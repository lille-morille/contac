import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../components/ui/button.tsx";
import { Card } from "../../components/ui/card.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../../components/ui/dialog.tsx";
import { Input } from "../../components/ui/input.tsx";
import { Select } from "../../components/ui/select.tsx";
import { request } from "../../lib/api.ts";
import { useOrg } from "../../lib/org.tsx";
import type { Contact, Reminder } from "./model.tsx";

export type CalendarEvent = {
  id: string;
  kind: "meeting" | "deadline";
  title: string;
  contactId: string | null;
  date: string | null;
  startAt: string | null;
  endAt: string | null;
  updatedAt: string;
};

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function localInput(date: Date) {
  return `${dateKey(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
function monday(date: Date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
  return result;
}
function hour(date: Date) {
  return date.getHours() + date.getMinutes() / 60;
}
function clock(date: Date) {
  return date.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
}
function defaultStart() {
  const date = new Date();
  date.setMinutes(0, 0, 0);
  date.setHours(date.getHours() + 1);
  return date;
}

export function CalendarEventForm({
  contacts,
  contactId,
  initial,
  initialDate,
  defaultKind = "meeting",
  onSaved,
  onCancel,
}: {
  contacts: Contact[];
  contactId?: string;
  initial?: CalendarEvent;
  initialDate?: Date;
  defaultKind?: "meeting" | "deadline";
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const { org } = useOrg();
  const qc = useQueryClient();
  const start = initial?.startAt
    ? new Date(initial.startAt)
    : initialDate
      ? new Date(initialDate.getFullYear(), initialDate.getMonth(), initialDate.getDate(), 9)
      : defaultStart();
  const [kind, setKind] = useState<"meeting" | "deadline">(initial?.kind ?? defaultKind);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [selectedContactId, setSelectedContactId] = useState(initial?.contactId ?? contactId ?? "");
  const [startValue, setStartValue] = useState(localInput(start));
  const [endValue, setEndValue] = useState(
    localInput(initial?.endAt ? new Date(initial.endAt) : new Date(start.getTime() + 60 * 60_000)),
  );
  const [date, setDate] = useState(initial?.date ?? dateKey(initialDate ?? start));
  const [deadlineTimed, setDeadlineTimed] = useState(
    !!initial?.startAt && initial.kind === "deadline",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!org) return;
    setError("");
    if (!title.trim() || (kind === "meeting" && !selectedContactId)) {
      setError("Skriv en tittel og velg en kontakt.");
      return;
    }
    const begin = new Date(startValue);
    const finish = new Date(endValue);
    if (
      kind === "meeting" &&
      (!Number.isFinite(begin.getTime()) || !Number.isFinite(finish.getTime()) || finish <= begin)
    ) {
      setError("Sluttid må være etter starttid.");
      return;
    }
    if (kind === "deadline" && (!date || (deadlineTimed && !Number.isFinite(begin.getTime())))) {
      setError("Velg en gyldig dato.");
      return;
    }
    setBusy(true);
    try {
      await request(
        `/org/calendar-events${initial ? `/${initial.id}/update` : ""}`,
        org.id,
        kind === "meeting"
          ? {
              kind,
              title: title.trim(),
              contactId: selectedContactId,
              startAt: begin.toISOString(),
              endAt: finish.toISOString(),
              ...(initial ? { expectedUpdatedAt: initial.updatedAt } : {}),
            }
          : {
              kind,
              title: title.trim(),
              date,
              startAt: deadlineTimed ? begin.toISOString() : null,
              ...(initial ? { expectedUpdatedAt: initial.updatedAt } : {}),
            },
      );
      await qc.invalidateQueries({ queryKey: ["calendar-events", org.id] });
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke lagre kalenderoppføringen.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!org || !initial) return;
    setBusy(true);
    setError("");
    try {
      await request(`/org/calendar-events/${initial.id}/delete`, org.id, {
        expectedUpdatedAt: initial.updatedAt,
      });
      await qc.invalidateQueries({ queryKey: ["calendar-events", org.id] });
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke slette kalenderoppføringen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {!contactId && (
        <div className="grid grid-cols-2 gap-2">
          <Button
            size="sm"
            variant={kind === "meeting" ? "secondary" : "outline"}
            onClick={() => setKind("meeting")}
          >
            Møte
          </Button>
          <Button
            size="sm"
            variant={kind === "deadline" ? "secondary" : "outline"}
            onClick={() => setKind("deadline")}
          >
            Frist
          </Button>
        </div>
      )}
      <label className="block text-xs font-medium">
        Tittel
        <Input
          className="mt-1"
          value={title}
          maxLength={200}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={kind === "meeting" ? "Møte med kontakt" : "Frist"}
        />
      </label>
      {kind === "meeting" ? (
        <>
          <label className="block text-xs font-medium">
            Kontakt
            <Select
              className="mt-1 w-full"
              value={selectedContactId}
              onValueChange={setSelectedContactId}
              placeholder="Velg kontakt"
              items={[
                { value: "", label: "Velg kontakt" },
                ...contacts
                  .filter((item) => item.status !== "duplicate")
                  .map((item) => ({ value: item.id, label: item.name })),
              ]}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs font-medium">
              Start
              <Input
                className="mt-1"
                type="datetime-local"
                value={startValue}
                onChange={(event) => setStartValue(event.target.value)}
              />
            </label>
            <label className="block text-xs font-medium">
              Slutt
              <Input
                className="mt-1"
                type="datetime-local"
                value={endValue}
                onChange={(event) => setEndValue(event.target.value)}
              />
            </label>
          </div>
        </>
      ) : (
        <>
          <label className="block text-xs font-medium">
            Dato
            <Input
              className="mt-1"
              type="date"
              value={date}
              onChange={(event) => {
                setDate(event.target.value);
                setStartValue((current) => `${event.target.value}${current.slice(10)}`);
              }}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={deadlineTimed}
              onChange={(event) => setDeadlineTimed(event.target.checked)}
            />
            Bestemt klokkeslett
          </label>
          {deadlineTimed && (
            <label className="block text-xs font-medium">
              Tid
              <Input
                className="mt-1"
                type="datetime-local"
                value={startValue}
                onChange={(event) => {
                  setStartValue(event.target.value);
                  setDate(event.target.value.slice(0, 10));
                }}
              />
            </label>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-risk">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy} onClick={() => void save()}>
          {initial ? "Lagre endringer" : kind === "meeting" ? "Planlegg møte" : "Legg til frist"}
        </Button>
        {initial && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void remove()}>
            Slett
          </Button>
        )}
        {onCancel && (
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Avbryt
          </Button>
        )}
      </div>
    </div>
  );
}

type TimedItem = {
  id: string;
  kind: "meeting" | "deadline" | "reminder";
  title: string;
  start: Date;
  end: Date;
  event?: CalendarEvent;
  reminder?: Reminder;
};
const HOUR_HEIGHT = 56;

export function TeamCalendar({
  contacts,
  reminders,
  onOpenContact,
}: {
  contacts: Contact[];
  reminders: Reminder[];
  onOpenContact: (id: string) => void;
}) {
  const { org } = useOrg();
  const [week, setWeek] = useState(() => monday(new Date()));
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [creating, setCreating] = useState(false);
  const [createKind, setCreateKind] = useState<"meeting" | "deadline">("meeting");
  const [focusedDay, setFocusedDay] = useState<Date | undefined>();
  const [now, setNow] = useState(() => new Date());
  const gridScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (gridScrollRef.current) gridScrollRef.current.scrollTop = 7 * HOUR_HEIGHT;
  }, []);
  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, offset) => {
        const day = new Date(week);
        day.setDate(day.getDate() + offset);
        return day;
      }),
    [week],
  );
  const nextWeek = new Date(week);
  nextWeek.setDate(nextWeek.getDate() + 7);
  const params = new URLSearchParams({
    from: dateKey(week),
    to: dateKey(nextWeek),
    start: week.toISOString(),
    end: nextWeek.toISOString(),
  });
  const query = useQuery({
    queryKey: ["calendar-events", org?.id, dateKey(week)],
    queryFn: () => request<CalendarEvent[]>(`/org/calendar-events?${params}`, org!.id),
    enabled: !!org,
    refetchInterval: 60_000,
  });
  const events = query.data ?? [];
  const contactName = (id: string | null) =>
    contacts.find((item) => item.id === id)?.name ?? "Kontakt";
  function openCreate(kind: "meeting" | "deadline", day?: Date) {
    setCreateKind(kind);
    setFocusedDay(day);
    setCreating(true);
  }
  function changeWeek(offset: number) {
    setWeek((current) => {
      const next = new Date(current);
      next.setDate(next.getDate() + offset * 7);
      return next;
    });
  }
  const todayKey = dateKey(now);

  function dayItems(day: Date) {
    const key = dateKey(day);
    const timed: TimedItem[] = [];
    for (const event of events) {
      if (!event.startAt) continue;
      const start = new Date(event.startAt);
      const end = event.endAt ? new Date(event.endAt) : new Date(start.getTime() + 30 * 60_000);
      const dayStart = new Date(day);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      if (start < dayEnd && end > dayStart)
        timed.push({ id: event.id, kind: event.kind, title: event.title, start, end, event });
    }
    for (const reminder of reminders) {
      const start = new Date(reminder.dueAt);
      if (dateKey(start) === key)
        timed.push({
          id: reminder.id,
          kind: "reminder",
          title: reminder.message || `Påminnelse: ${contactName(reminder.contactId)}`,
          start,
          end: new Date(start.getTime() + 30 * 60_000),
          reminder,
        });
    }
    timed.sort(
      (a, b) => a.start.getTime() - b.start.getTime() || a.end.getTime() - b.end.getTime(),
    );
    return timed;
  }

  function positioned(items: TimedItem[], day: Date) {
    const dayStart = new Date(day);
    const dayEnd = new Date(day);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const result: {
      item: TimedItem;
      lane: number;
      columns: number;
      begin: number;
      duration: number;
    }[] = [];
    let cluster: typeof result = [];
    let clusterEnd = 0;
    let laneEnds: number[] = [];
    function flush() {
      const columns = Math.max(1, ...cluster.map((entry) => entry.lane + 1));
      result.push(...cluster.map((entry) => ({ ...entry, columns })));
      cluster = [];
      laneEnds = [];
    }
    for (const item of items) {
      const begin = Math.max(item.start.getTime(), dayStart.getTime());
      const finish = Math.min(item.end.getTime(), dayEnd.getTime());
      if (cluster.length && begin >= clusterEnd) flush();
      let lane = laneEnds.findIndex((value) => value <= begin);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = finish;
      clusterEnd = Math.max(clusterEnd, finish);
      cluster.push({
        item,
        lane,
        columns: 0,
        begin: (begin - dayStart.getTime()) / 3_600_000,
        duration: (finish - begin) / 3_600_000,
      });
    }
    if (cluster.length) flush();
    return result;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <CalendarDays size={24} />
            Kalender
          </h1>
          <p className="text-sm text-muted-foreground">
            Møter og frister deles med teamet. Bare du ser dine påminnelser.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setWeek(monday(new Date()))}>
            I dag
          </Button>
          <Button
            size="sm"
            variant="outline"
            aria-label="Forrige uke"
            onClick={() => changeWeek(-1)}
          >
            <ChevronLeft size={16} />
          </Button>
          <Button size="sm" variant="outline" aria-label="Neste uke" onClick={() => changeWeek(1)}>
            <ChevronRight size={16} />
          </Button>
          <Button size="sm" onClick={() => openCreate("meeting")}>
            <Plus size={16} />
            Ny oppføring
          </Button>
        </div>
      </div>
      <p className="font-medium">
        {week.toLocaleDateString("nb-NO", { day: "numeric", month: "long" })} –{" "}
        {days[6].toLocaleDateString("nb-NO", { day: "numeric", month: "long", year: "numeric" })}
      </p>
      {query.isError && (
        <p role="alert" className="text-sm text-risk">
          Kunne ikke laste kalenderen.{" "}
          <button className="underline" onClick={() => void query.refetch()}>
            Prøv igjen
          </button>
        </p>
      )}
      <Card className="overflow-x-auto">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))] border-b border-border">
            <div className="border-r border-border p-2 text-xs text-muted-foreground">Tid</div>
            {days.map((day) => (
              <button
                key={dateKey(day)}
                className={`border-r border-border p-2 text-center text-sm hover:bg-muted/60 ${dateKey(day) === todayKey ? "font-semibold text-primary" : ""}`}
                onClick={() => openCreate("meeting", day)}
              >
                {day.toLocaleDateString("nb-NO", { weekday: "short" })}
                <span className="ml-2 text-base">{day.getDate()}</span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))] border-b border-border">
            <div className="border-r border-border p-2 text-xs text-muted-foreground">
              Hele dagen
            </div>
            {days.map((day) => (
              <div key={dateKey(day)} className="min-h-12 space-y-1 border-r border-border p-1">
                {events
                  .filter(
                    (event) =>
                      event.kind === "deadline" && !event.startAt && event.date === dateKey(day),
                  )
                  .map((event) => (
                    <button
                      key={event.id}
                      className="block w-full truncate rounded-md bg-orange-soft px-1.5 py-1 text-left text-xs text-foreground hover:brightness-95"
                      title={event.title}
                      onClick={() => setEditing(event)}
                    >
                      {event.title}
                    </button>
                  ))}
              </div>
            ))}
          </div>
          <div ref={gridScrollRef} className="max-h-[65vh] overflow-auto">
            <div
              className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))]"
              style={{ height: 24 * HOUR_HEIGHT }}
            >
              <div className="relative border-r border-border">
                {Array.from({ length: 24 }, (_, h) => (
                  <div
                    key={h}
                    className="absolute right-2 -translate-y-2 text-xs text-muted-foreground"
                    style={{ top: h * HOUR_HEIGHT }}
                  >
                    {String(h).padStart(2, "0")}:00
                  </div>
                ))}
              </div>
              {days.map((day) => (
                <div
                  key={dateKey(day)}
                  className="relative border-r border-border"
                  style={{
                    backgroundImage: `repeating-linear-gradient(to bottom, transparent 0px, transparent ${HOUR_HEIGHT - 1}px, var(--border) ${HOUR_HEIGHT - 1}px, var(--border) ${HOUR_HEIGHT}px)`,
                  }}
                >
                  {positioned(dayItems(day), day).map(
                    ({ item, lane, columns, begin, duration }) => (
                      <button
                        key={`${item.kind}-${item.id}`}
                        className={`absolute z-10 overflow-hidden rounded-md border px-1.5 py-0.5 text-left text-xs leading-tight hover:brightness-95 ${item.kind === "meeting" ? "border-primary/30 bg-primary-soft text-foreground" : item.kind === "deadline" ? "border-orange/30 bg-orange-soft text-foreground" : "border-blue/30 bg-blue-soft text-foreground"}`}
                        style={{
                          top: begin * HOUR_HEIGHT + 1,
                          height: Math.max(22, duration * HOUR_HEIGHT - 2),
                          left: `${(lane * 100) / columns}%`,
                          width: `${100 / columns}%`,
                        }}
                        title={`${clock(item.start)} ${item.title}`}
                        onClick={() =>
                          item.reminder
                            ? onOpenContact(item.reminder.contactId)
                            : item.event && setEditing(item.event)
                        }
                      >
                        <span className="block truncate font-medium">
                          {clock(item.start)} {item.title}
                        </span>
                        {item.event?.contactId && (
                          <span className="block truncate">
                            {contactName(item.event.contactId)}
                          </span>
                        )}
                      </button>
                    ),
                  )}
                  {dateKey(day) === todayKey && (
                    <div
                      className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-risk"
                      style={{ top: hour(now) * HOUR_HEIGHT }}
                    >
                      <span className="absolute -left-1 -top-[5px] size-2 rounded-full bg-risk" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <i className="size-2 rounded-full bg-primary" />
          Møte
        </span>
        <span className="flex items-center gap-1">
          <i className="size-2 rounded-full bg-orange" />
          Frist
        </span>
        <span className="flex items-center gap-1">
          <i className="size-2 rounded-full bg-blue" />
          Påminnelse (privat)
        </span>
      </div>
      <Dialog
        open={creating || !!editing}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
      >
        <DialogContent>
          <DialogTitle>{editing ? "Rediger oppføring" : "Ny kalenderoppføring"}</DialogTitle>
          <DialogDescription>Møter og frister er synlige for alle i teamet.</DialogDescription>
          <div className="mt-4">
            <CalendarEventForm
              key={editing?.id ?? `${createKind}-${focusedDay?.getTime() ?? "now"}`}
              contacts={contacts}
              initial={editing ?? undefined}
              initialDate={focusedDay}
              defaultKind={createKind}
              onSaved={() => {
                setCreating(false);
                setEditing(null);
                setNow(new Date());
              }}
              onCancel={() => {
                setCreating(false);
                setEditing(null);
              }}
            />
          </div>
          {editing?.contactId && (
            <Button
              className="mt-3"
              size="sm"
              variant="outline"
              onClick={() => {
                onOpenContact(editing.contactId!);
                setEditing(null);
              }}
            >
              Åpne kontakt
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
