import { expect, test } from "bun:test";
import {
  clampToFloor,
  faceDir,
  floorBounds,
  pickWanderTarget,
  stepToward,
} from "./motion";

// Deterministic rng that yields the given values in order, then repeats.
function seq(vals: number[]): () => number {
  let i = 0;
  return () => vals[i++ % vals.length] ?? 0;
}

test("clampToFloor clamps out-of-bounds points back to the edges", () => {
  const b = floorBounds();
  expect(clampToFloor({ x: -100, y: -100 }, b)).toEqual({
    x: b.minX,
    y: b.minY,
  });
  expect(clampToFloor({ x: 9999, y: 9999 }, b)).toEqual({
    x: b.maxX,
    y: b.maxY,
  });
  const inside = { x: 100, y: 100 };
  expect(clampToFloor(inside, b)).toEqual(inside);
});

test("pickWanderTarget stays within radius and is clamped into bounds", () => {
  const b = floorBounds();
  const home = { x: 192, y: 112 };
  // angle, dist samples — well inside the floor so clamp is a no-op.
  const p = pickWanderTarget(home, 24, b, seq([0.3, 0.7]));
  const d = Math.hypot(p.x - home.x, p.y - home.y);
  expect(d).toBeLessThanOrEqual(24 + 1e-9);
  expect(p.x).toBeGreaterThanOrEqual(b.minX);
  expect(p.x).toBeLessThanOrEqual(b.maxX);
  expect(p.y).toBeGreaterThanOrEqual(b.minY);
  expect(p.y).toBeLessThanOrEqual(b.maxY);
});

test("pickWanderTarget clamps when home sits at the wall", () => {
  const b = floorBounds();
  const home = { x: b.minX, y: b.minY };
  // Max distance, aimed up-left (rng=0 → angle 0 → +x; use a value that points
  // outward to exercise the clamp). dist = sqrt(1)*radius = radius.
  const p = pickWanderTarget(home, 40, b, seq([0.5, 1]));
  expect(p.x).toBeGreaterThanOrEqual(b.minX);
  expect(p.y).toBeGreaterThanOrEqual(b.minY);
  expect(p.x).toBeLessThanOrEqual(b.maxX);
  expect(p.y).toBeLessThanOrEqual(b.maxY);
});

test("stepToward advances toward the target without overshoot", () => {
  const s = stepToward({ x: 0, y: 0 }, { x: 10, y: 0 }, 2);
  expect(s.x).toBeCloseTo(2);
  expect(s.y).toBeCloseTo(0);
  expect(s.vx).toBeCloseTo(2);
  expect(s.arrived).toBe(false);
});

test("stepToward snaps to target and reports arrival when close", () => {
  const s = stepToward({ x: 9.8, y: 0 }, { x: 10, y: 0 }, 2);
  expect(s).toEqual({ x: 10, y: 0, vx: 0, vy: 0, arrived: true });
});

test("faceDir takes the sign of vx and holds when near zero", () => {
  expect(faceDir(1, -1)).toBe(1);
  expect(faceDir(-1, 1)).toBe(-1);
  expect(faceDir(0.01, -1)).toBe(-1); // below threshold → hold
  expect(faceDir(0, 1)).toBe(1);
});
