import { expect, test } from "bun:test";
import { ORCHESTRATOR_ID } from "../shared/domain";
import type { RoomEvent } from "../shared/events";
import { type RoomState, reduce } from "./store";

const empty: RoomState = { sessions: {}, currentSessionId: null };
const ev = (p: Partial<RoomEvent>): RoomEvent => ({
  seq: 1,
  ts: 0,
  sessionId: "s1",
  type: "agent.spawned",
  payload: {},
  ...p,
});

test("session.created adds a session and sets currentSessionId once", () => {
  const st = reduce(
    empty,
    ev({
      type: "session.created",
      payload: { title: "code-review", model: "claude-opus-4-8" },
    }),
  );
  expect(st.sessions.s1?.title).toBe("code-review");
  expect(st.currentSessionId).toBe("s1");
});

test("agent.spawned adds a working subagent; tool.started sets the head icon tool", () => {
  let st = reduce(
    empty,
    ev({ type: "session.created", payload: { title: "t", model: "m" } }),
  );
  st = reduce(
    st,
    ev({
      type: "agent.spawned",
      agentId: "ag-1",
      payload: { role: "coder", parentId: ORCHESTRATOR_ID },
    }),
  );
  expect(st.sessions.s1?.agents["ag-1"]?.status).toBe("working");
  st = reduce(
    st,
    ev({
      type: "tool.started",
      agentId: "ag-1",
      payload: { toolName: "Edit" },
    }),
  );
  expect(st.sessions.s1?.agents["ag-1"]?.currentTool).toBe("Edit");
});

test("agent.done removes a subagent but never the orchestrator", () => {
  let st = reduce(
    empty,
    ev({ type: "session.created", payload: { title: "t", model: "m" } }),
  );
  st = reduce(
    st,
    ev({
      type: "agent.spawned",
      agentId: "ag-1",
      payload: { role: "coder", parentId: ORCHESTRATOR_ID },
    }),
  );
  st = reduce(
    st,
    ev({
      type: "agent.done",
      agentId: "ag-1",
      payload: { stopReason: "normal" },
    }),
  );
  expect(st.sessions.s1?.agents["ag-1"]).toBeUndefined();
  st = reduce(
    st,
    ev({
      type: "agent.done",
      agentId: ORCHESTRATOR_ID,
      payload: { stopReason: "normal" },
    }),
  );
  expect(st.sessions.s1?.agents[ORCHESTRATOR_ID]).toBeDefined();
});
