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

test("a second session.created (from SDK init) merges, keeping messages and filling slashCommands", () => {
  // engine 先合成 session.created;SDK init 到来后又派生一个 session.created。
  // 后者必须合并(补 slashCommands/model),绝不能重建会话清空已有 transcript。
  let st = reduce(
    empty,
    ev({
      type: "session.created",
      payload: { title: "会话 1", model: "claude-opus-4-8", slashCommands: [] },
    }),
  );
  st = reduce(
    st,
    ev({
      type: "message.delta",
      agentId: ORCHESTRATOR_ID,
      payload: { text: "first reply" },
    }),
  );
  st = reduce(
    st,
    ev({
      seq: 9,
      type: "session.created",
      payload: { title: "会话 1", model: "m", slashCommands: ["/review"] },
    }),
  );
  expect(st.sessions.s1?.messages).toHaveLength(1);
  expect(st.sessions.s1?.messages[0]?.text).toBe("first reply");
  expect(st.sessions.s1?.slashCommands).toEqual(["/review"]);
});

test("creating a new session steals focus; a re-init of another session does not", () => {
  let st = reduce(
    empty,
    ev({ type: "session.created", payload: { title: "s1", model: "m" } }),
  );
  expect(st.currentSessionId).toBe("s1");
  // 新建 s2(首次)→ 焦点立即跳到 s2。
  st = reduce(
    st,
    ev({
      sessionId: "s2",
      type: "session.created",
      payload: { title: "s2", model: "m" },
    }),
  );
  expect(st.currentSessionId).toBe("s2");
  // s1 延迟到来的 SDK init 派生的第二条 session.created(会话已存在)→ 不抢焦点。
  st = reduce(
    st,
    ev({
      sessionId: "s1",
      type: "session.created",
      payload: { title: "s1", model: "m", slashCommands: ["/x"] },
    }),
  );
  expect(st.currentSessionId).toBe("s2");
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

test("agent.thinking sets thinking status and clears the tool icon", () => {
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
      type: "tool.started",
      agentId: "ag-1",
      payload: { toolName: "Edit" },
    }),
  );
  st = reduce(st, ev({ type: "agent.thinking", agentId: "ag-1", payload: {} }));
  expect(st.sessions.s1?.agents["ag-1"]?.status).toBe("thinking");
  expect(st.sessions.s1?.agents["ag-1"]?.currentTool).toBeUndefined();
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
