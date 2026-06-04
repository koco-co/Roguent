import type { Pos } from "../room/layout";

export interface Size {
  w: number;
  h: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * One-axis camera offset. `view`/`world`/`focus` are all on the same axis (px).
 * - World smaller than the viewport → centre it: (view - world) / 2 (>= 0).
 * - Otherwise centre the focus point (view/2 - focus) then clamp into the range
 *   [view - world, 0] so the viewport never reveals past either world edge.
 */
function axisOffset(focus: number, view: number, world: number): number {
  if (world <= view) return (view - world) / 2;
  return clamp(view / 2 - focus, view - world, 0);
}

/**
 * The world-container top-left offset (in screen px) so that `focus` (a world-space
 * point in px) is centred in the viewport, clamped so the viewport never reveals
 * past the world edges. Apply as container.position = cameraOffset(...).
 */
export function cameraOffset(focus: Pos, view: Size, world: Size): Pos {
  return {
    x: axisOffset(focus.x, view.w, world.w),
    y: axisOffset(focus.y, view.h, world.h),
  };
}
