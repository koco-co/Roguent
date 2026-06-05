import { expect, test } from "bun:test";
import { loadFixture } from "../engine/record";
import { ORCHESTRATOR_ID } from "../shared/domain";
import type { RoomEvent } from "../shared/events";
import { type RoomState, reduce } from "./store";

// 端到端冒烟(零额度):回放录制 fixture 驱动 store,断言
// spawn → work → done → loot 主链路 + 对话 transcript 都被消费(spec §11)。
test("replaying sample fixture drives room chain + transcript", async () => {
  const events = await loadFixture("fixtures/sample-run.jsonl");
  let st: RoomState = {
    sessions: {},
    currentSessionId: null,
    projectOrder: [],
  };
  for (const e of events) st = reduce(st, e);

  const s = st.sessions.s1;
  expect(s).toBeDefined();
  expect(st.currentSessionId).toBe("s1");

  // 助手对话气泡被收进 transcript
  const assistant = (s?.messages ?? []).filter((m) => m.role === "assistant");
  expect(assistant.length).toBeGreaterThan(0);

  // 产物落进背包
  expect(s?.loot.length).toBeGreaterThan(0);

  // 一波结束:session.cleared 把状态收成 done,只留主控
  expect(s?.status).toBe("done");
  expect(Object.keys(s?.agents ?? {})).toEqual(["orchestrator"]);
});

test("step-by-step replay: agent.spawned → in agents; tool.started/ended → currentTool; agent.done → removed", async () => {
  const events = await loadFixture("fixtures/sample-run.jsonl");
  let st: RoomState = {
    sessions: {},
    currentSessionId: null,
    projectOrder: [],
  };

  // seq 1: session.created
  for (const e of events.filter((e) => e.seq <= 1)) st = reduce(st, e);
  expect(st.sessions.s1).toBeDefined();
  expect(st.currentSessionId).toBe("s1");

  // seq 3: agent.spawned ag-coder → appears in agents, session becomes busy
  for (const e of events.filter((e) => e.seq === 3)) st = reduce(st, e);
  expect(st.sessions.s1?.agents["ag-coder"]).toBeDefined();
  expect(st.sessions.s1?.agents["ag-coder"]?.status).toBe("working");
  expect(st.sessions.s1?.status).toBe("busy");

  // seq 4: tool.started → currentTool set to "Edit"
  for (const e of events.filter((e) => e.seq === 4)) st = reduce(st, e);
  expect(st.sessions.s1?.agents["ag-coder"]?.currentTool).toBe("Edit");

  // seq 7: tool.ended → currentTool cleared
  for (const e of events.filter((e) => e.seq === 7)) st = reduce(st, e);
  expect(st.sessions.s1?.agents["ag-coder"]?.currentTool).toBeUndefined();

  // seq 9/10: agent.done (research, then coder) → removed from agents
  for (const e of events.filter((e) => e.seq === 9 || e.seq === 10))
    st = reduce(st, e);
  expect(st.sessions.s1?.agents["ag-coder"]).toBeUndefined();
  expect(st.sessions.s1?.agents["ag-research"]).toBeUndefined();
  expect(st.sessions.s1?.agents[ORCHESTRATOR_ID]).toBeDefined();

  // seq 12: loot.dropped → enters s.loot
  for (const e of events.filter((e) => e.seq === 12)) st = reduce(st, e);
  expect(st.sessions.s1?.loot).toHaveLength(1);
  expect(st.sessions.s1?.loot[0]?.kind).toBe("report");

  // seq 14: session.cleared → status done, only orchestrator left
  for (const e of events.filter((e) => e.seq === 14)) st = reduce(st, e);
  expect(st.sessions.s1?.status).toBe("done");
  expect(Object.keys(st.sessions.s1?.agents ?? {})).toEqual([ORCHESTRATOR_ID]);
});

test("tool.failed clears the agent's currentTool (red-light signal)", () => {
  const ev = (p: Partial<RoomEvent>): RoomEvent => ({
    seq: 1,
    ts: 0,
    sessionId: "s1",
    type: "agent.spawned",
    payload: {},
    ...p,
  });
  let st: RoomState = {
    sessions: {},
    currentSessionId: null,
    projectOrder: [],
  };
  st = reduce(
    st,
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
      payload: { toolName: "Bash" },
    }),
  );
  expect(st.sessions.s1?.agents["ag-1"]?.currentTool).toBe("Bash");

  st = reduce(st, ev({ type: "tool.failed", agentId: "ag-1", payload: {} }));
  expect(st.sessions.s1?.agents["ag-1"]?.currentTool).toBeUndefined();
});

test("multi-session fixture: two projects → two overworld room slots; per-session state isolated", async () => {
  const events = await loadFixture("fixtures/multi-session.jsonl");
  let st: RoomState = {
    sessions: {},
    currentSessionId: null,
    projectOrder: [],
  };
  for (const e of events) st = reduce(st, e);

  // Two distinct projects → two room slots in the overworld.
  expect(st.projectOrder).toEqual(["alpha", "beta"]);

  // Each session has the correct project binding.
  expect(st.sessions.sA?.project).toBe("alpha");
  expect(st.sessions.sB?.project).toBe("beta");

  // sA: spawned agent + loot, still busy.
  expect(st.sessions.sA?.agents["ag-a"]).toBeDefined();
  expect(st.sessions.sA?.loot).toHaveLength(1);
  expect(st.sessions.sA?.loot[0]?.label).toBe("alpha.ts");

  // sB: session.cleared → status done, only orchestrator.
  expect(st.sessions.sB?.status).toBe("done");
  expect(Object.keys(st.sessions.sB?.agents ?? {})).toEqual([ORCHESTRATOR_ID]);
  expect(st.sessions.sB?.loot).toHaveLength(0);

  // Focus ended on sB (last new session wins).
  expect(st.currentSessionId).toBe("sB");
});
