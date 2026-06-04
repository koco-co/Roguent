import { expect, test } from "bun:test";
import { loadFixture } from "../engine/record";
import { type RoomState, reduce } from "./store";

// 端到端冒烟(零额度):回放录制 fixture 驱动 store,断言
// spawn → work → done → loot 主链路 + 对话 transcript 都被消费(spec §11)。
test("replaying sample fixture drives room chain + transcript", async () => {
  const events = await loadFixture("fixtures/sample-run.jsonl");
  let st: RoomState = { sessions: {}, currentSessionId: null };
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
