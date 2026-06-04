import { expect, test } from "bun:test";
import { type Tile, findPath } from "./pathfind";

// Build a walkable grid from an ASCII map. '#' = wall, anything else = floor.
// Rows are top-to-bottom; columns left-to-right. Returns the row-major
// boolean[] plus its dimensions.
function grid(rowsAscii: string[]): {
  walkable: boolean[];
  cols: number;
  rows: number;
} {
  const rows = rowsAscii.length;
  const cols = rows > 0 ? (rowsAscii[0]?.length ?? 0) : 0;
  const walkable: boolean[] = [];
  for (let r = 0; r < rows; r++) {
    const line = rowsAscii[r] ?? "";
    for (let c = 0; c < cols; c++) {
      walkable.push(line[c] !== "#");
    }
  }
  return { walkable, cols, rows };
}

// Assert each consecutive pair is exactly 4-adjacent and every tile walkable.
function assertConnectedWalkable(
  path: Tile[],
  walkable: ReadonlyArray<boolean>,
  cols: number,
): void {
  for (let i = 0; i < path.length; i++) {
    const t = path[i];
    expect(t).toBeDefined();
    if (!t) continue;
    expect(walkable[t.r * cols + t.c]).toBe(true);
    if (i === 0) continue;
    const prev = path[i - 1];
    if (!prev) continue;
    const d = Math.abs(t.c - prev.c) + Math.abs(t.r - prev.r);
    expect(d).toBe(1);
  }
}

test("straight horizontal corridor → length = manhattan + 1, endpoints correct", () => {
  const { walkable, cols, rows } = grid(["........"]);
  const start: Tile = { c: 0, r: 0 };
  const goal: Tile = { c: 7, r: 0 };
  const path = findPath(walkable, cols, rows, start, goal);
  expect(path).not.toBeNull();
  if (!path) return;
  const manhattan = Math.abs(goal.c - start.c) + Math.abs(goal.r - start.r);
  expect(path.length).toBe(manhattan + 1);
  expect(path[0]).toEqual(start);
  expect(path[path.length - 1]).toEqual(goal);
  assertConnectedWalkable(path, walkable, cols);
});

test("L-shaped route around a wall block → connected path avoiding walls", () => {
  // A vertical wall splits the grid; the only way around is the bottom row.
  //   col: 01234
  //   r0:  ..#..
  //   r1:  ..#..
  //   r2:  .....
  const { walkable, cols, rows } = grid([".#...", ".#...", "....."]);
  const start: Tile = { c: 0, r: 0 };
  const goal: Tile = { c: 4, r: 0 };
  const path = findPath(walkable, cols, rows, start, goal);
  expect(path).not.toBeNull();
  if (!path) return;
  expect(path[0]).toEqual(start);
  expect(path[path.length - 1]).toEqual(goal);
  assertConnectedWalkable(path, walkable, cols);
  // It must detour: the straight-line distance is 4, but the wall forces a
  // longer route, so the path has strictly more than (manhattan + 1) tiles.
  const manhattan = Math.abs(goal.c - start.c) + Math.abs(goal.r - start.r);
  expect(path.length).toBeGreaterThan(manhattan + 1);
});

test("fully blocked goal (surrounded by walls) → null", () => {
  //   r0: .....
  //   r1: ..#..
  //   r2: .#G#.   (G at c=2,r=2 is walled in on all 4 sides)
  //   r3: ..#..
  //   r4: .....
  const { walkable, cols, rows } = grid([
    ".....",
    "..#..",
    ".#.#.",
    "..#..",
    ".....",
  ]);
  const start: Tile = { c: 0, r: 0 };
  const goal: Tile = { c: 2, r: 2 };
  // Goal tile itself is walkable ('.') but every neighbour is a wall.
  expect(walkable[goal.r * cols + goal.c]).toBe(true);
  const path = findPath(walkable, cols, rows, start, goal);
  expect(path).toBeNull();
});

test("start === goal → [start]", () => {
  const { walkable, cols, rows } = grid(["..", ".."]);
  const t: Tile = { c: 1, r: 1 };
  const path = findPath(walkable, cols, rows, t, t);
  expect(path).toEqual([{ c: 1, r: 1 }]);
});

test("goal not walkable → null", () => {
  const { walkable, cols, rows } = grid(["...", ".#.", "..."]);
  const start: Tile = { c: 0, r: 0 };
  const goal: Tile = { c: 1, r: 1 }; // a wall
  expect(findPath(walkable, cols, rows, start, goal)).toBeNull();
});

test("start not walkable → null", () => {
  const { walkable, cols, rows } = grid(["...", ".#.", "..."]);
  const start: Tile = { c: 1, r: 1 }; // a wall
  const goal: Tile = { c: 2, r: 2 };
  expect(findPath(walkable, cols, rows, start, goal)).toBeNull();
});

test("out-of-bounds start or goal → null", () => {
  const { walkable, cols, rows } = grid(["...", "...", "..."]);
  expect(
    findPath(walkable, cols, rows, { c: -1, r: 0 }, { c: 2, r: 2 }),
  ).toBeNull();
  expect(
    findPath(walkable, cols, rows, { c: 0, r: 0 }, { c: 3, r: 0 }),
  ).toBeNull();
  expect(
    findPath(walkable, cols, rows, { c: 0, r: 0 }, { c: 0, r: 3 }),
  ).toBeNull();
});

test("deterministic: same inputs yield an identical path every run", () => {
  // An open field where many equal-cost routes exist; tie-breaking must pick
  // the same one each time.
  const { walkable, cols, rows } = grid([
    "......",
    "......",
    "......",
    "......",
    "......",
    "......",
  ]);
  const start: Tile = { c: 0, r: 0 };
  const goal: Tile = { c: 5, r: 5 };
  const a = findPath(walkable, cols, rows, start, goal);
  const b = findPath(walkable, cols, rows, start, goal);
  expect(a).not.toBeNull();
  expect(a).toEqual(b);
  if (!a) return;
  const manhattan = Math.abs(goal.c - start.c) + Math.abs(goal.r - start.r);
  expect(a.length).toBe(manhattan + 1); // shortest path on open field
  assertConnectedWalkable(a, walkable, cols);
});

test("maze-like grid → returns a connected, walkable shortest-cost path", () => {
  //   col: 0123456
  //   r0:  S......
  //   r1:  #####..
  //   r2:  ....#..
  //   r3:  .##.#..
  //   r4:  .#..#..
  //   r5:  .#.###.
  //   r6:  ......G
  const { walkable, cols, rows } = grid([
    ".......",
    "#####..",
    "....#..",
    ".##.#..",
    ".#..#..",
    ".#.###.",
    ".......",
  ]);
  const start: Tile = { c: 0, r: 0 };
  const goal: Tile = { c: 6, r: 6 };
  const path = findPath(walkable, cols, rows, start, goal);
  expect(path).not.toBeNull();
  if (!path) return;
  expect(path[0]).toEqual(start);
  expect(path[path.length - 1]).toEqual(goal);
  assertConnectedWalkable(path, walkable, cols);
});
