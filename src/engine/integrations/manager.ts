import type { RoomEvent } from "../../shared/events";
import type { IntegrationChannel } from "../../shared/integrations";
import type { IntegrationRouter } from "./router";
import type { IntegrationEvent } from "./types";
import type {
  ImConnector,
  ImConnectorEvent,
  OutboundDeliveryResult,
  OutboundImTarget,
} from "./wechat-types";

export interface IntegrationManagerOptions {
  imConnectors?: Partial<Record<IntegrationChannel, ImConnector>>;
  router: IntegrationRouter;
  currentSessionId?: () => string | null | undefined;
}

export class IntegrationManager {
  private readonly unsubscribers: Array<() => void> = [];
  private readonly pendingOutboundBySession = new Map<
    string,
    PendingOutboundTarget[]
  >();
  private generation = 0;

  constructor(private readonly options: IntegrationManagerOptions) {}

  start(): void {
    this.stop();
    const generation = ++this.generation;
    for (const [channel, connector] of Object.entries(
      this.options.imConnectors ?? {},
    )) {
      if (!connector) continue;
      this.unsubscribers.push(
        connector.onEvent((event) =>
          this.handleConnectorEventSafely(channel as IntegrationChannel, event),
        ),
      );
      void connector.start?.().catch((error) => {
        if (this.generation !== generation) return;
        return this.publishStartupFailure(channel as IntegrationChannel, error);
      });
    }
  }

  stop(): void {
    this.generation++;
    this.pendingOutboundBySession.clear();
    for (const unsubscribe of this.unsubscribers.splice(0)) {
      unsubscribe();
    }
    for (const connector of Object.values(this.options.imConnectors ?? {})) {
      void connector?.stop?.().catch(() => {});
    }
  }

  async handleRoomEventSafely(event: RoomEvent): Promise<void> {
    try {
      await this.handleRoomEvent(event);
    } catch (error) {
      await this.publishRoomEventFailure(
        firstConfiguredChannel(this.options.imConnectors),
        error,
      ).catch(() => {});
    }
  }

  async handleRoomEvent(event: RoomEvent): Promise<void> {
    if (event.type !== "message.final") return;
    const payload = event.payload as { text?: unknown; role?: unknown };
    if (payload.role !== undefined && payload.role !== "assistant") return;
    if (typeof payload.text !== "string" || !payload.text.trim()) return;

    const pending = this.shiftPendingOutbound(event.sessionId);
    if (!pending) return;

    const connector = this.options.imConnectors?.[pending.channel];
    if (!connector) {
      await this.publishOutboundFailureSafely(
        pending,
        event,
        payload.text,
        new Error(`No connector configured for ${pending.channel}`),
      );
      return;
    }

    let result: OutboundDeliveryResult;
    try {
      result = await connector.sendMessage(pending.target, payload.text);
    } catch (error) {
      await this.publishOutboundFailureSafely(
        pending,
        event,
        payload.text,
        error,
      );
      return;
    }

    try {
      await this.publishOutboundDelivery(pending, event, payload.text, result);
    } catch (error) {
      await this.publishRoomEventFailure(pending.channel, error).catch(
        () => {},
      );
    }
  }

  private async handleConnectorEventSafely(
    channel: IntegrationChannel,
    event: ImConnectorEvent,
  ): Promise<void> {
    try {
      await this.handleConnectorEvent(event);
    } catch (error) {
      await this.publishConnectorEventFailure(channel, error).catch(() => {});
    }
  }

  private async handleConnectorEvent(event: ImConnectorEvent): Promise<void> {
    if (event.type === "message") {
      const result = await this.options.router.route(event.event, {
        currentSessionId: this.options.currentSessionId?.() ?? null,
      });
      if (result.forwardedToRuntime) {
        this.rememberOutboundTarget(event.event, result.sessionId);
      }
      return;
    }
    if (event.type === "status") {
      await this.options.router.publishStatus(event.status, {
        currentSessionId: this.options.currentSessionId?.() ?? null,
      });
    }
  }

  private async publishStartupFailure(
    channel: IntegrationChannel,
    error: unknown,
  ): Promise<void> {
    await this.options.router.publishStatus(
      {
        id: `${channel}-startup`,
        channel,
        state: "error",
        label: `${channel} connector`,
        error: sanitizeStartupError(error),
        lastEventAt: Date.now(),
        metadata: {
          code: "connector-startup-failed",
        },
      },
      {
        currentSessionId: this.options.currentSessionId?.() ?? null,
      },
    );
  }

  private async publishConnectorEventFailure(
    channel: IntegrationChannel,
    error: unknown,
  ): Promise<void> {
    await this.options.router.publishStatus(
      {
        id: `${channel}-event-handler`,
        channel,
        state: "degraded",
        label: `${channel} connector`,
        error: errorMessage(error),
        lastEventAt: Date.now(),
        metadata: {
          code: "connector-event-handler-failed",
        },
      },
      {
        currentSessionId: this.options.currentSessionId?.() ?? null,
      },
    );
  }

  private async publishRoomEventFailure(
    channel: IntegrationChannel,
    error: unknown,
  ): Promise<void> {
    await this.options.router.publishStatus(
      {
        id: `${channel}-room-event-handler`,
        channel,
        state: "degraded",
        label: `${channel} connector`,
        error: errorMessage(error),
        lastEventAt: Date.now(),
        metadata: {
          code: "outbound-room-event-failed",
        },
      },
      {
        currentSessionId: this.options.currentSessionId?.() ?? null,
      },
    );
  }

  private rememberOutboundTarget(
    event: IntegrationEvent,
    sessionId: string | undefined,
  ): void {
    if (!sessionId || !isPairableImEvent(event)) return;
    const displayName = event.displayName ?? event.from;
    const pending = this.pendingOutboundBySession.get(sessionId) ?? [];
    pending.push({
      channel: event.channel,
      eventId: event.id,
      sessionId,
      target: {
        externalChatId: event.externalChatId,
        ...(event.metadata ? { metadata: event.metadata } : {}),
        ...(displayName ? { displayName } : {}),
      },
    });
    this.pendingOutboundBySession.set(sessionId, pending);
  }

  private shiftPendingOutbound(
    sessionId: string,
  ): PendingOutboundTarget | null {
    const pending = this.pendingOutboundBySession.get(sessionId);
    if (!pending || pending.length === 0) return null;
    const next = pending.shift() ?? null;
    if (pending.length === 0) this.pendingOutboundBySession.delete(sessionId);
    return next;
  }

  private async publishOutboundDelivery(
    pending: PendingOutboundTarget,
    event: RoomEvent,
    text: string,
    result: OutboundDeliveryResult,
  ): Promise<void> {
    await this.options.router.publishOutbound(
      {
        id: result.id,
        channel: pending.channel,
        direction: "outbound",
        externalChatId: pending.target.externalChatId,
        deliveryId: result.id,
        summary: `Sent ${pending.channel} reply`,
        bodyText: text,
        to: pending.target.displayName,
        receivedAt: result.sentAt,
        metadata: {
          ...result.metadata,
          deliveryStatus: result.status,
          replyToEventId: pending.eventId,
          replyToTimelineItemId: String(event.seq),
        },
      },
      { sessionId: pending.sessionId },
    );
  }

  private async publishOutboundFailure(
    pending: PendingOutboundTarget,
    event: RoomEvent,
    text: string,
    error: unknown,
  ): Promise<void> {
    await this.options.router.publishOutbound(
      {
        id: `outbound-failed:${pending.channel}:${event.seq}`,
        channel: pending.channel,
        direction: "outbound",
        externalChatId: pending.target.externalChatId,
        summary: `Failed to send ${pending.channel} reply`,
        bodyText: text,
        to: pending.target.displayName,
        receivedAt: event.ts || Date.now(),
        metadata: {
          deliveryStatus: "failed",
          error: errorMessage(error),
          replyToEventId: pending.eventId,
          replyToTimelineItemId: String(event.seq),
        },
      },
      { sessionId: pending.sessionId },
    );
  }

  private async publishOutboundFailureSafely(
    pending: PendingOutboundTarget,
    event: RoomEvent,
    text: string,
    error: unknown,
  ): Promise<void> {
    try {
      await this.publishOutboundFailure(pending, event, text, error);
    } catch (publishError) {
      await this.publishRoomEventFailure(pending.channel, publishError).catch(
        () => {},
      );
    }
  }
}

function sanitizeStartupError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/secret-[^\s,;"]+/gi, "[redacted]");
}

interface PendingOutboundTarget {
  channel: "wechat" | "feishu";
  eventId: string;
  sessionId: string;
  target: OutboundImTarget;
}

function isPairableImEvent(
  event: IntegrationEvent,
): event is IntegrationEvent & {
  channel: "wechat" | "feishu";
  externalChatId: string;
} {
  return (
    (event.channel === "wechat" || event.channel === "feishu") &&
    event.direction === "inbound" &&
    typeof event.externalChatId === "string" &&
    event.externalChatId.trim().length > 0
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function firstConfiguredChannel(
  connectors: Partial<Record<IntegrationChannel, ImConnector>> | undefined,
): IntegrationChannel {
  return (
    (Object.keys(connectors ?? {})[0] as IntegrationChannel | undefined) ??
    "relay"
  );
}
