import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createCodexRuntimeNormalizer,
  normalizeCodexRuntimeEvent,
  normalizeCodexRuntimeEvents,
} from "./codex-normalize";
import type { CodexRuntimeEvent } from "./codex-protocol";
import type { DraftEvent } from "./types";

const fixturePath = join(
  import.meta.dir,
  "../../../fixtures/runtime/codex-chat.jsonl",
);

function readFixture(): CodexRuntimeEvent[] {
  return readFileSync(fixturePath, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as CodexRuntimeEvent);
}

test("fixture normalizes Codex chat events to deterministic Roguent event types", () => {
  const drafts = normalizeCodexRuntimeEvents(readFixture());

  expect(drafts.map((draft) => draft.type)).toEqual([
    "session.created",
    "message.delta",
    "tool.started",
    "tool.ended",
    "usage.updated",
  ]);
});

test("raw Codex tool.finished maps to tool.ended with frontend-safe payload", () => {
  const [draft] = normalizeCodexRuntimeEvent({
    kind: "tool.finished",
    callId: "tool-1",
    exitCode: 0,
    command: "secret command that must not leak",
  });

  expect(draft?.type).toBe("tool.ended");
  expect(draft?.payload).toEqual({ toolUseId: "tool-1", ok: true });
  expect(draft?.raw).toEqual({
    source: "codex-app-server",
    eventType: "tool.finished",
    eventId: "tool-1",
  });
  expect(JSON.stringify(draft?.payload)).not.toContain("secret command");
});

test("normalizes assistant text, thinking, prompts, errors, usage, and context", () => {
  const drafts = normalizeCodexRuntimeEvents([
    { kind: "thread.started", threadId: "thread-1", model: "gpt-5" },
    { kind: "assistant.delta", itemId: "msg-1", text: "partial" },
    { kind: "assistant.final", itemId: "msg-1", text: "final" },
    { kind: "thinking.delta", itemId: "think-1", text: "reason" },
    { kind: "thinking.final", itemId: "think-1", text: "done" },
    {
      kind: "approval.requested",
      requestId: "approval-1",
      method: "item/commandExecution/requestApproval",
      itemId: "cmd-1",
      command: "git status",
    },
    {
      kind: "question.requested",
      requestId: "question-1",
      prompt: "Continue?",
    },
    { kind: "error", message: "Codex failed" },
    {
      kind: "turn.finished",
      usage: { inputTokens: 7, outputTokens: 8, costUsd: 0.002 },
      context: { usedTokens: 15, windowSize: 100 },
    },
  ]);

  expect(pluck(drafts)).toEqual([
    { type: "session.created", payload: { runtime: "codex", model: "gpt-5" } },
    { type: "message.delta", payload: { text: "partial" } },
    { type: "message.final", payload: { text: "final" } },
    { type: "thinking.delta", payload: { text: "reason" } },
    { type: "thinking.final", payload: { text: "done" } },
    {
      type: "prompt.requested",
      payload: {
        promptId: "approval-1",
        promptKind: "permission",
        data: {
          toolName: "shell",
          inputSummary: "git status",
          title: "Command approval requested",
          displayName: "git status",
          description: "item/commandExecution/requestApproval",
        },
      },
    },
    {
      type: "prompt.requested",
      payload: {
        promptId: "question-1",
        promptKind: "question",
        data: {
          questions: [
            {
              question: "Continue?",
              header: "Question",
              options: [],
              multiSelect: false,
            },
          ],
        },
      },
    },
    { type: "session.error", payload: { message: "Codex failed" } },
    { type: "usage.updated", payload: { tokens: 15, cost: 0.002 } },
    {
      type: "context.updated",
      payload: { usedTokens: 15, windowSize: 100, utilization: 15 },
    },
  ]);
});

test("normalizes generated app-server item and token notifications", () => {
  const drafts = normalizeCodexRuntimeEvents([
    {
      kind: "item.started",
      threadId: "thread-1",
      turnId: "turn-1",
      item: {
        type: "commandExecution",
        id: "cmd-1",
        command: "bun test",
      },
    },
    {
      kind: "item.completed",
      threadId: "thread-1",
      turnId: "turn-1",
      item: {
        type: "commandExecution",
        id: "cmd-1",
        exitCode: 0,
      },
    },
    {
      kind: "item.completed",
      threadId: "thread-1",
      turnId: "turn-1",
      item: {
        type: "agentMessage",
        id: "msg-1",
        text: "final answer",
      },
    },
    {
      kind: "item.reasoning.textDelta",
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "reason-1",
      delta: "thinking",
    },
    {
      kind: "thread.tokenUsage.updated",
      threadId: "thread-1",
      turnId: "turn-1",
      tokenUsage: {
        total: {
          totalTokens: 42,
          inputTokens: 20,
          cachedInputTokens: 0,
          outputTokens: 22,
          reasoningOutputTokens: 0,
        },
        last: {
          totalTokens: 12,
          inputTokens: 5,
          cachedInputTokens: 0,
          outputTokens: 7,
          reasoningOutputTokens: 0,
        },
        modelContextWindow: 200,
      },
    },
  ]);

  expect(drafts.map((draft) => draft.type)).toEqual([
    "tool.started",
    "tool.ended",
    "message.final",
    "thinking.delta",
    "usage.updated",
    "context.updated",
  ]);
  expect(drafts[0]?.payload).toEqual({
    toolName: "shell",
    inputSummary: "bun test",
    toolUseId: "cmd-1",
  });
  expect(drafts[1]?.payload).toEqual({ toolUseId: "cmd-1", ok: true });
  expect(drafts[2]?.payload).toEqual({ text: "final answer" });
  expect(drafts[3]?.payload).toEqual({ text: "thinking" });
  expect(drafts[4]?.payload).toEqual({ tokens: 42, cost: 0 });
  expect(drafts[5]?.payload).toEqual({
    usedTokens: 42,
    windowSize: 200,
    utilization: 21,
  });
});

test("accumulates streaming assistant and thinking deltas per item", () => {
  const drafts = normalizeCodexRuntimeEvents([
    { kind: "assistant.delta", itemId: "msg-1", text: "Hel" },
    { kind: "assistant.delta", itemId: "msg-1", text: "lo" },
    { kind: "assistant.delta", itemId: "msg-2", text: "Fresh" },
    { kind: "thinking.delta", itemId: "think-1", text: "Rea" },
    { kind: "thinking.delta", itemId: "think-1", text: "son" },
  ]);

  expect(pluck(drafts)).toEqual([
    { type: "message.delta", payload: { text: "Hel" } },
    { type: "message.delta", payload: { text: "Hello" } },
    { type: "message.delta", payload: { text: "Fresh" } },
    { type: "thinking.delta", payload: { text: "Rea" } },
    { type: "thinking.delta", payload: { text: "Reason" } },
  ]);
});

test("stateful normalizer accumulates deltas when live events arrive one by one", () => {
  const normalizer = createCodexRuntimeNormalizer();

  const drafts = [
    ...normalizer.normalize({
      kind: "assistant.delta",
      itemId: "msg-1",
      text: "Hel",
    }),
    ...normalizer.normalize({
      kind: "assistant.delta",
      itemId: "msg-1",
      text: "lo",
    }),
  ];

  expect(pluck(drafts)).toEqual([
    { type: "message.delta", payload: { text: "Hel" } },
    { type: "message.delta", payload: { text: "Hello" } },
  ]);
});

test("normalizes real turn.completed usage and context", () => {
  const drafts = normalizeCodexRuntimeEvents([
    {
      kind: "turn.completed",
      turnId: "turn-1",
      usage: { inputTokens: 3, outputTokens: 4 },
      context: { usedTokens: 7, windowSize: 100 },
    },
  ]);

  expect(pluck(drafts)).toEqual([
    { type: "usage.updated", payload: { tokens: 7, cost: 0 } },
    {
      type: "context.updated",
      payload: { usedTokens: 7, windowSize: 100, utilization: 7 },
    },
  ]);
});

test("normalizes generated collab agent tool calls to subagent lifecycle", () => {
  const drafts = normalizeCodexRuntimeEvents([
    {
      kind: "item.started",
      threadId: "thread-1",
      turnId: "turn-1",
      item: {
        type: "collabAgentToolCall",
        id: "collab-1",
        tool: "spawnAgent",
        prompt: "review the patch",
        receiverThreadIds: ["agent-thread-1"],
        senderThreadId: "thread-1",
      },
    },
    {
      kind: "item.completed",
      threadId: "thread-1",
      turnId: "turn-1",
      item: {
        type: "collabAgentToolCall",
        id: "collab-2",
        tool: "closeAgent",
        receiverThreadIds: ["agent-thread-1"],
        agentsStates: {
          "agent-thread-1": { status: "completed" },
        },
      },
    },
  ]);

  expect(drafts.map((draft) => draft.type)).toEqual([
    "agent.spawned",
    "agent.done",
  ]);
  expect(drafts[0]).toMatchObject({
    agentId: "agent-thread-1",
    payload: {
      role: "agent",
      promptSummary: "review the patch",
      parentId: "thread-1",
    },
  });
  expect(drafts[1]).toMatchObject({
    agentId: "agent-thread-1",
    payload: { stopReason: "completed" },
  });
});

test("normalizes Codex subagent lifecycle events", () => {
  const drafts = normalizeCodexRuntimeEvents([
    {
      kind: "subagent.started",
      agentId: "agent-1",
      role: "reviewer",
      prompt: "review the patch",
      parentId: "orchestrator",
    },
    {
      kind: "subagent.finished",
      agentId: "agent-1",
      stopReason: "done",
    },
  ]);

  expect(drafts).toEqual([
    {
      type: "agent.spawned",
      agentId: "agent-1",
      payload: {
        role: "reviewer",
        promptSummary: "review the patch",
        parentId: "orchestrator",
      },
      raw: {
        source: "codex-app-server",
        eventType: "subagent.started",
        eventId: "agent-1",
      },
    },
    {
      type: "agent.done",
      agentId: "agent-1",
      payload: { stopReason: "done" },
      raw: {
        source: "codex-app-server",
        eventType: "subagent.finished",
        eventId: "agent-1",
      },
    },
  ]);
});

function pluck(drafts: DraftEvent[]): Array<{
  type: DraftEvent["type"];
  payload: unknown;
}> {
  return drafts.map((draft) => ({
    type: draft.type,
    payload:
      draft.type === "session.created"
        ? {
            runtime: (draft.payload as { runtime?: string }).runtime,
            model: (draft.payload as { model?: string }).model,
          }
        : draft.payload,
  }));
}
