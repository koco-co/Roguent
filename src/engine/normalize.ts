import { ORCHESTRATOR_ID } from "../shared/domain";
import type { RoomEventType } from "../shared/events";

export interface DraftEvent {
  type: RoomEventType;
  payload: unknown;
  agentId?: string;
}

// Structural shapes — decoupled from the SDK. Validate real JSON before trusting (spec §8.4).
export interface HookLike {
  hook_event_name: string;
  agent_id?: string;
  agent_type?: string;
  tool_name?: string;
  tool_input?: unknown;
  tool_use_id?: string;
  prompt?: string;
  stop_reason?: string;
}

export interface SdkMessageLike {
  type: string; // 'system' | 'assistant' | 'result' | ...
  subtype?: string;
  session_id?: string;
  apiKeySource?: string;
  slash_commands?: string[];
  model?: string;
  permissionMode?: string;
  parent_tool_use_id?: string | null;
  message?: { content?: Array<{ type: string; text?: string }> };
  total_cost_usd?: number;
  usage?: { input_tokens?: number; output_tokens?: number };
}

export function summarizeToolInput(input: unknown): string {
  const o = (input ?? {}) as Record<string, unknown>;
  const s = (k: string) =>
    typeof o[k] === "string" ? (o[k] as string) : undefined;
  const raw =
    s("command") ??
    s("file_path") ??
    s("pattern") ??
    s("query") ??
    s("path") ??
    "";
  return raw.length > 60 ? `${raw.slice(0, 57)}…` : raw;
}

export function normalizeHook(h: HookLike): DraftEvent[] {
  const agentId = h.agent_id ?? ORCHESTRATOR_ID;
  switch (h.hook_event_name) {
    case "SubagentStart":
      return [
        {
          type: "agent.spawned",
          agentId: h.agent_id,
          payload: {
            role: h.agent_type ?? "agent",
            promptSummary: (h.prompt ?? "").slice(0, 80),
            parentId: ORCHESTRATOR_ID,
          },
        },
      ];
    case "SubagentStop":
      return [
        {
          type: "agent.done",
          agentId: h.agent_id,
          payload: { stopReason: h.stop_reason ?? "normal" },
        },
      ];
    case "PreToolUse":
      return [
        {
          type: "tool.started",
          agentId,
          payload: {
            toolName: h.tool_name ?? "",
            inputSummary: summarizeToolInput(h.tool_input),
            toolUseId: h.tool_use_id ?? "",
          },
        },
      ];
    case "PostToolUse":
      return [
        {
          type: "tool.ended",
          agentId,
          payload: { toolUseId: h.tool_use_id ?? "", ok: true },
        },
      ];
    case "PostToolUseFailure":
      return [
        {
          type: "tool.failed",
          agentId,
          payload: { toolUseId: h.tool_use_id ?? "", ok: false },
        },
      ];
    default:
      return [];
  }
}

export function normalizeSdkMessage(m: SdkMessageLike): DraftEvent[] {
  if (m.type === "system" && m.subtype === "init") {
    return [
      {
        type: "session.created",
        payload: {
          title: "",
          model: m.model ?? "",
          permissionMode: m.permissionMode ?? "default",
          apiKeySource: m.apiKeySource ?? "",
          slashCommands: m.slash_commands ?? [],
        },
      },
    ];
  }
  if (m.type === "assistant") {
    const text = (m.message?.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("");
    if (!text) return [];
    // parent_tool_use_id != null → from a subagent; MVP routes all text to the orchestrator's drawer chat.
    return [
      {
        type: "message.delta",
        agentId: m.parent_tool_use_id ? undefined : ORCHESTRATOR_ID,
        payload: { text },
      },
    ];
  }
  if (m.type === "result") {
    const tokens = (m.usage?.input_tokens ?? 0) + (m.usage?.output_tokens ?? 0);
    return [
      {
        type: "usage.updated",
        payload: { tokens, cost: m.total_cost_usd ?? 0 },
      },
    ];
  }
  return [];
}
