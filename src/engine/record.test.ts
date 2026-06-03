import { expect, test } from "bun:test";
import type { RoomEvent } from "../shared/events";
import { parseEvents, replay, serializeEvents } from "./record";

const sample: RoomEvent[] = [
  {
    seq: 1,
    ts: 100,
    sessionId: "s1",
    type: "agent.spawned",
    agentId: "ag-1",
    payload: { role: "coder" },
  },
  {
    seq: 2,
    ts: 150,
    sessionId: "s1",
    type: "tool.started",
    agentId: "ag-1",
    payload: { toolName: "Edit" },
  },
];

test("serialize → parse round-trips", () => {
  expect(parseEvents(serializeEvents(sample))).toEqual(sample);
});

test("replay emits events in order", () => {
  const got: RoomEvent[] = [];
  replay(sample, (e) => got.push(e));
  expect(got.map((e) => e.seq)).toEqual([1, 2]);
});
