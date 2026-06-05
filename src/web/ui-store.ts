import { create } from "zustand";
import type { LocalSessionMeta } from "../shared/local-sessions";

type Panel =
  | "drawerOpen"
  | "modelOpen"
  | "skillsOpen"
  | "lootOpen"
  | "infoOpen"
  | "importOpen"
  | "leaderboardOpen";

// 双层缩放(spec §架构):总览大厅 ↔ 进入某会话的内景(复用现有 Room/Scene)。
export type View = "overworld" | { interior: string };

// 互斥模态路由(对标设计原型 app.jsx 的单一 active-panel):同一时刻最多开一个面板。
// 上方的布尔标志(drawerOpen/modelOpen/...)是过渡期遗留,各面板在 T3.x 重建时迁到此
// 路由,T5.x 收尾删除布尔标志。现阶段两套加法共存、互不干扰。
export type PanelId =
  | "npc"
  | "tasks"
  | "settings"
  | "skills"
  | "shop"
  | "leaderboard"
  | "backpack"
  | "chat"
  | "model"
  | "import"
  | "account"
  | "about"
  | "menu"
  | "error"
  | "sessiongrid";

export interface UiState {
  drawerOpen: boolean;
  modelOpen: boolean;
  skillsOpen: boolean;
  lootOpen: boolean;
  infoOpen: boolean;
  importOpen: boolean;
  leaderboardOpen: boolean;
  // 互斥模态路由的当前面板(null = 全关);见 PanelId 注释。
  activePanel: PanelId | null;
  localSessions: LocalSessionMeta[];
  importError: string | null;
  selectedAgentId: string | null;
  // 当前选中的 NPC(总览里打开了它的信息卡的那个会话);与 selectedAgentId(内景里
  // 选中的某个 subagent)是不同语境。
  selectedNpcId: string | null;
  view: View;
  // 传送门过渡:进/出内景时由 PortalTransition 驱动遮罩,中点真正切 view。
  transition: { kind: "enter" | "exit"; sessionId: string } | null;
  toggle: (k: Panel) => void;
  openPanel: (id: PanelId) => void;
  closePanel: () => void;
  select: (id: string | null) => void;
  selectNpc: (id: string | null) => void;
  enterInterior: (id: string) => void;
  exitOverworld: () => void;
  beginEnter: (id: string) => void;
  beginExit: (id: string) => void;
  endTransition: () => void;
  /** Replaces the session list and clears any previous importError. */
  setLocalSessions: (items: LocalSessionMeta[]) => void;
  setImportError: (reason: string | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
  drawerOpen: false,
  modelOpen: false,
  skillsOpen: false,
  lootOpen: false,
  infoOpen: false,
  importOpen: false,
  leaderboardOpen: false,
  activePanel: null,
  localSessions: [],
  importError: null,
  selectedAgentId: null,
  selectedNpcId: null,
  view: "overworld",
  transition: null,
  toggle: (k) => set((s) => ({ [k]: !s[k] }) as Partial<UiState>),
  openPanel: (id) => set({ activePanel: id }),
  closePanel: () => set({ activePanel: null }),
  select: (id) => set({ selectedAgentId: id }),
  selectNpc: (id) => set({ selectedNpcId: id }),
  // 进入会话内景:清掉总览的 NPC 选择,切到内景视图。会话焦点切换由调用方
  // 另调 useRoomStore.switchSession(id)(两个 store 解耦)。
  enterInterior: (id) => set({ view: { interior: id }, selectedNpcId: null }),
  // 返回大厅:清掉内景里选中的 subagent。
  exitOverworld: () => set({ view: "overworld", selectedAgentId: null }),
  beginEnter: (id) => set({ transition: { kind: "enter", sessionId: id } }),
  beginExit: (id) => set({ transition: { kind: "exit", sessionId: id } }),
  endTransition: () => set({ transition: null }),
  setLocalSessions: (items) => set({ localSessions: items, importError: null }),
  setImportError: (reason) => set({ importError: reason }),
}));
