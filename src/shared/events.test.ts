import { expect, test } from "bun:test";
import { type RoomEvent, isToolEvent } from "./events";

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
