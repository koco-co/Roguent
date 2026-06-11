import { expect, test } from "bun:test";
import {
  agoLabel,
  applySessionFilters,
  sortSessions,
} from "./session-grid-view";
import type { GridSession } from "./session-grid-view";

const mk = (over: Partial<GridSession>): GridSession => ({
  id: "s1",
  project: "roguent",
  model: "claude-opus-4-8",
  runtime: "claude",
  status: "busy",
  lastActiveAt: 0,
  ...over,
});

test("agoLabel: now / m / h / d", () => {
  expect(agoLabel(0)).toBe("now");
  expect(agoLabel(38)).toBe("38m ago");
  expect(agoLabel(190)).toBe("3h ago");
  expect(agoLabel(2980)).toBe("2d ago");
  expect(agoLabel(null)).toBe("");
});

test("sortSessions: error 最前,同权重按 lastActiveAt 新→旧", () => {
  const now = 1_000_000;
  const a = mk({ id: "a", status: "idle", lastActiveAt: now - 60_000 });
  const b = mk({ id: "b", status: "error", lastActiveAt: now - 999_000 });
  const c = mk({ id: "c", status: "busy", lastActiveAt: now - 1_000 });
  expect(sortSessions([a, b, c], now).map((s) => s.id)).toEqual([
    "b",
    "c",
    "a",
  ]);
});

test("applySessionFilters: runtime + 项目多选 + 模型多选 + 仅活跃 叠加", () => {
  const ss = [
    mk({
      id: "1",
      runtime: "claude",
      project: "roguent",
      model: "m1",
      status: "busy",
    }),
    mk({
      id: "2",
      runtime: "codex",
      project: "pay",
      model: "m2",
      status: "idle",
    }),
    mk({
      id: "3",
      runtime: "claude",
      project: "pay",
      model: "m1",
      status: "done",
    }),
  ];
  expect(
    applySessionFilters(ss, {
      rt: "claude",
      projects: [],
      models: [],
      activeOnly: false,
    }).map((s) => s.id),
  ).toEqual(["1", "3"]);
  expect(
    applySessionFilters(ss, {
      rt: "all",
      projects: ["pay"],
      models: [],
      activeOnly: false,
    }).map((s) => s.id),
  ).toEqual(["2", "3"]);
  expect(
    applySessionFilters(ss, {
      rt: "all",
      projects: [],
      models: ["m1"],
      activeOnly: true,
    }).map((s) => s.id),
  ).toEqual(["1"]);
});
