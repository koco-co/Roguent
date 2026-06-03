import { expect, test } from "bun:test";
import { Sequencer } from "./sequencer";

test("seq is monotonic per session and independent across sessions", () => {
  const seq = new Sequencer();
  const a1 = seq.stamp("s1", "agent.spawned", {}, 100);
  const a2 = seq.stamp("s1", "tool.started", {}, 101);
  const b1 = seq.stamp("s2", "agent.spawned", {}, 102);
  expect(a1.seq).toBe(1);
  expect(a2.seq).toBe(2);
  expect(b1.seq).toBe(1);
  expect(a2.sessionId).toBe("s1");
  expect(a1.ts).toBe(100);
});
