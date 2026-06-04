import { expect, test } from "bun:test";
import { ORCHESTRATOR_ID } from "../shared/domain";
import type { RoomEvent } from "../shared/events";
import { type RoomState, reduce, useRoomStore } from "./store";

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

test("message.delta appends an assistant bubble to the session transcript", () => {
  let st = reduce(
    empty,
    ev({ type: "session.created", payload: { title: "t", model: "m" } }),
  );
  st = reduce(
    st,
    ev({
      type: "message.delta",
      agentId: ORCHESTRATOR_ID,
      payload: { text: "hello world" },
    }),
  );
  const msgs = st.sessions.s1?.messages ?? [];
  expect(msgs).toHaveLength(1);
  expect(msgs[0]?.role).toBe("assistant");
  expect(msgs[0]?.text).toBe("hello world");
  expect(msgs[0]?.agentId).toBe(ORCHESTRATOR_ID);
});

test("message.final also appends an assistant bubble", () => {
  let st = reduce(
    empty,
    ev({ type: "session.created", payload: { title: "t", model: "m" } }),
  );
  st = reduce(
    st,
    ev({ type: "message.final", payload: { text: "done thinking" } }),
  );
  expect(st.sessions.s1?.messages.at(-1)?.text).toBe("done thinking");
});

test("session.error surfaces and marks error even before session.created", () => {
  const st = reduce(
    empty,
    ev({ type: "session.error", payload: { message: "auth failed" } }),
  );
  expect(st.sessions.s1?.status).toBe("error");
  expect(st.currentSessionId).toBe("s1");
  const last = st.sessions.s1?.messages.at(-1);
  expect(last?.role).toBe("system");
  expect(last?.text).toContain("auth failed");
});

test("appendUserMessage adds a user bubble optimistically", () => {
  useRoomStore.setState({ sessions: {}, currentSessionId: null });
  useRoomStore
    .getState()
    .applyEvent(
      ev({ type: "session.created", payload: { title: "t", model: "m" } }),
    );
  useRoomStore.getState().appendUserMessage("s1", "hi there");
  const last = useRoomStore.getState().sessions.s1?.messages.at(-1);
  expect(last?.role).toBe("user");
  expect(last?.text).toBe("hi there");
});
