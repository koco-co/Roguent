import { expect, test } from "bun:test";
import { ORCHESTRATOR_ID } from "../../shared/domain";
import { roomLayout } from "./layout";

test("orchestrator is centered; subagents get distinct positions", () => {
  const p = roomLayout([ORCHESTRATOR_ID, "a", "b"], 900, 560);
  expect(p[ORCHESTRATOR_ID]).toEqual({ x: 450, y: Math.round(560 * 0.42) });
  expect(p.a).not.toEqual(p.b);
  expect(p.a).toEqual(roomLayout([ORCHESTRATOR_ID, "a", "b"], 900, 560).a); // deterministic
});
