import { expect, test } from "bun:test";
import type { RoomEvent } from "../shared/events";
import { type RoomState, type RoomStateWithPrototype, reduce } from "./store";

const initialState = (): RoomStateWithPrototype => ({
  sessions: {},
  currentSessionId: null,
  projectOrder: [],
  connection: "connecting",
  runtimeStatusBySession: {},
  connectorStatus: {},
  pairings: { qrByChannel: {}, byId: {}, byExternalKey: {} },
  mailbox: { items: {}, order: [] },
  scheduler: { tasks: {}, runs: {} },
  ledger: { entries: [], balances: {} },
  achievements: {},
  inventory: {},
  settings: null,
});

const ev = (p: Partial<RoomEvent>): RoomEvent => ({
  seq: 1,
  ts: 0,
  sessionId: "s1",
  type: "session.created",
  payload: {},
  ...p,
});

function withCreatedSession(): RoomState {
  return reduce(
    initialState(),
    ev({
      type: "session.created",
      payload: { title: "Task", model: "m", runtime: "codex" },
    }),
  );
}

test("runtime stopped status makes a busy session writable again", () => {
  let state = withCreatedSession();
  state = reduce(
    state,
    ev({
      type: "agent.spawned",
      agentId: "agent-1",
      payload: { role: "coder", parentId: "orchestrator" },
    }),
  );
  expect(state.sessions.s1?.status).toBe("busy");

  state = reduce(
    state,
    ev({
      type: "runtime.status",
      payload: {
        runtime: "codex",
        status: "stopped",
        message: "Interrupted",
      },
    }),
  );

  expect(state.sessions.s1?.status).toBe("idle");
});

test("session.rolled_back trims timeline to the known checkpoint and returns to idle", () => {
  let state = withCreatedSession();
  state = reduce(
    state,
    ev({
      seq: 2,
      type: "message.final",
      payload: { text: "keep me" },
    }),
  );
  state = reduce(
    state,
    ev({
      seq: 3,
      type: "message.final",
      payload: { text: "remove me" },
    }),
  );
  expect(state.sessions.s1?.timeline).toHaveLength(2);

  state = reduce(
    state,
    ev({
      seq: 4,
      type: "session.rolled_back",
      payload: { checkpointId: "2" },
    }),
  );

  expect(state.sessions.s1?.status).toBe("idle");
  expect(state.sessions.s1?.timeline.map((item) => item.id)).toEqual(["2"]);
});

test("system retry audit records are rendered as system timeline messages", () => {
  let state = withCreatedSession();
  state = reduce(
    state,
    ev({
      seq: 2,
      type: "message.final",
      payload: {
        role: "system",
        text: "Audit: retryFrom resent timeline item 1 in session s1",
      },
    }),
  );

  const item = state.sessions.s1?.timeline[0];
  expect(item).toMatchObject({
    kind: "message",
    id: "2",
    role: "system",
    text: "Audit: retryFrom resent timeline item 1 in session s1",
    status: "final",
  });
});
