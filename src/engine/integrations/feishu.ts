import * as Lark from "@larksuiteoapi/node-sdk";
import type { SecretStore } from "../secrets/types";
import {
  type FeishuRegistrationOptions,
  type PollRegistrationResult,
  type RegistrationDomain,
  type StartRegistrationResult,
  pollRegistration,
  startRegistration,
} from "./feishu-registration";
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
  /** Whether this connector mints credentials on the Lark international base. */
  isLark?: boolean;
}

/**
 * Indirection over the device-code registration module so tests can script the
 * begin/poll turns without touching the network. Defaults to the real
 * accounts-domain flow in `feishu-registration.ts`.
 */
export interface FeishuRegistrationDriver {
  start(
    opts: FeishuRegistrationOptions & { isLark?: boolean },
  ): Promise<StartRegistrationResult>;
  poll(
    deviceCode: string,
    domain: RegistrationDomain,
    opts: FeishuRegistrationOptions,
  ): Promise<PollRegistrationResult>;
}

export interface FeishuConnectorOptions {
  config: FeishuConnectorConfig;
  secretStore: SecretStore;
  sdkFactory?: FeishuSdkFactory;
  now?: () => number;
  readyTimeoutMs?: number;
  /** Device-code registration driver (injectable for tests). */
  registration?: FeishuRegistrationDriver;
  /** Injected delay between polls; tests pass a no-op to skip real timers. */
  sleep?: (ms: number) => Promise<void>;
  /** fetch passed to the default registration driver. */
  fetchImpl?: typeof fetch;
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
  private readonly registration: FeishuRegistrationDriver;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly fetchImpl?: typeof fetch;
  private readonly lastInboundByChat = new Map<string, FeishuMessageMeta>();
  private client: FeishuClientLike | null = null;
  private wsClient: FeishuWsClientLike | null = null;
  private started = false;
  private startPromise: Promise<void> | null = null;
  private rejectPendingStart: ((error: Error) => void) | null = null;
  private startGeneration = 0;
  private counter = 0;
  private readonly pairings = new Map<string, FeishuPairingState>();

  constructor(private readonly options: FeishuConnectorOptions) {
    this.sdkFactory = options.sdkFactory ?? defaultFeishuSdkFactory;
    this.now = options.now ?? Date.now;
    this.readyTimeoutMs = options.readyTimeoutMs ?? 10_000;
    this.registration = options.registration ?? defaultRegistrationDriver;
    this.sleep =
      options.sleep ??
      ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.fetchImpl = options.fetchImpl;
  }

  /**
   * Bring up the Lark long connection. If no app credentials are configured
   * yet this is a clean no-op (device-code pairing populates them later) — we
   * emit a benign "configuration-required" status rather than throwing, so the
   * manager's boot-time `start()` does not surface a connector error before the
   * user has paired.
   */
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
    const credentials = await this.tryReadCredentials();
    if (!credentials) {
      // No creds yet (device-code pairing has not run): clean no-op. Emit a
      // benign configuration-required status — not an error — so the manager's
      // boot-time start does not flag the connector as broken before pairing.
      if (this.startGeneration === generation) {
        await this.emitStatus(
          "disconnected",
          "Feishu app credentials are not configured",
          { code: "configuration-required" },
        );
      }
      return;
    }
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

  /**
   * Drive the device-code app-registration flow: begin a grant, emit a
   * scannable QR (`verification_uri_complete`), then background-poll until a
   * `client_id`/`client_secret` pair is minted. On success the creds are
   * persisted, the Lark long connection is (re)started, and a `pairing.scanned`
   * event records that the app is connected. The per-chat binding forms later,
   * on the first inbound message routed through the IntegrationRouter.
   */
  async startPairing(sessionId: string): Promise<PairingQrState> {
    // Cancel any prior in-flight pairing for this session before re-arming.
    this.pairings.get(sessionId)?.cancel();

    const begin = await this.registration.start({
      ...(this.fetchImpl ? { fetchImpl: this.fetchImpl } : {}),
      now: this.now,
      ...(this.options.config.isLark ? { isLark: true } : {}),
    });

    if (!begin.ok) {
      const errored: PairingQrState = {
        id: `feishu-qr-${slug(sessionId)}-${++this.counter}`,
        channel: "feishu",
        sessionId,
        status: "error",
        error: begin.message,
        metadata: { code: "registration-failed" },
      };
      this.pairings.delete(sessionId);
      await this.emit({ type: "pairing.qr", qr: errored });
      return errored;
    }

    const pairing: FeishuPairingState = {
      sessionId,
      deviceCode: begin.deviceCode,
      domain: begin.domain,
      intervalMs: begin.interval * 1000,
      url: begin.url,
      cancelled: false,
      cancel() {
        this.cancelled = true;
      },
    };
    this.pairings.set(sessionId, pairing);

    const qr: PairingQrState = {
      id: `feishu-qr-${slug(sessionId)}-${++this.counter}`,
      channel: "feishu",
      sessionId,
      status: "pending",
      url: begin.url,
      expiresAt: this.now() + begin.expireIn * 1000,
      metadata: { userCode: begin.userCode },
    };
    await this.emit({ type: "pairing.qr", qr });

    const deadline = this.now() + begin.expireIn * 1000;
    void this.pollLoop(pairing, deadline).catch(() => {});
    return qr;
  }

  async stopPairing(sessionId: string): Promise<void> {
    const pairing = this.pairings.get(sessionId);
    pairing?.cancel();
    this.pairings.delete(sessionId);
  }

  /** Feishu device-code pairing carries no verify code; this is a no-op. */
  async submitVerifyCode(_sessionId: string, _code: string): Promise<void> {}

  private async pollLoop(
    pairing: FeishuPairingState,
    deadline: number,
  ): Promise<void> {
    while (!pairing.cancelled && this.now() < deadline) {
      await this.sleep(pairing.intervalMs);
      if (
        pairing.cancelled ||
        this.pairings.get(pairing.sessionId) !== pairing
      ) {
        return;
      }

      const result = await this.registration.poll(
        pairing.deviceCode,
        pairing.domain,
        {
          ...(this.fetchImpl ? { fetchImpl: this.fetchImpl } : {}),
          now: this.now,
        },
      );

      if (result.done) {
        await this.completePairing(pairing, result.appId, result.appSecret);
        return;
      }
      if (result.switchTo === "lark") {
        pairing.domain = "lark";
        continue;
      }
      if (result.pending) continue;
      if (result.error) {
        await this.expirePairing(pairing, result.error);
        return;
      }
    }
    if (!pairing.cancelled) {
      await this.expirePairing(pairing, "Feishu pairing expired");
    }
  }

  private async completePairing(
    pairing: FeishuPairingState,
    appId: string,
    appSecret: string,
  ): Promise<void> {
    this.pairings.delete(pairing.sessionId);
    await this.options.secretStore.put(
      this.options.config.appIdSecretRef,
      appId,
    );
    await this.options.secretStore.put(
      this.options.config.appSecretRef,
      appSecret,
    );
    // Point the long connection at the freshly-stored refs and (re)start it.
    // A WS bring-up failure here already surfaces via emitStatus("error"); the
    // app is still paired (creds persisted), so we record the scan regardless.
    await this.restartLongConnection().catch(() => {});
    await this.emit({
      type: "pairing.scanned",
      channel: "feishu",
      sessionId: pairing.sessionId,
      externalChatId: `feishu-app:${appId}`,
      displayName: "飞书机器人",
      scannedAt: this.now(),
    });
  }

  private async expirePairing(
    pairing: FeishuPairingState,
    error: string,
  ): Promise<void> {
    this.pairings.delete(pairing.sessionId);
    await this.emit({
      type: "pairing.expired",
      qr: {
        id: `feishu-qr-${slug(pairing.sessionId)}-${++this.counter}`,
        channel: "feishu",
        sessionId: pairing.sessionId,
        status: "expired",
        url: pairing.url,
        error,
      },
    });
  }

  /** Tear down any existing long connection and start a fresh one. */
  private async restartLongConnection(): Promise<void> {
    this.startGeneration++;
    this.rejectPendingStart?.(new Error("Feishu long connection restarting"));
    this.rejectPendingStart = null;
    this.startPromise = null;
    this.started = false;
    this.wsClient?.close?.({ force: true });
    this.wsClient = null;
    await this.start();
  }

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

  /** Read configured creds, or `null` when not yet provisioned/paired. */
  private async tryReadCredentials(): Promise<FeishuCredentials | null> {
    const appId = await this.options.secretStore.get(
      this.options.config.appIdSecretRef,
    );
    const appSecret = await this.options.secretStore.get(
      this.options.config.appSecretRef,
    );
    if (!appId || !appSecret) return null;
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

interface FeishuPairingState {
  sessionId: string;
  deviceCode: string;
  domain: RegistrationDomain;
  intervalMs: number;
  url: string;
  cancelled: boolean;
  cancel(): void;
}

/** Real device-code driver, delegating to the accounts-domain HTTP flow. */
export const defaultRegistrationDriver: FeishuRegistrationDriver = {
  start: startRegistration,
  poll: pollRegistration,
};

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
