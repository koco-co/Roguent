import { TILE } from "../room/config";

// 整数缩放 = 贴身跟随(brief §8)与「一眼看到一屋子小人」的折中。原本 14 行 / 上限 4×
// 太紧:一次只见 Hub 一间房、四周一片黑。放宽到目标 ~22 行、上限 3×,典型桌面落 2×,
// 既能同时看到 Hub + 相邻项目房(更像有人气的世界),角色/名牌仍清晰(整数缩放不糊)。
const TARGET_ROWS = 22;
const MIN_ZOOM = 2;
const MAX_ZOOM = 3;

/** 大厅世界容器的整数缩放(贴身跟随用)。纯函数,只依赖视口高。 */
export function lobbyZoom(view: { w: number; h: number }): number {
  const z = Math.floor(view.h / (TARGET_ROWS * TILE));
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
}
