import type { Loot } from "./domain";

export type RoomEventType =
  | "session.created"
  | "session.updated"
  | "session.cleared"
  | "session.error"
  | "agent.spawned"
  | "agent.thinking"
  | "agent.idle"
  | "agent.done"
  | "tool.started"
  | "tool.ended"
  | "tool.failed"
  | "loot.dropped"
  | "message.delta"
  | "message.final"
  | "usage.updated";

export interface RoomEvent<T = unknown> {
  seq: number; // server-side monotonic order key
  ts: number;
  sessionId: string;
  type: RoomEventType;
  agentId?: string;
  payload: T;
}

// ── payload shapes ──
export interface SessionCreatedPayload {
  title: string;
  model: string;
  permissionMode: string;
  apiKeySource: string;
  slashCommands: string[];
}
export interface AgentSpawnedPayload {
  role: string;
  promptSummary: string;
  parentId: string;
}
export interface ToolStartedPayload {
  toolName: string;
  inputSummary: string;
  toolUseId: string;
}
export interface ToolEndedPayload {
  toolUseId: string;
  ok: boolean;
}
export interface AgentDonePayload {
  stopReason: string;
}
export interface LootPayload {
  kind: Loot["kind"];
  label: string;
  sourceRef: string;
}
export interface MessagePayload {
  text: string;
}
export interface UsagePayload {
  tokens: number;
  cost: number;
}

export function isToolEvent(e: RoomEvent): boolean {
  return (
    e.type === "tool.started" ||
    e.type === "tool.ended" ||
    e.type === "tool.failed"
  );
}
