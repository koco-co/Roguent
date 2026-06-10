import { ORCHESTRATOR_ID } from "../../shared/domain";
import type {
  AgentDonePayload,
  AgentSpawnedPayload,
  ContextUpdatedPayload,
  MessagePayload,
  PromptRequestedPayload,
  SessionCreatedPayload,
  SessionErrorPayload,
  ThinkingPayload,
  ToolEndedPayload,
  ToolStartedPayload,
  UsagePayload,
} from "../../shared/events";
import {
  defaultRuntimeConfig,
  normalizeCodexApprovalPolicy,
  normalizePermissionMode,
  normalizeReasoningEffort,
  normalizeSandboxMode,
} from "../../shared/runtime";
import type { CodexRuntimeEvent } from "./codex-protocol";
import type { DraftEvent, SanitizedRuntimeRawRef } from "./types";

const TEXT_DELTA_KINDS = new Set([
  "assistant.delta",
  "item.agentMessage.delta",
]);
const TEXT_FINAL_KINDS = new Set([
  "assistant.final",
  "assistant.message",
  "assistant.completed",
  "item.agentMessage.final",
  "item.agentMessage.completed",
]);
const THINKING_DELTA_KINDS = new Set([
  "thinking.delta",
  "reasoning.delta",
  "assistant.thinking.delta",
  "item.reasoning.delta",
  "item.reasoning.textDelta",
  "item.reasoning.summaryDelta",
  "item.reasoning.summaryTextDelta",
]);
const THINKING_FINAL_KINDS = new Set([
  "thinking.final",
  "reasoning.final",
  "assistant.thinking.final",
  "item.reasoning.final",
  "item.reasoning.completed",
]);
const TOOL_START_KINDS = new Set([
  "tool.started",
  "tool.start",
  "item.tool.started",
  "item.command.started",
  "item.commandExecution.started",
]);
const TOOL_END_KINDS = new Set([
  "tool.finished",
  "tool.ended",
  "tool.completed",
  "item.tool.finished",
  "item.tool.completed",
  "item.command.finished",
  "item.commandExecution.finished",
  "item.commandExecution.completed",
]);
const TOOL_FAILED_KINDS = new Set([
  "tool.failed",
  "item.tool.failed",
  "item.command.failed",
  "item.commandExecution.failed",
]);
const SUBAGENT_START_KINDS = new Set([
  "agent.started",
  "agent.spawned",
  "subagent.started",
  "subagent.created",
  "subagent.start",
]);
const SUBAGENT_DONE_KINDS = new Set([
  "agent.done",
  "agent.finished",
  "agent.completed",
  "subagent.done",
  "subagent.finished",
  "subagent.completed",
  "subagent.stop",
]);
const TERMINAL_COLLAB_AGENT_STATES = new Set([
  "completed",
  "done",
  "failed",
  "error",
  "errored",
  "closed",
  "stopped",
  "shutdown",
  "interrupted",
  "cancelled",
  "canceled",
]);

export interface CodexRuntimeNormalizer {
  normalize(event: CodexRuntimeEvent): DraftEvent[];
}

export function createCodexRuntimeNormalizer(): CodexRuntimeNormalizer {
  const textStreams = new Map<string, string>();
  const thinkingStreams = new Map<string, string>();
  return {
    normalize(event) {
      return normalizeCodexRuntimeEvent(
        accumulateStreamingText(event, textStreams, thinkingStreams),
      );
    },
  };
}

export function normalizeCodexRuntimeEvents(
  events: Iterable<CodexRuntimeEvent>,
): DraftEvent[] {
  const drafts: DraftEvent[] = [];
  const normalizer = createCodexRuntimeNormalizer();
  for (const event of events) {
    drafts.push(...normalizer.normalize(event));
  }
  return drafts;
}

export function normalizeCodexRuntimeEvent(
  event: CodexRuntimeEvent,
): DraftEvent[] {
  if (event.kind === "thread.started" || event.kind === "thread.created") {
    return [draft(event, "session.created", sessionCreatedPayload(event))];
  }

  if (SUBAGENT_START_KINDS.has(event.kind)) {
    return [
      draft(
        event,
        "agent.spawned",
        {
          role: subagentRole(event),
          promptSummary: (textFrom(event) ?? "").slice(0, 80),
          parentId:
            stringField(event, "parentId", "parent_id") ?? ORCHESTRATOR_ID,
        } satisfies AgentSpawnedPayload,
        agentId(event),
      ),
    ];
  }

  if (SUBAGENT_DONE_KINDS.has(event.kind)) {
    return [
      draft(
        event,
        "agent.done",
        {
          stopReason:
            stringField(event, "stopReason", "stop_reason", "reason") ??
            "normal",
        } satisfies AgentDonePayload,
        agentId(event),
      ),
    ];
  }

  if (event.kind === "item.started") {
    return normalizeItemStarted(event);
  }

  if (event.kind === "item.completed") {
    return normalizeItemCompleted(event);
  }

  if (TEXT_DELTA_KINDS.has(event.kind)) {
    return textDraft(event, "message.delta");
  }

  if (TEXT_FINAL_KINDS.has(event.kind)) {
    return textDraft(event, "message.final");
  }

  if (THINKING_DELTA_KINDS.has(event.kind)) {
    return thinkingDraft(event, "thinking.delta");
  }

  if (THINKING_FINAL_KINDS.has(event.kind)) {
    return thinkingDraft(event, "thinking.final");
  }

  if (TOOL_START_KINDS.has(event.kind)) {
    return [
      draft(
        event,
        "tool.started",
        {
          toolName: toolName(event),
          inputSummary: inputSummary(event),
          toolUseId: toolUseId(event),
        } satisfies ToolStartedPayload,
        agentId(event),
      ),
    ];
  }

  if (TOOL_END_KINDS.has(event.kind)) {
    return [
      draft(
        event,
        "tool.ended",
        {
          toolUseId: toolUseId(event),
          ok: eventOk(event),
        } satisfies ToolEndedPayload,
        agentId(event),
      ),
    ];
  }

  if (TOOL_FAILED_KINDS.has(event.kind)) {
    return [
      draft(
        event,
        "tool.failed",
        {
          toolUseId: toolUseId(event),
          ok: false,
        } satisfies ToolEndedPayload,
        agentId(event),
      ),
    ];
  }

  if (event.kind === "approval.requested") {
    return [
      draft(
        event,
        "prompt.requested",
        {
          promptId: promptId(event),
          promptKind: "permission",
          data: permissionPromptData(event),
        } satisfies PromptRequestedPayload,
        agentId(event),
      ),
    ];
  }

  if (event.kind === "question.requested") {
    return [
      draft(
        event,
        "prompt.requested",
        {
          promptId: promptId(event),
          promptKind: "question",
          data: questionPromptData(event),
        } satisfies PromptRequestedPayload,
        agentId(event),
      ),
    ];
  }

  if (event.kind === "error" || event.kind === "session.error") {
    return [
      draft(event, "session.error", {
        message: errorMessage(event),
      } satisfies SessionErrorPayload),
    ];
  }

  if (event.kind === "usage.updated") {
    const usage = usagePayload(event);
    return usage ? [draft(event, "usage.updated", usage)] : [];
  }

  if (event.kind === "thread.tokenUsage.updated") {
    const tokenUsage = recordField(event, "tokenUsage") ?? event;
    const drafts: DraftEvent[] = [];
    const usage = usagePayload(tokenUsage);
    if (usage) drafts.push(draft(event, "usage.updated", usage));
    const context = contextPayload(tokenUsage);
    if (context) drafts.push(draft(event, "context.updated", context));
    return drafts;
  }

  if (event.kind === "context.updated") {
    const context = contextPayload(event);
    return context ? [draft(event, "context.updated", context)] : [];
  }

  if (event.kind === "turn.finished" || event.kind === "turn.completed") {
    const drafts: DraftEvent[] = [];
    const usage = usagePayload(recordField(event, "usage") ?? event);
    if (usage) drafts.push(draft(event, "usage.updated", usage));
    const context = contextPayload(
      recordField(event, "context") ??
        recordField(event, "contextUsage") ??
        recordField(event, "usage"),
    );
    if (context) drafts.push(draft(event, "context.updated", context));
    return drafts;
  }

  return [];
}

function normalizeItemStarted(event: CodexRuntimeEvent): DraftEvent[] {
  const item = mergedItemEvent(event);
  const itemType = stringField(item, "type");
  if (isCollabAgentItemType(itemType)) {
    return normalizeCollabAgentStarted(event, item);
  }
  if (isToolItemType(itemType)) {
    return [
      draft(
        event,
        "tool.started",
        {
          toolName: toolName(item),
          inputSummary: inputSummary(item),
          toolUseId: toolUseId(item),
        } satisfies ToolStartedPayload,
        agentId(event),
      ),
    ];
  }
  return [];
}

function normalizeItemCompleted(event: CodexRuntimeEvent): DraftEvent[] {
  const item = mergedItemEvent(event);
  const itemType = stringField(item, "type");
  if (isCollabAgentItemType(itemType)) {
    return normalizeCollabAgentCompleted(event, item);
  }
  if (isToolItemType(itemType)) {
    const type = eventOk(item) ? "tool.ended" : "tool.failed";
    return [
      draft(
        event,
        type,
        {
          toolUseId: toolUseId(item),
          ok: eventOk(item),
        } satisfies ToolEndedPayload,
        agentId(event),
      ),
    ];
  }
  if (itemType === "agentMessage") {
    return textDraft(item, "message.final");
  }
  if (itemType === "reasoning") {
    return thinkingDraft(item, "thinking.final");
  }
  return [];
}

function normalizeCollabAgentStarted(
  event: CodexRuntimeEvent,
  item: CodexRuntimeEvent,
): DraftEvent[] {
  if (collabTool(item) !== "spawnAgent") return [];
  const parentId =
    stringField(item, "senderThreadId", "sender_thread_id", "parentId") ??
    stringField(event, "threadId") ??
    ORCHESTRATOR_ID;
  const promptSummary = (textFrom(item) ?? "").slice(0, 80);
  return collabAgentIds(item).map((id) =>
    draft(
      event,
      "agent.spawned",
      {
        role: subagentRole(item),
        promptSummary,
        parentId,
      } satisfies AgentSpawnedPayload,
      id,
    ),
  );
}

function normalizeCollabAgentCompleted(
  event: CodexRuntimeEvent,
  item: CodexRuntimeEvent,
): DraftEvent[] {
  const tool = collabTool(item);
  return collabAgentIds(item).flatMap((id) => {
    const state = collabAgentState(item, id);
    const status =
      stringField(state, "status", "state") ??
      stringField(item, "status", "outcome");
    if (!isTerminalCollabAgentState(tool, status)) return [];
    return [
      draft(
        event,
        "agent.done",
        {
          stopReason: status ?? (tool === "closeAgent" ? "closed" : "normal"),
        } satisfies AgentDonePayload,
        id,
      ),
    ];
  });
}

function textDraft(
  event: CodexRuntimeEvent,
  type: "message.delta" | "message.final",
): DraftEvent[] {
  const text = textFrom(event);
  if (!text) return [];
  return [
    draft(event, type, { text } satisfies MessagePayload, agentId(event)),
  ];
}

function thinkingDraft(
  event: CodexRuntimeEvent,
  type: "thinking.delta" | "thinking.final",
): DraftEvent[] {
  const text = textFrom(event);
  if (!text) return [];
  return [
    draft(event, type, { text } satisfies ThinkingPayload, agentId(event)),
  ];
}

function draft<TPayload>(
  source: CodexRuntimeEvent,
  type: DraftEvent["type"],
  payload: TPayload,
  agentIdValue?: string,
): DraftEvent {
  const result: DraftEvent = {
    type,
    payload,
    raw: rawRef(source),
  };
  if (agentIdValue) result.agentId = agentIdValue;
  return result;
}

function sessionCreatedPayload(
  event: CodexRuntimeEvent,
): SessionCreatedPayload {
  const defaults = defaultRuntimeConfig("codex");
  const payload: SessionCreatedPayload = {
    title: stringField(event, "title", "name") ?? "",
    model: stringField(event, "model") ?? defaults.model,
    runtime: "codex",
    permissionMode: normalizePermissionMode(
      event.permissionMode,
      defaults.permissionMode,
    ),
    apiKeySource: "",
    slashCommands: stringArrayField(event, "slashCommands", "slash_commands"),
    sandboxMode: normalizeSandboxMode(event.sandboxMode, defaults.sandboxMode),
    networkAccess:
      booleanField(event, "networkAccess") ?? defaults.networkAccess,
  };
  const approvalPolicy = normalizeCodexApprovalPolicy(
    event.approvalPolicy,
    defaults.approvalPolicy,
  );
  if (approvalPolicy !== undefined) payload.approvalPolicy = approvalPolicy;
  const reasoningEffort = normalizeReasoningEffort(
    event.reasoningEffort,
    defaults.reasoningEffort,
  );
  if (reasoningEffort !== undefined) payload.reasoningEffort = reasoningEffort;
  const cwd = stringField(event, "cwd");
  if (cwd) payload.cwd = cwd;
  const project = stringField(event, "project");
  if (project) payload.project = project;
  return payload;
}

function permissionPromptData(
  event: CodexRuntimeEvent,
): PromptRequestedPayload["data"] {
  const summary = inputSummary(event);
  const name = toolName(event);
  return {
    toolName: name,
    inputSummary: summary,
    title: approvalTitle(event),
    displayName: summary || name,
    description: stringField(event, "method"),
  };
}

function questionPromptData(
  event: CodexRuntimeEvent,
): PromptRequestedPayload["data"] {
  const rawQuestions = event.questions;
  if (Array.isArray(rawQuestions)) {
    return {
      questions: rawQuestions.map((item) => {
        const question = asRecord(item);
        return {
          question:
            stringField(question, "question", "prompt", "message") ?? "",
          header: stringField(question, "header", "title") ?? "Question",
          options: questionOptions(question.options),
          multiSelect: booleanField(question, "multiSelect") ?? false,
        };
      }),
    };
  }
  return {
    questions: [
      {
        question: textFrom(event) ?? errorMessage(event),
        header: stringField(event, "header", "title") ?? "Question",
        options: questionOptions(event.options),
        multiSelect: booleanField(event, "multiSelect") ?? false,
      },
    ],
  };
}

function questionOptions(value: unknown): Array<{
  label: string;
  description?: string;
  preview?: string;
}> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return { label: item };
      const option = asRecord(item);
      const label = stringField(option, "label", "value", "title");
      if (!label) return null;
      const out: { label: string; description?: string; preview?: string } = {
        label,
      };
      const description = stringField(option, "description");
      if (description) out.description = description;
      const preview = stringField(option, "preview");
      if (preview) out.preview = preview;
      return out;
    })
    .filter(
      (
        item,
      ): item is { label: string; description?: string; preview?: string } =>
        Boolean(item),
    );
}

function usagePayload(value: unknown): UsagePayload | null {
  const usage = asRecord(value);
  const total = recordField(usage, "total");
  if (total) {
    const nested = usagePayload(total);
    if (nested) {
      return {
        tokens: nested.tokens,
        cost:
          numberField(usage, "cost", "costUsd", "cost_usd", "totalCostUsd") ??
          nested.cost,
      };
    }
  }
  const input =
    numberField(usage, "inputTokens", "input_tokens") ??
    numberField(asRecord(usage.usage), "inputTokens", "input_tokens") ??
    0;
  const output =
    numberField(usage, "outputTokens", "output_tokens") ??
    numberField(asRecord(usage.usage), "outputTokens", "output_tokens") ??
    0;
  const explicitTotal = numberField(
    usage,
    "tokens",
    "totalTokens",
    "total_tokens",
  );
  const tokens = explicitTotal ?? input + output;
  if (tokens <= 0) return null;
  return {
    tokens,
    cost:
      numberField(usage, "cost", "costUsd", "cost_usd", "totalCostUsd") ?? 0,
  };
}

function contextPayload(value: unknown): ContextUpdatedPayload | null {
  const context = asRecord(value);
  const total = recordField(context, "total");
  const tokenSource = total ?? context;
  const usedTokens = numberField(
    tokenSource,
    "usedTokens",
    "used_tokens",
    "totalTokens",
    "total_tokens",
  );
  const windowSize = numberField(
    context,
    "windowSize",
    "window_size",
    "maxTokens",
    "max_tokens",
    "modelContextWindow",
    "model_context_window",
  );
  if (usedTokens === undefined || windowSize === undefined || windowSize <= 0) {
    return null;
  }
  return {
    usedTokens,
    windowSize,
    utilization:
      numberField(context, "utilization") ??
      clampPercent(Math.round((usedTokens / windowSize) * 100)),
  };
}

function rawRef(event: CodexRuntimeEvent): SanitizedRuntimeRawRef {
  const raw: SanitizedRuntimeRawRef = {
    source: "codex-app-server",
    eventType: event.kind,
  };
  const eventId = stringField(
    event,
    "agentId",
    "agent_id",
    "itemId",
    "callId",
    "toolUseId",
    "requestId",
    "turnId",
    "threadId",
    "id",
  );
  if (eventId) raw.eventId = eventId;
  return raw;
}

function agentId(event: CodexRuntimeEvent): string {
  return stringField(event, "agentId", "agent_id") ?? ORCHESTRATOR_ID;
}

function promptId(event: CodexRuntimeEvent): string {
  return (
    stringField(event, "requestId", "promptId", "itemId", "callId", "id") ?? ""
  );
}

function toolUseId(event: CodexRuntimeEvent): string {
  return (
    stringField(event, "toolUseId", "tool_use_id", "callId", "itemId", "id") ??
    ""
  );
}

function toolName(event: CodexRuntimeEvent): string {
  const explicit = stringField(event, "toolName", "tool_name", "name");
  if (explicit) return explicit;
  const method = stringField(event, "method") ?? event.kind;
  if (method.includes("commandExecution") || stringField(event, "command")) {
    return "shell";
  }
  if (method.includes("applyPatch")) return "apply_patch";
  if (method.includes("fileChange")) return "file";
  return "tool";
}

function subagentRole(event: CodexRuntimeEvent): string {
  return (
    stringField(
      event,
      "role",
      "agentType",
      "agent_type",
      "subagentType",
      "subagent_type",
      "name",
    ) ?? "agent"
  );
}

function inputSummary(event: CodexRuntimeEvent): string {
  const input = asRecord(event.input);
  const text =
    stringField(
      event,
      "inputSummary",
      "command",
      "file_path",
      "path",
      "query",
    ) ??
    stringField(input, "command", "file_path", "path", "query") ??
    "";
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}

function eventOk(event: CodexRuntimeEvent): boolean {
  const ok = booleanField(event, "ok", "success");
  if (ok !== undefined) return ok;
  const exitCode = numberField(event, "exitCode", "exit_code");
  if (exitCode !== undefined) return exitCode === 0;
  const status = stringField(event, "status", "outcome")?.toLowerCase();
  if (status === "failed" || status === "error") return false;
  return true;
}

function approvalTitle(event: CodexRuntimeEvent): string {
  const method = stringField(event, "method") ?? "";
  if (method.includes("commandExecution")) return "Command approval requested";
  if (method.includes("fileChange")) return "File change approval requested";
  if (method.includes("applyPatch")) return "Patch approval requested";
  return "Approval requested";
}

function errorMessage(event: CodexRuntimeEvent): string {
  const error = asRecord(event.error);
  return (
    stringField(event, "message", "errorMessage", "reason") ??
    stringField(error, "message") ??
    "Codex runtime error"
  );
}

function textFrom(event: Record<string, unknown>): string | undefined {
  return stringField(event, "text", "delta", "message", "output", "prompt");
}

function recordField(
  record: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  const value = record[key];
  return isRecord(value) ? value : undefined;
}

function mergedItemEvent(event: CodexRuntimeEvent): CodexRuntimeEvent {
  const item = recordField(event, "item") ?? {};
  const itemId = stringField(event, "itemId") ?? stringField(item, "id");
  return {
    ...item,
    ...event,
    ...(itemId ? { itemId, id: itemId } : {}),
  };
}

function isToolItemType(itemType: string | undefined): boolean {
  return (
    itemType === "commandExecution" ||
    itemType === "mcpToolCall" ||
    itemType === "fileChange" ||
    itemType === "dynamicToolCall"
  );
}

function isCollabAgentItemType(itemType: string | undefined): boolean {
  return itemType === "collabAgentToolCall";
}

function collabTool(event: CodexRuntimeEvent): string | undefined {
  return stringField(event, "tool", "toolName", "tool_name", "name");
}

function collabAgentIds(event: CodexRuntimeEvent): string[] {
  const states = recordField(event, "agentsStates") ?? {};
  const ids = [
    ...stringArrayField(
      event,
      "receiverThreadIds",
      "receiver_thread_ids",
      "agentIds",
      "agent_ids",
    ),
    ...Object.keys(states),
  ];
  const single = stringField(
    event,
    "receiverThreadId",
    "receiver_thread_id",
    "agentId",
    "agent_id",
  );
  if (single) ids.push(single);
  if (ids.length === 0) {
    const fallback = stringField(event, "id");
    if (fallback) ids.push(fallback);
  }
  return Array.from(new Set(ids));
}

function collabAgentState(
  event: CodexRuntimeEvent,
  agentIdValue: string,
): Record<string, unknown> {
  const states = recordField(event, "agentsStates") ?? {};
  return recordField(states, agentIdValue) ?? {};
}

function isTerminalCollabAgentState(
  tool: string | undefined,
  status: string | undefined,
): boolean {
  if (tool === "closeAgent") return true;
  if (!status) return false;
  return TERMINAL_COLLAB_AGENT_STATES.has(status.toLowerCase());
}

function accumulateStreamingText(
  event: CodexRuntimeEvent,
  textStreams: Map<string, string>,
  thinkingStreams: Map<string, string>,
): CodexRuntimeEvent {
  if (TEXT_DELTA_KINDS.has(event.kind)) {
    return accumulateStream(event, textStreams);
  }
  if (THINKING_DELTA_KINDS.has(event.kind)) {
    return accumulateStream(event, thinkingStreams);
  }
  return event;
}

function accumulateStream(
  event: CodexRuntimeEvent,
  streams: Map<string, string>,
): CodexRuntimeEvent {
  const chunk = textFrom(event);
  const key = streamKey(event);
  if (!chunk || !key) return event;
  const text = `${streams.get(key) ?? ""}${chunk}`;
  streams.set(key, text);
  return { ...event, text };
}

function streamKey(event: CodexRuntimeEvent): string | undefined {
  const id = stringField(event, "itemId", "id", "callId", "turnId");
  if (!id) return undefined;
  return `${agentId(event)}:${id}`;
}

function stringArrayField(
  record: Record<string, unknown>,
  ...keys: string[]
): string[] {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === "string");
    }
  }
  return [];
}

function stringField(
  record: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") return value;
  }
  return undefined;
}

function numberField(
  record: Record<string, unknown>,
  ...keys: string[]
): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function booleanField(
  record: Record<string, unknown>,
  ...keys: string[]
): boolean | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") return value;
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}
