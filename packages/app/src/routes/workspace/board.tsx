import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import {
  ContactStatusIcon,
  contactStatusColor,
  contactStatuses as statuses,
  type ContactStatus as Status,
} from "../../components/contact-status.tsx";
import { Avatar } from "../../components/ui/avatar.tsx";
import { Badge } from "../../components/ui/badge.tsx";
import { Select } from "../../components/ui/select.tsx";
import { profileAvatarUrl } from "../../lib/api.ts";
import { assigneeOptions, statusOptions, type Contact, type Data } from "./model.tsx";
export type BoardDrag = {
  gestureId: number;
  id: string;
  source: Status;
  target: Status | null;
  phase: "dragging" | "settling";
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  destinationLeft: number;
  destinationTop: number;
};
export type PendingBoardDrag = Omit<
  BoardDrag,
  "target" | "phase" | "destinationLeft" | "destinationTop"
> & {
  pointerId: number;
  startX: number;
  startY: number;
};
export const boardSpring = { type: "spring" as const, stiffness: 380, damping: 32 };

export function ContactBoard({
  rows,
  visibleStatuses,
  data,
  onOpen,
  mutate,
  highlightId,
}: {
  rows: Contact[];
  visibleStatuses?: string[];
  data: Data;
  onOpen: (id: string) => void;
  mutate: (path: string, body: unknown) => Promise<unknown>;
  highlightId: string | null;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const pendingRef = useRef<PendingBoardDrag | null>(null);
  const dragRef = useRef<BoardDrag | null>(null);
  const frameRef = useRef<number | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const gestureIdRef = useRef(0);
  const writesRef = useRef(new Map<string, Promise<void>>());
  const suppressClickRef = useRef(false);
  const [drag, setDragState] = useState<BoardDrag | null>(null);
  const [optimistic, setOptimistic] = useState<Record<string, Status>>({});

  function setDrag(next: BoardDrag | null) {
    dragRef.current = next;
    setDragState(next);
  }
  function targetAt(x: number, y: number): Status | null {
    const section = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-status-column]");
    const value = section?.dataset.statusColumn;
    return statuses.some(([status]) => status === value) ? (value as Status) : null;
  }
  function stopScroll() {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }
  useEffect(
    () => () => {
      stopScroll();
      if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
    },
    [],
  );
  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      const maxScroll = board.scrollWidth - board.clientWidth;
      if (maxScroll <= 0) return;
      const unit =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? board.clientWidth
            : 1;
      const next = Math.max(0, Math.min(maxScroll, board.scrollLeft + event.deltaX * unit));
      if (next === board.scrollLeft) return;
      event.preventDefault();
      board.scrollLeft = next;
    };
    board.addEventListener("wheel", onWheel, { passive: false });
    return () => board.removeEventListener("wheel", onWheel);
  }, []);
  function scrollWhileDragging() {
    const current = dragRef.current;
    const board = boardRef.current;
    if (!current || current.phase !== "dragging" || !board) {
      frameRef.current = null;
      return;
    }
    const rect = board.getBoundingClientRect();
    if (current.y >= rect.top && current.y <= rect.bottom) {
      const edge = 72;
      const left = Math.max(0, (rect.left + edge - current.x) / edge);
      const right = Math.max(0, (current.x - (rect.right - edge)) / edge);
      const amount = Math.min(1, right) * 15 - Math.min(1, left) * 15;
      if (amount) {
        board.scrollLeft += amount;
        const target = targetAt(current.x, current.y);
        if (target !== current.target) setDrag({ ...current, target });
      }
    }
    const column = document
      .elementFromPoint(current.x, current.y)
      ?.closest<HTMLElement>("[data-status-column]");
    const cards = column?.querySelector<HTMLElement>("[data-column-scroll]");
    if (cards) {
      const cardRect = cards.getBoundingClientRect();
      if (current.x >= cardRect.left && current.x <= cardRect.right) {
        const edge = 64;
        const top = Math.max(0, (cardRect.top + edge - current.y) / edge);
        const bottom = Math.max(0, (current.y - (cardRect.bottom - edge)) / edge);
        cards.scrollTop += Math.min(1, bottom) * 13 - Math.min(1, top) * 13;
      }
    }
    frameRef.current = requestAnimationFrame(scrollWhileDragging);
  }
  function onPointerDown(e: PointerEvent<HTMLDivElement>, contact: Contact) {
    if (e.button !== 0 || !e.isPrimary || dragRef.current) return;
    if ((e.target as HTMLElement).closest("[data-board-control]")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    pendingRef.current = {
      gestureId: ++gestureIdRef.current,
      id: contact.id,
      source: optimistic[contact.id] ?? contact.status,
      x: e.clientX,
      y: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
      pointerId: e.pointerId,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const pending = pendingRef.current;
    if (!pending || pending.pointerId !== e.pointerId) return;
    const current = dragRef.current;
    if (!current && Math.hypot(e.clientX - pending.startX, e.clientY - pending.startY) < 6) return;
    e.preventDefault();
    if (!current) suppressClickRef.current = true;
    setDrag({
      gestureId: pending.gestureId,
      id: pending.id,
      source: pending.source,
      target: targetAt(e.clientX, e.clientY),
      phase: "dragging",
      x: e.clientX,
      y: e.clientY,
      offsetX: pending.offsetX,
      offsetY: pending.offsetY,
      width: pending.width,
      height: pending.height,
      destinationLeft: 0,
      destinationTop: 0,
    });
    if (frameRef.current === null) frameRef.current = requestAnimationFrame(scrollWhileDragging);
  }
  function finishDrag(e: PointerEvent<HTMLDivElement>) {
    if (pendingRef.current?.pointerId !== e.pointerId) return;
    pendingRef.current = null;
    stopScroll();
    const current = dragRef.current;
    if (!current || current.phase !== "dragging") return;
    const target = e.type === "pointercancel" ? null : targetAt(e.clientX, e.clientY);
    const destination =
      target && target !== current.source
        ? document.querySelector<HTMLElement>(`[data-drop-preview="${target}"]`)
        : document.querySelector<HTMLElement>(`[data-board-card="${current.id}"]`);
    const rect = destination?.getBoundingClientRect();
    setDrag({
      ...current,
      target,
      phase: "settling",
      destinationLeft: rect?.left ?? current.x - current.offsetX,
      destinationTop: rect?.top ?? current.y - current.offsetY,
    });
    // Settle independently of Motion's completion callback: a rapid second drag can
    // otherwise consume a completion event from the previous overlay animation.
    settleTimerRef.current = window.setTimeout(() => finishAnimation(current.gestureId), 380);
    // The browser fires click after pointerup; keep it from opening the card.
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  }
  function finishAnimation(gestureId: number) {
    const current = dragRef.current;
    if (!current || current.phase !== "settling" || current.gestureId !== gestureId) return;
    settleTimerRef.current = null;
    setDrag(null);
    if (current.target && current.target !== current.source) {
      const { id, target } = current;
      updateStatus(id, target);
    }
  }
  function updateStatus(id: string, target: Status) {
    setOptimistic((value) => ({ ...value, [id]: target }));
    // Serialize picker and drag changes together so a pending drag cannot overwrite a selection.
    const write = (writesRef.current.get(id) ?? Promise.resolve())
      .catch(() => {})
      .then(() => mutate(`/contacts/${id}`, { status: target }))
      .then(() => {});
    writesRef.current.set(id, write);
    void write.then(
      () => clearOptimistic(id, write),
      () => clearOptimistic(id, write),
    );
  }
  function clearOptimistic(id: string, write: Promise<void>) {
    if (writesRef.current.get(id) !== write) return;
    writesRef.current.delete(id);
    setOptimistic((value) => {
      const next = { ...value };
      delete next[id];
      return next;
    });
  }
  const draggedContact = drag ? data.contacts.find((contact) => contact.id === drag.id) : null;

  return (
    <LayoutGroup id="contact-board">
      <div
        ref={boardRef}
        className="mt-6 flex min-h-[65vh] gap-3 overflow-x-auto overflow-y-hidden overscroll-contain pb-4 [contain:paint] lg:min-h-0 lg:flex-1"
      >
        {statuses
          .filter(([key]) => !visibleStatuses?.length || visibleStatuses.includes(key))
          .map(([key, label]) => {
            const cards = rows.filter(
              (contact) => (optimistic[contact.id] ?? contact.status) === key,
            );
            const preview = drag?.target === key && drag.source !== key;
            const statusColor = contactStatusColor(key);
            return (
              <section
                key={key}
                data-status-column={key}
                className="flex h-[72dvh] w-80 shrink-0 flex-col rounded-2xl border-t-2 bg-muted/50 p-2 transition-colors duration-200 lg:h-full"
                style={{
                  borderTopColor: statusColor,
                  backgroundColor: preview
                    ? `color-mix(in srgb, ${statusColor} 16%, var(--muted))`
                    : undefined,
                }}
              >
                <h2 className="flex shrink-0 items-center justify-between px-2 py-2 text-sm font-semibold">
                  <span className="flex items-center gap-2">
                    <ContactStatusIcon status={key} size={18} />
                    {label}
                  </span>
                  <span className="text-muted-foreground">{cards.length}</span>
                </h2>
                <div
                  data-column-scroll
                  className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-y-contain pb-1 pr-1"
                >
                  {cards.map((contact) => (
                    <motion.div
                      key={contact.id}
                      data-board-card={contact.id}
                      data-contact-item={contact.id}
                      layout="position"
                      transition={boardSpring}
                      className={`rounded-xl ${drag?.id === contact.id ? "opacity-0" : ""} ${highlightId === contact.id ? "new-contact-flash" : ""}`}
                    >
                      <ContactCard
                        contact={
                          optimistic[contact.id]
                            ? { ...contact, status: optimistic[contact.id] }
                            : contact
                        }
                        data={data}
                        onOpen={() => onOpen(contact.id)}
                        onChangeStatus={(status) => updateStatus(contact.id, status)}
                        onChangeAssignee={(assigneeId) => {
                          void mutate(`/contacts/${contact.id}`, {
                            assigneeId: assigneeId || null,
                          }).catch(() => {});
                        }}
                        onPointerDown={(e) => onPointerDown(e, contact)}
                        onPointerMove={onPointerMove}
                        onPointerUp={finishDrag}
                        onPointerCancel={finishDrag}
                        onClickCapture={(e) => {
                          if (suppressClickRef.current) {
                            e.preventDefault();
                            e.stopPropagation();
                            suppressClickRef.current = false;
                          }
                        }}
                      />
                    </motion.div>
                  ))}
                  <AnimatePresence>
                    {preview && (
                      <motion.div
                        key="drop-preview"
                        data-drop-preview={key}
                        layout
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.96 }}
                        transition={boardSpring}
                        aria-hidden
                        className="rounded-xl border border-border bg-muted p-3 shadow-sm"
                        style={{ minHeight: drag.height }}
                      >
                        <div className="h-3 w-3/4 rounded bg-border" />
                        <div className="mt-3 h-2 w-1/2 rounded bg-border/80" />
                        <div className="mt-5 h-2 w-2/3 rounded bg-border/80" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </section>
            );
          })}
      </div>
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {drag && draggedContact && (
              <motion.div
                key={drag.gestureId}
                initial={{ rotate: 0, scale: 1, opacity: 0.95 }}
                animate={{
                  x: drag.phase === "settling" ? drag.destinationLeft - (drag.x - drag.offsetX) : 0,
                  y: drag.phase === "settling" ? drag.destinationTop - (drag.y - drag.offsetY) : 0,
                  rotate: drag.phase === "settling" ? 0 : 3,
                  scale: drag.phase === "settling" ? 1 : 1.035,
                  opacity: 1,
                }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={
                  drag.phase === "settling"
                    ? boardSpring
                    : {
                        x: { duration: 0 },
                        y: { duration: 0 },
                        rotate: boardSpring,
                        scale: boardSpring,
                      }
                }
                className="pointer-events-none fixed z-[100] shadow-xl"
                style={{
                  left: drag.x - drag.offsetX,
                  top: drag.y - drag.offsetY,
                  width: drag.width,
                }}
              >
                <ContactCardContent contact={draggedContact} data={data} />
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </LayoutGroup>
  );
}
export function ContactCard({
  contact: c,
  data,
  onOpen,
  onChangeStatus,
  onChangeAssignee,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onClickCapture,
}: {
  contact: Contact;
  data: Data;
  onOpen: () => void;
  onChangeStatus: (status: Status) => void;
  onChangeAssignee: (assigneeId: string) => void;
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: PointerEvent<HTMLDivElement>) => void;
  onClickCapture: (event: React.MouseEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      className="w-full cursor-grab touch-none rounded-xl text-left active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      onClick={(event) => {
        if (!(event.target as HTMLElement).closest("[data-board-control]")) onOpen();
      }}
      onClickCapture={onClickCapture}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <ContactCardContent
        contact={c}
        data={data}
        onChangeStatus={onChangeStatus}
        onChangeAssignee={onChangeAssignee}
      />
    </div>
  );
}
export function ContactCardContent({
  contact: c,
  data,
  onChangeStatus,
  onChangeAssignee,
}: {
  contact: Contact;
  data: Data;
  onChangeStatus?: (status: Status) => void;
  onChangeAssignee?: (assigneeId: string) => void;
}) {
  const assignee =
    data.members.find((member) => member.userId === c.assigneeId) ??
    data.contactAssignees.find((member) => member.userId === c.assigneeId);
  const company = data.companies.find((item) => item.id === c.companyId);
  return (
    <div className="w-full rounded-xl border border-border bg-card p-3 text-left shadow-card transition hover:border-primary/30 hover:shadow-card-hover">
      <span className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="inline-flex max-w-full shrink-0 items-center gap-2 text-sm font-semibold">
            {onChangeStatus ? (
              <span
                data-board-control
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <Select
                  value={c.status}
                  onValueChange={(status) => onChangeStatus(status as Status)}
                  items={statusOptions}
                  iconOnly
                  aria-label={`Endre status for ${c.name}`}
                  className="size-6 rounded-md border-transparent bg-transparent hover:bg-muted"
                />
              </span>
            ) : (
              <ContactStatusIcon status={c.status} />
            )}
            {onChangeStatus ? (
              <button
                type="button"
                aria-label={`Åpne kontakt: ${c.name}`}
                className="min-w-0 truncate rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                {c.name}
              </button>
            ) : (
              <span className="truncate">{c.name}</span>
            )}
          </span>
          {company && (
            <span
              className="max-w-full shrink-0 truncate text-xs text-muted-foreground"
              title={company.name}
            >
              {company.name}
            </span>
          )}
        </span>
        {onChangeAssignee ? (
          <span
            data-board-control
            className="shrink-0"
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <Select
              value={c.assigneeId ?? ""}
              onValueChange={onChangeAssignee}
              items={assigneeOptions(data.members)}
              iconOnly
              aria-label={`Endre ansvarlig for ${c.name}`}
              className="size-6 rounded-full border-transparent bg-transparent hover:bg-muted"
            />
          </span>
        ) : (
          <span className="shrink-0" title={assignee?.name ?? "Uten ansvarlig"}>
            <Avatar
              name={assignee?.name ?? "Uten ansvarlig"}
              src={profileAvatarUrl(assignee?.avatarPath)}
              className="size-6"
            />
          </span>
        )}
      </span>
      {c.description && (
        <p className="mt-1 line-clamp-3 break-words text-xs leading-relaxed text-muted-foreground">
          {c.description}
        </p>
      )}
      {c.stikkord && (
        <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground/85">
          {c.stikkord.slice(0, 300)}
          {c.stikkord.length > 300 ? "…" : ""}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-1">
        {data.contactPersonTags
          .filter((x) => x.contactId === c.id)
          .map((x) => {
            const tag = data.personTags.find((t) => t.id === x.tagId);
            return (
              tag && (
                <Badge key={x.tagId} variant="neutral">
                  {tag.name}
                </Badge>
              )
            );
          })}
      </div>
    </div>
  );
}
