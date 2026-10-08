import { useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Graph, GraphData, NodeData } from "@antv/g6";
import { ContactStatusIcon, contactStatusName } from "./contact-status.tsx";
import { Avatar } from "./ui/avatar.tsx";
import { profileAvatarUrl } from "../lib/api.ts";
import { useTheme } from "../lib/theme.ts";
import { Button } from "./ui/button.tsx";
import {
  buildOrganizationMap,
  type MapCompany,
  type MapPanel,
  type MapSelection,
  type MapSource,
} from "../lib/organization-graph-model.ts";

const domainColorTokens: Record<string, string> = {
  blue: "--blue",
  orange: "--orange",
  mint: "--mint",
  pink: "--pink",
  violet: "--primary",
  coral: "--coral",
  yellow: "--yellow",
  lime: "--lime",
  cyan: "--cyan",
  slate: "--slate",
};
const companyStatusTokens: Record<string, string> = {
  ingen: "--border",
  kunde: "--mint",
  konkurrent: "--coral",
  samarbeidspartner: "--blue",
};
const minimumReadableZoom = 0.85;
let reactNodeRegistered = false;

function findDomainPanel(container: HTMLElement, id: string) {
  return [...container.querySelectorAll<HTMLElement>("[data-graph-panel]")]
    .find((panel) => panel.dataset.graphPanel === id) ?? null;
}

function waitForDomainPanel(container: HTMLElement, id: string): Promise<HTMLElement | null> {
  const existing = findDomainPanel(container, id);
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      const panel = findDomainPanel(container, id);
      if (!panel) return;
      observer.disconnect();
      window.clearTimeout(timeout);
      resolve(panel);
    });
    const timeout = window.setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, 2500);
    observer.observe(container, { childList: true, subtree: true });
  });
}

async function fitReadableView(graph: Graph, container: HTMLElement) {
  await graph.fitView({ when: "always" }, false);
  const readableZoom = container.clientWidth < 900 ? 0.7 : minimumReadableZoom;
  if (graph.getZoom() >= readableZoom) return;
  await graph.zoomTo(readableZoom, false);
  const focusId = graph.getNodeData()[0]?.id;
  if (!focusId) return;
  await graph.focusElement(focusId, false);
  // React nodes can mount after G6 finishes positioning the canvas.
  const panel = await waitForDomainPanel(container, focusId);
  if (!panel) return;
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  const panelBounds = panel.getBoundingClientRect();
  const viewport = container.getBoundingClientRect();
  const desiredX = panelBounds.width > viewport.width - 48
    ? viewport.left + 24
    : viewport.left + (viewport.width - panelBounds.width) / 2;
  const desiredY = panelBounds.height > viewport.height - 48
    ? viewport.top + 24
    : viewport.top + (viewport.height - panelBounds.height) / 2;
  await graph.translateBy([desiredX - panelBounds.left, desiredY - panelBounds.top], false);
}

function keepFocusedCardVisible(graph: Graph, container: HTMLElement, element: HTMLElement) {
  const view = container.getBoundingClientRect();
  const card = element.getBoundingClientRect();
  const margin = 24;
  const dx = card.left < view.left + margin
    ? view.left + margin - card.left
    : card.right > view.right - margin ? view.right - margin - card.right : 0;
  const dy = card.top < view.top + margin
    ? view.top + margin - card.top
    : card.bottom > view.bottom - margin ? view.bottom - margin - card.bottom : 0;
  if (dx || dy) void graph.translateBy([dx, dy], false);
}

function CompanyCard({
  company,
  onOpen,
  onFocus,
}: {
  company: MapCompany;
  onOpen: (kind: "company" | "contact", id: string, anchor: Element) => void;
  onFocus: (anchor: HTMLElement) => void;
}) {
  const borderColor = `var(${companyStatusTokens[company.status] ?? "--border"})`;
  const headerColor = company.status !== "ingen"
    ? `color-mix(in srgb, ${borderColor} 20%, var(--card))`
    : "var(--card)";
  return (
    <div
      className="absolute flex flex-col overflow-hidden rounded-xl border-2 bg-card shadow-card"
      style={{ left: company.x, top: company.y, width: company.width, height: company.height, borderColor }}
      role="group"
      aria-label={`${company.label}, ${company.people.length} kontakter`}
    >
      <button
        type="button"
        data-graph-card={`company:${company.id}`}
        className="organization-map-card flex w-full shrink-0 items-center justify-center border-b px-3 text-center text-[16px] font-semibold outline-none transition-colors hover:brightness-95 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        style={{ height: company.headerHeight, backgroundColor: headerColor, borderColor }}
        title={company.label}
        aria-label={`Vis ${company.label}`}
        aria-pressed="false"
        onFocus={(event) => {
          if (event.currentTarget.matches(":focus-visible")) onFocus(event.currentTarget);
        }}
        onClick={(event) => {
          event.stopPropagation();
          onOpen("company", company.id, event.currentTarget);
        }}
      >
        <span className="line-clamp-3 min-w-0 break-words leading-5">{company.label}</span>
      </button>
      {company.people.length > 0 && (
        <div className="flex flex-col gap-2 p-2.5">
          {company.people.map((person) => (
            <button
              key={person.id}
              type="button"
              data-graph-card={`contact:${person.id}`}
              className="organization-map-card flex w-full shrink-0 flex-col rounded-lg border border-border bg-card px-2.5 py-2 text-left shadow-sm outline-none transition-all hover:border-primary/30 hover:shadow-card-hover focus-visible:ring-2 focus-visible:ring-ring"
              style={{ height: person.height }}
              aria-label={`Vis kontaktkort for ${person.label}. Status: ${contactStatusName(person.status)}. Ansvarlig: ${person.assigneeName ?? "Uten ansvarlig"}`}
              aria-pressed="false"
              onFocus={(event) => {
                if (event.currentTarget.matches(":focus-visible")) onFocus(event.currentTarget);
              }}
              onClick={(event) => {
                event.stopPropagation();
                onOpen("contact", person.id, event.currentTarget);
              }}
            >
              <span className="flex w-full items-start gap-2">
                <span className="mt-0.5 shrink-0" title={contactStatusName(person.status)}>
                  <ContactStatusIcon status={person.status} />
                </span>
                <span className="line-clamp-2 min-w-0 flex-1 break-words text-[14px] font-semibold leading-5" title={person.label}>
                  {person.label}
                </span>
                <span className="shrink-0" title={person.assigneeName ?? "Uten ansvarlig"}>
                  <Avatar
                    name={person.assigneeName ?? "Uten ansvarlig"}
                    src={profileAvatarUrl(person.assigneeAvatarPath)}
                    className="size-6"
                  />
                </span>
              </span>
              <span className="mt-1 block w-full text-[12px] leading-[18px] text-muted-foreground">
                {person.descriptionLines.map((line, index) => (
                  <span className="block w-full truncate" key={`${person.id}:${index}`}>{line}</span>
                ))}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DomainPanel({
  panel,
  onOpen,
  onFocus,
}: {
  panel: MapPanel;
  onOpen: (kind: "domain" | "company" | "contact", id: string, anchor: Element) => void;
  onFocus: (anchor: HTMLElement) => void;
}) {
  const color = `var(${domainColorTokens[panel.color] ?? "--slate"})`;
  return (
    <div
      className="relative overflow-hidden rounded-2xl border-2 bg-card shadow-card"
      data-graph-panel={panel.id}
      style={{
        width: panel.width,
        height: panel.height,
        borderColor: color,
        color: "var(--foreground)",
      }}
      role="group"
      aria-label={`${panel.label}, ${panel.companies.length} organisasjoner`}
    >
      {panel.entityId ? (
        <button
          type="button"
          data-graph-card={panel.id}
          className="organization-map-card flex h-16 w-full flex-col items-center justify-center border-b text-center outline-none transition-colors hover:brightness-95 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          style={{ borderColor: color, backgroundColor: `color-mix(in srgb, ${color} 8%, var(--card))` }}
          aria-label={`Vis ${panel.label}`}
          aria-pressed="false"
          onFocus={(event) => {
            if (event.currentTarget.matches(":focus-visible")) onFocus(event.currentTarget);
          }}
          onClick={(event) => {
            event.stopPropagation();
            onOpen("domain", panel.entityId!, event.currentTarget);
          }}
        >
          <span className="max-w-full truncate px-3 text-[17px] font-semibold leading-6" title={panel.label}>{panel.label}</span>
          <span className="text-xs text-muted-foreground">{panel.companies.length} organisasjoner</span>
        </button>
      ) : (
        <div className="flex h-16 items-center justify-center border-b font-semibold" style={{ borderColor: color }}>
          {panel.label}
        </div>
      )}
      {panel.companies.length ? panel.companies.map((company) => (
        <CompanyCard key={company.id} company={company} onOpen={onOpen} onFocus={onFocus} />
      )) : (
        <p className="px-4 pt-7 text-center text-sm text-muted-foreground">Ingen organisasjoner ennå</p>
      )}
    </div>
  );
}

export function OrganizationMapGraph({
  data,
  selection,
  onOpenNode,
  onCloseNode,
  activeNode,
  fitToken,
  zoomAction,
}: {
  data: MapSource;
  selection: MapSelection;
  onOpenNode: (kind: "domain" | "company" | "contact", id: string, anchor: Element) => void;
  onCloseNode: () => void;
  activeNode: { kind: "domain" | "company" | "contact"; id: string } | null;
  fitToken: number;
  zoomAction: { sequence: number; factor: number };
}) {
  const { theme } = useTheme();
  const reducedMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<Graph | null>(null);
  const onOpenNodeRef = useRef(onOpenNode);
  const onCloseNodeRef = useRef(onCloseNode);
  const renderQueue = useRef(Promise.resolve());
  const hasRendered = useRef(false);
  const [ready, setReady] = useState(false);
  const [rendered, setRendered] = useState(false);
  const [renderError, setRenderError] = useState(false);
  const [renderRetry, setRenderRetry] = useState(0);
  const renderedSelectionRef = useRef<string | null>(null);
  const graphMap = useMemo(() => buildOrganizationMap(data, selection), [data, selection]);
  onOpenNodeRef.current = onOpenNode;
  onCloseNodeRef.current = onCloseNode;

  useEffect(() => {
    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;
    let resizeTimer: number | undefined;
    let removeWheelListener: (() => void) | null = null;
    async function initialize() {
      const [{ Graph, ExtensionCategory, CanvasEvent, register }, { ReactNode }] =
        await Promise.all([import("@antv/g6"), import("@antv/g6-extension-react")]);
      if (disposed || !containerRef.current) return;
      if (!reactNodeRegistered) {
        register(ExtensionCategory.NODE, "contac-map-card", ReactNode);
        reactNodeRegistered = true;
      }
      const graph = new Graph({
        container: containerRef.current,
        zoomRange: [0.05, 3],
        autoResize: true,
        animation: false,
        node: {
          type: "contac-map-card",
          style: {
            component: (datum: NodeData) => {
              const panel = datum.data as unknown as MapPanel;
              return (
                <DomainPanel
                  panel={panel}
                  onOpen={(kind, id, anchor) => onOpenNodeRef.current(kind, id, anchor)}
                  onFocus={(anchor) => {
                    if (graphRef.current && containerRef.current)
                      keepFocusedCardVisible(graphRef.current, containerRef.current, anchor);
                  }}
                />
              );
            },
          },
        },
        behaviors: [
          { type: "drag-canvas", range: Infinity },
          { type: "zoom-canvas", key: "map-pinch", trigger: ["pinch"], sensitivity: 1.5 },
        ],
      });
      graph.on(CanvasEvent.CLICK, () => onCloseNodeRef.current());
      graphRef.current = graph;
      const container = containerRef.current;
      // Capture gestures over HTML cards as well as the G6 canvas.
      const onWheel = (event: WheelEvent) => {
        if (graphRef.current !== graph) return;
        const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? container.clientHeight
            : 1;
        event.preventDefault();
        if (event.ctrlKey) {
          const bounds = container.getBoundingClientRect();
          const origin: [number, number] = [event.clientX - bounds.left, event.clientY - bounds.top];
          const zoom = graph.getZoom() * Math.exp(-event.deltaY * unit * 0.006);
          void graph.zoomTo(zoom, false, origin);
        } else {
          void graph.translateBy([-event.deltaX * unit, -event.deltaY * unit], false);
        }
      };
      container.addEventListener("wheel", onWheel, { capture: true, passive: false });
      removeWheelListener = () => container.removeEventListener("wheel", onWheel, true);
      let previousWidth = container.clientWidth;
      let previousHeight = container.clientHeight;
      resizeObserver = new ResizeObserver(() => {
        if (graphRef.current !== graph) return;
        const width = container.clientWidth;
        const height = container.clientHeight;
        if (width === previousWidth && height === previousHeight) return;
        previousWidth = width;
        previousHeight = height;
        if (!hasRendered.current || !graph.getNodeData().length) return;
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => {
          renderQueue.current = renderQueue.current.catch(() => undefined).then(async () => {
            if (graphRef.current !== graph) return;
            graph.resize();
            await fitReadableView(graph, container);
          });
        }, 120);
      });
      resizeObserver.observe(containerRef.current);
      setReady(true);
    }
    void initialize();
    return () => {
      disposed = true;
      window.clearTimeout(resizeTimer);
      removeWheelListener?.();
      resizeObserver?.disconnect();
      hasRendered.current = false;
      graphRef.current?.destroy();
      graphRef.current = null;
    };
    // The graph instance stays mounted; later effects update its data and size.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const graph = graphRef.current;
    if (!ready || !graph) return;
    setRendered(false);
    setRenderError(false);
    renderQueue.current = renderQueue.current.catch(() => undefined).then(async () => {
      if (graphRef.current !== graph) return;
      // G6's React node layer positions every HTML panel relative to the first
      // node's top-left corner, so all coordinates use that panel as an anchor.
      const anchor = graphMap.nodes[0];
      const graphData: GraphData = {
        nodes: graphMap.nodes.map((panel) => ({
          id: panel.id,
          data: { ...panel },
          style: {
            x: panel.x + anchor.width / 2,
            y: panel.y + anchor.height / 2,
            size: [panel.width, panel.height],
          },
        })),
        edges: [],
        combos: [],
      };
      graph.setData(graphData);
      await graph.render();
      if (graphRef.current !== graph) return;
      const selectionKey = selection.kind === "all" ? "all" : `${selection.kind}:${selection.id}`;
      if (graphMap.nodes.length && renderedSelectionRef.current !== selectionKey && containerRef.current)
        await fitReadableView(graph, containerRef.current);
      renderedSelectionRef.current = selectionKey;
      if (graphRef.current === graph) {
        hasRendered.current = true;
        setRendered(true);
      }
    }).catch((error) => {
      console.error("Could not render organization map", error);
      if (graphRef.current === graph) {
        setRenderError(true);
        setRendered(true);
      }
    });
  }, [graphMap, ready, reducedMotion, renderRetry, theme]);

  useEffect(() => {
    const graph = graphRef.current;
    if (!ready || !graph || !fitToken) return;
    void graph.fitView({ when: "always" }, reducedMotion ? false : { duration: 250 });
  }, [fitToken, ready, reducedMotion]);

  useEffect(() => {
    const graph = graphRef.current;
    if (!ready || !graph || !zoomAction.sequence) return;
    void graph.zoomBy(zoomAction.factor, reducedMotion ? false : { duration: 160 });
  }, [zoomAction, ready, reducedMotion]);

  useEffect(() => {
    const activeId = activeNode ? `${activeNode.kind}:${activeNode.id}` : null;
    containerRef.current?.querySelectorAll<HTMLButtonElement>("[data-graph-card]").forEach((card) => {
      const selected = card.dataset.graphCard === activeId;
      card.classList.toggle("is-active", selected);
      card.setAttribute("aria-pressed", String(selected));
    });
  }, [activeNode, graphMap]);

  return (
    <div className="relative h-full w-full" role="group" aria-label="Organisasjonskart">
      <div
        ref={containerRef}
        className="h-full w-full touch-none"
        aria-label={
          selection.kind === "company"
              ? `Kart for ${graphMap.companies[0]?.name ?? "organisasjonen"}`
              : "Alle organisasjoner og domener"
        }
      />
      {renderError ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-card/90 text-sm text-muted-foreground" role="status">
          <p>Kunne ikke vise organisasjonskartet.</p>
          <Button variant="outline" onClick={() => setRenderRetry((current) => current + 1)}>
            Prøv igjen
          </Button>
        </div>
      ) : !rendered ? (
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground" role="status">
          Laster organisasjonskart …
        </p>
      ) : graphMap.companies.length === 0 && (
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          Ingen organisasjoner i dette utvalget.
        </p>
      )}
    </div>
  );
}
