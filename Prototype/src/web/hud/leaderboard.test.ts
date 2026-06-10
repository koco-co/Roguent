import { expect, test } from "bun:test";
import { createSession } from "../../shared/domain";
import {
  leaderboardByModel,
  leaderboardByRuntime,
  leaderboardRows,
} from "./leaderboard-rows";

test("ranks sessions by tokens desc, includes archived flagged", () => {
  const sessions = {
    a: createSession({ id: "a", title: "A", model: "claude-opus-4-8" }),
    b: createSession({ id: "b", title: "B", model: "claude-sonnet-4-6" }),
  };
  sessions.a.usage = { tokens: 100, cost: 0.1 };
  sessions.b.usage = { tokens: 900, cost: 0.9 };
  sessions.b.archived = true;
  const rows = leaderboardRows(sessions);
  expect(rows.map((r) => r.sessionId)).toEqual(["b", "a"]);
  expect(rows[0]?.tokens).toBe(900);
  expect(rows[0]?.archived).toBe(true);
});

test("empty sessions → empty rows", () => {
  expect(leaderboardRows({})).toEqual([]);
});

test("byModel: sums same-model sessions, sorts by tokens desc", () => {
  const sessions = {
    a: createSession({ id: "a", title: "A", model: "claude-opus-4-8" }),
    b: createSession({ id: "b", title: "B", model: "claude-opus-4-8" }),
    c: createSession({ id: "c", title: "C", model: "claude-sonnet-4-6" }),
  };
  sessions.a.usage = { tokens: 100, cost: 0.1 };
  sessions.b.usage = { tokens: 300, cost: 0.3 };
  sessions.c.usage = { tokens: 900, cost: 0.9 };
  const rows = leaderboardByModel(sessions);
  expect(rows.map((r) => r.key)).toEqual([
    "claude-sonnet-4-6",
    "claude-opus-4-8",
  ]);
  // opus 行 = a + b 求和
  expect(rows[1]?.tokens).toBe(400);
  expect(rows[1]?.cost).toBeCloseTo(0.4);
  expect(rows[0]?.tokens).toBe(900);
});

test("byModel: empty sessions → empty rows", () => {
  expect(leaderboardByModel({})).toEqual([]);
});

test("byRuntime: claude row sums all, codex row always zero placeholder", () => {
  const sessions = {
    a: createSession({ id: "a", title: "A", model: "claude-opus-4-8" }),
    b: createSession({ id: "b", title: "B", model: "claude-sonnet-4-6" }),
  };
  sessions.a.usage = { tokens: 100, cost: 0.1 };
  sessions.b.usage = { tokens: 900, cost: 0.9 };
  const rows = leaderboardByRuntime(sessions);
  // 始终返回 2 行,claude 在前
  expect(rows.length).toBe(2);
  expect(rows[0]?.key).toBe("claude");
  expect(rows[1]?.key).toBe("codex");
  // claude 行 = 全部会话 tokens/cost 之和(真)
  expect(rows[0]?.tokens).toBe(1000);
  expect(rows[0]?.cost).toBeCloseTo(1.0);
  // codex 行恒为占位 0 / model='—'
  expect(rows[1]?.tokens).toBe(0);
  expect(rows[1]?.cost).toBe(0);
  expect(rows[1]?.model).toBe("—");
});

test("byRuntime: empty sessions → claude row zero, still 2 rows", () => {
  const rows = leaderboardByRuntime({});
  expect(rows.length).toBe(2);
  expect(rows[0]?.key).toBe("claude");
  expect(rows[0]?.tokens).toBe(0);
  expect(rows[0]?.cost).toBe(0);
  expect(rows[1]?.key).toBe("codex");
  expect(rows[1]?.tokens).toBe(0);
});
