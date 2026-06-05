import type { Pos } from "../room/layout";

export interface Size {
  w: number;
  h: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * One-axis camera offset in screen px. 屏幕坐标 = scale*worldPoint + offset。
 * - 缩放后世界小于视口 → 居中:(view - scale*world)/2。
 * - 否则居中缩放后的聚焦点(view/2 - scale*focus),夹到 [view - scale*world, 0]。
 */
function axisOffset(
  focus: number,
  view: number,
  world: number,
  scale: number,
): number {
  const sw = world * scale;
  if (sw <= view) return (view - sw) / 2;
  return clamp(view / 2 - focus * scale, view - sw, 0);
}

/**
 * 世界容器左上角偏移(屏幕 px),使 `focus`(世界 px)在缩放 `scale` 下居中、
 * 且视口不露出世界边外。配合 container.scale.set(scale) + container.position=结果。
 */
export function cameraOffset(
  focus: Pos,
  view: Size,
  world: Size,
  scale = 1,
): Pos {
  return {
    x: axisOffset(focus.x, view.w, world.w, scale),
    y: axisOffset(focus.y, view.h, world.h, scale),
  };
}
