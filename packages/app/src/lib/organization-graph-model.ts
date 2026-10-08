export type MapSelection =
  | { kind: "all" }
  | { kind: "company"; id: string };

export type MapPerson = {
  id: string;
  label: string;
  descriptionLines: string[];
  height: number;
};

export type MapCompany = {
  id: string;
  label: string;
  status: string;
  people: MapPerson[];
  x: number;
  y: number;
  width: number;
  height: number;
  headerHeight: number;
};

export type MapPanel = {
  id: string;
  entityId: string | null;
  label: string;
  color: string;
  companies: MapCompany[];
  x: number;
  y: number;
  width: number;
  height: number;
};

export type MapSource = {
  domains: { id: string; name: string; color: string }[];
  companies: { id: string; name: string; status: string }[];
  companyDomains: { companyId: string; domainId: string }[];
  contacts: {
    id: string;
    companyId: string;
    name: string;
    description: string | null;
    status: string;
    deletedAt?: string | null;
  }[];
};

const companyWidth = 280;
const companyHeaderHeight = 54;
const personGap = 8;
const companyPadding = 10;
const panelPadding = 18;
const panelHeaderHeight = 64;
const cardGap = 16;
const panelGap = 80;

export function wrapMapDescription(description: string): string[] {
  const words = description.trim().split(/\s+/).flatMap((word) => word.match(/.{1,30}/g) ?? []);
  const lines: string[] = [];
  for (const word of words) {
    const last = lines.length - 1;
    if (last >= 0 && lines[last].length + word.length + 1 <= 30) lines[last] += ` ${word}`;
    else lines.push(word);
  }
  return lines.length > 2
    ? [lines[0], `${lines[1].slice(0, 29).trimEnd()}…`]
    : lines;
}

function panelColumns(count: number) {
  if (count <= 1) return 1;
  if (count <= 5) return 2;
  if (count <= 12) return 3;
  return 4;
}

function createPanel(
  domain: { id: string; name: string; color: string } | null,
  companies: MapSource["companies"],
  peopleByCompany: Map<string, MapPerson[]>,
): MapPanel {
  const columns = panelColumns(companies.length);
  const columnHeights = Array<number>(columns).fill(0);
  const cards: MapCompany[] = [];
  for (const company of [...companies].sort((a, b) => a.name.localeCompare(b.name, "nb"))) {
    const people = peopleByCompany.get(company.id) ?? [];
    const headerHeight = company.name.length > 48 ? 86 : company.name.length > 26 ? 70 : companyHeaderHeight;
    const peopleHeight = people.length
      ? companyPadding * 2 + people.reduce((sum, person) => sum + person.height, 0) +
        personGap * (people.length - 1)
      : 0;
    const height = 4 + headerHeight + peopleHeight;
    const column = columnHeights.indexOf(Math.min(...columnHeights));
    cards.push({
      id: company.id,
      label: company.name,
      status: company.status,
      people,
      x: 2 + panelPadding + column * (companyWidth + cardGap),
      y: 2 + panelHeaderHeight + panelPadding + columnHeights[column],
      width: companyWidth,
      height,
      headerHeight,
    });
    columnHeights[column] += height + cardGap;
  }
  const contentHeight = cards.length ? Math.max(...columnHeights) - cardGap : 52;
  return {
    id: domain ? `domain:${domain.id}` : "domain:unassigned",
    entityId: domain?.id ?? null,
    label: domain?.name ?? "Uten domene",
    color: domain?.color ?? "slate",
    companies: cards,
    x: 0,
    y: 0,
    width: 4 + panelPadding * 2 + columns * companyWidth + (columns - 1) * cardGap,
    height: 4 + panelHeaderHeight + panelPadding * 2 + contentHeight,
  };
}

function separated(a: MapPanel, b: MapPanel) {
  return a.x >= b.x + b.width + panelGap || b.x >= a.x + a.width + panelGap ||
    a.y >= b.y + b.height + panelGap || b.y >= a.y + a.height + panelGap;
}

/** Pack domain sections in expanding rings, keeping their full rectangles apart. */
export function arrangePanels(panels: MapPanel[]): MapPanel[] {
  const arranged = [...panels].sort((a, b) => b.width * b.height - a.width * a.height);
  const placed: MapPanel[] = [];
  for (const panel of arranged) {
    if (!placed.length) {
      placed.push({ ...panel, x: -panel.width / 2, y: -panel.height / 2 });
      continue;
    }
    let found: MapPanel | null = null;
    for (let ring = 1; ring < 100 && !found; ring++) {
      const radius = ring * 90;
      const slots = Math.max(12, Math.ceil(2 * Math.PI * radius / 120));
      for (let slot = 0; slot < slots; slot++) {
        const angle = (slot / slots) * 2 * Math.PI + (ring % 2 ? Math.PI / slots : 0);
        const candidate = {
          ...panel,
          x: Math.round(Math.cos(angle) * radius - panel.width / 2),
          y: Math.round(Math.sin(angle) * radius - panel.height / 2),
        };
        if (placed.every((other) => separated(candidate, other))) {
          found = candidate;
          break;
        }
      }
    }
    if (!found) throw new Error("Could not place organization domain without overlap");
    placed.push(found);
  }
  return placed;
}

/** A domain is a section containing organization cards and their people. */
export function buildOrganizationMap(source: MapSource, selection: MapSelection) {
  // Match migration 0051 while the production preview still has historical
  // multi-domain links: the lowest domain ID is retained for each company.
  const domainByCompany = new Map<string, string>();
  for (const link of [...source.companyDomains].sort((a, b) =>
    a.domainId < b.domainId ? -1 : a.domainId > b.domainId ? 1 : 0,
  )) {
    if (!domainByCompany.has(link.companyId)) domainByCompany.set(link.companyId, link.domainId);
  }
  const linkedDomainIds = selection.kind === "company"
    ? new Set([domainByCompany.get(selection.id)].filter((id): id is string => !!id))
    : null;
  const domains = source.domains.filter((domain) =>
    linkedDomainIds ? linkedDomainIds.has(domain.id) : true,
  );
  const companies = source.companies.filter((company) =>
    selection.kind === "company"
      ? company.id === selection.id
      : true,
  );
  const companyIds = new Set(companies.map((company) => company.id));
  const peopleByCompany = new Map<string, MapPerson[]>();
  for (const contact of source.contacts) {
    if (contact.status === "duplicate" || contact.deletedAt || !companyIds.has(contact.companyId)) continue;
    const descriptionLines = wrapMapDescription(contact.description?.trim() || "Ingen kort beskrivelse");
    const people = peopleByCompany.get(contact.companyId) ?? [];
    people.push({
      id: contact.id,
      label: contact.name,
      descriptionLines,
      height: Math.max(62, 40 + (contact.name.length > 28 ? 20 : 0) + descriptionLines.length * 18),
    });
    peopleByCompany.set(contact.companyId, people);
  }
  const panels = domains.map((domain) => createPanel(
    domain,
    companies.filter((company) => domainByCompany.get(company.id) === domain.id),
    peopleByCompany,
  ));
  const unassigned = companies.filter((company) => !domainByCompany.has(company.id));
  if (unassigned.length) panels.push(createPanel(null, unassigned, peopleByCompany));
  return { domains, companies, nodes: arrangePanels(panels) };
}
