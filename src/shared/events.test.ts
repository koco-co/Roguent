import { expect, test } from "bun:test";
import {
  type EconomyLedgerAppendedPayload,
  type RoomEvent,
  type RoomEventType,
  type SchedulerRunFinishedPayload,
  type SettingsUpdatedPayload,
  type TodosUpdatedPayload,
  isToolEvent,
} from "./events";

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

test("integration events keep room envelope", () => {
  const event: RoomEvent = {
    seq: 1,
    ts: 1,
    sessionId: "s1",
    type: "integration.event.received",
    payload: {
      id: "ie1",
      channel: "wechat",
      direction: "inbound",
      summary: "hi",
    },
  };
  expect(event.type).toBe("integration.event.received");
});

test("scheduler run payloads fit room envelope", () => {
  const event: RoomEvent<SchedulerRunFinishedPayload> = {
    seq: 2,
    ts: 2,
    sessionId: "s1",
    type: "scheduler.run.finished",
    payload: {
      run: {
        id: "run1",
        taskId: "task1",
        status: "succeeded",
        startedAt: 1,
        finishedAt: 2,
      },
    },
  };

  expect(event.payload.run.status).toBe("succeeded");
});

test("economy ledger payloads fit room envelope", () => {
  const event: RoomEvent<EconomyLedgerAppendedPayload> = {
    seq: 3,
    ts: 3,
    sessionId: "s1",
    type: "economy.ledger.appended",
    payload: {
      entry: {
        id: "ledger1",
        ts: 3,
        reason: "task.completed",
        delta: { coins: 5 },
        balance: { coins: 15 },
      },
    },
  };

  expect(event.payload.entry.balance.coins).toBe(15);
});

test("settings payloads fit room envelope", () => {
  const event: RoomEvent<SettingsUpdatedPayload> = {
    seq: 4,
    ts: 4,
    sessionId: "s1",
    type: "settings.updated",
    payload: {
      scope: "user",
      settings: {
        runtime: {
          runtime: "codex",
          model: "gpt-5",
          permissionMode: "default",
          approvalPolicy: "on-request",
          sandboxMode: "workspace-write",
          reasoningEffort: "medium",
          networkAccess: false,
        },
      },
      changedKeys: ["runtime.model"],
    },
  };

  expect(event.payload.settings.runtime?.model).toBe("gpt-5");
});
