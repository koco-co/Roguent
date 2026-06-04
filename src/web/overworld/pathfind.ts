// Pure 4-directional A* over a row-major walkable tile grid. No diagonals, unit
// step cost, Manhattan heuristic. Fully deterministic: equal-cost frontiers are
// broken by f, then h, then insertion order, and neighbours are expanded in a
// fixed N, E, S, W order — so the same inputs always yield the same path.

export interface Tile {
  c: number;
  r: number;
}

interface Node {
  /** flat index = r * cols + c */
  idx: number;
  /** g = cost from start */
  g: number;
  /** f = g + heuristic */
  f: number;
  /** heuristic to goal (tie-break under f) */
  h: number;
  /** insertion order (final tie-break, keeps pops stable) */
  order: number;
}

// Fixed neighbour offsets in N, E, S, W order. Deterministic expansion order.
const DIRS: ReadonlyArray<readonly [dc: number, dr: number]> = [
  [0, -1], // N
  [1, 0], // E
  [0, 1], // S
  [-1, 0], // W
];

function inBounds(c: number, r: number, cols: number, rows: number): boolean {
  return c >= 0 && c < cols && r >= 0 && r < rows;
}

function isWalkable(walkable: ReadonlyArray<boolean>, idx: number): boolean {
  return walkable[idx] === true;
}

function manhattan(c0: number, r0: number, c1: number, r1: number): number {
  return Math.abs(c0 - c1) + Math.abs(r0 - r1);
}

/**
 * 4-directional A* (Manhattan heuristic) over a row-major walkable grid
 * (walkable[r*cols + c] === true means walkable). Returns the inclusive tile path
 * [start, ..., goal], or null if no path exists or start/goal is out of bounds or
 * not walkable. If start equals goal (and walkable), returns [start].
 */
export function findPath(
  walkable: ReadonlyArray<boolean>,
  cols: number,
  rows: number,
  start: Tile,
  goal: Tile,
): Tile[] | null {
  if (cols <= 0 || rows <= 0) return null;

  // Reject degenerate / out-of-bounds / non-walkable endpoints up front.
  if (!inBounds(start.c, start.r, cols, rows)) return null;
  if (!inBounds(goal.c, goal.r, cols, rows)) return null;

  const startIdx = start.r * cols + start.c;
  const goalIdx = goal.r * cols + goal.c;
  if (!isWalkable(walkable, startIdx)) return null;
  if (!isWalkable(walkable, goalIdx)) return null;

  if (startIdx === goalIdx) return [{ c: start.c, r: start.r }];

  const total = cols * rows;
  // came-from map: cameFrom[idx] = previous flat index on the best path, or -1.
  const cameFrom = new Int32Array(total).fill(-1);
  // best known g for each tile; Infinity = not yet reached.
  const gScore = new Float64Array(total).fill(Number.POSITIVE_INFINITY);
  const closed = new Uint8Array(total);

  // Simple binary-min-heap open set keyed by (f, h, order).
  const heap: Node[] = [];

  // Returns true when a should pop before b. Stable: f, then h, then order.
  const before = (a: Node, b: Node): boolean => {
    if (a.f !== b.f) return a.f < b.f;
    if (a.h !== b.h) return a.h < b.h;
    return a.order < b.order;
  };

  const push = (node: Node): void => {
    heap.push(node);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      const cur = heap[i];
      const par = heap[parent];
      if (cur === undefined || par === undefined) break;
      if (!before(cur, par)) break;
      heap[i] = par;
      heap[parent] = cur;
      i = parent;
    }
  };

  const pop = (): Node | undefined => {
    const top = heap[0];
    if (top === undefined) return undefined;
    const last = heap.pop();
    if (last === undefined) return top;
    if (heap.length === 0) return top;
    heap[0] = last;
    let i = 0;
    const n = heap.length;
    for (;;) {
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      let smallest = i;
      const cur = heap[smallest];
      const l = left < n ? heap[left] : undefined;
      const r = right < n ? heap[right] : undefined;
      if (cur === undefined) break;
      let best = cur;
      if (l !== undefined && before(l, best)) {
        smallest = left;
        best = l;
      }
      if (r !== undefined && before(r, best)) {
        smallest = right;
        best = r;
      }
      if (smallest === i) break;
      const swap = heap[smallest];
      if (swap === undefined) break;
      heap[smallest] = cur;
      heap[i] = swap;
      i = smallest;
    }
    return top;
  };

  let order = 0;
  gScore[startIdx] = 0;
  const startH = manhattan(start.c, start.r, goal.c, goal.r);
  push({ idx: startIdx, g: 0, f: startH, h: startH, order: order++ });

  for (;;) {
    const current = pop();
    if (current === undefined) break; // open set exhausted → no path

    if (current.idx === goalIdx) {
      // Reconstruct via came-from, then reverse to start..goal order.
      const path: Tile[] = [];
      let idx = goalIdx;
      while (idx !== -1) {
        const c = idx % cols;
        const r = (idx - c) / cols;
        path.push({ c, r });
        if (idx === startIdx) break;
        const prev = cameFrom[idx];
        if (prev === undefined) break;
        idx = prev;
      }
      path.reverse();
      return path;
    }

    if (closed[current.idx] === 1) continue; // stale heap entry
    closed[current.idx] = 1;

    const cc = current.idx % cols;
    const cr = (current.idx - cc) / cols;
    const curG = current.g;

    for (const [dc, dr] of DIRS) {
      const nc = cc + dc;
      const nr = cr + dr;
      if (!inBounds(nc, nr, cols, rows)) continue;
      const nIdx = nr * cols + nc;
      if (!isWalkable(walkable, nIdx)) continue;
      if (closed[nIdx] === 1) continue;

      const tentativeG = curG + 1;
      const known = gScore[nIdx];
      if (known !== undefined && tentativeG >= known) continue;

      cameFrom[nIdx] = current.idx;
      gScore[nIdx] = tentativeG;
      const h = manhattan(nc, nr, goal.c, goal.r);
      push({
        idx: nIdx,
        g: tentativeG,
        f: tentativeG + h,
        h,
        order: order++,
      });
    }
  }

  return null;
}
