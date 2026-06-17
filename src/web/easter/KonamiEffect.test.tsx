import { afterEach, beforeEach, expect, test } from "bun:test";
import { act, cleanup, render } from "@testing-library/react";
import { DEFAULT_SETTINGS, useSettingsStore } from "../settings-store";
import { KonamiEffect } from "./KonamiEffect";
import { useEasterStore } from "./easter-store";

beforeEach(() => {
  useEasterStore.setState({ firedEggs: {}, lastEffect: null });
  useSettingsStore.setState({ ...DEFAULT_SETTINGS });
});
afterEach(() => {
  cleanup();
  useEasterStore.setState({ firedEggs: {}, lastEffect: null });
  useSettingsStore.setState({ ...DEFAULT_SETTINGS });
});

test("renders nothing while lastEffect is null", () => {
  const { container } = render(<KonamiEffect />);
  expect(container.querySelector(".konami-rainbow")).toBeNull();
});

test("setting a cosmetic lastEffect renders the rainbow overlay", () => {
  const { container } = render(<KonamiEffect />);
  act(() => {
    useEasterStore.setState({
      lastEffect: { kind: "cosmetic", cosmeticId: "konami-rainbow" },
    });
  });
  expect(container.querySelector(".konami-rainbow")).toBeTruthy();
});

test("clearLastEffect dismisses the rendered overlay (one-shot)", () => {
  const { container } = render(<KonamiEffect />);
  act(() => {
    useEasterStore.setState({
      lastEffect: { kind: "cosmetic", cosmeticId: "konami-rainbow" },
    });
  });
  expect(container.querySelector(".konami-rainbow")).toBeTruthy();

  act(() => {
    useEasterStore.getState().clearLastEffect();
  });
  expect(container.querySelector(".konami-rainbow")).toBeNull();
});

test("the overlay auto-clears lastEffect after its hold (one-shot)", () => {
  // 捕获组件注册的 setTimeout 回调,手动 flush 模拟到期(不靠真实计时,断言确定)。
  const realSetTimeout = globalThis.setTimeout;
  let captured: (() => void) | null = null;
  globalThis.setTimeout = ((cb: () => void) => {
    captured = cb;
    return 1 as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;
  try {
    render(<KonamiEffect />);
    act(() => {
      useEasterStore.setState({
        lastEffect: { kind: "cosmetic", cosmeticId: "konami-rainbow" },
      });
    });
    expect(useEasterStore.getState().lastEffect).not.toBeNull();
    // 到期 → 组件自清,lastEffect 归 null(one-shot,不靠用户操作)。
    expect(captured).not.toBeNull();
    act(() => {
      captured?.();
    });
    expect(useEasterStore.getState().lastEffect).toBeNull();
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }
});

test("non-cosmetic effects (achievementProgress) do not render the rainbow", () => {
  const { container } = render(<KonamiEffect />);
  act(() => {
    useEasterStore.setState({
      lastEffect: { kind: "achievementProgress", achievementId: "x" },
    });
  });
  expect(container.querySelector(".konami-rainbow")).toBeNull();
  // 非 cosmetic 也要被消费掉(清空),否则会卡住后续 cosmetic 效果。
  expect(useEasterStore.getState().lastEffect).toBeNull();
});
