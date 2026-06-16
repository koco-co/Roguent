import { randomBytes } from "node:crypto";
import type { SecretStore } from "../secrets/types";
import type {
  ImConnector,
  ImConnectorEvent,
  OutboundDeliveryResult,
  OutboundImTarget,
  PairingQrState,
} from "./wechat-types";

/**
 * Lean Bun-native WeChat connector that re-implements the official Tencent
 * iLink HTTP protocol directly via `fetch`.
 *
 * Faithful to:
 *  - QR login state machine: `get_bot_qrcode` -> poll `get_qrcode_status`
 *    (wait / scaned / need_verifycode / expired / scaned_but_redirect /
 *    binded_redirect / verify_code_blocked / confirmed).
 *  - Messaging: `getupdates` long-poll + `sendmessage`.
 *
 * Design for testability:
 *  - `fetchImpl` is injected (default `globalThis.fetch`).
 *  - `now` is injected (default `Date.now`).
 *  - `sleep` is injected (default `setTimeout`-backed). Tests pass a no-op
 *    sleep so the poll loops never block on real timers and resolve as soon
 *    as the scripted fetch queue runs dry.
 *  - Loops terminate naturally on a terminal QR state (confirmed / expired
 *    cap / binded_redirect) or when `stopLoops()` flips the running flag.
 */

const FIXED_BASE_URL = "https://ilinkai.weixin.qq.com";
const DEFAULT_ILINK_BOT_TYPE = "3";
const QR_TTL_MS = 180_000;
const MAX_QR_REFRESH_COUNT = 3;
const POLL_INTERVAL_MS = 1_000;
const GETUPDATES_BACKOFF_MS = 1_000;
const DEFAULT_STORAGE_KEY_PREFIX = "wechat:ilink:";

/** iLink message_type values. */
const MESSAGE_TYPE_USER = 1;
/** iLink MessageItem.type for TEXT. */
const ITEM_TYPE_TEXT = 1;

export interface WeChatIlinkConnectorOptions {
  fetchImpl?: typeof fetch;
  now?: () => number;
  /** Injectable delay; tests pass a no-op to avoid real timers. */
  sleep?: (ms: number) => Promise<void>;
  secretStore?: SecretStore;
  baseUrl?: string;
  storageKeyPrefix?: string;
}

interface StoredCredentials {
  bot_token: string;
  ilink_bot_id: string;
  baseurl: string;
}

interface QrCodeResponse {
  qrcode: string;
  qrcode_img_content: string;
}

type QrStatus =
  | "wait"
  | "scaned"
  | "need_verifycode"
  | "expired"
  | "scaned_but_redirect"
  | "binded_redirect"
  | "verify_code_blocked"
  | "confirmed";

interface StatusResponse {
  status: QrStatus;
  bot_token?: string;
  ilink_bot_id?: string;
  baseurl?: string;
  ilink_user_id?: string;
  redirect_host?: string;
}

interface WeixinMessageItem {
  type?: number;
  text_item?: { text?: string };
}

interface WeixinMessage {
  message_id?: number;
  from_user_id?: string;
  to_user_id?: string;
  create_time_ms?: number;
  message_type?: number;
  context_token?: string;
  item_list?: WeixinMessageItem[];
}

interface GetUpdatesResponse {
  ret?: number;
  errcode?: number;
  errmsg?: string;
  msgs?: WeixinMessage[];
  get_updates_buf?: string;
}

interface PairingState {
  sessionId: string;
  qrcode: string;
  qrcodeUrl: string;
  baseUrl: string;
  refreshCount: number;
  /** A code submitted by the user, awaiting the next poll. */
  pendingVerifyCode?: string;
  /** Resolver that wakes the loop when a verify code arrives. */
  resumeVerify?: () => void;
}

export class WeChatIlinkConnector implements ImConnector {
  readonly observedEvents: ImConnectorEvent[] = [];

  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly secretStore?: SecretStore;
  private readonly baseUrl: string;
  private readonly storageKeyPrefix: string;

  private readonly handlers = new Set<
    (event: ImConnectorEvent) => void | Promise<void>
  >();
  /** Remembered context_token per remote user for replies. */
  private readonly contextTokenByUser = new Map<string, string>();
  private readonly pairings = new Map<string, PairingState>();

  private counter = 0;
  private credentials: StoredCredentials | null = null;
  private updatesCursor = "";
  private pollLoopRunning = false;
  private updatesLoopRunning = false;

  constructor(options: WeChatIlinkConnectorOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.now = options.now ?? Date.now;
    this.sleep =
      options.sleep ??
      ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.secretStore = options.secretStore;
    this.baseUrl = options.baseUrl ?? FIXED_BASE_URL;
    this.storageKeyPrefix =
      options.storageKeyPrefix ?? DEFAULT_STORAGE_KEY_PREFIX;
  }

  // --- ImConnector lifecycle -------------------------------------------------

  async start(): Promise<void> {
    const loaded = await this.loadStoredCredentials();
    if (!loaded) return; // No stored creds: pairing required first.
    this.startUpdatesLoop();
  }

  async stop(): Promise<void> {
    this.stopLoops();
  }

  async close(): Promise<void> {
    this.stopLoops();
  }

  /** Flip both loops' running flags so they exit at the next checkpoint. */
  stopLoops(): void {
    this.pollLoopRunning = false;
    this.updatesLoopRunning = false;
    for (const pairing of this.pairings.values()) {
      pairing.resumeVerify?.();
    }
  }

  onEvent(
    handler: (event: ImConnectorEvent) => void | Promise<void>,
  ): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  // --- Pairing ---------------------------------------------------------------

  async startPairing(sessionId: string): Promise<PairingQrState> {
    const qr = await this.fetchQrCode(this.baseUrl);
    const pairing: PairingState = {
      sessionId,
      qrcode: qr.qrcode,
      qrcodeUrl: qr.qrcode_img_content,
      baseUrl: this.baseUrl,
      refreshCount: 1,
    };
    this.pairings.set(sessionId, pairing);
    const state = this.buildQrState(
      sessionId,
      qr.qrcode_img_content,
      "pending",
    );
    await this.emit({ type: "pairing.qr", qr: state });
    this.startPollLoop(sessionId);
    return state;
  }

  async stopPairing(sessionId: string): Promise<void> {
    const pairing = this.pairings.get(sessionId);
    pairing?.resumeVerify?.();
    this.pairings.delete(sessionId);
  }

  /** Stash a verify code so a paused poll loop resumes with `&verify_code=`. */
  async submitVerifyCode(sessionId: string, code: string): Promise<void> {
    const pairing = this.pairings.get(sessionId);
    if (!pairing) return;
    pairing.pendingVerifyCode = code;
    const resume = pairing.resumeVerify;
    pairing.resumeVerify = undefined;
    resume?.();
  }

  // --- Outbound --------------------------------------------------------------

  async sendMessage(
    target: OutboundImTarget,
    text: string,
  ): Promise<OutboundDeliveryResult> {
    const contextToken = this.contextTokenByUser.get(target.externalChatId);
    const body = {
      msg: {
        to_user_id: target.externalChatId,
        ...(contextToken ? { context_token: contextToken } : {}),
        item_list: [{ type: ITEM_TYPE_TEXT, text_item: { text } }],
      },
    };
    await this.postJson("ilink/bot/sendmessage", body, { auth: true });
    const result: OutboundDeliveryResult = {
      id: `wechat-outbound-${++this.counter}`,
      channel: "wechat",
      externalChatId: target.externalChatId,
      status: "delivered",
      sentAt: this.now(),
      metadata: {
        ...(target.displayName ? { displayName: target.displayName } : {}),
        textLength: text.length,
      },
    };
    await this.emit({ type: "outbound.ack", result });
    return result;
  }

  // --- Credentials -----------------------------------------------------------

  /** Load the most-recently-stored iLink credentials, if any. */
  async loadStoredCredentials(): Promise<boolean> {
    if (this.credentials) return true;
    if (!this.secretStore) return false;
    const refs = await this.secretStore.listRefs(this.storageKeyPrefix);
    for (const ref of refs) {
      const raw = await this.secretStore.get(ref);
      if (!raw) continue;
      const parsed = safeParseCredentials(raw);
      if (parsed) {
        this.credentials = parsed;
        return true;
      }
    }
    return false;
  }

  private async persistCredentials(creds: StoredCredentials): Promise<void> {
    this.credentials = creds;
    if (!this.secretStore) return;
    const ref = `${this.storageKeyPrefix}${creds.ilink_bot_id}`;
    await this.secretStore.put(ref, JSON.stringify(creds));
  }

  // --- QR login state machine -----------------------------------------------

  private startPollLoop(sessionId: string): void {
    if (this.pollLoopRunning) return;
    this.pollLoopRunning = true;
    void this.pollLoop(sessionId).catch(() => {
      this.pollLoopRunning = false;
    });
  }

  private async pollLoop(sessionId: string): Promise<void> {
    try {
      while (this.pollLoopRunning) {
        const pairing = this.pairings.get(sessionId);
        if (!pairing) break;

        const status = await this.pollStatus(
          pairing.baseUrl,
          pairing.qrcode,
          pairing.pendingVerifyCode,
        );

        const outcome = await this.handleStatus(sessionId, pairing, status);
        if (outcome === "stop") break;
        if (outcome === "continue-immediate") continue;
        await this.sleep(POLL_INTERVAL_MS);
      }
    } finally {
      this.pollLoopRunning = false;
    }
  }

  private async handleStatus(
    sessionId: string,
    pairing: PairingState,
    status: StatusResponse,
  ): Promise<"stop" | "continue" | "continue-immediate"> {
    switch (status.status) {
      case "wait":
        return "continue";
      case "scaned":
        if (pairing.pendingVerifyCode) pairing.pendingVerifyCode = undefined;
        await this.emit(
          this.scannedQrEvent(sessionId, pairing.qrcodeUrl, "scanned"),
        );
        return "continue";
      case "need_verifycode":
        await this.emit(this.needVerifyCodeEvent(sessionId, pairing.qrcodeUrl));
        await this.waitForVerifyCode(pairing);
        // Loop back immediately to poll with the freshly-supplied code.
        return this.pollLoopRunning ? "continue-immediate" : "stop";
      case "verify_code_blocked":
        pairing.pendingVerifyCode = undefined;
        return (await this.refreshQr(sessionId, pairing)) ? "continue" : "stop";
      case "expired":
        return (await this.refreshQr(sessionId, pairing)) ? "continue" : "stop";
      case "scaned_but_redirect":
        if (status.redirect_host) {
          pairing.baseUrl = `https://${status.redirect_host}`;
        }
        return "continue";
      case "binded_redirect":
        // Already bound to this instance; treat as a successful scan, no token.
        await this.emit(
          this.scannedQrEvent(sessionId, pairing.qrcodeUrl, "scanned"),
        );
        await this.emit({
          type: "pairing.scanned",
          channel: "wechat",
          sessionId,
          externalChatId: this.credentials?.ilink_bot_id ?? sessionId,
          scannedAt: this.now(),
        });
        this.pairings.delete(sessionId);
        return "stop";
      case "confirmed":
        await this.handleConfirmed(sessionId, status);
        this.pairings.delete(sessionId);
        return "stop";
      default:
        return "continue";
    }
  }

  private async handleConfirmed(
    sessionId: string,
    status: StatusResponse,
  ): Promise<void> {
    const botId = status.ilink_bot_id;
    if (!botId) return;
    const creds: StoredCredentials = {
      bot_token: status.bot_token ?? "",
      ilink_bot_id: botId,
      baseurl: status.baseurl ?? this.baseUrl,
    };
    await this.persistCredentials(creds);
    await this.emit({
      type: "pairing.scanned",
      channel: "wechat",
      sessionId,
      externalChatId: status.ilink_user_id ?? botId,
      ...(status.ilink_user_id ? { externalUserId: status.ilink_user_id } : {}),
      scannedAt: this.now(),
    });
    // Begin consuming inbound messages with the freshly-issued credentials.
    this.startUpdatesLoop();
  }

  private async refreshQr(
    sessionId: string,
    pairing: PairingState,
  ): Promise<boolean> {
    pairing.refreshCount += 1;
    if (pairing.refreshCount > MAX_QR_REFRESH_COUNT) {
      const expired = this.buildQrState(
        sessionId,
        pairing.qrcodeUrl,
        "expired",
      );
      await this.emit({ type: "pairing.expired", qr: expired });
      this.pairings.delete(sessionId);
      return false;
    }
    try {
      const qr = await this.fetchQrCode(pairing.baseUrl);
      pairing.qrcode = qr.qrcode;
      pairing.qrcodeUrl = qr.qrcode_img_content;
      const state = this.buildQrState(
        sessionId,
        qr.qrcode_img_content,
        "pending",
      );
      await this.emit({ type: "pairing.qr", qr: state });
      return true;
    } catch {
      const expired = this.buildQrState(
        sessionId,
        pairing.qrcodeUrl,
        "expired",
      );
      await this.emit({ type: "pairing.expired", qr: expired });
      this.pairings.delete(sessionId);
      return false;
    }
  }

  private waitForVerifyCode(pairing: PairingState): Promise<void> {
    if (pairing.pendingVerifyCode) return Promise.resolve();
    return new Promise<void>((resolve) => {
      pairing.resumeVerify = resolve;
    });
  }

  private async fetchQrCode(baseUrl: string): Promise<QrCodeResponse> {
    const endpoint = `ilink/bot/get_bot_qrcode?bot_type=${encodeURIComponent(
      DEFAULT_ILINK_BOT_TYPE,
    )}`;
    const text = await this.postJson(
      endpoint,
      { local_token_list: [] },
      { auth: false, baseUrl },
    );
    return JSON.parse(text) as QrCodeResponse;
  }

  private async pollStatus(
    baseUrl: string,
    qrcode: string,
    verifyCode: string | undefined,
  ): Promise<StatusResponse> {
    let endpoint = `ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(
      qrcode,
    )}`;
    if (verifyCode) {
      endpoint += `&verify_code=${encodeURIComponent(verifyCode)}`;
    }
    try {
      const text = await this.getText(baseUrl, endpoint);
      return JSON.parse(text) as StatusResponse;
    } catch (error) {
      // Long-poll client-side timeout / gateway error: keep waiting.
      if (error instanceof Error && error.name === "AbortError") {
        return { status: "wait" };
      }
      return { status: "wait" };
    }
  }

  // --- getupdates long-poll loop --------------------------------------------

  private startUpdatesLoop(): void {
    if (this.updatesLoopRunning) return;
    if (!this.credentials) return;
    this.updatesLoopRunning = true;
    void this.updatesLoop().catch(() => {
      this.updatesLoopRunning = false;
    });
  }

  private async updatesLoop(): Promise<void> {
    try {
      while (this.updatesLoopRunning) {
        const creds = this.credentials;
        if (!creds) break;
        let response: GetUpdatesResponse | null = null;
        try {
          const text = await this.postJson(
            "ilink/bot/getupdates",
            { get_updates_buf: this.updatesCursor },
            { auth: true, baseUrl: creds.baseurl },
          );
          response = JSON.parse(text) as GetUpdatesResponse;
        } catch {
          // Network error: back off and retry without crashing.
          await this.sleep(GETUPDATES_BACKOFF_MS);
          continue;
        }

        if (typeof response.get_updates_buf === "string") {
          this.updatesCursor = response.get_updates_buf;
        }

        if (response.ret !== undefined && response.ret !== 0) {
          // Server-side error (e.g. session timeout): back off and retry.
          await this.sleep(GETUPDATES_BACKOFF_MS);
          continue;
        }

        for (const msg of response.msgs ?? []) {
          await this.handleInbound(msg);
        }

        // Always yield between long-poll iterations. In production the server
        // holds the request (~35s) so this is a no-op pacing gap; without it a
        // fast-returning server (or a test fetch) would spin a microtask loop
        // and never deschedule.
        await this.sleep(0);
      }
    } finally {
      this.updatesLoopRunning = false;
    }
  }

  private async handleInbound(msg: WeixinMessage): Promise<void> {
    if (msg.message_type !== MESSAGE_TYPE_USER) return;
    const from = msg.from_user_id;
    if (!from) return;
    if (msg.context_token) {
      this.contextTokenByUser.set(from, msg.context_token);
    }
    const text = extractText(msg.item_list);
    const receivedAt = msg.create_time_ms ?? this.now();
    const id =
      msg.message_id !== undefined
        ? `wechat-inbound-${msg.message_id}`
        : `wechat-inbound-${++this.counter}`;
    await this.emit({
      type: "message",
      event: {
        id,
        channel: "wechat",
        direction: "inbound",
        externalChatId: from,
        deliveryId: id,
        summary: text,
        bodyText: text,
        from,
        metadata: { contextAvailable: Boolean(msg.context_token) },
        receivedAt,
      },
    });
  }

  // --- HTTP helpers ----------------------------------------------------------

  private async postJson(
    endpoint: string,
    body: unknown,
    options: { auth: boolean; baseUrl?: string },
  ): Promise<string> {
    const url = joinUrl(options.baseUrl ?? this.baseUrl, endpoint);
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: this.buildHeaders({ auth: options.auth, json: true }),
      body: JSON.stringify(body),
    });
    return readOk(res, endpoint);
  }

  private async getText(baseUrl: string, endpoint: string): Promise<string> {
    const url = joinUrl(baseUrl, endpoint);
    const res = await this.fetchImpl(url, {
      method: "GET",
      headers: this.buildHeaders({ auth: false, json: false }),
    });
    return readOk(res, endpoint);
  }

  private buildHeaders(opts: {
    auth: boolean;
    json: boolean;
  }): Record<string, string> {
    const headers: Record<string, string> = {
      "X-WECHAT-UIN": randomWechatUin(),
    };
    if (opts.json) headers["Content-Type"] = "application/json";
    if (opts.auth) {
      headers.AuthorizationType = "ilink_bot_token";
      const token = this.credentials?.bot_token?.trim();
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  }

  // --- QR state builders -----------------------------------------------------

  private buildQrState(
    sessionId: string,
    url: string,
    status: "pending" | "expired",
  ): PairingQrState {
    return {
      id: `wechat-qr-${slug(sessionId)}-${++this.counter}`,
      channel: "wechat",
      sessionId,
      status,
      url,
      expiresAt: status === "pending" ? this.now() + QR_TTL_MS : this.now(),
    };
  }

  private scannedQrEvent(
    sessionId: string,
    url: string,
    ilinkStatus: "scanned",
  ): ImConnectorEvent {
    return {
      type: "pairing.qr",
      qr: {
        id: `wechat-qr-${slug(sessionId)}-${++this.counter}`,
        channel: "wechat",
        sessionId,
        status: "scanned",
        url,
        metadata: { ilinkStatus },
      },
    };
  }

  private needVerifyCodeEvent(
    sessionId: string,
    url: string,
  ): ImConnectorEvent {
    // PairingQrStatus has no "need_verifycode"; surface it via metadata while
    // keeping the QR visibly pending so the UI can prompt for the code.
    return {
      type: "pairing.qr",
      qr: {
        id: `wechat-qr-${slug(sessionId)}-${++this.counter}`,
        channel: "wechat",
        sessionId,
        status: "pending",
        url,
        metadata: { ilinkStatus: "need_verifycode", needVerifyCode: true },
      },
    };
  }

  private async emit(event: ImConnectorEvent): Promise<void> {
    this.observedEvents.push(event);
    for (const handler of this.handlers) {
      await handler(event);
    }
  }
}

/** Factory mirroring the old `createWeChatConnector` signature target. */
export function createWeChatConnector(
  options: WeChatIlinkConnectorOptions = {},
): WeChatIlinkConnector {
  return new WeChatIlinkConnector(options);
}

// --- module-private helpers ---------------------------------------------------

function extractText(items: WeixinMessageItem[] | undefined): string {
  for (const item of items ?? []) {
    if (
      item.type === ITEM_TYPE_TEXT &&
      typeof item.text_item?.text === "string"
    ) {
      return item.text_item.text;
    }
  }
  return "";
}

/** X-WECHAT-UIN header: random uint32 -> decimal string -> base64. */
function randomWechatUin(): string {
  const uint32 = randomBytes(4).readUInt32BE(0);
  return Buffer.from(String(uint32), "utf-8").toString("base64");
}

function joinUrl(baseUrl: string, endpoint: string): string {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(endpoint, base).toString();
}

async function readOk(res: Response, label: string): Promise<string> {
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${label} ${res.status}: ${text}`);
  }
  return text;
}

function safeParseCredentials(raw: string): StoredCredentials | null {
  try {
    const parsed = JSON.parse(raw) as Partial<StoredCredentials>;
    if (
      typeof parsed.ilink_bot_id === "string" &&
      typeof parsed.bot_token === "string" &&
      typeof parsed.baseurl === "string"
    ) {
      return {
        ilink_bot_id: parsed.ilink_bot_id,
        bot_token: parsed.bot_token,
        baseurl: parsed.baseurl,
      };
    }
  } catch {}
  return null;
}

function slug(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "session";
}
