import { join } from "node:path";
import {
  type IncomingMessage,
  type QrLoginCallbacks,
  WeChatBot,
} from "@wechatbot/wechatbot";
import type {
  ImConnector,
  ImConnectorEvent,
  OutboundDeliveryResult,
  OutboundImTarget,
  PairingQrState,
} from "./wechat-types";

export interface WeChatBotLike {
  login(options?: {
    force?: boolean;
    callbacks?: QrLoginCallbacks;
  }): Promise<unknown>;
  onMessage(
    handler: (message: IncomingMessage) => void | Promise<void>,
  ): WeChatBotLike;
  on?(event: "poll:start", handler: () => void | Promise<void>): WeChatBotLike;
  start(): Promise<void>;
  stop(): void | Promise<void>;
  reply(message: IncomingMessage, text: string): Promise<void>;
  send(userId: string, text: string): Promise<void>;
}

export interface WeChatConnectorOptions {
  createBot?: () => WeChatBotLike;
  now?: () => number;
  storageDir?: string;
}

export type WeChatConnectorErrorCode =
  | "wechat_bun_incompatible"
  | "wechat_pairing_required"
  | "wechat_sdk_error";

export class WeChatConnectorError extends Error {
  constructor(
    readonly code: WeChatConnectorErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "WeChatConnectorError";
  }
}

export class WeChatConnector implements ImConnector {
  readonly observedEvents: ImConnectorEvent[] = [];

  private readonly bot: WeChatBotLike;
  private readonly handlers = new Set<
    (event: ImConnectorEvent) => void | Promise<void>
  >();
  private readonly messagesByChat = new Map<string, IncomingMessage>();
  private readonly now: () => number;
  private counter = 0;
  private pairings = new Map<string, PairingQrState>();
  private pollingTask: Promise<void> | null = null;
  private messageHandlerRegistered = false;
  private started = false;

  constructor(options: WeChatConnectorOptions = {}) {
    this.bot =
      options.createBot?.() ??
      new WeChatBot({
        storage: "file",
        storageDir: options.storageDir ?? resolveWeChatStorageDir(),
      });
    this.now = options.now ?? Date.now;
  }

  async startPairing(sessionId: string): Promise<PairingQrState> {
    const qr = await new Promise<PairingQrState>((resolve, reject) => {
      let settled = false;
      const callbacks: QrLoginCallbacks = {
        onQrUrl: (url) => {
          const state: PairingQrState = {
            id: `wechat-qr-${slug(sessionId)}-${++this.counter}`,
            channel: "wechat",
            sessionId,
            status: "pending",
            url,
            expiresAt: this.now() + 180_000,
          };
          this.pairings.set(sessionId, state);
          void this.emit({ type: "pairing.qr", qr: state });
          settled = true;
          resolve(state);
        },
        onScanned: () => {
          const scannedAt = this.now();
          void this.emit({
            type: "pairing.scanned",
            channel: "wechat",
            sessionId,
            externalChatId: sessionId,
            scannedAt,
          });
        },
        onExpired: () => {
          void this.expirePairing(sessionId);
        },
      };
      this.bot.login({ force: true, callbacks }).catch((error: unknown) => {
        if (!settled) reject(toConnectorError(error));
      });
    });
    return qr;
  }

  async stopPairing(sessionId: string): Promise<void> {
    this.pairings.delete(sessionId);
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    try {
      await this.bot.login({
        force: false,
        callbacks: {
          onQrUrl: () => {
            throw new WeChatConnectorError(
              "wechat_pairing_required",
              "No stored WeChat credentials; start a pairing flow before polling",
            );
          },
        },
      });
      this.registerMessageHandler();
      const pollStarted = waitForPollStart(this.bot);
      this.pollingTask = this.bot.start().catch((error: unknown) => {
        this.started = false;
        throw toConnectorError(error);
      });
      void this.pollingTask.catch(() => {});
      await Promise.race([pollStarted, this.pollingTask]);
    } catch (error) {
      this.started = false;
      throw toConnectorError(error);
    }
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    this.started = false;
    await this.bot.stop();
    this.pollingTask = null;
  }

  async sendMessage(
    target: OutboundImTarget,
    text: string,
  ): Promise<OutboundDeliveryResult> {
    const message = this.messagesByChat.get(target.externalChatId);
    if (message) await this.bot.reply(message, text);
    else await this.bot.send(target.externalChatId, text);

    const result: OutboundDeliveryResult = {
      id: `wechat-outbound-${++this.counter}`,
      channel: "wechat",
      externalChatId: target.externalChatId,
      status: "delivered",
      sentAt: this.now(),
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

  private registerMessageHandler(): void {
    if (this.messageHandlerRegistered) return;
    this.messageHandlerRegistered = true;
    this.bot.onMessage((message) => this.handleMessage(message));
  }

  private async handleMessage(message: IncomingMessage): Promise<void> {
    this.messagesByChat.set(message.userId, message);
    const receivedAt = message.timestamp.getTime();
    const id = `wechat-inbound-${++this.counter}`;
    const displayName = extractDisplayName(message);
    await this.emit({
      type: "message",
      event: {
        id,
        channel: "wechat",
        direction: "inbound",
        externalChatId: message.userId,
        deliveryId: id,
        summary: message.text,
        bodyText: message.text,
        from: message.userId,
        displayName,
        metadata: {
          contextAvailable: Boolean(message._contextToken),
          ...(displayName ? { displayName } : {}),
        },
        receivedAt,
      },
    });
  }

  private async expirePairing(sessionId: string): Promise<void> {
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

  private async emit(event: ImConnectorEvent): Promise<void> {
    this.observedEvents.push(event);
    for (const handler of this.handlers) {
      await handler(event);
    }
  }
}

function waitForPollStart(bot: WeChatBotLike): Promise<void> {
  if (!bot.on) return Promise.resolve();
  return new Promise((resolve) => {
    bot.on?.("poll:start", () => resolve());
  });
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function toConnectorError(error: unknown): WeChatConnectorError {
  if (error instanceof WeChatConnectorError) return error;
  const original = toError(error);
  if (isLikelyBunIncompatibility(original)) {
    return new WeChatConnectorError(
      "wechat_bun_incompatible",
      original.message,
      error,
    );
  }
  return new WeChatConnectorError("wechat_sdk_error", original.message, error);
}

function isLikelyBunIncompatibility(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes("bun") ||
    message.includes("node.js") ||
    message.includes("node 22") ||
    message.includes("unsupported runtime")
  );
}

function extractDisplayName(message: IncomingMessage): string | undefined {
  const messageRecord = message as unknown as Record<string, unknown>;
  const rawRecord = message.raw as unknown as Record<string, unknown>;
  return firstString(
    messageRecord.displayName,
    messageRecord.senderName,
    messageRecord.nickname,
    messageRecord.nickName,
    rawRecord.from_user_display_name,
    rawRecord.from_user_name,
    rawRecord.sender_name,
    rawRecord.nickname,
    rawRecord.nick_name,
  );
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

export function resolveWeChatStorageDir(
  env: Record<string, string | undefined> = Bun.env,
  platform: NodeJS.Platform = process.platform,
): string {
  if (env.ROGUENT_WECHAT_STORAGE_DIR) {
    return env.ROGUENT_WECHAT_STORAGE_DIR;
  }
  const home = env.HOME;
  if (!home) return join(".roguent", "wechat");
  if (platform === "darwin") {
    return join(home, "Library", "Application Support", "Roguent", "wechat");
  }
  return join(
    env.XDG_DATA_HOME ?? join(home, ".local", "share"),
    "Roguent",
    "wechat",
  );
}

function slug(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "session";
}
