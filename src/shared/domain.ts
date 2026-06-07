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

// TodoWrite 工具的真实待办项(引擎从 PreToolUse 的 tool_input.todos 捕获)。
// status 沿用 SDK 的枚举(pending | in_progress | completed)。activeForm =
// 进行时文案(可选)。
export type TodoStatus = "pending" | "in_progress" | "completed";
export interface TodoItem {
  content: string;
  status: TodoStatus;
  activeForm?: string;
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

export interface PermissionPromptData {
  toolName: string;
  inputSummary: string;
  title?: string;
  displayName?: string;
  description?: string;
  agentId?: string;
}

export interface QuestionOption {
  label: string;
  description?: string;
}

export interface QuestionData {
  questions: Array<{
    question: string;
    header: string;
    options: QuestionOption[];
    multiSelect: boolean;
  }>;
}

export interface TimelineMessageItem {
  kind: "message";
  id: string;
  role: ChatRole;
  agentId?: string;
  text: string;
  ts: number;
}

export interface TimelineThinkingItem {
  kind: "thinking";
  id: string;
  agentId?: string;
  text: string;
  ts: number;
}

export interface TimelineToolItem {
  kind: "tool";
  id: string; // toolUseId
  toolName: string;
  inputSummary: string;
  status: "running" | "ok" | "failed";
  agentId?: string;
  ts: number;
}

export interface TimelinePromptItem {
  kind: "prompt";
  id: string; // promptId (= toolUseId for permissions)
  promptKind: "permission" | "question";
  data: PermissionPromptData | QuestionData;
  status: "pending" | "answered" | "dismissed";
  ts: number;
}

export type TimelineItem =
  | TimelineMessageItem
  | TimelineThinkingItem
  | TimelineToolItem
  | TimelinePromptItem;

export interface Session {
  id: string;
  title: string;
  status: SessionStatus;
  model: string;
  permissionMode: string;
  slashCommands: string[];
  agents: Record<string, Agent>;
  timeline: TimelineItem[];
  loot: Loot[];
  // 每 agent 的 TodoWrite 真实待办,按 agentId 归集(每次 TodoWrite 整体覆盖该
  // agent 的清单)。供 TaskWindow / Tasks / Currency「完成数」消费。
  todos: Record<string, TodoItem[]>;
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
  // 导入的本地 transcript:客户端自有的静态存档回看,无 Driver。reconcile 对账
  // 豁免之(引擎花名册不管辖导入会话),否则引擎 --watch 重启会误删用户载入的存档。
  imported?: boolean;
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
    timeline: [],
    loot: [],
    todos: {},
    slashCommands: [],
    usage: { tokens: 0, cost: 0 },
    createdAt: 0,
    lastActiveAt: 0,
    archived: false,
    ...partial,
  };
}
