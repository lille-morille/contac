import { useQuery } from "@tanstack/react-query";
import { BookOpenText, ChevronDown, ChevronUp, Pencil, Plus } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { callGuideHref } from "../lib/call-guide-url.ts";
import {
  callGuideTitle,
  readCallGuideCollapsed,
  readSelectedGuideId,
  resolveSelectedGuide,
  tabIndexForKey,
  writeCallGuideCollapsed,
  writeSelectedGuideId,
} from "../lib/call-guide-panel.ts";
import { callGuideKeys, listCallGuides, type CallGuide } from "../lib/call-guides.ts";
import { cn } from "../lib/utils.ts";
import { CallGuideView } from "./call-guide-view.tsx";
import { buttonVariants } from "./ui/button.tsx";

/**
 * The team's call guides for the panel in a live conversation. Only fetches
 * while `enabled` (the team has the `call_guides` flag and a live conversation
 * is open). The realtime layer invalidates the list on every guide change, and
 * a refetch keeps the previous list on screen.
 */
export function useLiveCallGuides(teamId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: callGuideKeys.list(teamId ?? ""),
    queryFn: () => listCallGuides(teamId!),
    enabled: enabled && !!teamId,
    staleTime: 30_000,
  });
}

/**
 * Lays out the live conversation composer with the call guide panel: beside it
 * when the composer area is at least 44rem wide, stacked below it otherwise.
 * Without the `call_guides` flag it renders the children alone, unchanged, and
 * fetches nothing. The wrapper markup depends only on the flag, never on the
 * guide list, so a refetch never remounts the composer fields being typed in.
 */
export function CallGuideComposerLayout({
  enabled,
  teamId,
  userId,
  composerClassName,
  children,
}: {
  enabled: boolean;
  teamId: string | null | undefined;
  userId: string | null | undefined;
  composerClassName: string;
  children: ReactNode;
}) {
  if (!enabled || !teamId) return <>{children}</>;
  return (
    <CallGuideColumns teamId={teamId} userId={userId} composerClassName={composerClassName}>
      {children}
    </CallGuideColumns>
  );
}

function CallGuideColumns({
  teamId,
  userId,
  composerClassName,
  children,
}: {
  teamId: string;
  userId: string | null | undefined;
  composerClassName: string;
  children: ReactNode;
}) {
  const guides = useLiveCallGuides(teamId, true).data;
  const hasGuides = !!guides?.length;
  return (
    <div
      className={cn(
        "grid items-start gap-3",
        hasGuides &&
          "@min-[44rem]:grid-cols-[minmax(0,1fr)_17rem] @min-[60rem]:grid-cols-[minmax(0,1fr)_21rem]",
      )}
    >
      <div className={cn("min-w-0", composerClassName)}>{children}</div>
      {hasGuides ? (
        <CallGuidePanel
          key={`${teamId}:${userId ?? ""}`}
          teamId={teamId}
          userId={userId}
          guides={guides}
          className="@min-[44rem]:sticky @min-[44rem]:top-4 @min-[44rem]:max-h-[calc(100dvh-2rem)]"
        />
      ) : (
        guides && (
          <div>
            <CallGuideCreateLink />
          </div>
        )
      )}
    </div>
  );
}

/** Shown in the composer when the team has the feature but no guides. */
export function CallGuideCreateLink() {
  return (
    <a
      href={callGuideHref()}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <Plus size={13} aria-hidden /> Lag samtaleguide
    </a>
  );
}

/**
 * Read-only call guide panel beside the live conversation composer
 * (docs/spec/10-call-guides.md C). One tab per guide in team order. The selected
 * guide and the collapsed state are remembered per member and team. It never
 * reads or writes the activity draft.
 */
export function CallGuidePanel({
  teamId,
  userId,
  guides,
  className,
}: {
  teamId: string;
  userId: string | null | undefined;
  guides: CallGuide[];
  className?: string;
}) {
  const [preferredId, setPreferredId] = useState(() => readSelectedGuideId(userId, teamId));
  const [collapsed, setCollapsed] = useState(() => readCallGuideCollapsed(userId, teamId));
  const active = resolveSelectedGuide(guides, preferredId);
  const baseId = useId();
  const contentId = `${baseId}-content`;
  const tabId = (guideId: string) => `${baseId}-tab-${guideId}`;
  const panelId = `${baseId}-panel`;
  const tabListRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const bodyRef = useRef<HTMLDivElement>(null);
  const savedScroll = useRef({ guideId: "", top: 0 });

  /** Scrolls the tab list horizontally only, so the page itself never jumps. */
  const revealTab = useCallback((guideId: string) => {
    const list = tabListRef.current;
    const tab = tabRefs.current.get(guideId);
    if (!list || !tab) return;
    const start = tab.offsetLeft;
    const end = start + tab.offsetWidth;
    if (start < list.scrollLeft) list.scrollLeft = Math.max(0, start - 12);
    else if (end > list.scrollLeft + list.clientWidth)
      list.scrollLeft = end - list.clientWidth + 12;
  }, []);
  const activeId = active?.id;
  const activeBody = active?.body;
  useEffect(() => {
    if (activeId && !collapsed) revealTab(activeId);
  }, [activeId, collapsed, revealTab]);

  // A refetch after a teammate's save re-renders the body in place; keep the
  // member's reading position on the same guide, also after collapsing and
  // expanding. Switching guides starts at the top.
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body || !activeId || collapsed) return;
    if (savedScroll.current.guideId === activeId && body.scrollTop !== savedScroll.current.top)
      body.scrollTop = savedScroll.current.top;
  }, [activeId, activeBody, collapsed]);

  function select(guideId: string, focus: boolean) {
    setPreferredId(guideId);
    writeSelectedGuideId(userId, teamId, guideId);
    if (focus) tabRefs.current.get(guideId)?.focus({ preventScroll: true });
  }
  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = tabIndexForKey(event.key, index, guides.length);
    if (next === null) return;
    event.preventDefault();
    select(guides[next]!.id, true);
  }
  function toggleCollapsed() {
    setCollapsed((current) => {
      writeCallGuideCollapsed(userId, teamId, !current);
      return !current;
    });
  }
  if (!active) return null;

  return (
    <section
      aria-label="Samtaleguide"
      className={cn(
        "flex min-h-0 min-w-0 flex-col rounded-xl border border-border bg-card shadow-sm",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 py-1.5 pr-1.5 pl-3">
        <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <BookOpenText size={15} className="shrink-0 text-primary" aria-hidden />
          Samtaleguide
        </h3>
        <div className="flex shrink-0 items-center gap-0.5">
          {!collapsed && (
            <a
              href={callGuideHref(active.id)}
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-8 px-2 text-xs")}
              aria-label={`Rediger ${callGuideTitle(active.title)}`}
            >
              <Pencil aria-hidden /> Rediger
            </a>
          )}
          <button
            type="button"
            className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-8")}
            aria-expanded={!collapsed}
            aria-controls={contentId}
            aria-label={collapsed ? "Vis samtaleguide" : "Skjul samtaleguide"}
            title={collapsed ? "Vis samtaleguide" : "Skjul samtaleguide"}
            onClick={toggleCollapsed}
          >
            {collapsed ? <ChevronDown aria-hidden /> : <ChevronUp aria-hidden />}
          </button>
        </div>
      </div>
      {/* Hidden rather than unmounted, so expanding again keeps the reading position. */}
      <div id={contentId} hidden={collapsed} className="flex min-h-0 flex-1 flex-col">
        <div
          ref={tabListRef}
          role="tablist"
          aria-label="Samtaleguider"
          className="relative flex shrink-0 gap-1 overflow-x-auto px-2 pb-2 [scrollbar-width:thin]"
        >
          {guides.map((guide, index) => {
            const selected = guide.id === active.id;
            const title = callGuideTitle(guide.title);
            return (
              <button
                key={guide.id}
                ref={(element) => {
                  if (element) tabRefs.current.set(guide.id, element);
                  else tabRefs.current.delete(guide.id);
                }}
                type="button"
                role="tab"
                id={tabId(guide.id)}
                aria-selected={selected}
                aria-controls={panelId}
                tabIndex={selected ? 0 : -1}
                title={title}
                className={cn(
                  "max-w-56 shrink-0 truncate rounded-lg px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  selected
                    ? "bg-primary-soft text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                onClick={() => select(guide.id, false)}
                onKeyDown={(event) => onTabKeyDown(event, index)}
              >
                {title}
              </button>
            );
          })}
        </div>
        <div
          key={active.id}
          ref={bodyRef}
          id={panelId}
          role="tabpanel"
          aria-labelledby={tabId(active.id)}
          tabIndex={0}
          onScroll={(event) => {
            if (collapsed) return;
            savedScroll.current = { guideId: active.id, top: event.currentTarget.scrollTop };
          }}
          className="max-h-[min(26rem,60vh)] min-h-0 overflow-y-auto border-t border-border px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset @min-[44rem]:max-h-none @min-[44rem]:flex-1"
        >
          {active.body.trim() ? (
            <CallGuideView body={active.body} />
          ) : (
            <p className="text-sm text-muted-foreground">Denne samtaleguiden er tom.</p>
          )}
        </div>
      </div>
    </section>
  );
}
