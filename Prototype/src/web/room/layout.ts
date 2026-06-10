import { ORCHESTRATOR_ID } from "../../shared/domain";
import { STAGE_H, STAGE_W } from "../stage-scale";

export interface Pos {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const ROOM_STAGE: Rect = { x: 352, y: 88, w: 1216, h: 746 };
export const ROSTER_RECT: Rect = { x: 12, y: 150, w: 312, h: 166 };
export const TASK_WINDOW_RECT: Rect = { x: 12, y: 366, w: 312, h: 500 };
export const MINIMAP_RECT: Rect = { x: 12, y: 922, w: 200, h: 144 };
export const HOTBAR_RECT: Rect = { x: 592, y: 980, w: 736, h: 86 };

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  );
}

export function clampRoomStage(rect: Rect = ROOM_STAGE): Rect {
  const left = Math.max(0, Math.min(rect.x, STAGE_W));
  const top = Math.max(0, Math.min(rect.y, STAGE_H));
  const right = Math.max(left, Math.min(rect.x + rect.w, STAGE_W));
  const bottom = Math.max(top, Math.min(rect.y + rect.h, STAGE_H));
  return {
    x: left,
    y: top,
    w: right - left,
    h: bottom - top,
  };
}

export function roomLayout(
  agentIds: string[],
  w: number,
  h: number,
): Record<string, Pos> {
  const out: Record<string, Pos> = {};
  const cx = Math.round(w / 2);
  const cy = Math.round(h * 0.42);
  if (agentIds.includes(ORCHESTRATOR_ID))
    out[ORCHESTRATOR_ID] = { x: cx, y: cy };
  const others = agentIds.filter((id) => id !== ORCHESTRATOR_ID);
  const n = Math.max(1, others.length);
  others.forEach((id, i) => {
    const angle = -Math.PI / 2 + (i / n) * Math.PI * 2;
    // Proportional ring so the layout works in any coordinate space (the
    // virtual 16px-tile room is only ~384×224, so a fixed pixel offset would
    // push subagents through the walls).
    out[id] = {
      x: Math.round(cx + Math.cos(angle) * w * 0.3),
      y: Math.round(cy + h * 0.1 + Math.sin(angle) * h * 0.24),
    };
  });
  return out;
}
