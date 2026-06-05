import { expect, test } from "bun:test";
import { TILE } from "../room/config";
import { generateWorld } from "./worldgen";
import type { ProjectInput, WorldModel } from "./worldgen";

const P = (id: string, sessionCount = 0): ProjectInput => ({
  id,
  sessionCount,
});

/** Tile (col,row) containing a px point. */
function tileAt(px: { x: number; y: number }) {
  return { col: Math.floor(px.x / TILE), row: Math.floor(px.y / TILE) };
}

/** BFS over the walkable contract: can we reach `goal` tile from `start` tile? */
function reachable(
  w: WorldModel,
  start: { col: number; row: number },
  goal: { col: number; row: number },
): boolean {
  const idx = (c: number, r: number) => r * w.cols + c;
  const seen = new Array(w.cols * w.rows).fill(false);
  const queue: { col: number; row: number }[] = [start];
  seen[idx(start.col, start.row)] = true;
  while (queue.length > 0) {
    const cur = queue.shift();
    if (!cur) break;
    if (cur.col === goal.col && cur.row === goal.row) return true;
    const neighbours = [
      { col: cur.col - 1, row: cur.row },
      { col: cur.col + 1, row: cur.row },
      { col: cur.col, row: cur.row - 1 },
      { col: cur.col, row: cur.row + 1 },
    ];
    for (const nb of neighbours) {
      if (nb.col < 0 || nb.col >= w.cols || nb.row < 0 || nb.row >= w.rows)
        continue;
      const ni = idx(nb.col, nb.row);
      if (seen[ni] || !w.walkable[ni]) continue;
      seen[ni] = true;
      queue.push(nb);
    }
  }
  return false;
}

test("deterministic: same input deep-equals itself", () => {
  const input = [P("alpha", 3), P("beta", 0), P("gamma", 8), P("delta", 1)];
  const a = generateWorld(input);
  const b = generateWorld(input);
  expect(a).toEqual(b);
});

test("append-only: existing rooms' rects are identical when a project is appended", () => {
  const base = [P("alpha", 3), P("beta", 5)];
  const extended = [...base, P("gamma", 2)];
  const w1 = generateWorld(base);
  const w2 = generateWorld(extended);
  expect(w2.rooms[0]?.rect).toEqual(w1.rooms[0]?.rect);
  expect(w2.rooms[1]?.rect).toEqual(w1.rooms[1]?.rect);
  // World width is constant; height only grows (never shrinks the prefix).
  expect(w2.cols).toBe(w1.cols);
});

test("append-only holds across a row wrap (slot index drives placement)", () => {
  // 6 projects span two slot rows (SLOT_COLS=4). Appending more must not move
  // any of the first six.
  const six = Array.from({ length: 6 }, (_, i) => P(`p${i}`, i));
  const ten = Array.from({ length: 10 }, (_, i) => P(`p${i}`, i));
  const w6 = generateWorld(six);
  const w10 = generateWorld(ten);
  for (let i = 0; i < 6; i++) {
    expect(w10.rooms[i]?.rect).toEqual(w6.rooms[i]?.rect);
  }
});

test("rooms align 1:1 with projects in order", () => {
  const input = [P("a"), P("b"), P("c"), P("d"), P("e")];
  const w = generateWorld(input);
  expect(w.rooms.length).toBe(input.length);
  input.forEach((p, i) => {
    expect(w.rooms[i]?.projectId).toBe(p.id);
  });
});

test("connectivity: every room anchor is reachable from room 0's anchor", () => {
  // 7 rooms across two slot rows to exercise both horizontal and vertical
  // corridor segments and the row wrap.
  const input = Array.from({ length: 7 }, (_, i) => P(`proj-${i}`, i % 4));
  const w = generateWorld(input);
  const room0 = w.rooms[0];
  expect(room0).toBeDefined();
  if (!room0) return;
  const start = tileAt(room0.anchorPx);
  // Start tile must itself be walkable.
  expect(w.walkable[start.row * w.cols + start.col]).toBe(true);
  for (let i = 1; i < w.rooms.length; i++) {
    const room = w.rooms[i];
    expect(room).toBeDefined();
    if (!room) continue;
    const goal = tileAt(room.anchorPx);
    expect(reachable(w, start, goal)).toBe(true);
  }
});

test("walls vs floor: interior centre walkable, room corner is wall", () => {
  const w = generateWorld([P("solo", 2)]);
  const room = w.rooms[0];
  expect(room).toBeDefined();
  if (!room) return;
  const centre = tileAt(room.anchorPx);
  expect(w.walkable[centre.row * w.cols + centre.col]).toBe(true);
  expect(w.tiles[centre.row * w.cols + centre.col]).toBe("floor");
  // The rect corner (rect.x, rect.y) is part of the wall border and must NOT
  // be walkable. (It is the diagonal corner, only diagonally adjacent to the
  // nearest interior floor, so under the 4-neighbour derivation it is "void"
  // rather than "wall" — the load-bearing contract is that it is not floor.)
  const cornerIdx = room.rect.y * w.cols + room.rect.x;
  expect(w.walkable[cornerIdx]).toBe(false);
  expect(w.tiles[cornerIdx]).not.toBe("floor");
  // The wall tile directly below the interior centre (a 4-neighbour of floor)
  // is classified as "wall". (We probe the bottom wall, not the top: rooms[0]
  // now receives the Hub→room corridor through its top wall, so the top-centre
  // tile is a carved doorway, while the bottom wall stays solid.)
  const bottomWallRow = room.rect.y + room.rect.h - 1;
  const wallIdx = bottomWallRow * w.cols + centre.col;
  expect(w.tiles[wallIdx]).toBe("wall");
  expect(w.walkable[wallIdx]).toBe(false);
});

test("size scaling: more sessions => larger (or equal) interior area", () => {
  const small = generateWorld([P("scale", 0)]);
  const large = generateWorld([P("scale", 8)]);
  const sr = small.rooms[0];
  const lr = large.rooms[0];
  expect(sr).toBeDefined();
  expect(lr).toBeDefined();
  if (!sr || !lr) return;
  // Interior area = (w-2) * (h-2) since rect includes the wall border.
  const areaOf = (r: { rect: { w: number; h: number } }) =>
    (r.rect.w - 2) * (r.rect.h - 2);
  expect(areaOf(lr)).toBeGreaterThanOrEqual(areaOf(sr));
});

test("grid invariants: tiles/walkable length and walkable matches floor tiles", () => {
  const w = generateWorld([P("a", 1), P("b", 4), P("c", 0)]);
  expect(w.tiles.length).toBe(w.cols * w.rows);
  expect(w.walkable.length).toBe(w.cols * w.rows);
  expect(w.widthPx).toBe(w.cols * TILE);
  expect(w.heightPx).toBe(w.rows * TILE);
  for (let i = 0; i < w.tiles.length; i++) {
    expect(w.walkable[i]).toBe(w.tiles[i] === "floor");
  }
});

test("空输入也产出一个有地板的中央 Hub(没有 project 房间)", () => {
  const w = generateWorld([]);
  expect(w.rooms.length).toBe(0);
  expect(w.hub).toBeDefined();
  const hub = tileAt(w.hub.anchorPx);
  expect(w.walkable[hub.row * w.cols + hub.col]).toBe(true);
  expect(w.tiles[hub.row * w.cols + hub.col]).toBe("floor");
});

test("each room exposes a doorPx at the bottom-centre, inside its wander bounds", () => {
  const w = generateWorld([
    { id: "alpha", sessionCount: 1 },
    { id: "beta", sessionCount: 3 },
  ]);
  for (const room of w.rooms) {
    const d = room.doorPx;
    // 门口在 NPC wander bounds 内(横向居中、纵向贴下沿)。
    expect(d.x).toBeGreaterThanOrEqual(room.boundsPx.minX);
    expect(d.x).toBeLessThanOrEqual(room.boundsPx.maxX);
    expect(d.y).toBe(room.boundsPx.maxY);
    // 门口在 anchor 下方(或同高),即朝房间「下方入口」。
    expect(d.y).toBeGreaterThanOrEqual(room.anchorPx.y);
  }
});

test("Hub 恒存在,中心可行走,且是出生点", () => {
  const w = generateWorld([P("alpha", 1)]);
  const hub = tileAt(w.hub.anchorPx);
  expect(w.walkable[hub.row * w.cols + hub.col]).toBe(true);
});

test("每个 project 房间都能从 Hub 走到", () => {
  const w = generateWorld(
    Array.from({ length: 5 }, (_, i) => P(`p${i}`, i % 4)),
  );
  const start = tileAt(w.hub.anchorPx);
  for (const room of w.rooms) {
    expect(reachable(w, start, tileAt(room.anchorPx))).toBe(true);
  }
});

test("加 Hub 后 project 房间仍 append-only", () => {
  const base = [P("alpha", 3), P("beta", 5)];
  const w1 = generateWorld(base);
  const w2 = generateWorld([...base, P("gamma", 2)]);
  expect(w2.rooms[0]?.rect).toEqual(w1.rooms[0]?.rect);
  expect(w2.rooms[1]?.rect).toEqual(w1.rooms[1]?.rect);
  expect(w2.cols).toBe(w1.cols);
});
