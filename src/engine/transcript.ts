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

    // 用户轮次(人类提问):content 可能是纯字符串,也可能是含 text 块的数组。
    // 把它作为 role:"user" 的消息发出,让导入的会话历史在聊天抽屉里完整重现。
    // 注意:user 行里的 tool_result 块不是人类发言,仍交由下方统一处理(→ tool.ended/agent.done)。
    if (l.type === "user") {
      const c = l.message?.content;
      const userText =
        typeof c === "string"
          ? c
          : blocks(l)
              .filter((b) => b.type === "text" && b.text)
              .map((b) => b.text)
              .join("");
      if (userText) {
        out.push({
          type: "message.delta",
          payload: { text: userText, role: "user" },
          ts,
        });
      }
    }

    // 助手纯字符串内容(少见,如压缩摘要)也作为助手文本发出。
    if (l.type === "assistant" && typeof l.message?.content === "string") {
      if (l.message.content) {
        out.push({
          type: "message.delta",
          agentId: ORCHESTRATOR_ID,
          payload: { text: l.message.content, role: "assistant" },
          ts,
        });
      }
      continue;
    }

    for (const b of blocks(l)) {
      if (b.type === "text" && b.text) {
        // 用户行的 text 块已在上面作为 user 消息发过,这里只发助手文本。
        if (l.type === "user") continue;
        out.push({
          type: "message.delta",
          agentId: ORCHESTRATOR_ID,
          payload: { text: b.text, role: "assistant" },
          ts,
        });
      } else if (b.type === "tool_use" && b.id) {
        if (SUBAGENT_TOOLS.has(b.name ?? "")) {
          subagentIds.add(b.id);
          // Real CC Task/Agent inputs may omit subagent_type (only description/prompt present); fall back to generic "agent" — affects dungeon skin only, not correctness.
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
