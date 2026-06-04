// Pure, deterministic world-generation for the overworld hub. Turns a stable,
// first-seen-ordered list of projects into a multi-room tile world: each project
// is a walled room placed in a fixed slot grid, and consecutive rooms are linked
// by L-shaped corridors. No React/Pixi/DOM, no global RNG — every output derives
// only from the input (slot index + projectId hash), so the layout is stable and
// APPEND-ONLY: adding a project never moves the rooms that came before it.
import { TILE } from "../room/config";
import type { Pos } from "../room/layout";

export interface ProjectInput {
  id: string;
  sessionCount: number;
}

/** Tile-unit rectangle; the full room footprint including its 1-tile wall border. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RoomBox {
  projectId: string;
  rect: Rect;
  /** Interior centre in px — NPC home anchor / spawn point. */
  anchorPx: Pos;
  /** Interior floor area in px (inset by a small margin) for NPC wander clamping. */
  boundsPx: { minX: number; maxX: number; minY: number; maxY: number };
}

export type TileKind = "void" | "floor" | "wall";

export interface WorldModel {
  cols: number;
  rows: number;
  widthPx: number; // cols * TILE
  heightPx: number; // rows * TILE
  rooms: RoomBox[];
  tiles: TileKind[]; // row-major, length cols*rows
  walkable: boolean[]; // row-major, length cols*rows; true === floor (walkable)
}

// --- Layout constants ---------------------------------------------------------
// Slot grid: rooms are placed left-to-right, top-to-bottom in fixed cells. A
// cell is big enough for the largest room plus a corridor gutter, so corridors
// never have to cut through a neighbouring room.
const SLOT_COLS = 4;
const SLOT_W = 16; // slot cell width in tiles
const SLOT_H = 13; // slot cell height in tiles
const PAD = 2; // fixed margin (tiles) around the whole grid

// Interior sizing: base size grows with session count, bounded so a room always
// fits inside its slot with room left for the wall border + gutter.
const BASE_W = 6;
const BASE_H = 5;
const MIN_W = 5;
const MIN_H = 4;
const MAX_W = SLOT_W - 3; // leave a gutter inside the slot for corridors
const MAX_H = SLOT_H - 3;

const BOUNDS_MARGIN_PX = 4; // keep wandering NPCs off the interior walls

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Stable string hash for deterministic per-room size jitter. Derived ONLY from
 * the project id, never from a global RNG, so jitter is reproducible and does
 * not depend on slot position or neighbours.
 */
function hashId(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/**
 * The room rect for slot index `i` and project `p`. CRITICAL: depends ONLY on
 * `i` and `p.id` / `p.sessionCount` — never on neighbouring rooms — which is
 * what guarantees the append-only property.
 */
function roomRect(i: number, p: ProjectInput): Rect {
  const slotCol = i % SLOT_COLS;
  const slotRow = Math.floor(i / SLOT_COLS);
  const slotX = PAD + slotCol * SLOT_W;
  const slotY = PAD + slotRow * SLOT_H;

  const h = hashId(p.id);
  // Deterministic 0/1 jitter derived purely from the id hash.
  const jitterW = h & 1;
  const jitterH = (h >>> 1) & 1;

  const interiorW = clamp(
    BASE_W + Math.floor(p.sessionCount / 2) + jitterW,
    MIN_W,
    MAX_W,
  );
  const interiorH = clamp(
    BASE_H + Math.floor(p.sessionCount / 2) + jitterH,
    MIN_H,
    MAX_H,
  );

  // Centre the interior within the slot. The rect is the interior expanded by
  // 1 tile of wall on every side, so its offset is one tile less than the
  // interior's centred offset.
  const interiorOffX = Math.floor((SLOT_W - interiorW) / 2);
  const interiorOffY = Math.floor((SLOT_H - interiorH) / 2);

  return {
    x: slotX + interiorOffX - 1,
    y: slotY + interiorOffY - 1,
    w: interiorW + 2,
    h: interiorH + 2,
  };
}

/** Interior-centre tile (col,row) of a room rect — the corridor join + anchor. */
function interiorCentreTile(rect: Rect): { col: number; row: number } {
  return {
    col: rect.x + Math.floor(rect.w / 2),
    row: rect.y + Math.floor(rect.h / 2),
  };
}

export function generateWorld(projects: ProjectInput[]): WorldModel {
  const n = projects.length;
  const cols = PAD * 2 + SLOT_COLS * SLOT_W;
  const rows = PAD * 2 + Math.ceil(Math.max(1, n) / SLOT_COLS) * SLOT_H;

  // --- Rooms (rect depends only on slot index + id) ---------------------------
  const rooms: RoomBox[] = projects.map((p, i) => {
    const rect = roomRect(i, p);
    const anchorPx: Pos = {
      x: (rect.x + rect.w / 2) * TILE,
      y: (rect.y + rect.h / 2) * TILE,
    };
    // Interior floor rect in tiles, then px, inset by a small margin.
    const interiorMinXPx = (rect.x + 1) * TILE;
    const interiorMinYPx = (rect.y + 1) * TILE;
    const interiorMaxXPx = (rect.x + rect.w - 1) * TILE;
    const interiorMaxYPx = (rect.y + rect.h - 1) * TILE;
    return {
      projectId: p.id,
      rect,
      anchorPx,
      boundsPx: {
        minX: interiorMinXPx + BOUNDS_MARGIN_PX,
        minY: interiorMinYPx + BOUNDS_MARGIN_PX,
        maxX: interiorMaxXPx - BOUNDS_MARGIN_PX,
        maxY: interiorMaxYPx - BOUNDS_MARGIN_PX,
      },
    };
  });

  // --- Floor set --------------------------------------------------------------
  const floor: boolean[] = new Array(cols * rows).fill(false);
  const idx = (c: number, r: number) => r * cols + c;
  const setFloor = (c: number, r: number) => {
    if (c >= 0 && c < cols && r >= 0 && r < rows) floor[idx(c, r)] = true;
  };

  // Room interiors (inside the 1-tile wall border).
  for (const room of rooms) {
    const { x, y, w, h } = room.rect;
    for (let r = y + 1; r < y + h - 1; r++) {
      for (let c = x + 1; c < x + w - 1; c++) setFloor(c, r);
    }
  }

  // Corridors: link room i's interior-centre tile to room (i-1)'s, 2 tiles wide,
  // horizontal segment then vertical segment. Each corridor depends only on
  // rooms i-1 and i, so it does not break the append-only guarantee.
  const carveHSeg = (c0: number, c1: number, r: number) => {
    const lo = Math.min(c0, c1);
    const hi = Math.max(c0, c1);
    for (let c = lo; c <= hi; c++) {
      setFloor(c, r);
      setFloor(c, r + 1); // 2 tiles wide
    }
  };
  const carveVSeg = (r0: number, r1: number, c: number) => {
    const lo = Math.min(r0, r1);
    const hi = Math.max(r0, r1);
    for (let r = lo; r <= hi; r++) {
      setFloor(c, r);
      setFloor(c + 1, r); // 2 tiles wide
    }
  };

  for (let i = 1; i < n; i++) {
    const a = rooms[i - 1];
    const b = rooms[i];
    if (!a || !b) continue;
    const from = interiorCentreTile(a.rect);
    const to = interiorCentreTile(b.rect);
    // Horizontal first (at the source row), then vertical (at the dest col).
    carveHSeg(from.col, to.col, from.row);
    carveVSeg(from.row, to.row, to.col);
  }

  // --- Derive tiles + walkable ------------------------------------------------
  const tiles: TileKind[] = new Array(cols * rows);
  const walkable: boolean[] = new Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = idx(c, r);
      if (floor[i]) {
        tiles[i] = "floor";
        walkable[i] = true;
        continue;
      }
      // Wall if 8-neighbour-adjacent to any floor tile; else void. 8-neighbour
      // (vs 4) fills the room corners and corridor junctions so every floor
      // region is fully ringed by walls — no gaps to render around — while
      // walkable stays floor-only, so connectivity/append-only are unaffected.
      let adjFloor = false;
      for (let dr = -1; dr <= 1 && !adjFloor; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dc === 0 && dr === 0) continue;
          const nc = c + dc;
          const nr = r + dr;
          if (
            nc >= 0 &&
            nc < cols &&
            nr >= 0 &&
            nr < rows &&
            floor[idx(nc, nr)]
          ) {
            adjFloor = true;
            break;
          }
        }
      }
      tiles[i] = adjFloor ? "wall" : "void";
      walkable[i] = false;
    }
  }

  return {
    cols,
    rows,
    widthPx: cols * TILE,
    heightPx: rows * TILE,
    rooms,
    tiles,
    walkable,
  };
}
