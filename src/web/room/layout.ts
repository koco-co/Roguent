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
    out[id] = {
      x: Math.round(cx + Math.cos(angle) * w * 0.22),
      y: Math.round(cy + 70 + Math.sin(angle) * h * 0.16),
    };
  });
  return out;
}
