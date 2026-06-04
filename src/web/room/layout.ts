import { ORCHESTRATOR_ID } from "../../shared/domain";

export interface Pos {
  x: number;
  y: number;
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
