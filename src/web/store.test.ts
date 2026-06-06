import { expect, test } from "bun:test";
import { ORCHESTRATOR_ID } from "../shared/domain";
import type { RoomEvent } from "../shared/events";
import { type RoomState, reduce, useRoomStore } from "./store";

const empty: RoomState = {
  sessions: {},
  currentSessionId: null,
  projectOrder: [],
  connection: "connecting",
};
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
  useRoomStore.setState({
    sessions: {},
    currentSessionId: null,
    projectOrder: [],
  });
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

// ── 总览世界:会话生命周期 / 项目派生 / ≤10 LRU(spec §生命周期 & 最小数据) ──

test("session.created records cwd/project and appends a stable projectOrder", () => {
  let st = reduce(
    empty,
    ev({
      type: "session.created",
      payload: {
        title: "a",
        model: "m",
        cwd: "/repo/alpha",
        project: "alpha",
      },
    }),
  );
  expect(st.sessions.s1?.cwd).toBe("/repo/alpha");
  expect(st.sessions.s1?.project).toBe("alpha");
  expect(st.projectOrder).toEqual(["alpha"]);
  // 第二个会话、新项目 → 追加;同项目不重复入列。
  st = reduce(
    st,
    ev({
      sessionId: "s2",
      type: "session.created",
      payload: { title: "b", model: "m", cwd: "/repo/beta", project: "beta" },
    }),
  );
  st = reduce(
    st,
    ev({
      sessionId: "s3",
      type: "session.created",
      payload: { title: "c", model: "m", cwd: "/repo/alpha", project: "alpha" },
    }),
  );
  expect(st.projectOrder).toEqual(["alpha", "beta"]);
});

test("activity events bump lastActiveAt", () => {
  let st = reduce(
    empty,
    ev({ ts: 5, type: "session.created", payload: { title: "t", model: "m" } }),
  );
  expect(st.sessions.s1?.lastActiveAt).toBe(5);
  st = reduce(
    st,
    ev({
      ts: 42,
      type: "tool.started",
      agentId: ORCHESTRATOR_ID,
      payload: { toolName: "Edit" },
    }),
  );
  expect(st.sessions.s1?.lastActiveAt).toBe(42);
});

test("creating the 11th active session soft-archives the least-recently-active one", () => {
  let st = empty;
  // 10 个活跃会话,lastActiveAt = 序号(s1 最旧)。
  for (let i = 1; i <= 10; i++) {
    st = reduce(
      st,
      ev({
        sessionId: `s${i}`,
        ts: i,
        type: "session.created",
        payload: { title: `s${i}`, model: "m", project: `p${i}` },
      }),
    );
  }
  const activeCount = (s: RoomState) =>
    Object.values(s.sessions).filter((x) => !x.archived).length;
  expect(activeCount(st)).toBe(10);
  // 第 11 个 → 最旧(s1)被软归档,活跃仍 ≤ 10。
  st = reduce(
    st,
    ev({
      sessionId: "s11",
      ts: 11,
      type: "session.created",
      payload: { title: "s11", model: "m", project: "p11" },
    }),
  );
  expect(activeCount(st)).toBe(10);
  expect(st.sessions.s1?.archived).toBe(true);
  expect(st.sessions.s11?.archived).toBe(false);
});

test("archive/unarchive/remove session actions", () => {
  useRoomStore.setState({
    sessions: {},
    currentSessionId: null,
    projectOrder: [],
  });
  const api = useRoomStore.getState();
  api.applyEvent(
    ev({ type: "session.created", payload: { title: "t", model: "m" } }),
  );
  api.archiveSession("s1");
  expect(useRoomStore.getState().sessions.s1?.archived).toBe(true);
  expect(useRoomStore.getState().currentSessionId).toBeNull();
  api.unarchiveSession("s1");
  expect(useRoomStore.getState().sessions.s1?.archived).toBe(false);
  expect(useRoomStore.getState().currentSessionId).toBe("s1");
  api.removeSession("s1");
  expect(useRoomStore.getState().sessions.s1).toBeUndefined();
  expect(useRoomStore.getState().currentSessionId).toBeNull();
});

test("SDK-init session.created merges the real permissionMode over the synthesized default", () => {
  // engine 合成的第一条 permissionMode=default;SDK init 派生的第二条带真实模式。
  let st = reduce(
    empty,
    ev({
      type: "session.created",
      payload: { title: "t", model: "m", permissionMode: "default" },
    }),
  );
  expect(st.sessions.s1?.permissionMode).toBe("default");
  st = reduce(
    st,
    ev({
      seq: 9,
      type: "session.created",
      payload: { title: "t", model: "m", permissionMode: "plan" },
    }),
  );
  expect(st.sessions.s1?.permissionMode).toBe("plan");
});

test("a default-mode re-init does not clobber an already-known non-default mode", () => {
  let st = reduce(
    empty,
    ev({
      type: "session.created",
      payload: { title: "t", model: "m", permissionMode: "acceptEdits" },
    }),
  );
  st = reduce(
    st,
    ev({
      seq: 9,
      type: "session.created",
      payload: { title: "t", model: "m", permissionMode: "default" },
    }),
  );
  expect(st.sessions.s1?.permissionMode).toBe("acceptEdits");
});

test("an early session.error placeholder stamps lastActiveAt and never steals a lobby slot", () => {
  // 先来一条 session.error(无 project 的占位),再建 10 个带 project 的会话。
  // 占位不计入 ACTIVE_CAP,所以 10 个真实会话全部保持活跃。
  let st = reduce(
    empty,
    ev({ ts: 7, type: "session.error", payload: { message: "auth failed" } }),
  );
  expect(st.sessions.s1?.lastActiveAt).toBe(7);
  expect(st.sessions.s1?.project).toBeUndefined();
  for (let i = 2; i <= 11; i++) {
    st = reduce(
      st,
      ev({
        sessionId: `s${i}`,
        ts: i,
        type: "session.created",
        payload: { title: `s${i}`, model: "m", project: `p${i}` },
      }),
    );
  }
  const lobby = Object.values(st.sessions).filter(
    (x) => !x.archived && x.project,
  ).length;
  expect(lobby).toBe(10);
  // 错误占位还在,但没被算进大厅、也没被归档(它没 project)。
  expect(st.sessions.s1?.archived).toBe(false);
});

test("the just-created session is never the LRU victim even if the clock went backward", () => {
  let st = empty;
  for (let i = 1; i <= 10; i++) {
    st = reduce(
      st,
      ev({
        sessionId: `s${i}`,
        ts: 100 + i,
        type: "session.created",
        payload: { title: `s${i}`, model: "m", project: `p${i}` },
      }),
    );
  }
  // 第 11 个会话的 ts 比所有人都小(时钟回拨)。它绝不能把自己挤掉。
  st = reduce(
    st,
    ev({
      sessionId: "s11",
      ts: 1,
      type: "session.created",
      payload: { title: "s11", model: "m", project: "p11" },
    }),
  );
  expect(st.sessions.s11?.archived).toBe(false);
  // 被归档的是其它会话里 lastActiveAt 最低的(s1=101)。
  expect(st.sessions.s1?.archived).toBe(true);
  const lobby = Object.values(st.sessions).filter(
    (x) => !x.archived && x.project,
  ).length;
  expect(lobby).toBe(10);
});

test("switchSession changes currentSessionId without modifying sessions", () => {
  useRoomStore.setState({
    sessions: {},
    currentSessionId: null,
    projectOrder: [],
  });
  const api = useRoomStore.getState();
  api.applyEvent(
    ev({ type: "session.created", payload: { title: "s1", model: "m" } }),
  );
  api.applyEvent(
    ev({
      sessionId: "s2",
      type: "session.created",
      payload: { title: "s2", model: "m" },
    }),
  );
  // After two sessions, focus is on s2 (last new session wins).
  expect(useRoomStore.getState().currentSessionId).toBe("s2");

  api.switchSession("s1");
  expect(useRoomStore.getState().currentSessionId).toBe("s1");
  // The sessions themselves are untouched.
  expect(Object.keys(useRoomStore.getState().sessions)).toHaveLength(2);
  expect(useRoomStore.getState().sessions.s1?.title).toBe("s1");
  expect(useRoomStore.getState().sessions.s2?.title).toBe("s2");
});

test("message.delta from a subagent records the subagent agentId in the transcript", () => {
  let st = reduce(
    empty,
    ev({ type: "session.created", payload: { title: "t", model: "m" } }),
  );
  st = reduce(
    st,
    ev({
      type: "agent.spawned",
      agentId: "ag-sub",
      payload: { role: "coder", parentId: ORCHESTRATOR_ID },
    }),
  );
  st = reduce(
    st,
    ev({
      type: "message.delta",
      agentId: "ag-sub",
      payload: { text: "sub reply" },
    }),
  );
  const msg = st.sessions.s1?.messages.at(-1);
  expect(msg?.agentId).toBe("ag-sub");
  expect(msg?.role).toBe("assistant");
  expect(msg?.text).toBe("sub reply");
});

test("context.updated folds into session.context", () => {
  let st = reduce(
    empty,
    ev({ type: "session.created", payload: { title: "t", model: "m" } }),
  );
  st = reduce(
    st,
    ev({
      type: "context.updated",
      payload: { usedTokens: 200000, windowSize: 1000000, utilization: 20 },
    }),
  );
  expect(st.sessions.s1?.context).toEqual({
    usedTokens: 200000,
    windowSize: 1000000,
    utilization: 20,
  });
});

test("context.updated for unknown session is ignored", () => {
  const st = reduce(
    empty,
    ev({
      type: "context.updated",
      sessionId: "ghost",
      payload: { usedTokens: 1, windowSize: 2, utilization: 50 },
    }),
  );
  expect(st.sessions.ghost).toBeUndefined();
});

test("setLimits stores account limits and applyEvent preserves it", () => {
  const store = useRoomStore.getState();
  store.setLimits({
    planName: "Max",
    fiveHour: { utilization: 30, resetsAt: null },
    sevenDay: { utilization: 80, resetsAt: null },
  });
  expect(useRoomStore.getState().limits?.planName).toBe("Max");
  useRoomStore
    .getState()
    .applyEvent(
      ev({ type: "session.created", payload: { title: "t", model: "m" } }),
    );
  expect(useRoomStore.getState().limits?.planName).toBe("Max");
});
