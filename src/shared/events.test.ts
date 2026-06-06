import { expect, test } from "bun:test";
import { type RoomEvent, type RoomEventType, type TodosUpdatedPayload, isToolEvent } from "./events";

test("todos.updated is a known RoomEventType with a TodoItem[] payload", () => {
  const t: RoomEventType = "todos.updated";
  const p: TodosUpdatedPayload = {
    todos: [{ content: "写计划", status: "in_progress" }],
  };
  expect(t).toBe("todos.updated");
  expect(p.todos[0]?.status).toBe("in_progress");
});

test("isToolEvent only matches tool.* events", () => {
  const base = { seq: 1, ts: 0, sessionId: "s1", payload: {} };
  expect(isToolEvent({ ...base, type: "tool.started" } as RoomEvent)).toBe(
    true,
  );
  expect(isToolEvent({ ...base, type: "tool.failed" } as RoomEvent)).toBe(true);
  expect(isToolEvent({ ...base, type: "agent.spawned" } as RoomEvent)).toBe(
    false,
  );
});
