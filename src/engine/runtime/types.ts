import type { ContentBlockParam } from "@anthropic-ai/sdk/resources/messages";
import type { RoomEventType } from "../../shared/events";
import type { RuntimeConfig } from "../../shared/runtime";

/**
 * Message content handed to a runtime driver. A plain string is the legacy
 * text-only path (backward compatible); an array of SDK content blocks carries
 * multimodal input (text + image blocks, B4). Codex/other drivers that cannot
 * send images flatten the array down to text (see RuntimeSendContent helpers).
 */
export type RuntimeSendContent = string | ContentBlockParam[];

/**
 * Flatten send content to plain text for text-only runtimes (Codex). A string
 * passes through; a block array keeps the text blocks (joined) and drops image
 * blocks (Codex has no multimodal input path here). Used as a graceful fallback,
 * never silently losing the user's words.
 */
export function sendContentToText(content: RuntimeSendContent): string {
  if (typeof content === "string") return content;
  return content
    .filter(
      (block): block is Extract<ContentBlockParam, { type: "text" }> =>
        block.type === "text",
    )
    .map((block) => block.text)
    .join("\n");
}

export type RuntimeEventSource =
  | "claude-sdk"
  | "claude-hook"
  | "codex-app-server"
  | "codex-exec"
  | "replay";

export interface SanitizedRuntimeRawRef {
  source: RuntimeEventSource;
  eventType: string;
  eventId?: string;
  payloadHash?: string;
  auditRef?: string;
}

export interface RuntimeEventDraft<TPayload = unknown> {
  type: RoomEventType;
  payload: TPayload;
  agentId?: string;
  ts?: number;
  raw?: SanitizedRuntimeRawRef;
}

export type DraftEvent = RuntimeEventDraft;

export interface RuntimeSendMeta {
  parentToolUseId?: string | null;
}

export interface RuntimeDriver {
  start(): void;
  send(content: RuntimeSendContent, meta?: RuntimeSendMeta): void;
  setModel(model: string): Promise<void>;
  setPermissionMode(mode: string): Promise<void>;
  setRuntimeConfig?(config: RuntimeConfig): Promise<void>;
  setSandboxMode?(mode: string): Promise<void>;
  setReasoningEffort?(effort: string): Promise<void>;
  respondQuestion?(
    promptId: string,
    selectedLabels: string[],
  ): void | Promise<void>;
  rollback?(checkpointId: string): Promise<void>;
  interrupt(): Promise<void>;
  end(): void;
}
