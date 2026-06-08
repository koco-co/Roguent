import { spawn as nodeSpawn } from "node:child_process";
import type { EventEmitter } from "node:events";
import type { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import type { IntegrationConnectorStatus } from "../../shared/integrations";
import {
  WeChatConnector,
  WeChatConnectorError,
  type WeChatConnectorOptions,
} from "./wechat";
import type {
  ImConnector,
  ImConnectorEvent,
  OutboundDeliveryResult,
  OutboundImTarget,
  PairingQrState,
} from "./wechat-types";

export type WeChatHostRequest =
  | { id: string; type: "startPairing"; sessionId: string }
  | { id: string; type: "stopPairing"; sessionId: string }
  | { id: string; type: "sendMessage"; externalChatId: string; text: string };

type WeChatHostRequestPayload =
  | { type: "startPairing"; sessionId: string }
  | { type: "stopPairing"; sessionId: string }
  | { type: "sendMessage"; externalChatId: string; text: string };

export type WeChatHostResponse =
  | { id: string; ok: true; result: unknown }
  | { id: string; ok: false; error: string; code?: string };

export type WeChatHostEnvelope =
  | { type: "event"; event: ImConnectorEvent }
  | { type: "status"; status: IntegrationConnectorStatus }
  | WeChatHostResponse;

export interface WeChatNodeHostSpawnOptions {
  stdio: ["pipe", "pipe", "pipe"];
  env?: Record<string, string | undefined>;
}

export interface WeChatNodeHostProcess extends EventEmitter {
  stdin?: Writable;
  stdout?: Readable;
  stderr?: Readable;
  killed?: boolean;
  kill(signal?: NodeJS.Signals | number): boolean;
}

export type WeChatNodeHostSpawn = (
  command: string,
  args: string[],
  options: WeChatNodeHostSpawnOptions,
) => WeChatNodeHostProcess;

export interface WeChatNodeHostConnectorOptions {
  nodePath?: string;
  hostPath?: string;
  nodeVersion?: string;
  spawn?: WeChatNodeHostSpawn;
  env?: Record<string, string | undefined>;
  requestTimeoutMs?: number;
  now?: () => number;
}

export interface WeChatFallbackConnectorOptions {
  bun?: ImConnector;
  node?: ImConnector;
  bunOptions?: WeChatConnectorOptions;
  nodeOptions?: WeChatNodeHostConnectorOptions;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

export class WeChatNodeHostError extends Error {
  constructor(
    readonly code: "node_unavailable" | "host_unavailable" | "host_error",
    message: string,
  ) {
    super(message);
    this.name = "WeChatNodeHostError";
  }
}

export class WeChatNodeHostConnector implements ImConnector {
  readonly observedEvents: ImConnectorEvent[] = [];

  private readonly handlers = new Set<
    (event: ImConnectorEvent) => void | Promise<void>
  >();
  private readonly nodePath: string;
  private readonly hostPath: string;
  private readonly spawn: WeChatNodeHostSpawn;
  private readonly requestTimeoutMs: number;
  private readonly now: () => number;
  private child: WeChatNodeHostProcess | null = null;
  private stdoutBuffer = "";
  private stderrBuffer = "";
  private requestCounter = 0;
  private pending = new Map<string, PendingRequest>();

  constructor(private readonly options: WeChatNodeHostConnectorOptions = {}) {
    this.nodePath = options.nodePath ?? "node";
    this.hostPath =
      options.hostPath ??
      fileURLToPath(new URL("./wechat-node-host.mjs", import.meta.url));
    this.spawn = options.spawn ?? nodeSpawn;
    this.requestTimeoutMs =
      options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.now = options.now ?? Date.now;
  }

  async startPairing(sessionId: string): Promise<PairingQrState> {
    return this.request<PairingQrState>({ type: "startPairing", sessionId });
  }

  async stopPairing(sessionId: string): Promise<void> {
    await this.request({ type: "stopPairing", sessionId });
  }

  async sendMessage(
    target: OutboundImTarget,
    text: string,
  ): Promise<OutboundDeliveryResult> {
    return this.request<OutboundDeliveryResult>({
      type: "sendMessage",
      externalChatId: target.externalChatId,
      text,
    });
  }

  onEvent(
    handler: (event: ImConnectorEvent) => void | Promise<void>,
  ): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async close(): Promise<void> {
    this.child?.kill("SIGTERM");
    this.child = null;
    this.rejectAll(new WeChatNodeHostError("host_unavailable", "host closed"));
  }

  private async request<T>(payload: WeChatHostRequestPayload): Promise<T> {
    this.ensureHost();
    const child = this.child;
    if (!child?.stdin) {
      throw new WeChatNodeHostError("host_unavailable", "host stdin missing");
    }
    const id = `wechat-node-${++this.requestCounter}`;
    const message = { id, ...payload } as WeChatHostRequest;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new WeChatNodeHostError("host_error", "WeChat host timeout"));
      }, this.requestTimeoutMs);
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer,
      });
      child.stdin?.write(`${JSON.stringify(message)}\n`);
    });
  }

  private ensureHost(): void {
    if (this.child) return;
    const major = this.nodeMajorVersion();
    if (major === null || major < 22) {
      const message =
        major === null
          ? "Node.js is unavailable for WeChat fallback host"
          : `Node.js >=22 required for WeChat fallback host, got ${major}`;
      const error = new WeChatNodeHostError("node_unavailable", message);
      void this.emitStatus("error", message, { nodeMajor: major });
      throw error;
    }
    const child = this.spawn(this.nodePath, [this.hostPath], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...Bun.env, ...this.options.env },
    });
    this.child = child;
    this.stdoutBuffer = "";
    this.stderrBuffer = "";
    child.stdout?.on("data", (chunk) => this.handleStdout(String(chunk)));
    child.stderr?.on("data", (chunk) => this.handleStderr(String(chunk)));
    child.on("exit", (code, signal) =>
      this.handleExit(
        `WeChat Node host exited code=${String(code)} signal=${String(signal)}`,
      ),
    );
    child.on("error", (error) =>
      this.handleExit(
        error instanceof Error ? error.message : `WeChat host error: ${error}`,
      ),
    );
  }

  private nodeMajorVersion(): number | null {
    if (this.options.nodeVersion !== undefined) {
      return parseNodeMajorVersion(this.options.nodeVersion);
    }
    try {
      const result = Bun.spawnSync([this.nodePath, "--version"]);
      return parseNodeMajorVersion(
        result.stdout.toString() || result.stderr.toString(),
      );
    } catch {
      return null;
    }
  }

  private handleStdout(chunk: string): void {
    this.stdoutBuffer += chunk;
    const lines = this.stdoutBuffer.split(/\r?\n/);
    this.stdoutBuffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) this.handleLine(line);
    }
  }

  private handleStderr(chunk: string): void {
    this.stderrBuffer += chunk;
    if (this.stderrBuffer.length > 4000) {
      this.stderrBuffer = this.stderrBuffer.slice(-4000);
    }
  }

  private handleLine(line: string): void {
    let envelope: WeChatHostEnvelope;
    try {
      envelope = JSON.parse(line) as WeChatHostEnvelope;
    } catch {
      return;
    }
    if ("id" in envelope) {
      this.handleResponse(envelope);
      return;
    }
    if (envelope.type === "event") {
      void this.emit(envelope.event);
      return;
    }
    if (envelope.type === "status") {
      void this.emit({ type: "status", status: envelope.status });
    }
  }

  private handleResponse(response: WeChatHostResponse): void {
    const pending = this.pending.get(response.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(response.id);
    if (response.ok) {
      pending.resolve(response.result);
    } else {
      pending.reject(
        new WeChatNodeHostError(
          response.code === "node_unavailable"
            ? "node_unavailable"
            : "host_error",
          response.error,
        ),
      );
    }
  }

  private handleExit(message: string): void {
    this.child = null;
    const error = new WeChatNodeHostError("host_unavailable", message);
    this.rejectAll(error);
    void this.emitStatus("error", message, {
      stderr: this.stderrBuffer.trim() || undefined,
    });
  }

  private rejectAll(error: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
  }

  private async emitStatus(
    state: IntegrationConnectorStatus["state"],
    error?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.emit({
      type: "status",
      status: {
        id: "wechat-node-host",
        channel: "wechat",
        state,
        label: "WeChat Node Host",
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

export class WeChatFallbackConnector implements ImConnector {
  private active: ImConnector;

  constructor(
    private readonly bun: ImConnector,
    private readonly node: ImConnector,
  ) {
    this.active = bun;
  }

  async startPairing(sessionId: string): Promise<PairingQrState> {
    return this.withNodeFallback((connector) =>
      connector.startPairing(sessionId),
    );
  }

  async stopPairing(sessionId: string): Promise<void> {
    await this.withNodeFallback((connector) =>
      connector.stopPairing(sessionId),
    );
  }

  async sendMessage(
    target: OutboundImTarget,
    text: string,
  ): Promise<OutboundDeliveryResult> {
    return this.withNodeFallback((connector) =>
      connector.sendMessage(target, text),
    );
  }

  onEvent(
    handler: (event: ImConnectorEvent) => void | Promise<void>,
  ): () => void {
    const unsubscribeBun = this.bun.onEvent(handler);
    const unsubscribeNode = this.node.onEvent(handler);
    return () => {
      unsubscribeBun();
      unsubscribeNode();
    };
  }

  private async withNodeFallback<T>(
    operation: (connector: ImConnector) => Promise<T>,
  ): Promise<T> {
    try {
      return await operation(this.active);
    } catch (error) {
      if (this.active === this.bun && isBunIncompatibility(error)) {
        this.active = this.node;
        return operation(this.node);
      }
      throw error;
    }
  }
}

export function createWeChatConnector(
  options: WeChatFallbackConnectorOptions = {},
): ImConnector {
  return new WeChatFallbackConnector(
    options.bun ?? new WeChatConnector(options.bunOptions),
    options.node ?? new WeChatNodeHostConnector(options.nodeOptions),
  );
}

export function parseNodeMajorVersion(version: string): number | null {
  const match = version.trim().match(/^v?(\d+)(?:\.|$)/);
  if (!match?.[1]) return null;
  return Number(match[1]);
}

function isBunIncompatibility(error: unknown): boolean {
  return (
    error instanceof WeChatConnectorError &&
    error.code === "wechat_bun_incompatible"
  );
}
