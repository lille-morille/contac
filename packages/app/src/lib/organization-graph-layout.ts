export type GraphBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  kind: "domain" | "company" | "contact";
};

// Keep domains near their radial positions while allowing the outer nodes to make room.
export function separateGraphNodes<T extends GraphBox>(input: T[], gap = 28): T[] {
  const nodes = input.map((node) => ({ ...node }));
  const mobility = (node: GraphBox) => (node.kind === "domain" ? 0 : 1);
  for (let pass = 0; pass < 80; pass++) {
    let changed = false;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const first = nodes[i];
        const second = nodes[j];
        const dx = second.x - first.x;
        const dy = second.y - first.y;
        const overlapX = (first.width + second.width) / 2 + gap - Math.abs(dx);
        const overlapY = (first.height + second.height) / 2 + gap - Math.abs(dy);
        if (overlapX <= 0 || overlapY <= 0) continue;
        changed = true;
        const firstMobility = mobility(first);
        const secondMobility = mobility(second);
        const total = firstMobility + secondMobility || 2;
        const firstShare = (firstMobility || (total === 2 ? 1 : 0)) / total;
        const secondShare = (secondMobility || (total === 2 ? 1 : 0)) / total;
        if (overlapX < overlapY) {
          const direction = dx === 0 ? (i % 2 === 0 ? 1 : -1) : Math.sign(dx);
          first.x -= direction * (overlapX + 0.1) * firstShare;
          second.x += direction * (overlapX + 0.1) * secondShare;
        } else {
          const direction = dy === 0 ? (i % 2 === 0 ? 1 : -1) : Math.sign(dy);
          first.y -= direction * (overlapY + 0.1) * firstShare;
          second.y += direction * (overlapY + 0.1) * secondShare;
        }
      }
    }
    if (!changed) break;
  }
  return nodes;
}

export function closestSideAnchors(from: GraphBox, to: GraphBox) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const horizontal = Math.sign(dx) || 1;
  const vertical = Math.sign(dy) || 1;
  const fromSides = [
    { x: from.x + (horizontal * from.width) / 2, y: from.y },
    { x: from.x, y: from.y + (vertical * from.height) / 2 },
  ];
  const toSides = [
    { x: to.x - (horizontal * to.width) / 2, y: to.y },
    { x: to.x, y: to.y - (vertical * to.height) / 2 },
  ];
  let closest = { x1: fromSides[0].x, y1: fromSides[0].y, x2: toSides[0].x, y2: toSides[0].y };
  let distance = Infinity;
  for (const source of fromSides) {
    for (const target of toSides) {
      const candidate = (source.x - target.x) ** 2 + (source.y - target.y) ** 2;
      if (candidate < distance) {
        distance = candidate;
        closest = { x1: source.x, y1: source.y, x2: target.x, y2: target.y };
      }
    }
  }
  return closest;
}
