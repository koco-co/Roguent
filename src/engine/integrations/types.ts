import type {
  SchedulerRunFinishedPayload,
  SchedulerRunStartedPayload,
  SchedulerTaskCreatedPayload,
  SchedulerTaskUpdatedPayload,
  SettingsUpdatedPayload,
} from "../../shared/events";
import type {
  IntegrationChannel,
  IntegrationDirection,
  IntegrationStatusPayload,
  MailboxItem,
  MailboxItemCreatedPayload,
  MailboxItemUpdatedPayload,
  NormalizedIntegrationEvent,
  PairingBinding,
} from "../../shared/integrations";

export interface IntegrationEvent {
  id: string;
  channel: "wechat" | "feishu" | "github" | "x" | "relay";
  direction: "inbound" | "outbound";
  externalChatId?: string;
  deliveryId?: string;
  summary: string;
  bodyText?: string;
  from?: string;
  to?: string;
  displayName?: string;
  metadata?: Record<string, unknown>;
  receivedAt: number;
}

export type MaybePromise<T> = T | Promise<T>;

export interface IntegrationRouteOptions {
  currentSessionId?: string | null;
}

export interface IntegrationRouteResult {
  inboxItem: MailboxItem;
  sessionId?: string;
  createdSession: boolean;
  forwardedToRuntime?: boolean;
}

export interface PairingBindingReader {
  getByExternalKey(
    channel: IntegrationChannel,
    externalChatId: string,
  ): MaybePromise<PairingBinding | null | undefined>;
}

export interface InboxWriter {
  create(item: MailboxItem): MaybePromise<void>;
  assignSession(itemId: string, sessionId: string): MaybePromise<void>;
}

export interface IntegrationAuditInput {
  source: string;
  action: string;
  sessionId?: string;
  deliveryId?: string;
  payload: {
    id: string;
    channel: IntegrationChannel;
    direction: IntegrationDirection;
    externalChatId?: string;
    receivedAt: number;
  };
  summary: string;
  createdAt?: number;
}

export interface IntegrationAuditAppender {
  append(input: IntegrationAuditInput): MaybePromise<void>;
}

export interface CreateSubscriptionSessionInput {
  id: string;
  title: string;
  source: "integration.subscription";
}

export interface IntegrationSessionControl {
  createSubscriptionSession(
    input: CreateSubscriptionSessionInput,
  ): MaybePromise<void>;
  /**
   * Forward normalized external text into the runtime. The router publishes the
   * chat-visible integration event separately, so this method must not create a
   * second local user bubble.
   */
  forwardToRuntime(sessionId: string, text: string): MaybePromise<boolean>;
}

export type IntegrationRouterEvent =
  | {
      sessionId: string;
      type: "mailbox.item.created";
      payload: MailboxItemCreatedPayload;
      ts: number;
    }
  | {
      sessionId: string;
      type: "mailbox.item.updated";
      payload: MailboxItemUpdatedPayload;
      ts: number;
    }
  | {
      sessionId: string;
      type: "integration.event.received";
      payload: NormalizedIntegrationEvent;
      ts: number;
    }
  | {
      sessionId: string;
      type: "integration.status";
      payload: IntegrationStatusPayload;
      ts: number;
    }
  | {
      sessionId: string;
      type: "scheduler.task.created";
      payload: SchedulerTaskCreatedPayload;
      ts: number;
    }
  | {
      sessionId: string;
      type: "scheduler.task.updated";
      payload: SchedulerTaskUpdatedPayload;
      ts: number;
    }
  | {
      sessionId: string;
      type: "scheduler.run.started";
      payload: SchedulerRunStartedPayload;
      ts: number;
    }
  | {
      sessionId: string;
      type: "scheduler.run.finished";
      payload: SchedulerRunFinishedPayload;
      ts: number;
    }
  | {
      sessionId: string;
      type: "settings.updated";
      payload: SettingsUpdatedPayload;
      ts: number;
    };

export interface IntegrationRouterDependencies {
  pairingBindings: PairingBindingReader;
  inbox: InboxWriter;
  audit: IntegrationAuditAppender;
  sessions: IntegrationSessionControl;
  publish(event: IntegrationRouterEvent): MaybePromise<void>;
}
