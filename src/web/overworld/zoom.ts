import { TILE } from "../room/config";

// 以「目标可见行数 ≈ 内景的 14 行」为基准定整数缩放,使主角/名牌足够大、世界铺满屏。
const TARGET_ROWS = 14;
const MIN_ZOOM = 2;
const MAX_ZOOM = 4;

/** 大厅世界容器的整数缩放(贴身跟随用)。纯函数,只依赖视口高。 */
export function lobbyZoom(view: { w: number; h: number }): number {
  const z = Math.floor(view.h / (TARGET_ROWS * TILE));
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
}
