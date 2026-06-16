import { expect, test } from "bun:test";
import type { PairingBinding } from "../../shared/integrations";
import { IntegrationManager } from "./manager";
import { IntegrationRouter } from "./router";
import type { IntegrationRouterEvent } from "./types";
import { FakeWeChatConnector } from "./wechat-fake";

function fakeBinding(overrides: Partial<PairingBinding> = {}): PairingBinding {
  return {
    id: "binding:wechat:chat-9:s1",
    channel: "wechat",
    status: "active",
    externalChatId: "chat-9",
    sessionId: "s1",
    forwardingEnabled: true,
    boundAt: 1_717_451_000_000,
    ...overrides,
  };
}

function createHarness(
  options: { failBind?: boolean; failPublish?: boolean } = {},
) {
  const connector = new FakeWeChatConnector({ now: () => 1_717_451_000_000 });
  const published: IntegrationRouterEvent[] = [];
  const bindCalls: Array<{
    channel: string;
    sessionId: string;
    externalChatId: string;
    externalUserId?: string;
    displayName?: string;
  }> = [];

  const router = new IntegrationRouter({
    pairingBindings: { getByExternalKey: () => null },
    inbox: { create() {}, assignSession() {} },
    audit: { append() {} },
    sessions: {
      createSubscriptionSession() {},
      forwardToRuntime: () => true,
    },
    publish(event) {
      if (options.failPublish) throw new Error("publish unavailable");
      published.push(event);
    },
  });

  const manager = new IntegrationManager({
    currentSessionId: () => "s1",
    imConnectors: { wechat: connector },
    router,
    pairingBind: async (scanned) => {
      bindCalls.push(scanned);
      if (options.failBind) throw new Error("db unavailable");
      return fakeBinding({
        externalChatId: scanned.externalChatId,
        sessionId: scanned.sessionId,
        externalUserId: scanned.externalUserId,
        displayName: scanned.displayName,
      });
    },
  });
  manager.start();

  return { bindCalls, connector, manager, published };
}

test("startPairing drives connector and publishes pairing.qr.updated", async () => {
  const harness = createHarness();

  await harness.manager.startPairing("wechat", "s1");

  expect(harness.published).toContainEqual(
    expect.objectContaining({
      sessionId: "s1",
      type: "pairing.qr.updated",
      payload: expect.objectContaining({
        qr: expect.objectContaining({
          channel: "wechat",
          sessionId: "s1",
          status: "pending",
        }),
      }),
    }),
  );
});

test("connector scan publishes pairing.binding.updated created via pairingBind", async () => {
  const harness = createHarness();

  await harness.manager.startPairing("wechat", "s1");
  await harness.connector.confirmScan("s1", {
    externalChatId: "chat-9",
    externalUserId: "user-9",
    displayName: "Scanner",
  });

  expect(harness.bindCalls).toEqual([
    {
      channel: "wechat",
      sessionId: "s1",
      externalChatId: "chat-9",
      externalUserId: "user-9",
      displayName: "Scanner",
    },
  ]);
  expect(harness.published).toContainEqual(
    expect.objectContaining({
      sessionId: "s1",
      type: "pairing.binding.updated",
      payload: expect.objectContaining({
        action: "created",
        binding: expect.objectContaining({
          channel: "wechat",
          externalChatId: "chat-9",
          sessionId: "s1",
        }),
      }),
    }),
  );
});

test("expirePairing publishes pairing.qr.updated with expired status", async () => {
  const harness = createHarness();

  await harness.manager.startPairing("wechat", "s1");
  await harness.connector.expirePairing("s1");

  expect(harness.published).toContainEqual(
    expect.objectContaining({
      type: "pairing.qr.updated",
      payload: expect.objectContaining({
        qr: expect.objectContaining({ status: "expired", sessionId: "s1" }),
      }),
    }),
  );
});

test("cancelPairing stops connector pairing without throwing", async () => {
  const harness = createHarness();

  await harness.manager.startPairing("wechat", "s1");
  await expect(
    harness.manager.cancelPairing("wechat", "s1"),
  ).resolves.toBeUndefined();
});

test("startPairing on a missing channel publishes error status, never throws", async () => {
  const harness = createHarness();

  await expect(
    harness.manager.startPairing("feishu", "s1"),
  ).resolves.toBeUndefined();

  expect(harness.published).toContainEqual(
    expect.objectContaining({
      type: "integration.status",
      payload: expect.objectContaining({
        status: expect.objectContaining({
          channel: "feishu",
          state: "error",
        }),
      }),
    }),
  );
});

test("submitVerifyCode on a connector without the method publishes error status", async () => {
  const harness = createHarness();

  await harness.manager.startPairing("wechat", "s1");
  await expect(
    harness.manager.submitVerifyCode("wechat", "s1", "1234"),
  ).resolves.toBeUndefined();

  expect(harness.published).toContainEqual(
    expect.objectContaining({
      type: "integration.status",
      payload: expect.objectContaining({
        status: expect.objectContaining({
          channel: "wechat",
          state: "degraded",
        }),
      }),
    }),
  );
});

test("pairingBind failure is contained and reported as degraded status", async () => {
  const harness = createHarness({ failBind: true });

  await harness.manager.startPairing("wechat", "s1");
  await expect(
    harness.connector.confirmScan("s1", { externalChatId: "chat-9" }),
  ).resolves.toBeUndefined();

  expect(harness.published).toContainEqual(
    expect.objectContaining({
      type: "integration.status",
      payload: expect.objectContaining({
        status: expect.objectContaining({
          channel: "wechat",
          state: "degraded",
        }),
      }),
    }),
  );
});
