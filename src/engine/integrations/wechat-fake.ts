import type {
  ImConnector,
  ImConnectorEvent,
  OutboundDeliveryResult,
  OutboundImTarget,
  PairingQrState,
} from "./wechat-types";

export interface FakeWeChatConnectorOptions {
  now?: () => number;
}

export interface FakeInboundMessage {
  externalChatId: string;
  text: string;
  from?: string;
  externalUserId?: string;
  deliveryId?: string;
}

export interface FakeScanConfirmation {
  externalChatId: string;
  externalUserId?: string;
  displayName?: string;
}

export class FakeWeChatConnector implements ImConnector {
  readonly observedEvents: ImConnectorEvent[] = [];

  private readonly handlers = new Set<
    (event: ImConnectorEvent) => void | Promise<void>
  >();
  private readonly now: () => number;
  private counter = 0;
  private pairings = new Map<string, PairingQrState>();

  constructor(options: FakeWeChatConnectorOptions = {}) {
    this.now = options.now ?? Date.now;
  }

  async startPairing(sessionId: string): Promise<PairingQrState> {
    const now = this.now();
    const qr: PairingQrState = {
      id: `wechat-qr-${slug(sessionId)}-${++this.counter}`,
      channel: "wechat",
      sessionId,
      status: "pending",
      url: `fake-wechat://pair/${encodeURIComponent(sessionId)}`,
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
    confirmation: FakeScanConfirmation,
  ): Promise<void> {
    const current = this.pairings.get(sessionId);
    if (current) {
      this.pairings.set(sessionId, { ...current, status: "scanned" });
    }
    await this.emit({
      type: "pairing.scanned",
      channel: "wechat",
      sessionId,
      externalChatId: confirmation.externalChatId,
      externalUserId: confirmation.externalUserId,
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

  async emitInbound(message: FakeInboundMessage): Promise<void> {
    const receivedAt = this.now();
    const id = message.deliveryId ?? `wechat-inbound-${++this.counter}`;
    await this.emit({
      type: "message",
      event: {
        id,
        channel: "wechat",
        direction: "inbound",
        externalChatId: message.externalChatId,
        deliveryId: id,
        summary: message.text,
        bodyText: message.text,
        receivedAt,
      },
    });
  }

  async sendMessage(
    target: OutboundImTarget,
    text: string,
  ): Promise<OutboundDeliveryResult> {
    const sentAt = this.now();
    const result: OutboundDeliveryResult = {
      id: `wechat-outbound-${++this.counter}`,
      channel: "wechat",
      externalChatId: target.externalChatId,
      status: "delivered",
      sentAt,
      metadata: {
        displayName: target.displayName,
        textLength: text.length,
      },
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

function slug(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "session";
}
