// Pure, dependency-free motion helpers for the decorative wander system (no
// React/Pixi runtime deps, only type imports) so the logic is unit-testable.
// Positions are advanced one frame at a time by Character's useTick and never
// enter React state.
import type { AgentStatus } from "../../shared/domain";
import { ROWS, TILE, VW } from "./config";
import type { Pos } from "./layout";

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export type Facing = 1 | -1;

/**
 * Per-frame live state a Character writes for the particle layer to read. The
 * Scene holds a useRef<MotionMap>; each Character owns its own key and deletes
 * it on unmount; particles read the whole map and tolerate missing keys.
 */
export interface Live {
  x: number;
  y: number;
  facing: Facing;
  moving: boolean;
  status: AgentStatus | "leaving";
}

export type MotionMap = Record<string, Live>;

/**
 * Foot-reachable floor rectangle derived from the room geometry. The brick
 * border occupies the top two rows (cap + face), the bottom row, and the left/
 * right columns (see DungeonRoom.wallName), so the floor interior is rows
 * 2..ROWS-2 and cols 1..COLS-2. A small margin keeps sprites off the walls.
 */
export function floorBounds(margin = 4): Bounds {
  return {
    minX: TILE + margin,
    maxX: VW - TILE - margin,
    minY: 2 * TILE + margin,
    maxY: (ROWS - 1) * TILE - margin,
  };
}

export function clampToFloor(p: Pos, b: Bounds): Pos {
  return {
    x: Math.max(b.minX, Math.min(b.maxX, p.x)),
    y: Math.max(b.minY, Math.min(b.maxY, p.y)),
  };
}

/**
 * A random point within `radius` of `home`, clamped into the floor bounds.
 * sqrt(rng) gives a uniform spread over the disc rather than clustering at the
 * centre. `rng` defaults to Math.random and can be injected for tests.
 */
export function pickWanderTarget(
  home: Pos,
  radius: number,
  b: Bounds,
  rng: () => number = Math.random,
): Pos {
  const angle = rng() * Math.PI * 2;
  const dist = Math.sqrt(rng()) * radius;
  return clampToFloor(
    { x: home.x + Math.cos(angle) * dist, y: home.y + Math.sin(angle) * dist },
    b,
  );
}

const ARRIVE_EPS = 0.5;

export interface Step {
  x: number;
  y: number;
  vx: number;
  vy: number;
  arrived: boolean;
}

/** Advance one step from `pos` toward `target` by `speed`; snaps on arrival. */
export function stepToward(pos: Pos, target: Pos, speed: number): Step {
  const dx = target.x - pos.x;
  const dy = target.y - pos.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= ARRIVE_EPS || dist <= speed) {
    return { x: target.x, y: target.y, vx: 0, vy: 0, arrived: true };
  }
  const vx = (dx / dist) * speed;
  const vy = (dy / dist) * speed;
  return { x: pos.x + vx, y: pos.y + vy, vx, vy, arrived: false };
}

const FACE_EPS = 0.05;

/** Sprite facing: sign(vx) when moving meaningfully, else keep current. */
export function faceDir(vx: number, current: Facing): Facing {
  if (vx > FACE_EPS) return 1;
  if (vx < -FACE_EPS) return -1;
  return current;
}
