import { create } from "zustand";
import {
  type Loot,
  ORCHESTRATOR_ID,
  type Session,
  createAgent,
  createSession,
} from "../shared/domain";
import type {
  AccountLimits,
  ContextUpdatedPayload,
  RoomEvent,
} from "../shared/events";
import { agentTypeToSkin } from "../shared/mapping";

// WS 连接生命周期状态:connecting(建连/退避重连中)/ open(已连)/ closed(已断,
// 含 engine URL 解析失败)。ErrorOverlay 据此去抖显示离线错误层(T4.3)。
export type ConnectionStatus = "connecting" | "open" | "closed";

export interface RoomState {
  sessions: Record<string, Session>;
  currentSessionId: string | null;
  // 项目首见顺序 —— 总览世界房间的槽位顺序。追加式:新项目入尾,既有项目永不
  // 重排,房间因此不抖动(spec §总览世界:布局对已存在项目稳定/追加式)。
  projectOrder: string[];
  connection: ConnectionStatus;
}

// 大厅最多同时显示这么多活跃(未归档)会话;新建/激活第 11 个会把活跃度最低者
// 软归档(spec §生命周期:≤10/LRU)。
export const ACTIVE_CAP = 10;

/**
 * 就地把活跃度最低的会话软归档,直到「活跃(未归档)且有 project」的会话数 ≤
 * ACTIVE_CAP。只统计带 project 的会话:无 project 的(如早到的 session.error 占位)
 * 渲染不出 NPC,不该占大厅槽。protectId 永不被选为牺牲品 —— 用于保护刚建/刚激活者,
 * 防止非单调 wall-clock(时钟回拨)把它自己挤掉。
 */
function enforceActiveCap(
  sessions: Record<string, Session>,
  protectId?: string,
): void {
  while (true) {
    const active = Object.values(sessions).filter(
      (s) => !s.archived && s.project,
    );
    if (active.length <= ACTIVE_CAP) break;
    let victim: Session | undefined;
    for (const s of active) {
      if (s.id === protectId) continue;
      if (!victim || s.lastActiveAt < victim.lastActiveAt) victim = s;
    }
    if (!victim) break;
    sessions[victim.id] = { ...victim, archived: true };
  }
}

export function reduce(state: RoomState, e: RoomEvent): RoomState {
  const sessions = { ...state.sessions };

  if (e.type === "session.created") {
    const p = e.payload as {
      title: string;
      model: string;
      slashCommands?: string[];
      cwd?: string;
      project?: string;
      permissionMode?: string;
    };
    // 幂等:engine 先合成一条 session.created,SDK init 后又派生一条。第二条必须
    // 合并(补 model/slashCommands/cwd/project),绝不能重建会话——否则会清空已有
    // transcript(spec §关键约定)。
    const existing = sessions[e.sessionId];
    if (existing) {
      const proj = existing.project ?? p.project;
      sessions[e.sessionId] = {
        ...existing,
        title: p.title || existing.title,
        model: p.model || existing.model,
        slashCommands: p.slashCommands?.length
          ? p.slashCommands
          : existing.slashCommands,
        cwd: existing.cwd ?? p.cwd,
        project: proj,
        // SDK init 派生的第二条带真实 permissionMode;只在它是非 default 时覆盖,
        // 否则保留已知值(合成的第一条恒为 "default",不能把真实模式刷回去)。
        permissionMode:
          p.permissionMode && p.permissionMode !== "default"
            ? p.permissionMode
            : existing.permissionMode,
      };
      const projectOrder =
        proj && !state.projectOrder.includes(proj)
          ? [...state.projectOrder, proj]
          : state.projectOrder;
      // SDK init 派生的第二条 session.created 绝不能抢焦点。
      // connection 是传输层状态,事件折叠从不改它 —— 原样透传。
      return {
        sessions,
        projectOrder,
        currentSessionId: state.currentSessionId,
        connection: state.connection,
      };
    }

    const created = createSession({
      id: e.sessionId,
      title: p.title || e.sessionId,
      model: p.model,
      slashCommands: p.slashCommands ?? [],
      cwd: p.cwd,
      project: p.project,
      // 合成的第一条恒为 "default";若首条已带真实模式(如 init 先于合成到达)则尊重之。
      // 显式回落 "default":createSession 的默认会被 partial 里的 undefined 覆盖掉。
      permissionMode: p.permissionMode ?? "default",
      lastActiveAt: e.ts, // 首次出现即视为刚活跃,供 LRU 排序
    });
    sessions[e.sessionId] = created;
    const projectOrder =
      p.project && !state.projectOrder.includes(p.project)
        ? [...state.projectOrder, p.project]
        : state.projectOrder;
    // 新建即跳第 11 个 → 软归档活跃度最低者;新会话受保护,绝不被自己挤掉。
    enforceActiveCap(sessions, e.sessionId);
    // 新建即跳转:会话首次出现就把焦点切过去。connection 透传(见上)。
    return {
      sessions,
      projectOrder,
      currentSessionId: e.sessionId,
      connection: state.connection,
    };
  }

  // session.error 可能在 system:init 之前就到达(如订阅 auth 直接失败),
  // 此时还没有 session.created。所以在 prev 守卫之前处理:缺会话就建占位,
  // 把错误标进状态并落进 transcript,保证"为什么没法用"对用户可见(spec §10)。
  if (e.type === "session.error") {
    const p = e.payload as { message: string };
    const base =
      sessions[e.sessionId] ??
      createSession({
        id: e.sessionId,
        title: e.sessionId,
        model: "",
        lastActiveAt: e.ts,
      });
    sessions[e.sessionId] = {
      ...base,
      status: "error",
      messages: [
        ...base.messages,
        { id: String(e.seq), role: "system", text: p.message, t: e.ts },
      ],
    };
    return {
      sessions,
      projectOrder: state.projectOrder,
      currentSessionId: state.currentSessionId ?? e.sessionId,
      connection: state.connection,
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
    case "agent.thinking": {
      // Mirror agent.idle: clear currentTool so the head shows the "..." emote
      // (not a tool bubble) while the agent reasons (spec §6.4).
      const a = e.agentId ? s.agents[e.agentId] : undefined;
      if (a && e.agentId)
        s.agents[e.agentId] = {
          ...a,
          status: "thinking",
          currentTool: undefined,
        };
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
      // 对话文字进抽屉会话窗口,不进房间(spec §5/§7.3)。
      // includePartialMessages=false 时一条 delta = 一整轮发言。
      // role 默认 "assistant";导入历史会话时用户轮次带 role:"user"。
      const p = e.payload as { text: string; role?: "user" | "assistant" };
      const role = p.role ?? "assistant";
      if (p.text)
        s.messages = [
          ...s.messages,
          {
            id: String(e.seq),
            role,
            agentId: role === "user" ? undefined : e.agentId,
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
    case "context.updated": {
      const p = e.payload as ContextUpdatedPayload;
      s.context = {
        usedTokens: p.usedTokens,
        windowSize: p.windowSize,
        utilization: p.utilization,
      };
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

  // 活跃度:任何 message/tool/agent/usage 事件都刷新 lastActiveAt,供大厅 ≤10/LRU
  // 选择(spec §生命周期)。房间归属按 project 不按活跃度,故 NPC 不会因此挪位。
  s.lastActiveAt = e.ts;
  sessions[e.sessionId] = s;
  return { ...state, sessions };
}

export interface RoomStore extends RoomState {
  applyEvent: (e: RoomEvent) => void;
  switchSession: (id: string) => void;
  appendUserMessage: (sessionId: string, text: string) => void;
  // 软归档(纯客户端可见性,driver 后台不杀):移出大厅、进 ChatDrawer 已归档区。
  archiveSession: (id: string) => void;
  // 取消归档 → 走回大厅并挤掉当前 LRU;焦点切到它。
  unarchiveSession: (id: string) => void;
  // 硬删除的客户端侧:从 store 移除。停 driver 的命令由调用方另发(避免 store↔ws 循环)。
  removeSession: (id: string) => void;
  limits: AccountLimits | null;
  setLimits: (limits: AccountLimits) => void;
  setConnection: (c: ConnectionStatus) => void;
}

export const useRoomStore = create<RoomStore>((set) => ({
  sessions: {},
  currentSessionId: null,
  projectOrder: [],
  connection: "connecting",
  limits: null,
  setLimits: (limits) => set({ limits }),
  setConnection: (connection) => set({ connection }),
  applyEvent: (e) => set((st) => reduce(st, e)),
  switchSession: (id) => set({ currentSessionId: id }),
  // 乐观回显:用户发的消息没有对应服务端事件,本地直接进 transcript;同时刷新活跃度。
  appendUserMessage: (sessionId, text) =>
    set((st) => {
      const prev = st.sessions[sessionId];
      if (!prev) return st;
      return {
        sessions: {
          ...st.sessions,
          [sessionId]: {
            ...prev,
            lastActiveAt: Date.now(),
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
  archiveSession: (id) =>
    set((st) => {
      const s = st.sessions[id];
      if (!s || s.archived) return st;
      return {
        sessions: { ...st.sessions, [id]: { ...s, archived: true } },
        currentSessionId:
          st.currentSessionId === id ? null : st.currentSessionId,
      };
    }),
  unarchiveSession: (id) =>
    set((st) => {
      const s = st.sessions[id];
      if (!s) return st;
      const sessions = {
        ...st.sessions,
        [id]: { ...s, archived: false, lastActiveAt: Date.now() },
      };
      enforceActiveCap(sessions, id);
      return { sessions, currentSessionId: id };
    }),
  removeSession: (id) =>
    set((st) => {
      if (!st.sessions[id]) return st;
      const sessions = { ...st.sessions };
      // 注:不修剪 projectOrder(追加式、保证既有房间不挪位),删掉某项目最后一个
      // 会话会留下一个空房间直到刷新 —— 已接受的 tradeoff(见 spec §验证)。
      delete sessions[id];
      return {
        sessions,
        currentSessionId:
          st.currentSessionId === id ? null : st.currentSessionId,
      };
    }),
}));
