import { ORCHESTRATOR_ID } from "../shared/domain";
import type { SessionCreatedPayload } from "../shared/events";
import { type DraftEvent, summarizeToolInput } from "./normalize";

export interface TimedDraft extends DraftEvent {
  ts: number; // epoch ms，来自该行 ISO timestamp
}

const SUBAGENT_TOOLS = new Set(["Task", "Agent"]);

interface ContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  is_error?: boolean;
}
interface Line {
  type?: string;
  timestamp?: string;
  cwd?: string;
  message?: {
    role?: string;
    model?: string;
    content?: ContentBlock[] | string;
  };
}

function asLine(x: unknown): Line | null {
  return x && typeof x === "object" ? (x as Line) : null;
}
function tsOf(l: Line, prev: number): number {
  const t = l.timestamp ? Date.parse(l.timestamp) : Number.NaN;
  return Number.isNaN(t) ? prev : t;
}
function blocks(l: Line): ContentBlock[] {
  const c = l.message?.content;
  return Array.isArray(c) ? c : [];
}

export function normalizeTranscript(input: unknown[]): TimedDraft[] {
  const lines = input.map(asLine);

  // Pass 1：派生 session.created 的元信息。
  let cwd = "";
  let model = "";
  let title = "";
  let firstTs = 0;
  for (const l of lines) {
    if (!l) continue;
    if (!firstTs && l.timestamp) firstTs = tsOf(l, 0);
    if (!cwd && typeof l.cwd === "string") cwd = l.cwd;
    if (!model && typeof l.message?.model === "string") model = l.message.model;
    if (!title && l.type === "user" && typeof l.message?.content === "string") {
      title = l.message.content.slice(0, 60);
    }
  }

  const created: SessionCreatedPayload = {
    title: title || "imported session",
    model,
    permissionMode: "default",
    apiKeySource: "",
    slashCommands: [],
    cwd: cwd || undefined,
  };
  const out: TimedDraft[] = [
    { type: "session.created", payload: created, ts: firstTs },
  ];

  // Pass 2：事件流。记录哪些 tool_use id 是 subagent，决定其 result 是 done 还是 ended。
  const subagentIds = new Set<string>();
  let prev = firstTs;
  for (const l of lines) {
    if (!l) continue;
    const ts = tsOf(l, prev);
    prev = ts;

    if (l.type === "assistant" && typeof l.message?.content === "string")
      continue;

    for (const b of blocks(l)) {
      if (b.type === "text" && b.text) {
        out.push({
          type: "message.delta",
          agentId: ORCHESTRATOR_ID,
          payload: { text: b.text },
          ts,
        });
      } else if (b.type === "tool_use" && b.id) {
        if (SUBAGENT_TOOLS.has(b.name ?? "")) {
          subagentIds.add(b.id);
          const role = (b.input?.subagent_type as string) ?? "agent";
          const prompt =
            (b.input?.description as string) ??
            (b.input?.prompt as string) ??
            "";
          out.push({
            type: "agent.spawned",
            agentId: b.id,
            payload: {
              role,
              promptSummary: prompt.slice(0, 80),
              parentId: ORCHESTRATOR_ID,
            },
            ts,
          });
        } else {
          out.push({
            type: "tool.started",
            agentId: ORCHESTRATOR_ID,
            payload: {
              toolName: b.name ?? "",
              inputSummary: summarizeToolInput(b.input),
              toolUseId: b.id,
            },
            ts,
          });
        }
      } else if (b.type === "tool_result" && b.tool_use_id) {
        if (subagentIds.has(b.tool_use_id)) {
          out.push({
            type: "agent.done",
            agentId: b.tool_use_id,
            payload: { stopReason: "normal" },
            ts,
          });
        } else {
          out.push(
            b.is_error
              ? {
                  type: "tool.failed",
                  agentId: ORCHESTRATOR_ID,
                  payload: { toolUseId: b.tool_use_id, ok: false },
                  ts,
                }
              : {
                  type: "tool.ended",
                  agentId: ORCHESTRATOR_ID,
                  payload: { toolUseId: b.tool_use_id, ok: true },
                  ts,
                },
          );
        }
      }
    }
  }

  return out;
}
