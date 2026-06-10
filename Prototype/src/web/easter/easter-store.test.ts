import { afterEach, expect, test } from "bun:test";
import { type EasterEffect, useEasterStore } from "./easter-store";

afterEach(() => {
  // Reset store to initial state between tests
  useEasterStore.setState({ firedEggs: {}, lastEffect: null });
});

// ── fireEgg is idempotent (one-time) ─────────────────────────────────────────

test("fireEgg fires a cosmetic effect once", () => {
  const effect: EasterEffect = {
    kind: "cosmetic",
    cosmeticId: "rainbow-trail",
  };
  useEasterStore.getState().fireEgg("konami", effect);

  const state = useEasterStore.getState();
  expect(state.firedEggs.konami).toBe(true);
  expect(state.lastEffect).toEqual(effect);
});

test("fireEgg with achievementProgress fires once and records effect", () => {
  const effect: EasterEffect = {
    kind: "achievementProgress",
    achievementId: "cheat-code",
  };
  useEasterStore.getState().fireEgg("secret-combo", effect);

  const state = useEasterStore.getState();
  expect(state.firedEggs["secret-combo"]).toBe(true);
  expect(state.lastEffect).toEqual(effect);
});

test("re-firing the same egg is a no-op: firedEggs and lastEffect do not change", () => {
  const first: EasterEffect = { kind: "cosmetic", cosmeticId: "sparkle" };
  const second: EasterEffect = {
    kind: "cosmetic",
    cosmeticId: "different-skin",
  };

  useEasterStore.getState().fireEgg("konami", first);
  // Capture state after first fire
  const afterFirst = { ...useEasterStore.getState() };

  // Attempt second fire — must be a no-op
  useEasterStore.getState().fireEgg("konami", second);
  const afterSecond = useEasterStore.getState();

  expect(afterSecond.firedEggs.konami).toBe(true);
  // lastEffect should still be the first one
  expect(afterSecond.lastEffect).toEqual(first);
  expect(afterSecond.lastEffect).toEqual(afterFirst.lastEffect);
});

test("different egg ids do not interfere", () => {
  const e1: EasterEffect = { kind: "cosmetic", cosmeticId: "a" };
  const e2: EasterEffect = { kind: "achievementProgress", achievementId: "b" };

  useEasterStore.getState().fireEgg("egg-a", e1);
  useEasterStore.getState().fireEgg("egg-b", e2);

  const state = useEasterStore.getState();
  expect(state.firedEggs["egg-a"]).toBe(true);
  expect(state.firedEggs["egg-b"]).toBe(true);
  // lastEffect reflects the most recent fire
  expect(state.lastEffect).toEqual(e2);
});

// ── clearLastEffect ───────────────────────────────────────────────────────────

test("clearLastEffect removes lastEffect but keeps firedEggs", () => {
  const effect: EasterEffect = { kind: "cosmetic", cosmeticId: "glow" };
  useEasterStore.getState().fireEgg("konami", effect);
  useEasterStore.getState().clearLastEffect();

  const state = useEasterStore.getState();
  expect(state.lastEffect).toBeNull();
  expect(state.firedEggs.konami).toBe(true);
});
