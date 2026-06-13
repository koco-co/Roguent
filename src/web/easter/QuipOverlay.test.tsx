import { afterEach, beforeEach, expect, test } from "bun:test";
import { act, cleanup, render } from "@testing-library/react";
import { createSession } from "../../shared/domain";
import { DEFAULT_SETTINGS, useSettingsStore } from "../settings-store";
import { useRoomStore } from "../store";
import { QuipOverlay } from "./QuipOverlay";

// 手搓可控定时器:捕获组件 setTimeout 的回调,测试手动 flush;不靠真实计时,断言确定。
interface Pending {
  id: number;
  cb: () => void;
  delay: number;
}
let pending: Pending[] = [];
let nextId = 1;
const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;

function installFakeTimers() {
  pending = [];
  nextId = 1;
  globalThis.setTimeout = ((cb: () => void, delay = 0) => {
    const id = nextId++;
    pending.push({ id, cb, delay });
    return id as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;
  globalThis.clearTimeout = ((id: number) => {
    pending = pending.filter((p) => p.id !== id);
  }) as typeof clearTimeout;
}
function restoreTimers() {
  globalThis.setTimeout = realSetTimeout;
  globalThis.clearTimeout = realClearTimeout;
}
/** flush 当前队列里最早注册的一个回调(模拟其到期)。 */
function flushNext() {
  const p = pending.shift();
  if (p)
    act(() => {
      p.cb();
    });
}

beforeEach(() => {
  installFakeTimers();
  useSettingsStore.setState({ ...DEFAULT_SETTINGS });
  useRoomStore.setState({
    sessions: {},
    currentSessionId: null,
    projectOrder: [],
    connection: "connecting",
  });
});

afterEach(() => {
  restoreTimers();
  cleanup();
  // 复位 settings(本文件会设 uiLang:"en"),避免污染后续测试文件。
  useSettingsStore.setState({ ...DEFAULT_SETTINGS });
  useRoomStore.setState({
    sessions: {},
    currentSessionId: null,
    projectOrder: [],
    connection: "connecting",
  });
});

function seedSession() {
  const session = createSession({ id: "s1", title: "T" });
  // orchestrator 已在 createSession 里,设为 working 让词库走 working 组。
  session.agents = {
    orchestrator: {
      id: "orchestrator",
      kind: "orchestrator",
      role: "orchestrator",
      status: "working",
      skin: "lead",
    },
  };
  useRoomStore.setState({
    sessions: { s1: session },
    currentSessionId: "s1",
  });
}

test("a quip bubble appears after the first tick and disappears after its hold", () => {
  seedSession();
  // 确定性 rng → 永远挑第一个 agent / 第一条词。
  const { container } = render(<QuipOverlay rng={() => 0} />);
  // 初始无气泡。
  expect(container.querySelector(".quip-bubble")).toBeNull();

  // 第一次 tick(1400ms)到期 → 弹气泡。
  flushNext();
  const bubble = container.querySelector(".quip-bubble");
  expect(bubble).toBeTruthy();
  // working 组第一条(rng=0)。
  expect(bubble?.textContent).toBe("跑测试中…");

  // tick 排了两个定时器:hold(2800)与下一次 tick(3600+)。flush hold → 气泡消失。
  flushNext();
  expect(container.querySelector(".quip-bubble")).toBeNull();
});

test("no agents present → no bubble and no timer scheduled", () => {
  // 没有 currentSessionId → npcs 为空。
  render(<QuipOverlay rng={() => 0} />);
  expect(pending.length).toBe(0);
});

test("English UI renders the EN quip pool", () => {
  useSettingsStore.setState({ uiLang: "en" });
  seedSession();
  const { container } = render(<QuipOverlay rng={() => 0} />);
  flushNext();
  expect(container.querySelector(".quip-bubble")?.textContent).toBe(
    "running tests…",
  );
});
