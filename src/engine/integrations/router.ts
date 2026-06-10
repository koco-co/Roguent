import type {
  IntegrationChannel,
  IntegrationConnectorStatus,
  MailboxItem,
  NormalizedIntegrationEvent,
  PairingBinding,
} from "../../shared/integrations";
import type {
  IntegrationEvent,
  IntegrationRouteOptions,
  IntegrationRouteResult,
  IntegrationRouterDependencies,
} from "./types";

const SUBSCRIPTION_CHANNELS = new Set<IntegrationChannel>(["github", "x"]);
const PAIRABLE_CHANNELS = new Set<IntegrationChannel>([
  "wechat",
  "feishu",
  "relay",
]);

export class IntegrationRouter {
  constructor(private readonly deps: IntegrationRouterDependencies) {}

  async publishStatus(
    status: IntegrationConnectorStatus,
    options: IntegrationRouteOptions = {},
  ): Promise<void> {
    await this.deps.publish({
      sessionId: options.currentSessionId?.trim() || "integrations",
      type: "integration.status",
      payload: { status },
      ts: status.lastEventAt ?? Date.now(),
    });
  }

  async route(
    event: IntegrationEvent,
    options: IntegrationRouteOptions = {},
  ): Promise<IntegrationRouteResult> {
    const target = await this.resolveRouteTarget(event, options);
    const initialSessionId = target.sessionId;
    const inboxItem = this.createInboxItem(event, initialSessionId);

    if (target.auditOnly) {
      await this.appendReceivedAudit(event, initialSessionId);
      return { inboxItem, sessionId: undefined, createdSession: false };
    }

    await this.deps.inbox.create(inboxItem);
    await this.appendReceivedAudit(event, initialSessionId);

    const { sessionId, createdSession } = await this.ensureRouteSession(
      event,
      initialSessionId,
      inboxItem.id,
    );

    const routedInboxItem =
      sessionId && initialSessionId === undefined
        ? { ...inboxItem, sessionId }
        : inboxItem;

    let forwardedToRuntime = false;
    if (sessionId) {
      const publishedItem =
        initialSessionId === undefined ? routedInboxItem : inboxItem;
      await this.deps.publish({
        sessionId,
        type: "mailbox.item.created",
        payload: { item: publishedItem },
        ts: event.receivedAt,
      });
      await this.deps.publish({
        sessionId,
        type: "integration.event.received",
        payload: this.normalizeEvent(event),
        ts: event.receivedAt,
      });
      if (event.direction === "inbound") {
        forwardedToRuntime = await this.deps.sessions.forwardToRuntime(
          sessionId,
          this.forwardedText(event),
        );
      }
    }

    return {
      inboxItem: routedInboxItem,
      sessionId,
      createdSession,
      forwardedToRuntime,
    };
  }

  async publishOutbound(
    event: IntegrationEvent,
    options: { sessionId: string },
  ): Promise<void> {
    await this.deps.audit.append({
      source: `integration.${event.channel}`,
      action: "integration.event.outbound",
      sessionId: options.sessionId,
      deliveryId: event.deliveryId,
      payload: this.auditPayload(event),
      summary: event.summary,
      createdAt: event.receivedAt,
    });
    await this.deps.publish({
      sessionId: options.sessionId,
      type: "integration.event.received",
      payload: this.normalizeEvent(event),
      ts: event.receivedAt,
    });
  }

  private async resolveRouteTarget(
    event: IntegrationEvent,
    options: IntegrationRouteOptions,
  ): Promise<{ sessionId?: string; auditOnly: boolean }> {
    if (isPairableEvent(event)) {
      const binding = await this.deps.pairingBindings.getByExternalKey(
        event.channel,
        event.externalChatId,
      );
      if (isForwardingBinding(binding)) {
        return { sessionId: binding.sessionId, auditOnly: false };
      }
      if (binding) return { auditOnly: true };
    }

    if (SUBSCRIPTION_CHANNELS.has(event.channel)) {
      return {
        sessionId: options.currentSessionId?.trim() || undefined,
        auditOnly: false,
      };
    }

    return { auditOnly: false };
  }

  private async ensureRouteSession(
    event: IntegrationEvent,
    sessionId: string | undefined,
    inboxItemId: string,
  ): Promise<{ sessionId?: string; createdSession: boolean }> {
    if (sessionId || !SUBSCRIPTION_CHANNELS.has(event.channel)) {
      return { sessionId, createdSession: false };
    }

    const id = subscriptionSessionId(event);
    await this.deps.sessions.createSubscriptionSession({
      id,
      title: subscriptionSessionTitle(event),
      source: "integration.subscription",
    });
    await this.deps.inbox.assignSession(inboxItemId, id);
    return { sessionId: id, createdSession: true };
  }

  private createInboxItem(
    event: IntegrationEvent,
    sessionId: string | undefined,
  ): MailboxItem {
    return {
      id: inboxItemId(event),
      source: event.channel,
      title: event.summary,
      summary: event.bodyText || event.summary,
      ts: event.receivedAt,
      status: "unread",
      kind: SUBSCRIPTION_CHANNELS.has(event.channel) ? "event" : "message",
      priority: "normal",
      channel: event.channel,
      sessionId,
      relatedEventId: event.id,
      metadata: {
        board: SUBSCRIPTION_CHANNELS.has(event.channel),
        deliveryId: event.deliveryId,
        ...sourceUrlMetadata(event.metadata),
      },
    };
  }

  private auditPayload(event: IntegrationEvent) {
    return {
      id: event.id,
      channel: event.channel,
      direction: event.direction,
      externalChatId: event.externalChatId,
      receivedAt: event.receivedAt,
    };
  }

  private async appendReceivedAudit(
    event: IntegrationEvent,
    sessionId: string | undefined,
  ): Promise<void> {
    await this.deps.audit.append({
      source: `integration.${event.channel}`,
      action: "integration.event.received",
      sessionId,
      deliveryId: event.deliveryId,
      payload: this.auditPayload(event),
      summary: event.summary,
      createdAt: event.receivedAt,
    });
  }

  private normalizeEvent(event: IntegrationEvent): NormalizedIntegrationEvent {
    return {
      id: event.id,
      channel: event.channel,
      direction: event.direction,
      summary: event.summary,
      receivedAt: event.receivedAt,
      externalChatId: event.externalChatId,
      deliveryId: event.deliveryId,
      bodyText: event.bodyText,
      from: event.from,
      displayName: event.displayName,
      metadata: event.metadata,
      ts: event.receivedAt,
    };
  }

  private forwardedText(event: IntegrationEvent): string {
    if (SUBSCRIPTION_CHANNELS.has(event.channel)) {
      return event.bodyText
        ? `[${event.channel}] ${event.summary}\n\n${event.bodyText}`
        : `[${event.channel}] ${event.summary}`;
    }
    return event.bodyText || event.summary;
  }
}

function isPairableEvent(
  event: IntegrationEvent,
): event is IntegrationEvent & { externalChatId: string } {
  return (
    PAIRABLE_CHANNELS.has(event.channel) &&
    typeof event.externalChatId === "string" &&
    event.externalChatId.trim().length > 0
  );
}

function isForwardingBinding(
  binding: PairingBinding | null | undefined,
): binding is PairingBinding {
  return (
    binding?.status === "active" &&
    binding.forwardingEnabled &&
    binding.sessionId.trim().length > 0
  );
}

function sourceUrlMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, string> {
  const sourceUrl = stringMetadata(metadata, "sourceUrl");
  const url = stringMetadata(metadata, "url");
  return {
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(url && url !== sourceUrl ? { url } : {}),
  };
}

function stringMetadata(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function inboxItemId(event: IntegrationEvent): string {
  return `inbox:${event.id}`;
}

function subscriptionSessionId(event: IntegrationEvent): string {
  return `integration-${event.channel}-${slug(event.id)}`;
}

function subscriptionSessionTitle(event: IntegrationEvent): string {
  return `${channelLabel(event.channel)} · ${event.summary}`;
}

function channelLabel(channel: IntegrationChannel): string {
  if (channel === "github") return "GitHub";
  if (channel === "x") return "X";
  return channel;
}

function slug(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "event";
}
