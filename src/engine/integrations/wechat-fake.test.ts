import { expect, test } from "bun:test";
import type { MailboxItem, PairingBinding } from "../../shared/integrations";
import { IntegrationManager } from "./manager";
import { IntegrationRouter } from "./router";
import type { IntegrationRouterEvent } from "./types";
import { FakeWeChatConnector } from "./wechat-fake";

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
