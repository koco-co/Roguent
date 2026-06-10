import { expect, test } from "bun:test";
import type { IncomingMessage } from "@wechatbot/wechatbot";
import {
  type WeChatBotLike,
  WeChatConnector,
  type WeChatConnectorError,
  resolveWeChatStorageDir,
} from "./wechat";

function incoming(overrides: Partial<IncomingMessage> = {}): IncomingMessage {
  return {
    userId: "wx-room-1",
    text: "请检查 CI",
    type: "text",
    timestamp: new Date(1_717_452_000_000),
    images: [],
    voices: [],
    files: [],
    videos: [],
    raw: {} as IncomingMessage["raw"],
    _contextToken: "context-token-1",
    ...overrides,
  };
}

class FakeBot implements WeChatBotLike {
  constructor(
    private readonly options: {
      loginError?: Error;
      keepStartPending?: boolean;
      startError?: Error;
    } = {},
  ) {}

  loginCalls: unknown[] = [];
  operations: string[] = [];
  started = false;
  stopped = false;
  onMessageCalls = 0;
  handler: ((message: IncomingMessage) => void | Promise<void>) | null = null;
  pollStartHandlers: Array<() => void | Promise<void>> = [];
  replies: Array<{ message: IncomingMessage; text: string }> = [];
  sends: Array<{ userId: string; text: string }> = [];

  async login(options?: unknown): Promise<unknown> {
    this.operations.push("login");
    this.loginCalls.push(options);
    if (this.options.loginError) throw this.options.loginError;
    const force = (options as { force?: boolean } | undefined)?.force;
    const callbacks = (
      options as {
        callbacks?: {
          onQrUrl?: (url: string) => void;
          onScanned?: () => void;
        };
      }
    )?.callbacks;
    if (force !== false) {
      callbacks?.onQrUrl?.("https://wechat.example/qr");
      callbacks?.onScanned?.();
    }
    return {
      accountId: "account-1",
      userId: "bot-user-1",
    };
  }

  onMessage(handler: (message: IncomingMessage) => void | Promise<void>): this {
    this.onMessageCalls++;
    this.handler = handler;
    return this;
  }

  on(event: "poll:start", handler: () => void | Promise<void>): this {
    if (event === "poll:start") this.pollStartHandlers.push(handler);
    return this;
  }

  async start(): Promise<void> {
    this.operations.push("start");
    if (this.options.startError) throw this.options.startError;
    this.started = true;
    for (const handler of this.pollStartHandlers) {
      await handler();
    }
    if (this.options.keepStartPending) {
      await new Promise(() => {});
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
  }

  async reply(message: IncomingMessage, text: string): Promise<void> {
    this.replies.push({ message, text });
  }

  async send(userId: string, text: string): Promise<void> {
    this.sends.push({ userId, text });
  }
}

test("startPairing returns QR state from SDK login callbacks", async () => {
  const bot = new FakeBot();
  const connector = new WeChatConnector({
    createBot: () => bot,
    now: () => 1_717_452_000_000,
  });
  const observed = connector.observedEvents;

  const qr = await connector.startPairing("s1");

  expect(qr).toMatchObject({
    channel: "wechat",
    sessionId: "s1",
    status: "pending",
    url: "https://wechat.example/qr",
  });
  expect(observed.map((event) => event.type)).toEqual([
    "pairing.qr",
    "pairing.scanned",
  ]);
  expect(bot.loginCalls).toHaveLength(1);
});

test("start restores stored credentials before long polling", async () => {
  const bot = new FakeBot();
  const connector = new WeChatConnector({ createBot: () => bot });

  await connector.start();

  expect(bot.loginCalls).toEqual([
    { force: false, callbacks: expect.any(Object) },
  ]);
  expect(bot.operations).toEqual(["login", "start"]);
  expect(bot.started).toBe(true);
});

test("start resolves after launching a long-running polling loop", async () => {
  const bot = new FakeBot({ keepStartPending: true });
  const connector = new WeChatConnector({ createBot: () => bot });

  await expect(connector.start()).resolves.toBeUndefined();

  expect(bot.operations).toEqual(["login", "start"]);
  expect(bot.started).toBe(true);
});

test("start rejects if polling fails before poll:start", async () => {
  const bot = new FakeBot({ startError: new Error("cursor load failed") });
  const connector = new WeChatConnector({ createBot: () => bot });

  await expect(connector.start()).rejects.toMatchObject({
    name: "WeChatConnectorError",
    code: "wechat_sdk_error",
    message: "cursor load failed",
  });
  await expect(connector.start()).rejects.toMatchObject({
    code: "wechat_sdk_error",
  });

  expect(bot.operations).toEqual(["login", "start", "login", "start"]);
  expect(bot.onMessageCalls).toBe(1);
});

test("incoming SDK messages normalize to IntegrationEvent without leaking context token", async () => {
  const bot = new FakeBot();
  const connector = new WeChatConnector({
    createBot: () => bot,
    now: () => 1_717_452_000_000,
  });
  const observed = connector.observedEvents;
  await connector.start();

  await bot.handler?.(
    incoming({
      raw: {
        ...(incoming().raw as object),
        from_user_display_name: "我的工作号",
      } as unknown as IncomingMessage["raw"],
    }),
  );

  expect(observed.at(-1)).toMatchObject({
    type: "message",
    event: {
      channel: "wechat",
      direction: "inbound",
      externalChatId: "wx-room-1",
      bodyText: "请检查 CI",
      from: "wx-room-1",
      displayName: "我的工作号",
      metadata: {
        contextAvailable: true,
        displayName: "我的工作号",
      },
    },
  });
  expect(JSON.stringify(observed.at(-1))).not.toContain("context-token-1");
});

test("startPairing wraps Bun incompatibility as a typed connector error", async () => {
  const connector = new WeChatConnector({
    createBot: () =>
      new FakeBot({
        loginError: new Error(
          "Unsupported runtime: expected Node.js 22, got Bun",
        ),
      }),
  });

  await expect(connector.startPairing("s1")).rejects.toMatchObject({
    name: "WeChatConnectorError",
    code: "wechat_bun_incompatible",
  } satisfies Partial<WeChatConnectorError>);
});

test("sendMessage replies through the remembered incoming message context", async () => {
  const bot = new FakeBot();
  const connector = new WeChatConnector({
    createBot: () => bot,
    now: () => 1_717_452_000_000,
  });
  const msg = incoming();
  await connector.start();
  await bot.handler?.(msg);

  const delivery = await connector.sendMessage(
    { externalChatId: "wx-room-1" },
    "agent reply",
  );

  expect(bot.replies).toEqual([{ message: msg, text: "agent reply" }]);
  expect(bot.sends).toEqual([]);
  expect(delivery).toMatchObject({
    channel: "wechat",
    externalChatId: "wx-room-1",
    status: "delivered",
  });
});

test("default SDK storage path is persistent Roguent user data", () => {
  expect(resolveWeChatStorageDir({ HOME: "/Users/poco" }, "darwin")).toBe(
    "/Users/poco/Library/Application Support/Roguent/wechat",
  );
  expect(
    resolveWeChatStorageDir(
      { HOME: "/home/poco", XDG_DATA_HOME: "/data" },
      "linux",
    ),
  ).toBe("/data/Roguent/wechat");
  expect(
    resolveWeChatStorageDir({
      ROGUENT_WECHAT_STORAGE_DIR: "/tmp/wechat-storage",
    }),
  ).toBe("/tmp/wechat-storage");
});
