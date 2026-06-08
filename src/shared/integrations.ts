export type IntegrationChannel = "wechat" | "feishu" | "github" | "x" | "relay";
export type IntegrationDirection = "inbound" | "outbound";
export type IntegrationConnectionState =
  | "connecting"
  | "connected"
  | "disconnected"
  | "degraded"
  | "error";

export interface IntegrationConnectorStatus {
  id: string;
  channel: IntegrationChannel;
  state: IntegrationConnectionState;
  label?: string;
  account?: string;
  lastEventAt?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface IntegrationStatusPayload {
  status: IntegrationConnectorStatus;
}

export interface NormalizedIntegrationEvent {
  id: string;
  channel: IntegrationChannel;
  direction: IntegrationDirection;
  summary: string;
  receivedAt: number;
  externalChatId?: string;
  deliveryId?: string;
  bodyText?: string;
  ts?: number;
  connectorId?: string;
  externalId?: string;
  threadId?: string;
  from?: string;
  to?: string;
  displayName?: string;
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export type IntegrationEventReceivedPayload = NormalizedIntegrationEvent;

export type PairingQrStatus = "pending" | "scanned" | "expired" | "error";

export interface PairingQr {
  id: string;
  channel: IntegrationChannel;
  status: PairingQrStatus;
  url?: string;
  imageDataUrl?: string;
  expiresAt?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface PairingQrUpdatedPayload {
  qr: PairingQr | null;
}

export type PairingBindingStatus = "active" | "revoked" | "expired";

export interface PairingBinding {
  id: string;
  channel: IntegrationChannel;
  status: PairingBindingStatus;
  externalChatId: string;
  sessionId: string;
  forwardingEnabled: boolean;
  boundAt: number;
  updatedAt?: number;
  externalUserId?: string;
  displayName?: string;
  metadata?: Record<string, unknown>;
}

export interface PairingBindingUpdatedPayload {
  binding: PairingBinding;
  action?: "created" | "updated" | "revoked";
}

export type MailboxSource =
  | IntegrationChannel
  | "scheduler"
  | "runtime"
  | "system";
export type MailboxItemKind =
  | "message"
  | "announcement"
  | "alert"
  | "task"
  | "event";
export type MailboxItemStatus = "unread" | "read" | "archived";
export type MailboxItemPriority = "low" | "normal" | "high";

export interface MailboxAction {
  id: string;
  label: string;
  kind: "open" | "reply" | "archive" | "run" | "custom";
  metadata?: Record<string, unknown>;
}

export interface MailboxItem {
  id: string;
  source: MailboxSource;
  title: string;
  summary: string;
  ts: number;
  status: MailboxItemStatus;
  kind?: MailboxItemKind;
  priority?: MailboxItemPriority;
  channel?: IntegrationChannel;
  sessionId?: string;
  agentId?: string;
  relatedEventId?: string;
  actions?: MailboxAction[];
  metadata?: Record<string, unknown>;
}

export interface MailboxItemCreatedPayload {
  item: MailboxItem;
}

export interface MailboxItemUpdatedPayload {
  item: MailboxItem;
  changes?: Partial<MailboxItem>;
}
