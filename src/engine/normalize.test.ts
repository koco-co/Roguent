import { expect, test } from "bun:test";
import {
  normalizeHook,
  normalizeSdkMessage,
  summarizeToolInput,
} from "./normalize";

test("SubagentStart → agent.spawned tagged with agent_id", () => {
  const [e] = normalizeHook({
    hook_event_name: "SubagentStart",
    agent_id: "ag-7",
    agent_type: "Explore",
    prompt: "find refs",
  });
  expect(e?.type).toBe("agent.spawned");
  expect(e?.agentId).toBe("ag-7");
  expect((e?.payload as { role: string }).role).toBe("Explore");
});

test("PreToolUse without agent_id attributes to orchestrator; PostToolUse → ended", () => {
  const [start] = normalizeHook({
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command: "bun test" },
    tool_use_id: "t1",
  });
  expect(start?.type).toBe("tool.started");
  expect(start?.agentId).toBe("orchestrator");
  expect((start?.payload as { toolName: string }).toolName).toBe("Bash");
  const [end] = normalizeHook({
    hook_event_name: "PostToolUse",
    tool_name: "Bash",
    tool_use_id: "t1",
  });
  expect(end?.type).toBe("tool.ended");
});

test("PostToolUseFailure → tool.failed", () => {
  const [e] = normalizeHook({
    hook_event_name: "PostToolUseFailure",
    tool_use_id: "t1",
    agent_id: "ag-7",
  });
  expect(e?.type).toBe("tool.failed");
  expect(e?.agentId).toBe("ag-7");
});

test("unknown hook yields nothing", () => {
  expect(normalizeHook({ hook_event_name: "Notification" })).toEqual([]);
});

test("system init → session.created with apiKeySource; result → usage", () => {
  const [created] = normalizeSdkMessage({
    type: "system",
    subtype: "init",
    apiKeySource: "oauth",
    slash_commands: ["/code-review"],
    model: "claude-opus-4-8",
  });
  expect(created?.type).toBe("session.created");
  expect((created?.payload as { apiKeySource: string }).apiKeySource).toBe(
    "oauth",
  );
  const [usage] = normalizeSdkMessage({
    type: "result",
    subtype: "success",
    total_cost_usd: 0.012,
    usage: { input_tokens: 100, output_tokens: 50 },
  });
  expect(usage?.type).toBe("usage.updated");
  expect((usage?.payload as { tokens: number }).tokens).toBe(150);
});

test("summarizeToolInput truncates and redacts to a single field", () => {
  expect(summarizeToolInput({ command: "echo hi" })).toBe("echo hi");
  expect(summarizeToolInput({ file_path: "a".repeat(100) }).endsWith("…")).toBe(
    true,
  );
});

test("SubagentStop → agent.done with agentId and stopReason", () => {
  const [e] = normalizeHook({
    hook_event_name: "SubagentStop",
    agent_id: "ag-7",
    stop_reason: "done",
  });
  expect(e?.type).toBe("agent.done");
  expect(e?.agentId).toBe("ag-7");
  expect((e?.payload as { stopReason: string }).stopReason).toBe("done");
});

test("SubagentStop without agent_id or stop_reason uses defaults", () => {
  const [e] = normalizeHook({ hook_event_name: "SubagentStop" });
  expect(e?.agentId).toBe(undefined);
  expect((e?.payload as { stopReason: string }).stopReason).toBe("normal");
});

test("assistant with text blocks → message.delta routed to orchestrator", () => {
  const [e] = normalizeSdkMessage({
    type: "assistant",
    message: {
      content: [
        { type: "text", text: "hello " },
        { type: "text", text: "world" },
      ],
    },
  });
  expect(e?.type).toBe("message.delta");
  expect((e?.payload as { text: string }).text).toBe("hello world");
  expect(e?.agentId).toBe("orchestrator");
});

test("assistant subagent message (parent_tool_use_id set) has agentId undefined", () => {
  const [e] = normalizeSdkMessage({
    type: "assistant",
    parent_tool_use_id: "tu-1",
    message: { content: [{ type: "text", text: "hi" }] },
  });
  expect(e?.agentId).toBe(undefined);
});

test("assistant message with no text blocks returns []", () => {
  expect(
    normalizeSdkMessage({ type: "assistant", message: { content: [] } }),
  ).toEqual([]);
});
