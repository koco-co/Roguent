import type {
  Loot,
  PermissionPromptData,
  QuestionData,
  TodoItem,
} from "./domain";

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
  | "usage.updated"
  | "context.updated"
  | "todos.updated"
  | "thinking.delta"
  | "thinking.final"
  | "prompt.requested"
  | "prompt.resolved";

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
  // 总览世界:服务端把会话 cwd + 算出的 project(git 根 basename)随会话一起下发。
  // 可选 → replay/旧 fixture 不带也安全(spec §服务端/协议改动:均为加法)。
  cwd?: string;
  project?: string;
  // 导入的本地 transcript(静态存档回看,无 Driver)。客户端据此把它豁免出 roster
  // 对账:引擎 --watch 重启后花名册为空也不该清掉用户主动载入的存档。
  imported?: boolean;
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
  // 说话方:导入历史会话时,用户轮次与助手轮次都进聊天抽屉。
  // 可选 → LIVE/REPLAY 的助手 delta 不带则默认 "assistant"(向后兼容)。
  role?: "user" | "assistant";
}
export interface SessionErrorPayload {
  message: string;
}
export interface UsagePayload {
  tokens: number;
  cost: number;
}

export interface ContextUpdatedPayload {
  usedTokens: number;
  windowSize: number;
  utilization: number; // 0-100
}

// 某 agent 的 TodoWrite 整表快照(引擎在该 agent 调 TodoWrite 时下发;事件 agentId =
// 该 agent)。reducer 用它覆盖 Session.todos[agentId]。
export interface TodosUpdatedPayload {
  todos: TodoItem[];
}

export interface ThinkingPayload {
  text: string;
}

export interface PromptRequestedPayload {
  promptId: string;
  promptKind: "permission" | "question";
  data: PermissionPromptData | QuestionData;
}

export interface PromptResolvedPayload {
  promptId: string;
  result: "answered" | "dismissed";
}

// ── 信封之外的账户级兄弟消息(不带 seq;last-write-wins;与 (sessionId,seq) 顺序契约无关) ──
export interface WindowUsage {
  utilization: number | null; // 0-100;null=未知
  resetsAt: number | null; // epoch ms
}
export interface AccountLimits {
  planName: string | null; // "Pro" | "Max" | "Team" | <首字母大写> | null
  fiveHour: WindowUsage;
  sevenDay: WindowUsage;
  apiError?: string; // 置位 → 前端灰显
  stale?: boolean; // 退避期沿用旧值
}
export interface LimitsMessage {
  kind: "limits";
  ts: number;
  limits: AccountLimits;
}

export function isToolEvent(e: RoomEvent): boolean {
  return (
    e.type === "tool.started" ||
    e.type === "tool.ended" ||
    e.type === "tool.failed"
  );
}
