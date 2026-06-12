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
    skills: ["brainstorming", "writing-plans"],
    model: "claude-opus-4-8",
  });
  expect(created?.type).toBe("session.created");
  expect((created?.payload as { apiKeySource: string }).apiKeySource).toBe(
    "oauth",
  );
  // SDK init 把 skills 与 slash_commands 分两个字段上报;normalize 两者都要带出。
  expect((created?.payload as { skills: string[] }).skills).toEqual([
    "brainstorming",
    "writing-plans",
  ]);
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

test("PreToolUse on TodoWrite emits tool.started AND todos.updated with parsed todos", () => {
  const drafts = normalizeHook({
    hook_event_name: "PreToolUse",
    agent_id: "ag-coder",
    tool_name: "TodoWrite",
    tool_use_id: "tu-1",
    tool_input: {
      todos: [
        {
          content: "重构缩放",
          status: "in_progress",
          activeForm: "正在重构缩放",
        },
        { content: "写测试", status: "pending" },
        { content: "提交", status: "completed" },
      ],
    },
  });
  const started = drafts.find((d) => d.type === "tool.started");
  const todos = drafts.find((d) => d.type === "todos.updated");
  expect(started).toBeDefined();
  expect(started?.agentId).toBe("ag-coder");
  expect(todos).toBeDefined();
  expect(todos?.agentId).toBe("ag-coder");
  const payload = todos?.payload as {
    todos: Array<{ content: string; status: string }>;
  };
  expect(payload.todos).toHaveLength(3);
  expect(payload.todos[1]).toEqual({ content: "写测试", status: "pending" });
});

test("PreToolUse on TodoWrite with malformed input emits no todos (defensive)", () => {
  const drafts = normalizeHook({
    hook_event_name: "PreToolUse",
    agent_id: "ag-coder",
    tool_name: "TodoWrite",
    tool_use_id: "tu-2",
    tool_input: { todos: "not-an-array" },
  });
  expect(drafts.some((d) => d.type === "todos.updated")).toBe(false);
  // tool.started 仍照常产出
  expect(drafts.some((d) => d.type === "tool.started")).toBe(true);
});

test("PreToolUse on a non-TodoWrite tool emits no todos.updated", () => {
  const drafts = normalizeHook({
    hook_event_name: "PreToolUse",
    agent_id: "ag-coder",
    tool_name: "Edit",
    tool_use_id: "tu-3",
    tool_input: { file_path: "a.ts" },
  });
  expect(drafts.some((d) => d.type === "todos.updated")).toBe(false);
});

test("PreToolUse AskUserQuestion → prompt.requested(kind=question), NOT tool.started", () => {
  const drafts = normalizeHook({
    hook_event_name: "PreToolUse",
    tool_name: "AskUserQuestion",
    agent_id: "ag-1",
    tool_use_id: "t-ask",
    tool_input: {
      questions: [
        {
          question: "Which approach?",
          header: "Approach",
          options: [
            { label: "A", description: "Option A" },
            { label: "B", description: "Option B" },
          ],
          multiSelect: false,
        },
      ],
    },
  });
  // Should produce exactly 1 event: prompt.requested
  expect(drafts).toHaveLength(1);
  expect(drafts[0]?.type).toBe("prompt.requested");
  const p = drafts[0]?.payload as {
    promptId: string;
    promptKind: string;
    data: { questions: Array<{ question: string; options: unknown[] }> };
  };
  expect(p.promptId).toBe("t-ask");
  expect(p.promptKind).toBe("question");
  expect(p.data.questions).toHaveLength(1);
  expect(p.data.questions[0]?.question).toBe("Which approach?");
  expect(p.data.questions[0]?.options).toHaveLength(2);
});

test("PreToolUse normal tool still emits tool.started (AskUserQuestion guard doesn't break others)", () => {
  const drafts = normalizeHook({
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_use_id: "t-bash",
    tool_input: { command: "ls" },
  });
  expect(drafts.some((d) => d.type === "tool.started")).toBe(true);
  expect(drafts.some((d) => d.type === "prompt.requested")).toBe(false);
});

test("assistant message with thinking block → both thinking.final and message.delta", () => {
  const drafts = normalizeSdkMessage({
    type: "assistant",
    message: {
      content: [
        { type: "thinking", text: "let me reason..." },
        { type: "text", text: "final answer" },
      ],
    },
  });
  const types = drafts.map((d) => d.type);
  expect(types).toContain("thinking.final");
  expect(types).toContain("message.delta");
});
