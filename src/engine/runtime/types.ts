import type { RoomEventType } from "../../shared/events";
import type { RuntimeConfig } from "../../shared/runtime";

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
  send(text: string, meta?: RuntimeSendMeta): void;
  setModel(model: string): Promise<void>;
  setPermissionMode(mode: string): Promise<void>;
  setRuntimeConfig?(config: RuntimeConfig): Promise<void>;
  setSandboxMode?(mode: string): Promise<void>;
  setReasoningEffort?(effort: string): Promise<void>;
  respondQuestion?(
    promptId: string,
    selectedLabels: string[],
  ): void | Promise<void>;
  interrupt(): Promise<void>;
  end(): void;
}
