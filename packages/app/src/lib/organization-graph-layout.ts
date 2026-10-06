export type GraphBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  kind: "domain" | "company" | "contact";
};

export type GraphLink = { from: string; to: string };

type PositionedNode = GraphBox & { id: string };

function boundaryRadius(node: GraphBox, ux: number, uy: number) {
  return Math.min(
    node.width / (2 * Math.max(Math.abs(ux), 0.001)),
    node.height / (2 * Math.max(Math.abs(uy), 0.001)),
  );
}

function visitNearbyPairs(
  nodes: GraphBox[],
  cellSize: number,
  range: number,
  visit: (first: number, second: number) => void,
) {
  const buckets = new Map<string, number[]>();
  for (let index = 0; index < nodes.length; index++) {
    const column = Math.floor(nodes[index].x / cellSize);
    const row = Math.floor(nodes[index].y / cellSize);
    for (let offsetX = -range; offsetX <= range; offsetX++) {
      for (let offsetY = -range; offsetY <= range; offsetY++) {
        const neighbors = buckets.get(`${column + offsetX}:${row + offsetY}`);
        if (neighbors) for (const neighbor of neighbors) visit(neighbor, index);
      }
    }
    const key = `${column}:${row}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(index);
    else buckets.set(key, [index]);
  }
}

function resolveOverlap(nodes: GraphBox[], gap: number) {
  let moved = false;
  visitNearbyPairs(nodes, 350, 1, (i, j) => {
    const first = nodes[i];
    const second = nodes[j];
    const dx = second.x - first.x;
    const dy = second.y - first.y;
    const overlapX = (first.width + second.width) / 2 + gap - Math.abs(dx);
    const overlapY = (first.height + second.height) / 2 + gap - Math.abs(dy);
    if (overlapX <= 0 || overlapY <= 0) return;
    moved = true;
    if (overlapX < overlapY) {
      const direction = dx === 0 ? (i % 2 === 0 ? 1 : -1) : Math.sign(dx);
      first.x -= (direction * (overlapX + 0.1)) / 2;
      second.x += (direction * (overlapX + 0.1)) / 2;
    } else {
      const direction = dy === 0 ? (i % 2 === 0 ? 1 : -1) : Math.sign(dy);
      first.y -= (direction * (overlapY + 0.1)) / 2;
      second.y += (direction * (overlapY + 0.1)) / 2;
    }
  });
  return moved;
}

/** Deterministic, settled force layout for the small, rectangular workspace graph. */
export function layoutOrganizationNodes<T extends PositionedNode>(
  input: T[],
  links: GraphLink[],
): T[] {
  const nodes = input.map((node) => ({ ...node }));
  const indices = new Map(nodes.map((node, index) => [node.id, index]));
  const edges = links.flatMap((link) => {
    const from = indices.get(link.from);
    const to = indices.get(link.to);
    return from === undefined || to === undefined ? [] : [{ from, to }];
  });
  const velocities = nodes.map(() => ({ x: 0, y: 0 }));
  const repulsion = 26000 * (1 + Math.min(2, nodes.length / 80));
  for (let tick = 0; tick < 180; tick++) {
    const alpha = 0.22 + 0.78 * (1 - tick / 180) ** 2;
    const forces = nodes.map(() => ({ x: 0, y: 0 }));
    for (const { from, to } of edges) {
      const source = nodes[from];
      const target = nodes[to];
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const ux = dx / distance;
      const uy = dy / distance;
      const gap = source.kind === "contact" || target.kind === "contact" ? 52 : 72;
      const desired = boundaryRadius(source, ux, uy) + boundaryRadius(target, ux, uy) + gap;
      const pull = Math.max(-7, Math.min(7, (distance - desired) * 0.035)) * alpha;
      forces[from].x += ux * pull;
      forces[from].y += uy * pull;
      forces[to].x -= ux * pull;
      forces[to].y -= uy * pull;
    }
    visitNearbyPairs(nodes, 350, 2, (i, j) => {
      const dx = nodes[j].x - nodes[i].x;
      const dy = nodes[j].y - nodes[i].y;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared > 700 * 700) return;
      const distance = Math.max(1, Math.sqrt(distanceSquared));
      const push = Math.min(5, repulsion / (distanceSquared + 2500)) * alpha;
      const ux = dx / distance;
      const uy = dy / distance;
      forces[i].x -= ux * push;
      forces[i].y -= uy * push;
      forces[j].x += ux * push;
      forces[j].y += uy * push;
    });
    // Move unrelated cards away from link corridors before routing the links.
    for (const { from, to } of edges) {
      const source = nodes[from];
      const target = nodes[to];
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const lengthSquared = dx * dx + dy * dy;
      if (lengthSquared < 1) continue;
      const length = Math.sqrt(lengthSquared);
      const nx = -dy / length;
      const ny = dx / length;
      for (let index = 0; index < nodes.length; index++) {
        if (index === from || index === to) continue;
        const node = nodes[index];
        const fraction = ((node.x - source.x) * dx + (node.y - source.y) * dy) / lengthSquared;
        if (fraction < 0.12 || fraction > 0.88) continue;
        const signed = (node.x - source.x) * nx + (node.y - source.y) * ny;
        const clearance = (Math.abs(nx) * node.width) / 2 + (Math.abs(ny) * node.height) / 2 + 24;
        if (Math.abs(signed) >= clearance) continue;
        const direction = signed === 0 ? (index % 2 === 0 ? 1 : -1) : Math.sign(signed);
        const push = Math.min(6, (clearance - Math.abs(signed)) * 0.05) * alpha;
        forces[index].x += nx * direction * push;
        forces[index].y += ny * direction * push;
      }
    }
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      velocities[i].x = (velocities[i].x + forces[i].x - node.x * 0.0014 * alpha) * 0.62;
      velocities[i].y = (velocities[i].y + forces[i].y - node.y * 0.0014 * alpha) * 0.62;
      node.x += velocities[i].x;
      node.y += velocities[i].y;
    }
    resolveOverlap(nodes, 26);
  }
  for (let pass = 0; pass < 80 && resolveOverlap(nodes, 26); pass++) {
    // Repeat until all rectangle collisions are cleared.
  }
  return nodes;
}

export function closestSideAnchors(from: GraphBox, to: GraphBox) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const horizontal = Math.sign(dx) || 1;
  const vertical = Math.sign(dy) || 1;
  // The receiving card uses the side indicated by the overall direction.
  // If those card spans overlap, use the other axis on the source so the link
  // does not travel through a card before reaching that receiving side.
  const targetVertical = Math.abs(dy) >= Math.abs(dx);
  const sourceVertical = targetVertical
    ? Math.abs(dy) >= (from.height + to.height) / 2
    : Math.abs(dx) < (from.width + to.width) / 2;
  return {
    x1: sourceVertical ? from.x : from.x + (horizontal * from.width) / 2,
    y1: sourceVertical ? from.y + (vertical * from.height) / 2 : from.y,
    x2: targetVertical ? to.x : to.x - (horizontal * to.width) / 2,
    y2: targetVertical ? to.y - (vertical * to.height) / 2 : to.y,
  };
}

type Point = { x: number; y: number };

type RoutingGrid = {
  left: number;
  top: number;
  columns: number;
  rows: number;
  size: number;
  occupied: Uint8Array;
};
const routingGrids = new WeakMap<object, RoutingGrid>();

function routingGrid(nodes: PositionedNode[]): RoutingGrid {
  const cached = routingGrids.get(nodes);
  if (cached) return cached;
  const size = 20;
  const left =
    Math.floor(Math.min(...nodes.map((node) => node.x - node.width / 2)) / size) * size - 180;
  const top =
    Math.floor(Math.min(...nodes.map((node) => node.y - node.height / 2)) / size) * size - 180;
  const right = Math.max(...nodes.map((node) => node.x + node.width / 2)) + 180;
  const bottom = Math.max(...nodes.map((node) => node.y + node.height / 2)) + 180;
  const columns = Math.ceil((right - left) / size) + 1;
  const rows = Math.ceil((bottom - top) / size) + 1;
  const occupied = new Uint8Array(columns * rows);
  for (const node of nodes) {
    const minColumn = Math.max(0, Math.floor((node.x - node.width / 2 - 8 - left) / size));
    const maxColumn = Math.min(columns - 1, Math.ceil((node.x + node.width / 2 + 8 - left) / size));
    const minRow = Math.max(0, Math.floor((node.y - node.height / 2 - 8 - top) / size));
    const maxRow = Math.min(rows - 1, Math.ceil((node.y + node.height / 2 + 8 - top) / size));
    for (let row = minRow; row <= maxRow; row++) {
      for (let column = minColumn; column <= maxColumn; column++) {
        const x = left + column * size;
        const y = top + row * size;
        if (
          Math.abs(x - node.x) <= node.width / 2 + 8 &&
          Math.abs(y - node.y) <= node.height / 2 + 8
        )
          occupied[row * columns + column] = 1;
      }
    }
  }
  const grid = { left, top, columns, rows, size, occupied };
  routingGrids.set(nodes, grid);
  return grid;
}

function gridDetour(
  from: PositionedNode,
  to: PositionedNode,
  nodes: PositionedNode[],
  start: Point,
  end: Point,
) {
  const grid = routingGrid(nodes);
  const pointAt = (index: number) => ({
    x: grid.left + (index % grid.columns) * grid.size,
    y: grid.top + Math.floor(index / grid.columns) * grid.size,
  });
  const cellAt = (point: Point) => ({
    column: Math.round((point.x - grid.left) / grid.size),
    row: Math.round((point.y - grid.top) / grid.size),
  });
  const clearEndpoint = (anchor: Point, point: Point) =>
    nodes.every((node) =>
      node.id === from.id || node.id === to.id ? true : !intersectsBox(anchor, point, node, 8),
    );
  const nearestOpen = (anchor: Point, node: PositionedNode) => {
    const direction = {
      x: Math.sign(anchor.x - node.x),
      y: Math.sign(anchor.y - node.y),
    };
    const preferred = cellAt({ x: anchor.x + direction.x * 24, y: anchor.y + direction.y * 24 });
    for (let radius = 0; radius <= 10; radius++) {
      let best = -1;
      let bestDistance = Infinity;
      for (let row = preferred.row - radius; row <= preferred.row + radius; row++) {
        for (
          let column = preferred.column - radius;
          column <= preferred.column + radius;
          column++
        ) {
          if (row < 0 || row >= grid.rows || column < 0 || column >= grid.columns) continue;
          const index = row * grid.columns + column;
          if (grid.occupied[index]) continue;
          const point = pointAt(index);
          if (!clearEndpoint(anchor, point)) continue;
          const distance = Math.hypot(
            point.x - preferred.column * grid.size - grid.left,
            point.y - preferred.row * grid.size - grid.top,
          );
          if (distance < bestDistance) {
            best = index;
            bestDistance = distance;
          }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  };
  const first = nearestOpen(start, from);
  const last = nearestOpen(end, to);
  if (first < 0 || last < 0) return null;
  const distance = new Float64Array(grid.occupied.length).fill(Infinity);
  const previous = new Int32Array(grid.occupied.length).fill(-1);
  const heap: { index: number; score: number }[] = [];
  const push = (index: number, score: number) => {
    let child = heap.length;
    heap.push({ index, score });
    while (child > 0) {
      const parent = Math.floor((child - 1) / 2);
      if (heap[parent].score <= score) break;
      heap[child] = heap[parent];
      child = parent;
    }
    heap[child] = { index, score };
  };
  const pop = () => {
    const firstEntry = heap[0];
    const tail = heap.pop()!;
    if (heap.length) {
      let parent = 0;
      while (true) {
        let child = parent * 2 + 1;
        if (child >= heap.length) break;
        if (child + 1 < heap.length && heap[child + 1].score < heap[child].score) child++;
        if (heap[child].score >= tail.score) break;
        heap[parent] = heap[child];
        parent = child;
      }
      heap[parent] = tail;
    }
    return firstEntry;
  };
  const goal = pointAt(last);
  const heuristic = (index: number) => {
    const point = pointAt(index);
    return (Math.abs(point.x - goal.x) + Math.abs(point.y - goal.y)) / grid.size;
  };
  distance[first] = 0;
  push(first, heuristic(first));
  while (heap.length) {
    const current = pop().index;
    if (current === last) break;
    const column = current % grid.columns;
    const row = Math.floor(current / grid.columns);
    for (const [nextColumn, nextRow] of [
      [column - 1, row],
      [column + 1, row],
      [column, row - 1],
      [column, row + 1],
    ]) {
      if (nextColumn < 0 || nextColumn >= grid.columns || nextRow < 0 || nextRow >= grid.rows)
        continue;
      const next = nextRow * grid.columns + nextColumn;
      if (grid.occupied[next] || distance[current] + 1 >= distance[next]) continue;
      distance[next] = distance[current] + 1;
      previous[next] = current;
      push(next, distance[next] + heuristic(next));
    }
  }
  if (!Number.isFinite(distance[last])) return null;
  const cells: Point[] = [];
  for (let index = last; index >= 0; index = previous[index]) {
    cells.unshift(pointAt(index));
    if (index === first) break;
  }
  const compact = cells.filter((point, index) => {
    if (index === 0 || index === cells.length - 1) return true;
    const before = cells[index - 1];
    const after = cells[index + 1];
    return (
      (point.x - before.x) * (after.y - point.y) !== (point.y - before.y) * (after.x - point.x)
    );
  });
  return [start, ...compact, end];
}

function intersectsBox(start: Point, end: Point, box: GraphBox, padding: number) {
  const minX = box.x - box.width / 2 - padding;
  const maxX = box.x + box.width / 2 + padding;
  const minY = box.y - box.height / 2 - padding;
  const maxY = box.y + box.height / 2 + padding;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  let enter = 0;
  let leave = 1;
  for (const [position, direction, min, max] of [
    [start.x, dx, minX, maxX],
    [start.y, dy, minY, maxY],
  ]) {
    if (Math.abs(direction) < 0.0001) {
      if (position >= min && position <= max) continue;
      return false;
    }
    const first = (min - position) / direction;
    const second = (max - position) / direction;
    enter = Math.max(enter, Math.min(first, second));
    leave = Math.min(leave, Math.max(first, second));
    if (enter > leave) return false;
  }
  return enter < 1 && leave > 0;
}

function roundedPath(points: Point[], maxRadius = 12) {
  const coordinate = (point: Point) => `${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
  if (points.length < 3) return `M ${coordinate(points[0])} L ${coordinate(points[1])}`;
  let path = `M ${coordinate(points[0])}`;
  for (let index = 1; index < points.length - 1; index++) {
    const previous = points[index - 1];
    const corner = points[index];
    const next = points[index + 1];
    const incoming = Math.hypot(corner.x - previous.x, corner.y - previous.y);
    const outgoing = Math.hypot(next.x - corner.x, next.y - corner.y);
    const radius = Math.min(maxRadius, incoming / 3, outgoing / 3);
    const before = {
      x: corner.x + ((previous.x - corner.x) * radius) / incoming,
      y: corner.y + ((previous.y - corner.y) * radius) / incoming,
    };
    const after = {
      x: corner.x + ((next.x - corner.x) * radius) / outgoing,
      y: corner.y + ((next.y - corner.y) * radius) / outgoing,
    };
    path += ` L ${coordinate(before)} Q ${coordinate(corner)} ${coordinate(after)}`;
  }
  return `${path} L ${coordinate(points[points.length - 1])}`;
}

function sideCenters(node: GraphBox): Point[] {
  return [
    { x: node.x + node.width / 2, y: node.y },
    { x: node.x - node.width / 2, y: node.y },
    { x: node.x, y: node.y + node.height / 2 },
    { x: node.x, y: node.y - node.height / 2 },
  ];
}

/** Route around unrelated cards only when the direct connection is obstructed. */
export function routeOrganizationLink<T extends PositionedNode>(from: T, to: T, nodes: T[]) {
  const anchors = closestSideAnchors(from, to);
  const start = { x: anchors.x1, y: anchors.y1 };
  const end = { x: anchors.x2, y: anchors.y2 };
  const obstacles = nodes.filter((node) => node.id !== from.id && node.id !== to.id);
  const clear = (first: Point, second: Point) =>
    obstacles.every((node) => !intersectsBox(first, second, node, 8));
  if (clear(start, end))
    return { ...anchors, points: [start, end], path: roundedPath([start, end]) };

  if (nodes.length > 120) {
    const detour = gridDetour(from, to, nodes, start, end);
    if (detour) return { ...anchors, points: detour, path: roundedPath(detour, 4) };
  }

  const nearby = obstacles.filter((node) => intersectsBox(start, end, node, 300));
  const points: Point[] = [start, end];
  for (const node of nearby) {
    const left = node.x - node.width / 2 - 24;
    const right = node.x + node.width / 2 + 24;
    const top = node.y - node.height / 2 - 24;
    const bottom = node.y + node.height / 2 + 24;
    points.push(
      { x: left, y: top },
      { x: right, y: top },
      { x: right, y: bottom },
      { x: left, y: bottom },
    );
  }
  const distances = points.map(() => Infinity);
  const previous = points.map(() => -1);
  const visited = points.map(() => false);
  distances[0] = 0;
  for (let step = 0; step < points.length; step++) {
    let current = -1;
    for (let index = 0; index < points.length; index++) {
      if (!visited[index] && (current < 0 || distances[index] < distances[current]))
        current = index;
    }
    if (current < 0 || !Number.isFinite(distances[current]) || current === 1) break;
    visited[current] = true;
    for (let index = 0; index < points.length; index++) {
      if (index === current || visited[index] || !clear(points[current], points[index])) continue;
      const length = Math.hypot(
        points[current].x - points[index].x,
        points[current].y - points[index].y,
      );
      const candidate = distances[current] + length + (index === 1 ? 0 : 6);
      if (candidate < distances[index]) {
        distances[index] = candidate;
        previous[index] = current;
      }
    }
  }
  if (!Number.isFinite(distances[1])) {
    const detour = gridDetour(from, to, nodes, start, end);
    if (detour) return { ...anchors, points: detour, path: roundedPath(detour, 4) };
    const alternatives = sideCenters(from)
      .flatMap((source) => sideCenters(to).map((target) => ({ source, target })))
      .filter(
        ({ source, target }) =>
          source.x !== start.x || source.y !== start.y || target.x !== end.x || target.y !== end.y,
      )
      .sort(
        (first, second) =>
          Math.hypot(first.source.x - first.target.x, first.source.y - first.target.y) -
          Math.hypot(second.source.x - second.target.x, second.source.y - second.target.y),
      );
    for (const { source, target } of alternatives) {
      const alternate = gridDetour(from, to, nodes, source, target);
      if (alternate)
        return {
          x1: source.x,
          y1: source.y,
          x2: target.x,
          y2: target.y,
          points: alternate,
          path: roundedPath(alternate, 4),
        };
    }
    return { ...anchors, points: [start, end], path: roundedPath([start, end]) };
  }
  const route: Point[] = [];
  for (let index = 1; index >= 0; index = previous[index]) route.unshift(points[index]);
  return { ...anchors, points: route, path: roundedPath(route) };
}
