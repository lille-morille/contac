import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GripVertical, Plus, ScrollText } from "lucide-react";
import { Reorder, useDragControls } from "motion/react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { CallGuideEditor } from "../../components/call-guide-editor.tsx";
import { Avatar } from "../../components/ui/avatar.tsx";
import { Button } from "../../components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../../components/ui/dialog.tsx";
import { profileAvatarUrl } from "../../lib/api.ts";
import { guideAfterDelete, moveId } from "../../lib/call-guide-sync.ts";
import {
  CALL_GUIDE_DEFAULT_TITLE,
  callGuideKeys,
  callGuideOrderConflict,
  createCallGuide,
  deleteCallGuide,
  listCallGuides,
  reorderCallGuides,
  type CallGuide,
} from "../../lib/call-guides.ts";
import { useTeamRealtime, type TeamPeer } from "../../lib/team-realtime.tsx";
import { cn } from "../../lib/utils.ts";
import type { Data } from "./model.tsx";

/** Presence `editingId` for a member who has a call guide open in the editor. */
export const callGuidePresenceId = (guideId: string) => `call-guide:${guideId}`;

const noGuides: CallGuide[] = [];

export function guideTitle(title: string) {
  return title.trim() || CALL_GUIDE_DEFAULT_TITLE;
}

export function CallGuidesPage({
  teamId,
  members,
  currentUserId,
  selectedId,
  onSelect,
}: {
  teamId: string;
  members: Data["members"];
  currentUserId: string | null;
  /** The guide in the URL. */
  selectedId: string | null;
  /** `replace` updates the URL without a new history entry. */
  onSelect: (id: string | null, replace?: boolean) => void;
}) {
  const qc = useQueryClient();
  const { peers, setEditing } = useTeamRealtime();
  const listKey = callGuideKeys.list(teamId);
  const guidesQuery = useQuery({
    queryKey: listKey,
    queryFn: () => listCallGuides(teamId),
    refetchInterval: 60_000,
  });
  const guides = guidesQuery.data ?? noGuides;
  const [liveTitle, setLiveTitle] = useState<{ id: string; title: string } | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<CallGuide | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [dragOrder, setDragOrder] = useState<string[] | null>(null);
  const selected = guides.find((guide) => guide.id === selectedId) ?? null;

  // Select the first guide when none (or a deleted one) is in the URL.
  useEffect(() => {
    if (!guidesQuery.isSuccess) return;
    if (selectedId && guides.some((guide) => guide.id === selectedId)) return;
    onSelect(guides[0]?.id ?? null, true);
  }, [guidesQuery.isSuccess, guides, selectedId, onSelect]);

  // Presence: teammates see this member on the open guide.
  useEffect(() => {
    if (!selected?.id) return;
    setEditing(callGuidePresenceId(selected.id));
    return () => setEditing(null);
  }, [selected?.id, setEditing]);

  const titleOf = (guide: CallGuide) =>
    guideTitle(liveTitle?.id === guide.id ? liveTitle.title : guide.title);

  const create = useMutation({
    mutationFn: () => createCallGuide(teamId),
    onSuccess: (guide) => {
      qc.setQueryData<CallGuide[]>(listKey, (old) =>
        old && !old.some((item) => item.id === guide.id) ? [...old, guide] : old,
      );
      setCreatedId(guide.id);
      onSelect(guide.id);
    },
  });

  const remove = useMutation({
    mutationFn: (guide: CallGuide) => deleteCallGuide(teamId, guide.id),
    onSuccess: (_result, guide) => {
      const ids = guides.map((item) => item.id);
      qc.setQueryData<CallGuide[]>(listKey, (old) => old?.filter((item) => item.id !== guide.id));
      if (guide.id === selectedId) onSelect(guideAfterDelete(ids, guide.id), true);
      setDeleting(null);
    },
  });

  const reorder = useMutation({
    mutationFn: (ids: string[]) => reorderCallGuides(teamId, ids),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: listKey });
      const previous = qc.getQueryData<CallGuide[]>(listKey);
      qc.setQueryData<CallGuide[]>(listKey, (old) =>
        old
          ? ids
              .map((id) => old.find((guide) => guide.id === id))
              .filter((guide): guide is CallGuide => !!guide)
              .map((guide, position) => ({ ...guide, position }))
          : old,
      );
      return { previous };
    },
    onSuccess: (list) => {
      // Keep any newer title/body a concurrent refetch already placed in the cache.
      qc.setQueryData<CallGuide[]>(listKey, (old) =>
        list.map((guide) => {
          const cached = old?.find((item) => item.id === guide.id);
          return cached && cached.revision > guide.revision
            ? { ...cached, position: guide.position }
            : guide;
        }),
      );
    },
    onError: (error, _ids, context) => {
      const current = callGuideOrderConflict(error);
      qc.setQueryData(listKey, current ?? context?.previous);
      setNotice(
        current
          ? "En teamkollega endret listen samtidig. Rekkefølgen er oppdatert, prøv igjen."
          : "Kunne ikke lagre rekkefølgen.",
      );
    },
  });

  const order = dragOrder ?? guides.map((guide) => guide.id);
  const ordered = order
    .map((id) => guides.find((guide) => guide.id === id))
    .filter((guide): guide is CallGuide => !!guide);

  function commitOrder(ids: string[]) {
    setDragOrder(null);
    const current = guides.map((guide) => guide.id);
    if (ids.length !== current.length || ids.every((id, index) => id === current[index])) return;
    setNotice(null);
    reorder.mutate(ids);
  }

  function moveWithKeyboard(guide: CallGuide, direction: -1 | 1) {
    const current = guides.map((item) => item.id);
    const next = moveId(current, guide.id, direction);
    if (next === current) return;
    commitOrder(next);
    setAnnouncement(
      `${titleOf(guide)} flyttet til plass ${next.indexOf(guide.id) + 1} av ${next.length}.`,
    );
  }

  const peersOn = (guideId: string) =>
    peers.filter(
      (peer, index, rows) =>
        peer.editingId === callGuidePresenceId(guideId) &&
        peer.userId !== currentUserId &&
        rows.findIndex(
          (row) => row.userId === peer.userId && row.editingId === peer.editingId,
        ) === index,
    );

  const header = (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h1 className="text-lg font-semibold tracking-tight">Samtaleguider</h1>
      {guides.length > 0 && (
        <Button size="sm" variant="outline" disabled={create.isPending} onClick={() => create.mutate()}>
          <Plus /> Ny samtaleguide
        </Button>
      )}
    </div>
  );

  if (guidesQuery.isPending)
    return (
      <div className="mx-auto max-w-6xl">
        {header}
        <p className="text-sm text-muted-foreground" role="status">
          Laster samtaleguider …
        </p>
      </div>
    );

  if (guidesQuery.isError && !guidesQuery.data)
    return (
      <div className="mx-auto max-w-6xl">
        {header}
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl bg-risk-soft px-4 py-3 text-sm text-risk">
          Kunne ikke laste samtaleguidene.
          <Button size="sm" variant="outline" onClick={() => void guidesQuery.refetch()}>
            Prøv igjen
          </Button>
        </div>
      </div>
    );

  if (guides.length === 0)
    return (
      <div className="mx-auto max-w-6xl">
        {header}
        <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card p-6 text-center shadow-card">
          <ScrollText className="size-8 text-muted-foreground" aria-hidden />
          <div>
            <p className="font-medium">Ingen samtaleguider ennå</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Skriv punktene teamet vil ha foran seg under en samtale. Guidene vises ved siden av
              telefonsamtaler og møter.
            </p>
          </div>
          <Button disabled={create.isPending} onClick={() => create.mutate()}>
            <Plus /> Lag samtaleguide
          </Button>
          {create.isError && (
            <p role="alert" className="text-sm text-risk">
              Kunne ikke lage samtaleguiden. Prøv igjen.
            </p>
          )}
        </div>
      </div>
    );

  return (
    <div className="mx-auto max-w-6xl">
      {header}
      {(notice || create.isError) && (
        <p role="alert" className="mb-3 rounded-xl bg-risk-soft px-4 py-2 text-sm text-risk">
          {notice ?? "Kunne ikke lage samtaleguiden. Prøv igjen."}
        </p>
      )}
      <div className="grid items-start gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <nav aria-label="Samtaleguider" className="rounded-2xl border border-border bg-card p-1.5 shadow-card">
          <p id="call-guide-reorder-help" className="sr-only">
            Dra for å endre rekkefølgen, eller bruk Alt og piltastene. Rekkefølgen er den samme for
            hele teamet og i samtalepanelet.
          </p>
          <Reorder.Group
            as="ol"
            axis="y"
            values={order}
            onReorder={setDragOrder}
            className="space-y-0.5"
          >
            {ordered.map((guide, index) => (
              <GuideListItem
                key={guide.id}
                guide={guide}
                title={titleOf(guide)}
                active={guide.id === selected?.id}
                first={index === 0}
                last={index === ordered.length - 1}
                peers={peersOn(guide.id)}
                members={members}
                onSelect={() => onSelect(guide.id)}
                onMove={(direction) => moveWithKeyboard(guide, direction)}
                onDragEnd={() => commitOrder(order)}
              />
            ))}
          </Reorder.Group>
          <p className="sr-only" aria-live="polite">
            {announcement}
          </p>
        </nav>
        <section
          aria-label="Rediger samtaleguide"
          className="flex min-h-[480px] flex-col rounded-2xl border border-border bg-card p-5 shadow-card md:p-6"
        >
          {selected ? (
            <CallGuideEditor
              key={selected.id}
              teamId={teamId}
              guide={selected}
              autoFocusTitle={createdId === selected.id}
              onTitleChange={(title) => setLiveTitle({ id: selected.id, title })}
              onDelete={() => {
                remove.reset();
                setDeleting(selected);
              }}
              presence={<PresenceAvatars peers={peersOn(selected.id)} members={members} />}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Velg en samtaleguide.</p>
          )}
        </section>
      </div>
      <Dialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogTitle>Slett samtaleguide?</DialogTitle>
          <DialogDescription>
            «{deleting ? titleOf(deleting) : ""}» slettes permanent for hele teamet. Dette kan ikke
            angres.
          </DialogDescription>
          {remove.isError && (
            <p role="alert" className="mt-3 text-sm text-risk">
              Kunne ikke slette samtaleguiden. Prøv igjen.
            </p>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" disabled={remove.isPending} onClick={() => setDeleting(null)}>
              Avbryt
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => deleting && remove.mutate(deleting)}
            >
              Slett samtaleguide
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GuideListItem({
  guide,
  title,
  active,
  first,
  last,
  peers,
  members,
  onSelect,
  onMove,
  onDragEnd,
}: {
  guide: CallGuide;
  title: string;
  active: boolean;
  first: boolean;
  last: boolean;
  peers: TeamPeer[];
  members: Data["members"];
  onSelect: () => void;
  onMove: (direction: -1 | 1) => void;
  onDragEnd: () => void;
}) {
  const controls = useDragControls();
  const handleRef = useRef<HTMLButtonElement>(null);
  const onKeyDown = (event: KeyboardEvent) => {
    const viaHandle = event.currentTarget === handleRef.current;
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    if (!viaHandle && !event.altKey) return;
    event.preventDefault();
    const direction = event.key === "ArrowUp" ? -1 : 1;
    if ((direction === -1 && first) || (direction === 1 && last)) return;
    onMove(direction);
    // Keep focus on the moved guide after the list re-renders.
    const target = event.currentTarget as HTMLElement;
    requestAnimationFrame(() => target.focus());
  };
  return (
    <Reorder.Item
      value={guide.id}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDragEnd}
      className="group relative flex items-center rounded-xl bg-card"
    >
      <button
        ref={handleRef}
        type="button"
        aria-label={`Flytt ${title}`}
        aria-describedby="call-guide-reorder-help"
        title="Dra for å flytte, eller bruk piltastene"
        className="grid h-9 w-6 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-muted-foreground/60 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 active:cursor-grabbing"
        onPointerDown={(event) => controls.start(event)}
        onKeyDown={onKeyDown}
      >
        <GripVertical className="size-4" aria-hidden />
      </button>
      <button
        type="button"
        aria-current={active ? "page" : undefined}
        aria-describedby="call-guide-reorder-help"
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-2 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
          active
            ? "bg-primary-soft font-medium text-foreground"
            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        )}
        onClick={onSelect}
        onKeyDown={onKeyDown}
      >
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {peers.length > 0 && <PresenceAvatars peers={peers} members={members} compact />}
      </button>
    </Reorder.Item>
  );
}

function PresenceAvatars({
  peers,
  members,
  compact,
}: {
  peers: TeamPeer[];
  members: Data["members"];
  compact?: boolean;
}) {
  if (!peers.length) return null;
  const names = peers.map(
    (peer) => members.find((member) => member.userId === peer.userId)?.name ?? "Teammedlem",
  );
  const label = `${names.join(", ")} har denne guiden åpen`;
  return (
    <span className="flex items-center -space-x-1.5" title={label} aria-label={label} role="img">
      {peers.map((peer, index) => {
        const member = members.find((item) => item.userId === peer.userId);
        return (
          <Avatar
            key={peer.userId}
            name={names[index]!}
            src={profileAvatarUrl(member?.avatarPath)}
            className={cn("ring-2 ring-card", compact ? "size-5" : "size-7")}
          />
        );
      })}
    </span>
  );
}
