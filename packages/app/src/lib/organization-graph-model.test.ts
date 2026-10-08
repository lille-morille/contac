import { expect, test } from "vitest";
import { buildOrganizationMap, wrapMapDescription, type MapPanel, type MapSource } from "./organization-graph-model.ts";

const source: MapSource = {
  domains: [
    { id: "a", name: "A", color: "mint" },
    { id: "b", name: "B", color: "blue" },
  ],
  companies: [
    { id: "shared", name: "Shared", status: "kunde" },
    { id: "other", name: "Other", status: "ingen" },
  ],
  companyDomains: [
    { companyId: "shared", domainId: "a" },
    { companyId: "shared", domainId: "b" },
    { companyId: "other", domainId: "b" },
  ],
  contacts: [
    { id: "visible", companyId: "shared", name: "Visible", description: "A complete description", status: "ikke_kontaktet" },
    { id: "duplicate", companyId: "shared", name: "Duplicate", description: null, status: "duplicate" },
    { id: "deleted", companyId: "shared", name: "Deleted", description: null, status: "ikke_kontaktet", deletedAt: "2026-10-06" },
  ],
};

function separated(a: MapPanel, b: MapPanel, gap = 80) {
  return a.x >= b.x + b.width + gap || b.x >= a.x + a.width + gap ||
    a.y >= b.y + b.height + gap || b.y >= a.y + a.height + gap;
}

test("long descriptions stay a short preview in the map", () => {
  const lines = wrapMapDescription("A detailed contact description ".repeat(12));
  expect(lines).toHaveLength(2);
  expect(lines[1].endsWith("…")).toBe(true);
});

test("long names receive space without hiding contacts", () => {
  const longName = "A very long organization name with several departments and locations";
  const longContactName = "A contact with a long full name and professional title";
  const map = buildOrganizationMap({
    ...source,
    companies: [{ id: "shared", name: longName, status: "ingen" }],
    contacts: [{ id: "visible", companyId: "shared", name: longContactName,
      description: "A complete description", status: "ikke_kontaktet" }],
  }, { kind: "all" });
  const company = map.nodes[0].companies[0];
  expect(company.headerHeight).toBe(86);
  expect(company.people[0].height).toBeGreaterThan(62);
  expect(company.y + company.height).toBeLessThanOrEqual(map.nodes[0].height - 18);
});

test("a historical multi-domain organization appears only in its retained domain", () => {
  const map = buildOrganizationMap(source, { kind: "all" });
  expect(map.nodes).toHaveLength(2);
  const a = map.nodes.find((panel) => panel.entityId === "a")!;
  const b = map.nodes.find((panel) => panel.entityId === "b")!;
  expect(a.companies.map((company) => company.id)).toEqual(["shared"]);
  expect(b.companies.map((company) => company.id)).toEqual(["other"]);
  expect(a.companies[0].people.map((person) => person.id)).toEqual(["visible"]);
  expect(separated(a, b)).toBe(true);
});

test("organization focus retains the correct section", () => {
  const company = buildOrganizationMap(source, { kind: "company", id: "shared" });
  expect(company.nodes.map((panel) => panel.id)).toEqual(["domain:a"]);
  expect(company.nodes[0].companies.map((item) => item.id)).toEqual(["shared"]);
});

test("a long organization displays every person without a capped internal list", () => {
  const contacts = Array.from({ length: 12 }, (_, index) => ({
    id: String(index), companyId: "shared", name: `Person ${index}`,
    description: index === 0 ? "A complete description that continues across more than one line" : null,
    status: "ikke_kontaktet",
  }));
  const map = buildOrganizationMap({ ...source, contacts }, { kind: "all" });
  const panel = map.nodes.find((candidate) => candidate.entityId === "a")!;
  const company = panel.companies[0];
  expect(company.people).toHaveLength(12);
  expect(company.people[0].descriptionLines.length).toBeGreaterThan(1);
  expect(company.height).toBeGreaterThan(800);
  expect(company.y + company.height).toBeLessThanOrEqual(panel.height - 18);
});

test("a team-sized domain cloud grows in two dimensions without overlapping panels or cards", () => {
  const counts = [19, 11, 8, 8, 6, 3, 3, 3, 3, 2, 2, 2, 2];
  const domains = counts.map((_, index) => ({ id: String(index), name: `Domain ${index}`, color: "blue" }));
  const companies = Array.from({ length: 70 }, (_, index) => ({ id: String(index), name: `Organization ${index}`, status: "ingen" }));
  let nextCompany = 0;
  const companyDomains = counts.flatMap((count, index) =>
    Array.from({ length: count }, () => ({ companyId: companies[nextCompany++ % companies.length].id, domainId: domains[index].id })),
  );
  const contacts = companies.flatMap((company, index) =>
    Array.from({ length: index === 0 ? 12 : index < 58 ? 2 : 1 }, (_, person) => ({
      id: `${company.id}-${person}`, companyId: company.id, name: `Person ${person}`,
      description: null, status: "ikke_kontaktet",
    })),
  );
  const map = buildOrganizationMap({ domains, companies, companyDomains, contacts }, { kind: "all" });
  expect(map.nodes).toHaveLength(13);
  expect(map.nodes.reduce((sum, panel) => sum + panel.companies.length, 0)).toBe(70);
  expect(map.nodes.some((panel) => panel.x < 0 && panel.y < 0)).toBe(true);
  expect(map.nodes.some((panel) => panel.x > 0 && panel.y > 0)).toBe(true);
  for (let i = 0; i < map.nodes.length; i++) {
    const panel = map.nodes[i];
    for (let j = i + 1; j < map.nodes.length; j++)
      expect(separated(panel, map.nodes[j]), `${panel.id} overlaps ${map.nodes[j].id}`).toBe(true);
    for (const company of panel.companies) {
      expect(company.x).toBeGreaterThanOrEqual(2);
      expect(company.y).toBeGreaterThanOrEqual(64);
      expect(company.x + company.width).toBeLessThanOrEqual(panel.width - 2);
      expect(company.y + company.height).toBeLessThanOrEqual(panel.height - 18);
      for (const other of panel.companies) {
        if (other === company) continue;
        expect(company.x >= other.x + other.width || other.x >= company.x + company.width ||
          company.y >= other.y + other.height || other.y >= company.y + company.height).toBe(true);
      }
    }
  }
});
