import { expect, test } from "vitest";
import {
  closestSideAnchors,
  separateGraphNodes,
  type GraphBox,
} from "./organization-graph-layout.ts";

test("overlapping map cards separate while the domain stays centered", () => {
  const input: GraphBox[] = [
    { kind: "domain", x: 0, y: 0, width: 190, height: 58 },
    { kind: "company", x: 120, y: 0, width: 230, height: 58 },
    { kind: "contact", x: 130, y: 0, width: 260, height: 120 },
    { kind: "contact", x: 135, y: 20, width: 260, height: 140 },
  ];
  const nodes = separateGraphNodes(input);
  expect(nodes[0]).toMatchObject({ x: 0, y: 0 });
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const horizontalGap =
        Math.abs(nodes[i].x - nodes[j].x) - (nodes[i].width + nodes[j].width) / 2;
      const verticalGap =
        Math.abs(nodes[i].y - nodes[j].y) - (nodes[i].height + nodes[j].height) / 2;
      expect(horizontalGap >= 27.9 || verticalGap >= 27.9).toBe(true);
    }
  }
});

test("map links meet the middle of the nearest facing sides", () => {
  const company: GraphBox = { kind: "company", x: 0, y: 0, width: 230, height: 58 };
  const right: GraphBox = { kind: "contact", x: 400, y: 0, width: 260, height: 120 };
  const below: GraphBox = { ...right, x: 0, y: 250 };
  expect(closestSideAnchors(company, right)).toEqual({ x1: 115, y1: 0, x2: 270, y2: 0 });
  expect(closestSideAnchors(company, below)).toEqual({ x1: 0, y1: 29, x2: 0, y2: 190 });
});
