import { expect, test } from "bun:test";
import inboundFixture from "../../../fixtures/integrations/feishu-inbound.json";
import { MemorySecretStore } from "../secrets/memory-store";
import {
  FeishuConnector,
  FeishuConnectorError,
  type FeishuEventDispatcherLike,
  type FeishuMessageCreatePayload,
  type FeishuMessageEvent,
  type FeishuSdkFactory,
  normalizeFeishuMessage,
} from "./feishu";
import type { ImConnectorEvent } from "./wechat-types";

test("start emits configuration-required instead of fake success when credentials are missing", async () => {
  const sdk = new FakeFeishuSdkFactory();
  const connector = new FeishuConnector({
    config: {
      appIdSecretRef: "feishu:app-id",
      appSecretRef: "feishu:app-secret",
    },
    secretStore: new MemorySecretStore(),
    sdkFactory: sdk,
    now: () => 1_717_452_000_000,
  });

  await expect(connector.start()).rejects.toBeInstanceOf(FeishuConnectorError);

  expect(sdk.clients).toHaveLength(0);
  expect(connector.observedEvents).toContainEqual({
    type: "status",
    status: expect.objectContaining({
      channel: "feishu",
      state: "error",
      error: "Feishu app credentials are not configured",
      metadata: expect.objectContaining({
        code: "configuration-required",
      }),
    }),
  });
});

test("long connection receive normalizes inbound Feishu message without token metadata", async () => {
  const secretStore = await configuredSecrets();
  const sdk = new FakeFeishuSdkFactory();
  const observed: ImConnectorEvent[] = [];
  const connector = new FeishuConnector({
    config: {
      appIdSecretRef: "feishu:app-id",
      appSecretRef: "feishu:app-secret",
      botName: "Roguent Bot",
    },
    secretStore,
    sdkFactory: sdk,
    now: () => 1_717_452_000_000,
  });
  connector.onEvent((event) => {
    observed.push(event);
  });

  await connector.start();
  await sdk.dispatcher.dispatch({
    ...inboundFixture,
    token: "secret-token-that-must-not-leak",
  } as FeishuMessageEvent);

  expect(sdk.credentials).toEqual({
    appId: "cli_a",
    appSecret: "secret_a",
  });
  expect(observed).toContainEqual({
    type: "message",
    event: {
      id: "om_msg_1",
      channel: "feishu",
      direction: "inbound",
      externalChatId: "oc_group_1",
      deliveryId: "evt-feishu-1",
      summary: "请检查飞书长连接任务",
      bodyText: "请检查飞书长连接任务",
      from: "ou_user_1",
      displayName: "Roguent Bot",
      metadata: {
        messageId: "om_msg_1",
        chatId: "oc_group_1",
        senderId: "ou_user_1",
        chatType: "group",
      },
      receivedAt: 1_717_452_000_000,
    },
  });
  expect(JSON.stringify(observed)).not.toContain(
    "secret-token-that-must-not-leak",
  );
});

test("start rejects and does not emit connected when long connection never becomes ready", async () => {
  const secretStore = await configuredSecrets();
  const sdk = new FakeFeishuSdkFactory({ ready: false });
  const connector = new FeishuConnector({
    config: {
      appIdSecretRef: "feishu:app-id",
      appSecretRef: "feishu:app-secret",
    },
    secretStore,
    sdkFactory: sdk,
    readyTimeoutMs: 1,
    now: () => 1_717_452_000_000,
  });

  await expect(connector.start()).rejects.toMatchObject({
    code: "feishu-sdk-error",
  });

  expect(connector.observedEvents).toContainEqual({
    type: "status",
    status: expect.objectContaining({
      channel: "feishu",
      state: "error",
      error: "Feishu long connection did not become ready",
    }),
  });
  expect(connector.observedEvents).not.toContainEqual({
    type: "status",
    status: expect.objectContaining({
      channel: "feishu",
      state: "connected",
    }),
  });
});

test("post-ready SDK errors emit status and clear the active connection", async () => {
  const secretStore = await configuredSecrets();
  const sdk = new FakeFeishuSdkFactory();
  const connector = new FeishuConnector({
    config: {
      appIdSecretRef: "feishu:app-id",
      appSecretRef: "feishu:app-secret",
    },
    secretStore,
    sdkFactory: sdk,
    now: () => 1_717_452_000_000,
  });

  await connector.start();
  await sdk.emitError(new Error("entitlement revoked"));

  expect(connector.observedEvents).toContainEqual({
    type: "status",
    status: expect.objectContaining({
      channel: "feishu",
      state: "error",
      error: "entitlement revoked",
    }),
  });
  expect(sdk.wsClients.at(-1)?.closed).toBe(true);
});

test("concurrent starts share one pending long connection", async () => {
  const secretStore = await configuredSecrets();
  const sdk = new FakeFeishuSdkFactory({ autoReady: false });
  const connector = new FeishuConnector({
    config: {
      appIdSecretRef: "feishu:app-id",
      appSecretRef: "feishu:app-secret",
    },
    secretStore,
    sdkFactory: sdk,
    readyTimeoutMs: 100,
  });

  const first = connector.start();
  const second = connector.start();
  await waitFor(() => sdk.wsClients.length === 1);
  expect(sdk.wsClients).toHaveLength(1);

  sdk.ready();
  await Promise.all([first, second]);

  expect(connector.observedEvents.filter(isConnectedStatus)).toHaveLength(1);
});

test("stop while start is pending closes stale connection and prevents connected", async () => {
  const secretStore = await configuredSecrets();
  const sdk = new FakeFeishuSdkFactory({ autoReady: false });
  const connector = new FeishuConnector({
    config: {
      appIdSecretRef: "feishu:app-id",
      appSecretRef: "feishu:app-secret",
    },
    secretStore,
    sdkFactory: sdk,
    readyTimeoutMs: 100,
  });

  const start = connector.start();
  await waitFor(() => sdk.wsClients.length === 1);
  await connector.stop();
  sdk.ready();
  await expect(start).rejects.toMatchObject({ code: "feishu-sdk-error" });

  expect(sdk.wsClients.at(-1)?.closed).toBe(true);
  expect(connector.observedEvents.some(isConnectedStatus)).toBe(false);
});

test("sendMessage uses Feishu reply API shape and correlates with inbound event", async () => {
  const secretStore = await configuredSecrets();
  const sdk = new FakeFeishuSdkFactory();
  const connector = new FeishuConnector({
    config: {
      appIdSecretRef: "feishu:app-id",
      appSecretRef: "feishu:app-secret",
    },
    secretStore,
    sdkFactory: sdk,
    now: () => 1_717_452_000_000,
  });

  await connector.start();
  await sdk.dispatcher.dispatch(inboundFixture as FeishuMessageEvent);
  const result = await connector.sendMessage(
    { externalChatId: "oc_group_1", displayName: "工程群" },
    "agent reply",
  );

  expect(sdk.sentMessages).toEqual([
    {
      params: { receive_id_type: "chat_id" },
      data: {
        receive_id: "oc_group_1",
        msg_type: "text",
        content: JSON.stringify({ text: "agent reply" }),
      },
    },
  ]);
  expect(result).toMatchObject({
    id: "om_reply_1",
    channel: "feishu",
    externalChatId: "oc_group_1",
    status: "delivered",
    metadata: {
      displayName: "工程群",
      textLength: "agent reply".length,
      replyToMessageId: "om_msg_1",
      replyToChatId: "oc_group_1",
      replyToSenderId: "ou_user_1",
      chatType: "group",
    },
  });
  expect(connector.observedEvents.at(-1)).toEqual({
    type: "outbound.ack",
    result,
  });
});

test("normalizeFeishuMessage tolerates non-json content and p2p chat type", () => {
  expect(
    normalizeFeishuMessage({
      sender: {
        sender_id: { user_id: "u1" },
        sender_type: "user",
      },
      message: {
        message_id: "m1",
        create_time: "1717452000001",
        chat_id: "chat-p2p",
        chat_type: "p2p",
        message_type: "text",
        content: "plain text",
      },
    }),
  ).toMatchObject({
    messageId: "m1",
    chatId: "chat-p2p",
    senderId: "u1",
    chatType: "p2p",
    text: "plain text",
    receivedAt: 1_717_452_000_001,
  });
});

async function configuredSecrets(): Promise<MemorySecretStore> {
  const store = new MemorySecretStore();
  await store.put("feishu:app-id", "cli_a");
  await store.put("feishu:app-secret", "secret_a");
  return store;
}

class FakeEventDispatcher implements FeishuEventDispatcherLike {
  private handler: ((data: FeishuMessageEvent) => void | Promise<void>) | null =
    null;

  register(handlers: {
    "im.message.receive_v1": (data: FeishuMessageEvent) => void | Promise<void>;
  }): FeishuEventDispatcherLike {
    this.handler = handlers["im.message.receive_v1"];
    return this;
  }

  async dispatch(data: FeishuMessageEvent): Promise<void> {
    if (!this.handler) throw new Error("dispatcher not registered");
    await this.handler(data);
  }
}

class FakeFeishuSdkFactory implements FeishuSdkFactory {
  readonly dispatcher = new FakeEventDispatcher();
  readonly clients: unknown[] = [];
  readonly wsClients: FakeWsClient[] = [];
  readonly sentMessages: FeishuMessageCreatePayload[] = [];
  credentials: { appId: string; appSecret: string } | null = null;

  constructor(
    private readonly options: { ready?: boolean; autoReady?: boolean } = {},
  ) {}

  createClient(credentials: { appId: string; appSecret: string }) {
    this.credentials = credentials;
    const client = {
      im: {
        v1: {
          message: {
            create: async (payload: FeishuMessageCreatePayload) => {
              this.sentMessages.push(payload);
              return {
                code: 0,
                data: { message_id: `om_reply_${this.sentMessages.length}` },
              };
            },
          },
        },
      },
    };
    this.clients.push(client);
    return client;
  }

  createWsClient(
    _credentials: { appId: string; appSecret: string },
    callbacks: { onReady: () => void; onError: (error: Error) => void },
  ) {
    const client = new FakeWsClient(callbacks, this.options);
    this.wsClients.push(client);
    return client;
  }

  createEventDispatcher(): FeishuEventDispatcherLike {
    return this.dispatcher;
  }

  ready(): void {
    this.wsClients.at(-1)?.ready();
  }

  async emitError(error: Error): Promise<void> {
    await this.wsClients.at(-1)?.emitError(error);
  }
}

class FakeWsClient {
  closed = false;

  constructor(
    private readonly callbacks: {
      onReady: () => void;
      onError: (error: Error) => void;
    },
    private readonly options: { ready?: boolean; autoReady?: boolean },
  ) {}

  async start(): Promise<void> {
    if (this.options.ready === false || this.options.autoReady === false) {
      return;
    }
    this.ready();
  }

  close(): void {
    this.closed = true;
  }

  ready(): void {
    this.callbacks.onReady();
  }

  async emitError(error: Error): Promise<void> {
    this.callbacks.onError(error);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function isConnectedStatus(event: ImConnectorEvent): boolean {
  return event.type === "status" && event.status.state === "connected";
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
