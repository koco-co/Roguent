import * as Lark from "@larksuiteoapi/node-sdk";
import type { SecretStore } from "../secrets/types";
import type {
  FakeFeishuInboundMessage,
  FeishuMessageMeta,
} from "./feishu-types";
import type {
  ImConnector,
  ImConnectorEvent,
  OutboundDeliveryResult,
  OutboundImTarget,
  PairingQrState,
} from "./wechat-types";

export interface FeishuConnectorConfig {
  appIdSecretRef: string;
  appSecretRef: string;
  botName?: string;
}

export interface FeishuConnectorOptions {
  config: FeishuConnectorConfig;
  secretStore: SecretStore;
  sdkFactory?: FeishuSdkFactory;
  now?: () => number;
  readyTimeoutMs?: number;
}

export interface FeishuCredentials {
  appId: string;
  appSecret: string;
}

export interface FeishuMessageCreatePayload {
  data: {
    receive_id: string;
    msg_type: "text";
    content: string;
    uuid?: string;
  };
  params: {
    receive_id_type: "chat_id";
  };
}

export interface FeishuClientLike {
  im: {
    v1: {
      message: {
        create(payload: FeishuMessageCreatePayload): Promise<{
          code?: number;
          msg?: string;
          data?: {
            message_id?: string;
          };
        }>;
      };
    };
  };
}

export interface FeishuEventDispatcherLike {
  register(handlers: {
    "im.message.receive_v1": (data: FeishuMessageEvent) => void | Promise<void>;
  }): FeishuEventDispatcherLike;
}

export interface FeishuWsClientLike {
  start(params: { eventDispatcher: FeishuEventDispatcherLike }): Promise<void>;
  close?(params?: { force?: boolean }): void;
}

export interface FeishuSdkFactory {
  createClient(credentials: FeishuCredentials): FeishuClientLike;
  createWsClient(
    credentials: FeishuCredentials,
    callbacks: FeishuWsClientCallbacks,
  ): FeishuWsClientLike;
  createEventDispatcher(): FeishuEventDispatcherLike;
}

export interface FeishuWsClientCallbacks {
  onReady: () => void;
  onError: (error: Error) => void;
}

export interface FeishuMessageEvent {
  event_id?: string;
  token?: string;
  create_time?: string;
  event_type?: string;
  tenant_key?: string;
  ts?: string;
  uuid?: string;
  type?: string;
  app_id?: string;
  sender: {
    sender_id?: {
      union_id?: string;
      user_id?: string;
      open_id?: string;
    };
    sender_type: string;
    tenant_key?: string;
  };
  message: {
    message_id: string;
    root_id?: string;
    parent_id?: string;
    create_time: string;
    update_time?: string;
    chat_id: string;
    thread_id?: string;
    chat_type: string;
    message_type: string;
    content: string;
  };
}

export class FeishuConnectorError extends Error {
  constructor(
    readonly code: "configuration-required" | "feishu-sdk-error",
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "FeishuConnectorError";
  }
}

export class FeishuConnector implements ImConnector {
  readonly observedEvents: ImConnectorEvent[] = [];

  private readonly handlers = new Set<
    (event: ImConnectorEvent) => void | Promise<void>
  >();
  private readonly sdkFactory: FeishuSdkFactory;
  private readonly now: () => number;
  private readonly readyTimeoutMs: number;
  private readonly lastInboundByChat = new Map<string, FeishuMessageMeta>();
  private client: FeishuClientLike | null = null;
  private wsClient: FeishuWsClientLike | null = null;
  private started = false;
  private startPromise: Promise<void> | null = null;
  private rejectPendingStart: ((error: Error) => void) | null = null;
  private startGeneration = 0;
  private counter = 0;

  constructor(private readonly options: FeishuConnectorOptions) {
    this.sdkFactory = options.sdkFactory ?? defaultFeishuSdkFactory;
    this.now = options.now ?? Date.now;
    this.readyTimeoutMs = options.readyTimeoutMs ?? 10_000;
  }

  async start(): Promise<void> {
    if (this.started) return;
    if (this.startPromise) return this.startPromise;
    const generation = ++this.startGeneration;
    this.startPromise = this.startAttempt(generation).finally(() => {
      if (this.startGeneration === generation) this.startPromise = null;
    });
    return this.startPromise;
  }

  private async startAttempt(generation: number): Promise<void> {
    const credentials = await this.readCredentials();
    let resolveReady: () => void = () => {};
    let rejectReady: (error: Error) => void = () => {};
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    this.rejectPendingStart = rejectReady;
    if (this.startGeneration !== generation) return;
    this.client = this.sdkFactory.createClient(credentials);
    const wsClient = this.sdkFactory.createWsClient(credentials, {
      onReady: () => {
        if (this.startGeneration === generation) resolveReady();
      },
      onError: (error) => {
        if (this.startGeneration === generation && this.started) {
          void this.handleConnectionError(error, wsClient);
          return;
        }
        rejectReady(error);
      },
    });
    if (this.startGeneration !== generation) {
      wsClient.close?.({ force: true });
      return;
    }
    this.wsClient = wsClient;
    const dispatcher = this.sdkFactory.createEventDispatcher().register({
      "im.message.receive_v1": (data) => this.handleMessage(data),
    });
    await this.emitStatus("connecting");
    try {
      void wsClient
        .start({ eventDispatcher: dispatcher })
        .catch((error) => rejectReady(toError(error)));
      await withTimeout(
        ready,
        this.readyTimeoutMs,
        "Feishu long connection did not become ready",
      );
      if (this.startGeneration !== generation) {
        wsClient.close?.({ force: true });
        return;
      }
      this.started = true;
      this.rejectPendingStart = null;
      await this.emitStatus("connected");
    } catch (error) {
      wsClient.close?.({ force: true });
      if (this.startGeneration === generation) {
        this.wsClient = null;
        this.started = false;
        this.rejectPendingStart = null;
      }
      if (this.startGeneration === generation) {
        await this.emitStatus("error", errorMessage(error), {
          code: "feishu-sdk-error",
        });
      }
      throw new FeishuConnectorError(
        "feishu-sdk-error",
        "Feishu long connection failed to start",
        error,
      );
    }
  }

  async stop(): Promise<void> {
    this.startGeneration++;
    this.rejectPendingStart?.(new Error("Feishu long connection stopped"));
    this.rejectPendingStart = null;
    this.startPromise = null;
    this.started = false;
    this.wsClient?.close?.({ force: true });
    this.wsClient = null;
    await this.emitStatus("disconnected");
  }

  private async handleConnectionError(
    error: Error,
    wsClient: FeishuWsClientLike,
  ): Promise<void> {
    if (this.wsClient !== wsClient) return;
    this.started = false;
    this.wsClient = null;
    wsClient.close?.({ force: true });
    await this.emitStatus("error", error.message, {
      code: "feishu-sdk-error",
    });
  }

  async startPairing(sessionId: string): Promise<PairingQrState> {
    const qr: PairingQrState = {
      id: `feishu-config-${slug(sessionId)}-${++this.counter}`,
      channel: "feishu",
      sessionId,
      status: "error",
      error:
        "Feishu uses app credentials and long connection; configure the bot instead of QR pairing",
      metadata: {
        code: "configuration-required",
      },
    };
    await this.emit({ type: "pairing.qr", qr });
    return qr;
  }

  async stopPairing(): Promise<void> {}

  async sendMessage(
    target: OutboundImTarget,
    text: string,
  ): Promise<OutboundDeliveryResult> {
    const client = this.client;
    if (!client) {
      throw new FeishuConnectorError(
        "configuration-required",
        "Feishu connector is not started",
      );
    }
    const inbound = this.lastInboundByChat.get(target.externalChatId);
    const response = await client.im.v1.message.create({
      params: { receive_id_type: "chat_id" },
      data: {
        receive_id: target.externalChatId,
        msg_type: "text",
        content: JSON.stringify({ text }),
      },
    });
    const result: OutboundDeliveryResult = {
      id: response.data?.message_id ?? `feishu-outbound-${++this.counter}`,
      channel: "feishu",
      externalChatId: target.externalChatId,
      status: response.code && response.code !== 0 ? "failed" : "delivered",
      sentAt: this.now(),
      error: response.code && response.code !== 0 ? response.msg : undefined,
      metadata: {
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

  private async readCredentials(): Promise<FeishuCredentials> {
    const appId = await this.options.secretStore.get(
      this.options.config.appIdSecretRef,
    );
    const appSecret = await this.options.secretStore.get(
      this.options.config.appSecretRef,
    );
    if (!appId || !appSecret) {
      const message = "Feishu app credentials are not configured";
      await this.emitStatus("error", message, {
        code: "configuration-required",
        appIdSecretRef: this.options.config.appIdSecretRef,
        appSecretSecretRef: this.options.config.appSecretRef,
      });
      throw new FeishuConnectorError("configuration-required", message);
    }
    return { appId, appSecret };
  }

  private async handleMessage(data: FeishuMessageEvent): Promise<void> {
    const normalized = normalizeFeishuMessage(data);
    this.lastInboundByChat.set(normalized.chatId, {
      messageId: normalized.messageId,
      chatId: normalized.chatId,
      senderId: normalized.senderId,
      chatType: normalized.chatType,
    });
    await this.emit({
      type: "message",
      event: {
        id: normalized.messageId,
        channel: "feishu",
        direction: "inbound",
        externalChatId: normalized.chatId,
        deliveryId: data.event_id ?? normalized.messageId,
        summary: normalized.text,
        bodyText: normalized.text,
        from: normalized.senderId,
        displayName: this.options.config.botName,
        metadata: {
          messageId: normalized.messageId,
          chatId: normalized.chatId,
          senderId: normalized.senderId,
          chatType: normalized.chatType,
        },
        receivedAt: normalized.receivedAt,
      },
    });
  }

  private async emitStatus(
    state: "connecting" | "connected" | "disconnected" | "degraded" | "error",
    error?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.emit({
      type: "status",
      status: {
        id: "feishu-long-connection",
        channel: "feishu",
        state,
        label: "Feishu Long Connection",
        error,
        lastEventAt: this.now(),
        metadata,
      },
    });
  }

  private async emit(event: ImConnectorEvent): Promise<void> {
    this.observedEvents.push(event);
    for (const handler of this.handlers) {
      await handler(event);
    }
  }
}

export const defaultFeishuSdkFactory: FeishuSdkFactory = {
  createClient(credentials) {
    return new Lark.Client({
      appId: credentials.appId,
      appSecret: credentials.appSecret,
    }) as FeishuClientLike;
  },
  createWsClient(credentials, callbacks) {
    return new Lark.WSClient({
      appId: credentials.appId,
      appSecret: credentials.appSecret,
      loggerLevel: Lark.LoggerLevel.info,
      onReady: callbacks.onReady,
      onError: callbacks.onError,
    }) as FeishuWsClientLike;
  },
  createEventDispatcher() {
    return new Lark.EventDispatcher({}) as FeishuEventDispatcherLike;
  },
};

export function normalizeFeishuMessage(
  data: FeishuMessageEvent,
): FakeFeishuInboundMessage & { receivedAt: number } {
  const chatType = normalizeChatType(data.message.chat_type);
  return {
    messageId: data.message.message_id,
    chatId: data.message.chat_id,
    senderId: senderId(data),
    chatType,
    text: parseTextContent(data.message.content),
    receivedAt: parseFeishuTimestamp(data.message.create_time),
  };
}

function normalizeChatType(value: string): "p2p" | "group" {
  return value === "p2p" ? "p2p" : "group";
}

function senderId(data: FeishuMessageEvent): string {
  return (
    data.sender.sender_id?.open_id ??
    data.sender.sender_id?.user_id ??
    data.sender.sender_id?.union_id ??
    data.sender.sender_type
  );
}

function parseTextContent(content: string): string {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (parsed && typeof parsed === "object" && "text" in parsed) {
      const text = (parsed as { text?: unknown }).text;
      if (typeof text === "string") return text;
    }
  } catch {}
  return content;
}

function parseFeishuTimestamp(value: string): number {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function slug(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "session";
}
