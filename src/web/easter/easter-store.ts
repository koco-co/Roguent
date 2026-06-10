import { create } from "zustand";

/**
 * EasterEffect — purely local, cosmetic-only. Never affects real agent
 * execution. achievementProgress records intent locally only; no engine
 * commands are sent.
 */
export type EasterEffect =
  | { kind: "cosmetic"; cosmeticId: string }
  | { kind: "achievementProgress"; achievementId: string };

export interface EasterState {
  /** Which eggs have already fired (idempotent guard). */
  firedEggs: Record<string, true>;
  /**
   * The most recent effect that fired and has not yet been acknowledged.
   * Components (e.g. an overlay) read this and call clearLastEffect() once
   * they have shown it.
   */
  lastEffect: EasterEffect | null;
}

export interface EasterStore extends EasterState {
  /**
   * Fire an egg once. If the same eggId has already been fired, this is a
   * no-op (idempotent, "one-time" semantics).
   */
  fireEgg: (eggId: string, effect: EasterEffect) => void;
  /** Dismiss the displayed effect without un-marking it as fired. */
  clearLastEffect: () => void;
}

export const useEasterStore = create<EasterStore>((set, get) => ({
  firedEggs: {},
  lastEffect: null,

  fireEgg: (eggId, effect) => {
    if (get().firedEggs[eggId]) return; // idempotent — one-time only
    set((s) => ({
      firedEggs: { ...s.firedEggs, [eggId]: true },
      lastEffect: effect,
    }));
  },

  clearLastEffect: () => set({ lastEffect: null }),
}));
