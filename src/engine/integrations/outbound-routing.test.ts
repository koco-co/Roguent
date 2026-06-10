import { expect, test } from "bun:test";
import type { RoomEvent } from "../../shared/events";
import type { MailboxItem, PairingBinding } from "../../shared/integrations";
import { IntegrationManager } from "./manager";
import { IntegrationRouter } from "./router";
import type { IntegrationEvent, IntegrationRouterEvent } from "./types";
import type {
  ImConnectorEvent,
  OutboundDeliveryResult,
  OutboundImTarget,
  PairingQrState,
} from "./wechat-types";

function activeBinding(
  overrides: Partial<PairingBinding> = {},
): PairingBinding {
  return {
    id: "binding-1",
    channel: "wechat",
    status: "active",
    externalChatId: "chat-1",
    sessionId: "s1",
    forwardingEnabled: true,
    boundAt: 1_717_451_000_000,
    ...overrides,
  };
}

function assistantFinal(overrides: Partial<RoomEvent> = {}): RoomEvent {
  return {
    seq: 7,
    ts: 1_717_452_000_200,
    sessionId: "s1",
    type: "message.final",
    payload: { text: "tests fixed" },
    ...overrides,
  };
}

function createHarness(
  binding: PairingBinding | null = activeBinding(),
  options: {
    failFirstOutboundPublish?: boolean;
    failRoute?: boolean;
    forwardToRuntimeResult?: boolean;
  } = {},
) {
  const connector = new RecordingConnector("wechat");
  const inboxItems: MailboxItem[] = [];
  const auditRecords: unknown[] = [];
  const published: IntegrationRouterEvent[] = [];
  const forwarded: Array<{ sessionId: string; text: string }> = [];
  let failedOutboundPublishes = 0;

  const router = new IntegrationRouter({
    pairingBindings: {
      getByExternalKey() {
        return binding;
      },
    },
    inbox: {
      create(item) {
        inboxItems.push(item);
      },
      assignSession() {},
    },
    audit: {
      append(input) {
        auditRecords.push(input);
      },
    },
    sessions: {
      createSubscriptionSession() {},
      forwardToRuntime(sessionId, text) {
        if (options.failRoute) throw new Error("db unavailable");
        forwarded.push({ sessionId, text });
        return options.forwardToRuntimeResult ?? true;
      },
    },
    publish(event) {
      if (
        options.failFirstOutboundPublish &&
        failedOutboundPublishes === 0 &&
        event.type === "integration.event.received" &&
        event.payload.direction === "outbound"
      ) {
        failedOutboundPublishes += 1;
        throw new Error("publish unavailable");
      }
      published.push(event);
    },
  });

  const manager = new IntegrationManager({
    currentSessionId: () => "s1",
    imConnectors: { wechat: connector },
    router,
  });
  manager.start();

  return { auditRecords, connector, forwarded, inboxItems, manager, published };
}

test("assistant reply is sent back to paired IM chat", async () => {
  const harness = createHarness();

  await harness.connector.emitInbound({
    id: "im-1",
    externalChatId: "chat-1",
    text: "fix tests",
  });
  await harness.manager.handleRoomEvent(assistantFinal());

  expect(harness.forwarded).toEqual([{ sessionId: "s1", text: "fix tests" }]);
  expect(harness.connector.sent).toEqual([
    { target: { externalChatId: "chat-1" }, text: "tests fixed" },
  ]);
  expect(harness.published).toContainEqual(
    expect.objectContaining({
      sessionId: "s1",
      type: "integration.event.received",
      payload: expect.objectContaining({
        channel: "wechat",
        direction: "outbound",
        externalChatId: "chat-1",
        bodyText: "tests fixed",
        metadata: expect.objectContaining({
          deliveryStatus: "delivered",
          replyToEventId: "im-1",
          replyToTimelineItemId: "7",
        }),
      }),
    }),
  );
});

test("assistant replies consume inbound IM targets in turn order", async () => {
  const harness = createHarness();

  await harness.connector.emitInbound({
    id: "im-1",
    externalChatId: "chat-1",
    text: "first turn",
  });
  await harness.connector.emitInbound({
    id: "im-2",
    externalChatId: "chat-2",
    text: "second turn",
  });
  await harness.manager.handleRoomEvent(
    assistantFinal({ seq: 8, payload: { text: "first reply" } }),
  );
  await harness.manager.handleRoomEvent(
    assistantFinal({ seq: 9, payload: { text: "second reply" } }),
  );

  expect(harness.connector.sent).toEqual([
    { target: { externalChatId: "chat-1" }, text: "first reply" },
    { target: { externalChatId: "chat-2" }, text: "second reply" },
  ]);
  expect(
    harness.published
      .filter((event) => event.type === "integration.event.received")
      .map((event) => event.payload)
      .filter((payload) => payload.direction === "outbound")
      .map((payload) => payload.metadata?.replyToEventId),
  ).toEqual(["im-1", "im-2"]);
});

test("forwarding disabled records inbound audit but does not send outbound reply", async () => {
  const harness = createHarness(
    activeBinding({ forwardingEnabled: false, sessionId: "s1" }),
  );

  await harness.connector.emitInbound({
    id: "im-disabled",
    externalChatId: "chat-1",
    text: "fix tests",
  });
  await harness.manager.handleRoomEvent(assistantFinal());

  expect(harness.forwarded).toEqual([]);
  expect(harness.inboxItems).toEqual([]);
  expect(harness.connector.sent).toEqual([]);
  expect(harness.auditRecords).toContainEqual(
    expect.objectContaining({
      action: "integration.event.received",
      deliveryId: "im-disabled",
    }),
  );
});

test("inbound target is not queued when runtime forward is not accepted", async () => {
  const harness = createHarness(activeBinding(), {
    forwardToRuntimeResult: false,
  });

  await harness.connector.emitInbound({
    id: "im-stale",
    externalChatId: "chat-1",
    text: "fix tests",
  });
  await harness.manager.handleRoomEvent(assistantFinal());

  expect(harness.forwarded).toEqual([{ sessionId: "s1", text: "fix tests" }]);
  expect(harness.connector.sent).toEqual([]);
});

test("connector event handler failures are contained and reported as status", async () => {
  const harness = createHarness(activeBinding(), { failRoute: true });

  await expect(
    harness.connector.emitInbound({
      id: "im-route-fail",
      externalChatId: "chat-1",
      text: "fix tests",
    }),
  ).resolves.toBeUndefined();
  await waitFor(() =>
    harness.published.some(
      (event) =>
        event.type === "integration.status" &&
        event.payload.status.metadata?.code ===
          "connector-event-handler-failed",
    ),
  );

  expect(harness.connector.sent).toEqual([]);
});

test("outbound connector failure publishes failed delivery without throwing", async () => {
  const harness = createHarness();
  harness.connector.failNextSend = new Error("network down");

  await harness.connector.emitInbound({
    id: "im-fail",
    externalChatId: "chat-1",
    text: "fix tests",
  });
  await expect(harness.manager.handleRoomEvent(assistantFinal())).resolves.toBe(
    undefined,
  );

  expect(harness.published).toContainEqual(
    expect.objectContaining({
      sessionId: "s1",
      type: "integration.event.received",
      payload: expect.objectContaining({
        direction: "outbound",
        metadata: expect.objectContaining({
          deliveryStatus: "failed",
          error: "network down",
          replyToEventId: "im-fail",
          replyToTimelineItemId: "7",
        }),
      }),
    }),
  );
});

test("outbound publish failure reports status and does not interrupt later replies", async () => {
  const harness = createHarness(activeBinding(), {
    failFirstOutboundPublish: true,
  });

  await harness.connector.emitInbound({
    id: "im-1",
    externalChatId: "chat-1",
    text: "first turn",
  });
  await harness.connector.emitInbound({
    id: "im-2",
    externalChatId: "chat-2",
    text: "second turn",
  });
  await expect(
    harness.manager.handleRoomEvent(
      assistantFinal({ seq: 8, payload: { text: "first reply" } }),
    ),
  ).resolves.toBeUndefined();
  await expect(
    harness.manager.handleRoomEvent(
      assistantFinal({ seq: 9, payload: { text: "second reply" } }),
    ),
  ).resolves.toBeUndefined();

  expect(harness.connector.sent).toEqual([
    { target: { externalChatId: "chat-1" }, text: "first reply" },
    { target: { externalChatId: "chat-2" }, text: "second reply" },
  ]);
  expect(harness.published).toContainEqual(
    expect.objectContaining({
      type: "integration.status",
      payload: expect.objectContaining({
        status: expect.objectContaining({
          channel: "wechat",
          metadata: { code: "outbound-room-event-failed" },
          state: "degraded",
        }),
      }),
    }),
  );
  expect(
    harness.published
      .filter((event) => event.type === "integration.event.received")
      .map((event) => event.payload)
      .filter((payload) => payload.direction === "outbound")
      .map((payload) => payload.metadata?.replyToEventId),
  ).toEqual(["im-2"]);
});

class RecordingConnector {
  readonly sent: Array<{ target: OutboundImTarget; text: string }> = [];
  failNextSend: Error | null = null;
  private readonly handlers = new Set<
    (event: ImConnectorEvent) => void | Promise<void>
  >();
  private counter = 0;

  constructor(private readonly channel: "wechat") {}

  async startPairing(sessionId: string): Promise<PairingQrState> {
    return {
      id: `qr-${sessionId}`,
      channel: this.channel,
      sessionId,
      status: "pending",
    };
  }

  async stopPairing(): Promise<void> {}

  async sendMessage(
    target: OutboundImTarget,
    text: string,
  ): Promise<OutboundDeliveryResult> {
    this.sent.push({ target, text });
    if (this.failNextSend) throw this.failNextSend;
    return {
      id: `outbound-${++this.counter}`,
      channel: this.channel,
      externalChatId: target.externalChatId,
      status: "delivered",
      sentAt: 1_717_452_000_300,
    };
  }

  onEvent(
    handler: (event: ImConnectorEvent) => void | Promise<void>,
  ): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async emitInbound(input: {
    id: string;
    externalChatId: string;
    text: string;
  }): Promise<void> {
    const event: IntegrationEvent = {
      id: input.id,
      channel: this.channel,
      direction: "inbound",
      externalChatId: input.externalChatId,
      deliveryId: input.id,
      summary: input.text,
      bodyText: input.text,
      receivedAt: 1_717_452_000_100,
    };
    for (const handler of this.handlers) {
      await handler({ type: "message", event });
    }
  }
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > 1000) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}
