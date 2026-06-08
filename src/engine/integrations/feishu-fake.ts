import type {
  FakeFeishuConnectorOptions,
  FakeFeishuInboundMessage,
  FakeFeishuScanConfirmation,
  FeishuMessageMeta,
  FeishuOutboundCorrelationMeta,
} from "./feishu-types";
import type {
  ImConnector,
  ImConnectorEvent,
  OutboundDeliveryResult,
  OutboundImTarget,
  PairingQrState,
} from "./wechat-types";

export class FakeFeishuConnector implements ImConnector {
  readonly observedEvents: ImConnectorEvent[] = [];

  private readonly handlers = new Set<
    (event: ImConnectorEvent) => void | Promise<void>
  >();
  private readonly lastInboundByChat = new Map<string, FeishuMessageMeta>();
  private readonly now: () => number;
  private counter = 0;
  private pairings = new Map<string, PairingQrState>();

  constructor(options: FakeFeishuConnectorOptions = {}) {
    this.now = options.now ?? Date.now;
  }

  async startPairing(sessionId: string): Promise<PairingQrState> {
    const now = this.now();
    const qr: PairingQrState = {
      id: `feishu-qr-${slug(sessionId)}-${++this.counter}`,
      channel: "feishu",
      sessionId,
      status: "pending",
      url: `fake-feishu://pair/${encodeURIComponent(sessionId)}`,
      expiresAt: now + 180_000,
    };
    this.pairings.set(sessionId, qr);
    await this.emit({ type: "pairing.qr", qr });
    return qr;
  }

  async stopPairing(sessionId: string): Promise<void> {
    this.pairings.delete(sessionId);
  }

  async confirmScan(
    sessionId: string,
    confirmation: FakeFeishuScanConfirmation,
  ): Promise<void> {
    const current = this.pairings.get(sessionId);
    if (current) {
      this.pairings.set(sessionId, { ...current, status: "scanned" });
    }
    await this.emit({
      type: "pairing.scanned",
      channel: "feishu",
      sessionId,
      externalChatId: confirmation.chatId,
      externalUserId: confirmation.senderId,
      displayName: confirmation.displayName,
      scannedAt: this.now(),
    });
  }

  async expirePairing(sessionId: string): Promise<void> {
    const current = this.pairings.get(sessionId);
    if (!current) return;
    const expired: PairingQrState = {
      ...current,
      status: "expired",
      expiresAt: this.now(),
    };
    this.pairings.set(sessionId, expired);
    await this.emit({ type: "pairing.expired", qr: expired });
  }

  async emitInbound(message: FakeFeishuInboundMessage): Promise<void> {
    const receivedAt = this.now();
    const metadata = toMessageMeta(message);
    this.lastInboundByChat.set(message.chatId, metadata);
    await this.emit({
      type: "message",
      event: {
        id: message.messageId,
        channel: "feishu",
        direction: "inbound",
        externalChatId: message.chatId,
        deliveryId: message.messageId,
        summary: message.text,
        bodyText: message.text,
        from: message.senderId,
        displayName: message.displayName,
        metadata: { ...metadata },
        receivedAt,
      },
    });
  }

  async emitStatus(
    state: "connecting" | "connected" | "disconnected" | "degraded" | "error",
    error?: string,
  ): Promise<void> {
    await this.emit({
      type: "status",
      status: {
        id: "fake-feishu",
        channel: "feishu",
        state,
        label: "Fake Feishu",
        error,
        lastEventAt: this.now(),
      },
    });
  }

  async sendMessage(
    target: OutboundImTarget,
    text: string,
  ): Promise<OutboundDeliveryResult> {
    const sentAt = this.now();
    const inbound = this.lastInboundByChat.get(target.externalChatId);
    const metadata: FeishuOutboundCorrelationMeta = {
      displayName: target.displayName,
      textLength: text.length,
      ...(inbound
        ? {
            replyToMessageId: inbound.messageId,
            replyToChatId: inbound.chatId,
            replyToSenderId: inbound.senderId,
            chatType: inbound.chatType,
          }
        : {}),
    };
    const result: OutboundDeliveryResult = {
      id: `feishu-outbound-${++this.counter}`,
      channel: "feishu",
      externalChatId: target.externalChatId,
      status: "delivered",
      sentAt,
      metadata: { ...metadata },
    };
    await this.emit({ type: "outbound.ack", result });
    return result;
  }

  onEvent(
    handler: (event: ImConnectorEvent) => void | Promise<void>,
  ): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private async emit(event: ImConnectorEvent): Promise<void> {
    this.observedEvents.push(event);
    for (const handler of this.handlers) {
      await handler(event);
    }
  }
}

function toMessageMeta(message: FakeFeishuInboundMessage): FeishuMessageMeta {
  return {
    messageId: message.messageId,
    chatId: message.chatId,
    senderId: message.senderId,
    chatType: message.chatType,
  };
}

function slug(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "session";
}
