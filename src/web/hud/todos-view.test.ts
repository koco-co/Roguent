import { expect, test } from "bun:test";
import { ORCHESTRATOR_ID, createSession } from "../../shared/domain";
import { TODO_META, sessionTodos, todoCounts } from "./todos-view";

function sessionWith(todos: Record<string, Array<{ content: string; status: "pending" | "in_progress" | "completed" }>>) {
  const s = createSession({ id: "s1", title: "t", model: "m" });
  return { ...s, todos };
}

test("sessionTodos returns [] for undefined session", () => {
  expect(sessionTodos(undefined)).toEqual([]);
});

test("sessionTodos flattens per-agent lists, orchestrator first, tagging agentId", () => {
  const s = sessionWith({
    "ag-b": [{ content: "B1", status: "pending" }],
    [ORCHESTRATOR_ID]: [{ content: "O1", status: "in_progress" }],
  });
  const rows = sessionTodos(s);
  expect(rows.map((r) => r.content)).toEqual(["O1", "B1"]);
  expect(rows[0]?.agentId).toBe(ORCHESTRATOR_ID);
  expect(rows[1]?.agentId).toBe("ag-b");
});

test("todoCounts tallies by status", () => {
  const rows = sessionTodos(
    sessionWith({
      [ORCHESTRATOR_ID]: [
        { content: "a", status: "completed" },
        { content: "b", status: "in_progress" },
        { content: "c", status: "pending" },
        { content: "d", status: "completed" },
      ],
    }),
  );
  expect(todoCounts(rows)).toEqual({
    pending: 1,
    in_progress: 1,
    completed: 2,
    total: 4,
  });
});

test("TODO_META covers all three statuses with [color, label]", () => {
  expect(TODO_META.pending[1]).toBe("待办");
  expect(TODO_META.in_progress[1]).toBe("进行中");
  expect(TODO_META.completed[1]).toBe("完成");
});
