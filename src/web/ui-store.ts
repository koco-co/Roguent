import { create } from "zustand";

type Panel = "drawerOpen" | "modelOpen" | "skillsOpen";

export interface UiState {
  drawerOpen: boolean;
  modelOpen: boolean;
  skillsOpen: boolean;
  selectedAgentId: string | null;
  toggle: (k: Panel) => void;
  select: (id: string | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
  drawerOpen: false,
  modelOpen: false,
  skillsOpen: false,
  selectedAgentId: null,
  toggle: (k) => set((s) => ({ [k]: !s[k] }) as Partial<UiState>),
  select: (id) => set({ selectedAgentId: id }),
}));
