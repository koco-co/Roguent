import { expect, test } from "bun:test";
import { ORCHESTRATOR_ID, createAgent, createSession } from "./domain";

test("createSession seeds an orchestrator agent and sane defaults", () => {
  const s = createSession({
    id: "s1",
    title: "code-review",
    model: "claude-opus-4-8",
  });
  expect(s.status).toBe("idle");
  expect(s.agents[ORCHESTRATOR_ID]?.kind).toBe("orchestrator");
  expect(s.agents[ORCHESTRATOR_ID]?.status).toBe("idle");
  expect(s.loot).toEqual([]);
});

test("createAgent defaults to a spawning subagent", () => {
  const a = createAgent({ id: "ag-1", role: "researcher", skin: "mag" });
  expect(a.kind).toBe("subagent");
  expect(a.status).toBe("spawning");
});

test("createSession leaves context undefined until first context.updated", () => {
  const s = createSession({ id: "s1", title: "t", model: "claude-opus-4-8" });
  expect(s.context).toBeUndefined();
});

test("createSession initializes empty todos map", () => {
  const s = createSession({ id: "s1", title: "t", model: "m" });
  expect(s.todos).toEqual({});
});

test("createSession initializes timeline as empty array", () => {
  const s = createSession({ id: "s1", title: "t", model: "m" });
  expect(s.timeline).toEqual([]);
});
