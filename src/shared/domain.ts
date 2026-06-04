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
    ...partial,
  };
}
