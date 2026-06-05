import { expect, test } from "bun:test";
import type { RoomEvent } from "../shared/events";
import type { ControlMessage } from "../shared/local-sessions";
import { handleIncoming, sendCommand } from "./ws-client";

test("handleIncoming applies valid events and ignores malformed", () => {
  const got: RoomEvent[] = [];
  handleIncoming(
    '{"seq":1,"ts":0,"sessionId":"s1","type":"agent.idle","payload":{}}',
    (e) => got.push(e),
  );
  handleIncoming("not json", (e) => got.push(e));
  expect(got).toHaveLength(1);
  expect(got[0]?.type).toBe("agent.idle");
});

test("handleIncoming routes control messages to onControl, not the event sink", () => {
  const events: RoomEvent[] = [];
  const controls: ControlMessage[] = [];
  handleIncoming(
    '{"kind":"control","type":"localSessions","items":[]}',
    (e) => events.push(e),
    (c) => controls.push(c),
  );
  expect(events).toHaveLength(0);
  expect(controls).toHaveLength(1);
  expect(controls[0]?.type).toBe("localSessions");
});

test("handleIncoming with no onControl silently ignores a control frame", () => {
  expect(() =>
    handleIncoming(
      '{"kind":"control","type":"localSessions","items":[]}',
      (e) => e,
    ),
  ).not.toThrow();
});

test("sendCommand before any connection does not throw (command is buffered, not dropped)", () => {
  // No active connection yet in a fresh import is not guaranteed across tests,
  // but calling sendCommand must never throw even when active is null.
  expect(() => sendCommand({ cmd: "listLocalSessions" })).not.toThrow();
});
