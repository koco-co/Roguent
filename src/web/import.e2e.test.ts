import { expect, test } from "bun:test";
import { readTranscriptLines } from "../engine/local-sessions";
import { normalizeTranscript } from "../engine/transcript";
import { ORCHESTRATOR_ID } from "../shared/domain";
import { type RoomState, reduce } from "./store";

// 端到端(零额度):本地 transcript → 纯转换 → DraftEvent 当 RoomEvent 喂 reduce,
// 断言「事件流 → 房间表现」与 LIVE/REPLAY 等价(spec §5 测试)。
test("imported transcript drives spawn → tool cycle → done → message", () => {
  const drafts = normalizeTranscript(
    readTranscriptLines("fixtures/sample-transcript.jsonl"),
  );
  let st: RoomState = {
    sessions: {},
    currentSessionId: null,
    projectOrder: [],
    connection: "connecting",
  };
  let seq = 0;
  for (const d of drafts) {
    st = reduce(st, {
      seq: ++seq,
      ts: d.ts,
      sessionId: "imp",
      type: d.type,
      agentId: d.agentId,
      payload: d.payload,
    });
  }

  const s = st.sessions.imp;
  expect(s).toBeDefined();
  expect(st.currentSessionId).toBe("imp");

  // subagent 上场又离场。
  expect(Object.keys(s?.agents ?? {})).toEqual([ORCHESTRATOR_ID]);

  // 完整对话进了聊天历史:用户提问 + 助手回复都在(云存档同步式回看)。
  const msgs = s?.messages ?? [];
  expect(msgs.filter((m) => m.role === "user").length).toBeGreaterThan(0);
  expect(msgs.filter((m) => m.role === "assistant").length).toBeGreaterThan(0);
  // 第一条人类提问应是 transcript 首行内容。
  expect(msgs.find((m) => m.role === "user")?.text).toBe("复核并发改动");

  // 普通工具(Edit)在 orchestrator 上起又落。
  expect(s?.agents[ORCHESTRATOR_ID]?.currentTool).toBeUndefined();
});

test("subagent appears mid-stream before its result", () => {
  const drafts = normalizeTranscript(
    readTranscriptLines("fixtures/sample-transcript.jsonl"),
  );
  let st: RoomState = {
    sessions: {},
    currentSessionId: null,
    projectOrder: [],
    connection: "connecting",
  };
  let seq = 0;
  // 只放到 agent.spawned 之前那条之后(spawn 已发、done 未发)。
  const upto = drafts.findIndex((d) => d.type === "agent.spawned");
  for (let i = 0; i <= upto; i++) {
    const d = drafts[i];
    if (!d) continue;
    st = reduce(st, {
      seq: ++seq,
      ts: d.ts,
      sessionId: "imp",
      type: d.type,
      agentId: d.agentId,
      payload: d.payload,
    });
  }
  expect(st.sessions.imp?.agents["tu-coder"]).toBeDefined();
});
