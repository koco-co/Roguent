import { expect, test } from "bun:test";
import { createSession } from "../../shared/domain";
import { leaderboardRows } from "./leaderboard-rows";

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
