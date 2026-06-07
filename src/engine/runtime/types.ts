import type { RoomEventType } from "../../shared/events";

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
