import { expect, test } from "bun:test";
import type { MailboxItem, PairingBinding } from "../../shared/integrations";
import { FakeFeishuConnector } from "./feishu-fake";
import { IntegrationManager } from "./manager";
import { IntegrationRouter } from "./router";
import type { IntegrationRouterEvent } from "./types";

function activeBinding(): PairingBinding {
  return {
    id: "binding-1",
    channel: "feishu",
    status: "active",
    externalChatId: "oc_group_1",
    sessionId: "paired-session",
    forwardingEnabled: true,
    boundAt: 1_717_451_000_000,
    metadata: {
      chatType: "group",
    },
  };
}

function createRouterHarness(binding: PairingBinding | null = activeBinding()) {
  const inboxItems: MailboxItem[] = [];
  const published: IntegrationRouterEvent[] = [];
  const forwarded: Array<{ sessionId: string; text: string }> = [];
  const pairingLookups: Array<{ channel: string; externalChatId: string }> = [];

  const router = new IntegrationRouter({
    pairingBindings: {
      getByExternalKey(channel, externalChatId) {
        pairingLookups.push({ channel, externalChatId });
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

  return { forwarded, inboxItems, pairingLookups, published, router };
}

test("fake connector emits p2p pairing and inbound Feishu metadata without raw secrets", async () => {
  const connector = new FakeFeishuConnector({
    now: () => 1_717_452_000_000,
  });

  const qr = await connector.startPairing("s1");
  await connector.confirmScan("s1", {
    chatId: "oc_p2p_1",
    senderId: "ou_user_1",
    chatType: "p2p",
    displayName: "Lark DM",
  });
  await connector.emitInbound({
    messageId: "om_msg_1",
    chatId: "oc_p2p_1",
    senderId: "ou_user_1",
    chatType: "p2p",
    text: "请检查 CI",
    displayName: "Lark DM",
  });

  expect(qr).toMatchObject({
    channel: "feishu",
    sessionId: "s1",
    status: "pending",
    url: "fake-feishu://pair/s1",
  });
  expect(connector.observedEvents).toContainEqual(
    expect.objectContaining({
      type: "pairing.scanned",
      channel: "feishu",
      sessionId: "s1",
      externalChatId: "oc_p2p_1",
      externalUserId: "ou_user_1",
      displayName: "Lark DM",
    }),
  );
  expect(connector.observedEvents.at(-1)).toMatchObject({
    type: "message",
    event: {
      id: "om_msg_1",
      channel: "feishu",
      direction: "inbound",
      externalChatId: "oc_p2p_1",
      deliveryId: "om_msg_1",
      bodyText: "请检查 CI",
      from: "ou_user_1",
      displayName: "Lark DM",
      metadata: {
        messageId: "om_msg_1",
        chatId: "oc_p2p_1",
        senderId: "ou_user_1",
        chatType: "p2p",
      },
    },
  });
  expect(JSON.stringify(connector.observedEvents)).not.toContain("token");
});

test("fake connector emits group messages and correlates replies to the remembered inbound event", async () => {
  const connector = new FakeFeishuConnector({
    now: () => 1_717_452_000_000,
  });

  await connector.confirmScan("s1", {
    chatId: "oc_group_1",
    senderId: "ou_user_2",
    chatType: "group",
    displayName: "工程群",
  });
  await connector.emitInbound({
    messageId: "om_group_msg_1",
    chatId: "oc_group_1",
    senderId: "ou_user_2",
    chatType: "group",
    text: "群里来的任务",
    displayName: "工程群",
  });
  const delivery = await connector.sendMessage(
    { externalChatId: "oc_group_1", displayName: "工程群" },
    "agent reply",
  );

  expect(connector.observedEvents.at(-2)).toMatchObject({
    type: "message",
    event: {
      channel: "feishu",
      externalChatId: "oc_group_1",
      from: "ou_user_2",
      metadata: {
        messageId: "om_group_msg_1",
        chatId: "oc_group_1",
        senderId: "ou_user_2",
        chatType: "group",
      },
    },
  });
  expect(delivery).toMatchObject({
    channel: "feishu",
    externalChatId: "oc_group_1",
    status: "delivered",
    metadata: {
      displayName: "工程群",
      textLength: "agent reply".length,
      replyToMessageId: "om_group_msg_1",
      replyToChatId: "oc_group_1",
      replyToSenderId: "ou_user_2",
      chatType: "group",
    },
  });
  expect(connector.observedEvents.at(-1)).toEqual({
    type: "outbound.ack",
    result: delivery,
  });
});

test("IntegrationManager routes fake Feishu inbound messages through paired sessions", async () => {
  const connector = new FakeFeishuConnector({
    now: () => 1_717_452_000_000,
  });
  const harness = createRouterHarness();
  const manager = new IntegrationManager({
    currentSessionId: () => "selected-session",
    imConnectors: { feishu: connector },
    router: harness.router,
  });

  manager.start();
  await connector.emitInbound({
    messageId: "om_group_msg_1",
    chatId: "oc_group_1",
    senderId: "ou_user_2",
    chatType: "group",
    text: "请帮我看飞书任务",
    displayName: "工程群",
  });

  expect(harness.pairingLookups).toEqual([
    { channel: "feishu", externalChatId: "oc_group_1" },
  ]);
  expect(harness.inboxItems).toHaveLength(1);
  expect(harness.forwarded).toEqual([
    { sessionId: "paired-session", text: "请帮我看飞书任务" },
  ]);
  expect(harness.published).toContainEqual(
    expect.objectContaining({
      sessionId: "paired-session",
      type: "integration.event.received",
      payload: expect.objectContaining({
        id: "om_group_msg_1",
        channel: "feishu",
        externalChatId: "oc_group_1",
        bodyText: "请帮我看飞书任务",
        metadata: {
          messageId: "om_group_msg_1",
          chatId: "oc_group_1",
          senderId: "ou_user_2",
          chatType: "group",
        },
      }),
    }),
  );
});
