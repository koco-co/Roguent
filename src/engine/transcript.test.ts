import { expect, test } from "bun:test";
import { ORCHESTRATOR_ID } from "../shared/domain";
import type { SessionCreatedPayload } from "../shared/events";
import { normalizeTranscript } from "./transcript";

const T = "2026-06-05T10:00:00.000Z";
const T2 = "2026-06-05T10:00:01.000Z";

test("session.created comes first with title/model/cwd from the transcript", () => {
  const lines = [
    {
      type: "user",
      timestamp: T,
      cwd: "/work/kata",
      sessionId: "sX",
      message: { role: "user", content: "复核并发改动" },
    },
    {
      type: "assistant",
      timestamp: T2,
      message: {
        role: "assistant",
        model: "claude-opus-4-8",
        content: [{ type: "text", text: "好的" }],
      },
    },
  ];
  const out = normalizeTranscript(lines);
  expect(out[0]?.type).toBe("session.created");
  const p = out[0]?.payload as SessionCreatedPayload;
  expect(p.title).toBe("复核并发改动");
  expect(p.model).toBe("claude-opus-4-8");
  expect(p.cwd).toBe("/work/kata");
  expect(out[0]?.ts).toBe(Date.parse(T));
});

test("assistant text → message.delta on the orchestrator", () => {
  const lines = [
    {
      type: "user",
      timestamp: T,
      cwd: "/w",
      sessionId: "s",
      message: { role: "user", content: "hi" },
    },
    {
      type: "assistant",
      timestamp: T2,
      message: {
        role: "assistant",
        content: [
          { type: "text", text: "开工" },
          { type: "thinking", text: "secret" },
        ],
      },
    },
  ];
  const out = normalizeTranscript(lines);
  const delta = out.find((d) => d.type === "message.delta");
  expect(delta?.agentId).toBe(ORCHESTRATOR_ID);
  expect((delta?.payload as { text: string }).text).toBe("开工");
});

test("Agent tool_use → agent.spawned; its tool_result → agent.done", () => {
  const lines = [
    {
      type: "user",
      timestamp: T,
      cwd: "/w",
      sessionId: "s",
      message: { role: "user", content: "go" },
    },
    {
      type: "assistant",
      timestamp: T2,
      message: {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "tu1",
            name: "Agent",
            input: {
              subagent_type: "coder",
              description: "review concurrency",
            },
          },
        ],
      },
    },
    {
      type: "user",
      timestamp: T2,
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "tu1", content: "done" }],
      },
    },
  ];
  const out = normalizeTranscript(lines);
  const spawned = out.find((d) => d.type === "agent.spawned");
  expect(spawned?.agentId).toBe("tu1");
  expect((spawned?.payload as { role: string; parentId: string }).role).toBe(
    "coder",
  );
  expect((spawned?.payload as { parentId: string }).parentId).toBe(
    ORCHESTRATOR_ID,
  );
  expect(out.find((d) => d.type === "agent.done")?.agentId).toBe("tu1");
});

test("plain tool_use → tool.started; ok result → tool.ended; is_error → tool.failed", () => {
  const lines = [
    {
      type: "user",
      timestamp: T,
      cwd: "/w",
      sessionId: "s",
      message: { role: "user", content: "go" },
    },
    {
      type: "assistant",
      timestamp: T2,
      message: {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "e1",
            name: "Edit",
            input: { file_path: "src/x.ts" },
          },
        ],
      },
    },
    {
      type: "user",
      timestamp: T2,
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "e1", content: "ok" }],
      },
    },
    {
      type: "assistant",
      timestamp: T2,
      message: {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "b1",
            name: "Bash",
            input: { command: "false" },
          },
        ],
      },
    },
    {
      type: "user",
      timestamp: T2,
      message: {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "b1",
            is_error: true,
            content: "boom",
          },
        ],
      },
    },
  ];
  const out = normalizeTranscript(lines);
  const started = out.find((d) => d.type === "tool.started");
  expect(started?.agentId).toBe(ORCHESTRATOR_ID);
  expect(
    (started?.payload as { toolName: string; toolUseId: string }).toolName,
  ).toBe("Edit");
  expect((started?.payload as { toolUseId: string }).toolUseId).toBe("e1");
  const ended = out.find((d) => d.type === "tool.ended");
  expect((ended?.payload as { toolUseId: string; ok: boolean }).toolUseId).toBe(
    "e1",
  );
  expect((ended?.payload as { ok: boolean }).ok).toBe(true);
  const failed = out.find((d) => d.type === "tool.failed");
  expect(
    (failed?.payload as { toolUseId: string; ok: boolean }).toolUseId,
  ).toBe("b1");
  expect((failed?.payload as { ok: boolean }).ok).toBe(false);
});

test("Task tool_use (the other subagent name) also → agent.spawned", () => {
  const lines = [
    {
      type: "user",
      timestamp: T,
      cwd: "/w",
      sessionId: "s",
      message: { role: "user", content: "go" },
    },
    {
      type: "assistant",
      timestamp: T2,
      message: {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "tk1",
            name: "Task",
            input: { description: "do work" },
          },
        ],
      },
    },
  ];
  const out = normalizeTranscript(lines);
  const spawned = out.find((d) => d.type === "agent.spawned");
  expect(spawned?.agentId).toBe("tk1");
  expect((spawned?.payload as { role: string }).role).toBe("agent"); // no subagent_type → default
});

test("malformed lines are skipped, not thrown", () => {
  const lines = [
    {
      type: "user",
      timestamp: T,
      cwd: "/w",
      sessionId: "s",
      message: { role: "user", content: "go" },
    },
    null,
    "garbage",
    { type: "mode", mode: "x" },
    {
      type: "assistant",
      timestamp: T2,
      message: { role: "assistant", content: [{ type: "text", text: "ok" }] },
    },
  ];
  const out = normalizeTranscript(lines);
  expect(out[0]?.type).toBe("session.created");
  expect(out.some((d) => d.type === "message.delta")).toBe(true);
});
