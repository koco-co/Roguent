import { beforeEach, expect, test } from "bun:test";
import { parsePinned, selectPinnedIds, usePinnedStore } from "./pinned-store";

beforeEach(() => {
  usePinnedStore.setState({ pinnedBySession: {} });
});

test("togglePin 添加一个 id 到该会话", () => {
  usePinnedStore.getState().togglePin("s1", "m1");
  expect(usePinnedStore.getState().pinnedBySession).toEqual({ s1: ["m1"] });
});

test("togglePin 再次切换同一 id → 移除(空列表不留键)", () => {
  const { togglePin } = usePinnedStore.getState();
  togglePin("s1", "m1");
  togglePin("s1", "m1");
  expect(usePinnedStore.getState().pinnedBySession).toEqual({});
});

test("togglePin 累加多个 id,保留顺序", () => {
  const { togglePin } = usePinnedStore.getState();
  togglePin("s1", "m1");
  togglePin("s1", "m2");
  togglePin("s1", "m3");
  expect(usePinnedStore.getState().pinnedBySession.s1).toEqual([
    "m1",
    "m2",
    "m3",
  ]);
  // 取消中间一条,其余顺序不变
  togglePin("s1", "m2");
  expect(usePinnedStore.getState().pinnedBySession.s1).toEqual(["m1", "m3"]);
});

test("置顶按会话隔离:一个会话的 pin 不影响另一个", () => {
  const { togglePin } = usePinnedStore.getState();
  togglePin("s1", "m1");
  togglePin("s2", "m1"); // 同 id 不同会话
  togglePin("s2", "m9");
  expect(usePinnedStore.getState().pinnedBySession).toEqual({
    s1: ["m1"],
    s2: ["m1", "m9"],
  });
  // 移除 s1 的 m1 不动 s2
  togglePin("s1", "m1");
  expect(usePinnedStore.getState().pinnedBySession).toEqual({
    s2: ["m1", "m9"],
  });
});

test("isPinned 反映当前状态", () => {
  const { togglePin, isPinned } = usePinnedStore.getState();
  expect(isPinned("s1", "m1")).toBe(false);
  togglePin("s1", "m1");
  expect(usePinnedStore.getState().isPinned("s1", "m1")).toBe(true);
  expect(usePinnedStore.getState().isPinned("s1", "m2")).toBe(false);
  expect(usePinnedStore.getState().isPinned("s2", "m1")).toBe(false);
});

test("selectPinnedIds 对无置顶会话返回稳定的同一空数组引用", () => {
  const s = usePinnedStore.getState();
  const a = selectPinnedIds(s, "nope");
  const b = selectPinnedIds(s, "also-nope");
  expect(a).toEqual([]);
  // 同一冻结空数组引用,避免 selector 造新值触发无限重渲染
  expect(a).toBe(b);
});

test("selectPinnedIds 返回该会话的 id 数组", () => {
  usePinnedStore.getState().togglePin("s1", "m1");
  usePinnedStore.getState().togglePin("s1", "m2");
  expect(selectPinnedIds(usePinnedStore.getState(), "s1")).toEqual([
    "m1",
    "m2",
  ]);
});

// ── 持久化形状(parsePinned 纯函数,对标 settings-store.parsePersisted)──────
test("parsePinned: null / 损坏 JSON / 非对象 → 空", () => {
  expect(parsePinned(null)).toEqual({});
  expect(parsePinned("not json {{{")).toEqual({});
  expect(parsePinned("[1,2,3]")).toEqual({}); // 数组非对象
  expect(parsePinned("null")).toEqual({}); // JSON null
  expect(parsePinned('"str"')).toEqual({}); // 字符串
});

test("parsePinned: 合法 Record<sessionId, string[]> 被保留", () => {
  const raw = JSON.stringify({ s1: ["m1", "m2"], s2: ["m9"] });
  expect(parsePinned(raw)).toEqual({ s1: ["m1", "m2"], s2: ["m9"] });
});

test("parsePinned: 非字符串数组 / 非数组值被丢弃,合法键保留", () => {
  const raw = JSON.stringify({
    s1: ["m1"], // 合法
    s2: [1, 2, 3], // 数字数组 → 丢
    s3: "m1", // 非数组 → 丢
    s4: ["m1", 2], // 混合 → 丢
  });
  expect(parsePinned(raw)).toEqual({ s1: ["m1"] });
});

test("parsePinned: 同会话内重复 id 去重", () => {
  const raw = JSON.stringify({ s1: ["m1", "m1", "m2", "m1"] });
  expect(parsePinned(raw)).toEqual({ s1: ["m1", "m2"] });
});

// 持久化往返:写入的形状能被 parsePinned 原样读回(JSON.stringify(pinnedBySession))。
test("持久化形状往返:stringify → parsePinned 一致", () => {
  usePinnedStore.getState().togglePin("s1", "m1");
  usePinnedStore.getState().togglePin("s7", "m3");
  const serialized = JSON.stringify(usePinnedStore.getState().pinnedBySession);
  expect(parsePinned(serialized)).toEqual(
    usePinnedStore.getState().pinnedBySession,
  );
});
