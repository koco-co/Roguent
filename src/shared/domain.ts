export type AgentKind = "orchestrator" | "subagent";
export type AgentStatus = "spawning" | "thinking" | "working" | "idle" | "done";
export type SessionStatus = "idle" | "busy" | "done" | "error";

export interface Agent {
  id: string; // agent_id; orchestrator uses ORCHESTRATOR_ID
  kind: AgentKind;
  role: string; // agentType or skill-derived
  status: AgentStatus;
  currentTool?: string; // toolName currently driving the head icon
  skin: string;
  parentId?: string;
}

export interface Loot {
  id: string;
  sessionId: string;
  kind: "file" | "diff" | "report" | "answer";
  label: string;
  sourceRef: string;
  t: number;
}

// 当前会话上下文窗口占用(来自 SDK getContextUsage)。usedTokens/windowSize 为 token 数,
// utilization 为 0-100 的占用百分比(/compact 后回落)。
export interface ContextUsage {
  usedTokens: number;
  windowSize: number;
  utilization: number;
}

export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string; // 服务端 seq 派生;user 气泡用本地乐观 id
  role: ChatRole;
  agentId?: string; // 产出该气泡的 agent(默认主控),用于归 swimlane
  text: string;
  t: number;
}

export interface Session {
  id: string;
  title: string;
  status: SessionStatus;
  model: string;
  permissionMode: string;
  slashCommands: string[];
  agents: Record<string, Agent>;
  messages: ChatMessage[];
  loot: Loot[];
  usage: { tokens: number; cost: number };
  createdAt: number;
  // 总览世界(S1 最小数据,spec 2026-06-04-overworld-hub):
  // cwd = 会话工作目录;project = 该 cwd 的 git 根 basename(房间归属键)。
  cwd?: string;
  project?: string;
  // 活跃度:reducer 在 message/tool/agent 事件上 bump 为 e.ts,供 ≤10/LRU 选择。
  lastActiveAt: number;
  // 软归档:客户端可见性开关(driver 后台不杀),归档后移出大厅、进 ChatDrawer。
  archived: boolean;
  // 上下文窗口占用(每轮结束由引擎 getContextUsage 派生);首轮前为 undefined。
  context?: ContextUsage;
}

export const ORCHESTRATOR_ID = "orchestrator";

export function createAgent(
  partial: Partial<Agent> & Pick<Agent, "id" | "role" | "skin">,
): Agent {
  return { kind: "subagent", status: "spawning", ...partial };
}

export function createSession(
  partial: Partial<Session> & Pick<Session, "id" | "title" | "model">,
): Session {
  return {
    status: "idle",
    permissionMode: "default",
    agents: {
      [ORCHESTRATOR_ID]: {
        id: ORCHESTRATOR_ID,
        kind: "orchestrator",
        role: "orchestrator",
        status: "idle",
        skin: "lead",
      },
    },
    messages: [],
    loot: [],
    slashCommands: [],
    usage: { tokens: 0, cost: 0 },
    createdAt: 0,
    lastActiveAt: 0,
    archived: false,
    ...partial,
  };
}
