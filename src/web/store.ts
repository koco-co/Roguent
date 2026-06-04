import { create } from "zustand";
import {
  type Loot,
  ORCHESTRATOR_ID,
  type Session,
  createAgent,
  createSession,
} from "../shared/domain";
import type { RoomEvent } from "../shared/events";
import { agentTypeToSkin } from "../shared/mapping";

export interface RoomState {
  sessions: Record<string, Session>;
  currentSessionId: string | null;
}

export function reduce(state: RoomState, e: RoomEvent): RoomState {
  const sessions = { ...state.sessions };

  if (e.type === "session.created") {
    const p = e.payload as {
      title: string;
      model: string;
      slashCommands?: string[];
    };
    sessions[e.sessionId] = createSession({
      id: e.sessionId,
      title: p.title || e.sessionId,
      model: p.model,
      slashCommands: p.slashCommands ?? [],
    });
    return {
      sessions,
      currentSessionId: state.currentSessionId ?? e.sessionId,
    };
  }

  // session.error 可能在 system:init 之前就到达(如订阅 auth 直接失败),
  // 此时还没有 session.created。所以在 prev 守卫之前处理:缺会话就建占位,
  // 把错误标进状态并落进 transcript,保证"为什么没法用"对用户可见(spec §10)。
  if (e.type === "session.error") {
    const p = e.payload as { message: string };
    const base =
      sessions[e.sessionId] ??
      createSession({ id: e.sessionId, title: e.sessionId, model: "" });
    sessions[e.sessionId] = {
      ...base,
      status: "error",
      messages: [
        ...base.messages,
        { id: String(e.seq), role: "system", text: `⚠ ${p.message}`, t: e.ts },
      ],
    };
    return {
      sessions,
      currentSessionId: state.currentSessionId ?? e.sessionId,
    };
  }

  const prev = sessions[e.sessionId];
  if (!prev) return state; // event for an unknown session — ignore
  const s: Session = { ...prev, agents: { ...prev.agents } };

  switch (e.type) {
    case "agent.spawned": {
      const p = e.payload as { role: string; parentId: string };
      if (e.agentId) {
        s.agents[e.agentId] = createAgent({
          id: e.agentId,
          role: p.role,
          skin: agentTypeToSkin(p.role),
          parentId: p.parentId,
          status: "working",
        });
      }
      s.status = "busy";
      break;
    }
    case "tool.started": {
      const p = e.payload as { toolName: string };
      const a = e.agentId ? s.agents[e.agentId] : undefined;
      if (a && e.agentId)
        s.agents[e.agentId] = {
          ...a,
          status: "working",
          currentTool: p.toolName,
        };
      break;
    }
    case "tool.ended":
    case "tool.failed": {
      const a = e.agentId ? s.agents[e.agentId] : undefined;
      if (a && e.agentId)
        s.agents[e.agentId] = { ...a, currentTool: undefined };
      break;
    }
    case "agent.idle": {
      const a = e.agentId ? s.agents[e.agentId] : undefined;
      if (a && e.agentId)
        s.agents[e.agentId] = { ...a, status: "idle", currentTool: undefined };
      break;
    }
    case "agent.done": {
      if (e.agentId && e.agentId !== ORCHESTRATOR_ID)
        delete s.agents[e.agentId];
      break;
    }
    case "loot.dropped": {
      const p = e.payload as {
        kind: Loot["kind"];
        label: string;
        sourceRef: string;
      };
      s.loot = [
        ...s.loot,
        {
          id: String(e.seq),
          sessionId: e.sessionId,
          kind: p.kind,
          label: p.label,
          sourceRef: p.sourceRef,
          t: e.ts,
        },
      ];
      break;
    }
    case "message.delta":
    case "message.final": {
      // 助手文字进抽屉会话窗口,不进房间(spec §5/§7.3)。
      // includePartialMessages=false 时一条 delta = 一整轮助手发言。
      const p = e.payload as { text: string };
      if (p.text)
        s.messages = [
          ...s.messages,
          {
            id: String(e.seq),
            role: "assistant",
            agentId: e.agentId,
            text: p.text,
            t: e.ts,
          },
        ];
      break;
    }
    case "usage.updated": {
      const p = e.payload as { tokens: number; cost: number };
      s.usage = { tokens: p.tokens, cost: p.cost };
      break;
    }
    case "session.cleared": {
      const orch = s.agents[ORCHESTRATOR_ID];
      s.agents = orch ? { [ORCHESTRATOR_ID]: orch } : {};
      s.status = "done";
      break;
    }
    default:
      break;
  }

  sessions[e.sessionId] = s;
  return { ...state, sessions };
}

export interface RoomStore extends RoomState {
  applyEvent: (e: RoomEvent) => void;
  switchSession: (id: string) => void;
  appendUserMessage: (sessionId: string, text: string) => void;
}

export const useRoomStore = create<RoomStore>((set) => ({
  sessions: {},
  currentSessionId: null,
  applyEvent: (e) => set((st) => reduce(st, e)),
  switchSession: (id) => set({ currentSessionId: id }),
  // 乐观回显:用户发的消息没有对应服务端事件,本地直接进 transcript。
  appendUserMessage: (sessionId, text) =>
    set((st) => {
      const prev = st.sessions[sessionId];
      if (!prev) return st;
      return {
        sessions: {
          ...st.sessions,
          [sessionId]: {
            ...prev,
            messages: [
              ...prev.messages,
              {
                id: `u-${prev.messages.length}-${Date.now()}`,
                role: "user",
                text,
                t: Date.now(),
              },
            ],
          },
        },
      };
    }),
}));
