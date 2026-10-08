export type OrganizationMapView = { zoom: number; position: [number, number] };
const views = new Map<string, OrganizationMapView>();
const storageKey = (key: string) => `contac:organization-map-view:${key}`;

export function validMapView(value: unknown): value is OrganizationMapView {
  if (!value || typeof value !== "object") return false;
  const view = value as OrganizationMapView;
  return (
    Number.isFinite(view.zoom) &&
    view.zoom >= 0.05 &&
    view.zoom <= 3 &&
    Array.isArray(view.position) &&
    view.position.length === 2 &&
    view.position.every(Number.isFinite)
  );
}

export function readMapView(key: string): OrganizationMapView | null {
  const cached = views.get(key);
  if (cached) return cached;
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(storageKey(key)) ?? "null");
    if (validMapView(value)) {
      views.set(key, value);
      return value;
    }
  } catch {
    /* Storage may be unavailable. In-memory navigation still works. */
  }
  return null;
}

export function saveMapView(key: string, view: OrganizationMapView) {
  if (!validMapView(view)) return;
  views.set(key, view);
  try {
    sessionStorage.setItem(storageKey(key), JSON.stringify(view));
  } catch {
    /* Keep the in-memory view. */
  }
}
