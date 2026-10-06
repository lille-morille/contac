import { expect, test } from "vitest";
import {
  closestSideAnchors,
  layoutOrganizationNodes,
  routeOrganizationLink,
  type GraphBox,
} from "./organization-graph-layout.ts";

test("connected rectangular cards settle without overlap", () => {
  const input = [
    { id: "domain:a", kind: "domain" as const, x: 0, y: -120, width: 190, height: 58 },
    { id: "domain:b", kind: "domain" as const, x: 0, y: 120, width: 190, height: 58 },
    { id: "company:a", kind: "company" as const, x: 0, y: -400, width: 230, height: 58 },
    { id: "company:b", kind: "company" as const, x: 0, y: 350, width: 230, height: 58 },
    { id: "contact:a", kind: "contact" as const, x: -150, y: -600, width: 260, height: 140 },
    { id: "contact:b", kind: "contact" as const, x: 150, y: -600, width: 260, height: 100 },
  ];
  const links = [
    { from: "domain:a", to: "company:a" },
    { from: "domain:b", to: "company:a" },
    { from: "domain:b", to: "company:b" },
    { from: "company:a", to: "contact:a" },
    { from: "company:a", to: "contact:b" },
  ];
  const nodes = layoutOrganizationNodes(input, links);
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const horizontalGap =
        Math.abs(nodes[i].x - nodes[j].x) - (nodes[i].width + nodes[j].width) / 2;
      const verticalGap =
        Math.abs(nodes[i].y - nodes[j].y) - (nodes[i].height + nodes[j].height) / 2;
      expect(horizontalGap >= 25.9 || verticalGap >= 25.9).toBe(true);
    }
  }
  expect(layoutOrganizationNodes(input, links)).toEqual(nodes);
});

test("horizontal and vertical links meet the middle of facing sides", () => {
  const company: GraphBox = { kind: "company", x: 0, y: 0, width: 230, height: 58 };
  const right: GraphBox = { kind: "contact", x: 400, y: 0, width: 260, height: 120 };
  const below: GraphBox = { ...right, x: 0, y: 250 };
  expect(closestSideAnchors(company, right)).toEqual({ x1: 115, y1: 0, x2: 270, y2: 0 });
  expect(closestSideAnchors(company, below)).toEqual({ x1: 0, y1: 29, x2: 0, y2: 190 });
});

test("contacts above an organization connect to its top, including diagonally", () => {
  const organization: GraphBox = { kind: "company", x: 0, y: 0, width: 230, height: 58 };
  const leftContact: GraphBox = { kind: "contact", x: -145, y: -155, width: 260, height: 80 };
  const rightContact: GraphBox = { ...leftContact, x: 145 };
  expect(closestSideAnchors(leftContact, organization)).toEqual({
    x1: -145,
    y1: -115,
    x2: 0,
    y2: -29,
  });
  expect(closestSideAnchors(rightContact, organization)).toEqual({
    x1: 145,
    y1: -115,
    x2: 0,
    y2: -29,
  });
});

test("an offset lower contact receives its link on the side", () => {
  const organization: GraphBox = { kind: "company", x: 0, y: 0, width: 230, height: 58 };
  const contact: GraphBox = { kind: "contact", x: -130, y: 100, width: 260, height: 80 };
  expect(closestSideAnchors(organization, contact)).toEqual({
    x1: 0,
    y1: 29,
    x2: 0,
    y2: 100,
  });
});

test("an obstructed link routes around the intervening card", () => {
  const from = { id: "domain", kind: "domain" as const, x: 0, y: -200, width: 190, height: 58 };
  const to = { id: "company", kind: "company" as const, x: 0, y: 200, width: 230, height: 58 };
  const blocker = { id: "other", kind: "domain" as const, x: 0, y: 0, width: 190, height: 58 };
  const route = routeOrganizationLink(from, to, [from, to, blocker]);
  expect(route.points.length).toBeGreaterThan(2);
  expect(route.points[0]).toEqual({ x: 0, y: -171 });
  expect(route.points.at(-1)).toEqual({ x: 0, y: 171 });
  expect(route.points.slice(1, -1).every((point) => Math.abs(point.x) > 95)).toBe(true);
});

test("crowded graphs keep links out of unrelated cards", () => {
  const input = Array.from({ length: 100 }, (_, index) => ({
    id: String(index),
    kind: (index < 10 ? "domain" : index < 60 ? "company" : "contact") as GraphBox["kind"],
    x: Math.cos(index * 2.4) * Math.sqrt(index) * 80,
    y: Math.sin(index * 2.4) * Math.sqrt(index) * 80,
    width: index < 10 ? 190 : index < 60 ? 230 : 260,
    height: index < 60 ? 58 : 100,
  }));
  const links = input.slice(10).map((node, index) => ({
    from: String(index < 50 ? index % 10 : 10 + (index % 50)),
    to: node.id,
  }));
  const nodes = layoutOrganizationNodes(input, links);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const link of links) {
    const route = routeOrganizationLink(byId.get(link.from)!, byId.get(link.to)!, nodes);
    let crossesCard = false;
    for (let segment = 0; segment < route.points.length - 1; segment++) {
      const start = route.points[segment];
      const end = route.points[segment + 1];
      for (const node of nodes) {
        if (node.id === link.from || node.id === link.to) continue;
        for (let step = 1; step < 40; step++) {
          const fraction = step / 40;
          const x = start.x + (end.x - start.x) * fraction;
          const y = start.y + (end.y - start.y) * fraction;
          if (
            Math.abs(x - node.x) < node.width / 2 + 7 &&
            Math.abs(y - node.y) < node.height / 2 + 7
          )
            crossesCard = true;
        }
      }
    }
    expect(crossesCard, `${link.from} → ${link.to}`).toBe(false);
  }
});
