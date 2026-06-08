import { expect, test } from "bun:test";
import type { MailboxItem, PairingBinding } from "../../shared/integrations";
import { IntegrationManager } from "./manager";
import { IntegrationRouter } from "./router";
import type { IntegrationRouterEvent } from "./types";
import { FakeWeChatConnector } from "./wechat-fake";
import type {
  ImConnectorEvent,
  OutboundDeliveryResult,
  OutboundImTarget,
  PairingQrState,
} from "./wechat-types";

function activeBinding(): PairingBinding {
  return {
    id: "binding-1",
    channel: "wechat",
    status: "active",
    externalChatId: "wx-room-1",
    sessionId: "paired-session",
    forwardingEnabled: true,
    boundAt: 1_717_451_000_000,
  };
}

function createRouterHarness(binding: PairingBinding | null = activeBinding()) {
  const inboxItems: MailboxItem[] = [];
  const published: IntegrationRouterEvent[] = [];
  const forwarded: Array<{ sessionId: string; text: string }> = [];

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
      append() {},
    },
    sessions: {
      createSubscriptionSession() {},
      forwardToRuntime(sessionId, text) {
        forwarded.push({ sessionId, text });
        return true;
      },
    },
    publish(event) {
      published.push(event);
    },
  });

  return { forwarded, inboxItems, published, router };
}

test("fake connector emits QR, scan confirmation, inbound messages, outbound ack, and expiry", async () => {
  const connector = new FakeWeChatConnector({ now: () => 1_717_452_000_000 });
  const observed = connector.observedEvents;

  const qr = await connector.startPairing("s1");
  await connector.confirmScan("s1", {
    externalChatId: "wx-room-1",
    displayName: "我的工作号",
  });
  await connector.emitInbound({
    externalChatId: "wx-room-1",
    text: "手机上发来的任务",
    from: "我的工作号",
  });
  const delivery = await connector.sendMessage(
    { externalChatId: "wx-room-1", displayName: "我的工作号" },
    "agent reply",
  );
  await connector.expirePairing("s1");

  expect(qr).toMatchObject({
    channel: "wechat",
    sessionId: "s1",
    status: "pending",
  });
  expect(delivery).toMatchObject({
    channel: "wechat",
    externalChatId: "wx-room-1",
    status: "delivered",
  });
  expect(observed.map((event) => event.type)).toEqual([
    "pairing.qr",
    "pairing.scanned",
    "message",
    "outbound.ack",
    "pairing.expired",
  ]);
});

test("IntegrationManager routes fake WeChat inbound messages through the router", async () => {
  const connector = new FakeWeChatConnector({ now: () => 1_717_452_000_000 });
  const harness = createRouterHarness();
  const manager = new IntegrationManager({
    currentSessionId: () => "selected-session",
    imConnectors: { wechat: connector },
    router: harness.router,
  });

  manager.start();
  await connector.emitInbound({
    externalChatId: "wx-room-1",
    text: "请帮我看 CI",
    from: "我的工作号",
  });

  expect(harness.inboxItems).toHaveLength(1);
  expect(harness.forwarded).toEqual([
    { sessionId: "paired-session", text: "请帮我看 CI" },
  ]);
  expect(harness.published).toContainEqual(
    expect.objectContaining({
      sessionId: "paired-session",
      type: "integration.event.received",
      payload: expect.objectContaining({
        channel: "wechat",
        externalChatId: "wx-room-1",
        bodyText: "请帮我看 CI",
      }),
    }),
  );
});

test("IntegrationManager publishes connector status as integration.status", async () => {
  const connector = new FakeWeChatConnector({ now: () => 1_717_452_000_000 });
  const harness = createRouterHarness();
  const manager = new IntegrationManager({
    currentSessionId: () => "selected-session",
    imConnectors: { wechat: connector },
    router: harness.router,
  });

  manager.start();
  await connector.emitStatus("error", "host crashed");

  expect(harness.published).toContainEqual({
    sessionId: "selected-session",
    type: "integration.status",
    payload: {
      status: expect.objectContaining({
        channel: "wechat",
        state: "error",
        error: "host crashed",
      }),
    },
    ts: 1_717_452_000_000,
  });
});

test("IntegrationManager publishes startup failure when connector rejects before status", async () => {
  const harness = createRouterHarness();
  const manager = new IntegrationManager({
    currentSessionId: () => "selected-session",
    imConnectors: {
      feishu: new RejectingConnector("keychain locked: secret-should-not-leak"),
    },
    router: harness.router,
  });

  manager.start();
  await waitFor(() => harness.published.length > 0);

  expect(harness.published).toContainEqual({
    sessionId: "selected-session",
    type: "integration.status",
    payload: {
      status: expect.objectContaining({
        channel: "feishu",
        state: "error",
        error: "keychain locked: [redacted]",
        metadata: {
          code: "connector-startup-failed",
        },
      }),
    },
    ts: expect.any(Number),
  });
});

test("IntegrationManager ignores startup rejection after manager stop", async () => {
  const harness = createRouterHarness();
  const connector = new ControllableStartConnector();
  const manager = new IntegrationManager({
    currentSessionId: () => "selected-session",
    imConnectors: { feishu: connector },
    router: harness.router,
  });

  manager.start();
  manager.stop();
  connector.reject(new Error("startup cancelled"));
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(harness.published).toEqual([]);
});

class RejectingConnector {
  constructor(private readonly message: string) {}

  async start(): Promise<void> {
    throw new Error(this.message);
  }

  async startPairing(): Promise<PairingQrState> {
    throw new Error("unused");
  }

  async stopPairing(): Promise<void> {}

  async sendMessage(
    _target: OutboundImTarget,
    _text: string,
  ): Promise<OutboundDeliveryResult> {
    throw new Error("unused");
  }

  onEvent(_handler: (event: ImConnectorEvent) => void | Promise<void>) {
    return () => {};
  }
}

class ControllableStartConnector extends RejectingConnector {
  private rejectStart: ((error: Error) => void) | null = null;

  constructor() {
    super("unused");
  }

  override async start(): Promise<void> {
    return new Promise((_, reject) => {
      this.rejectStart = reject;
    });
  }

  reject(error: Error): void {
    this.rejectStart?.(error);
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
