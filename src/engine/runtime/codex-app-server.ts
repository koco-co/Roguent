import { spawn as nodeSpawn } from "node:child_process";
import type { EventEmitter } from "node:events";
import type { Readable, Writable } from "node:stream";
import type { PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import type { RuntimeStatusPayload } from "../../shared/events";
import type { RuntimeConfig } from "../../shared/runtime";
import {
  normalizePermissionMode,
  normalizeReasoningEffort,
  normalizeSandboxMode,
} from "../../shared/runtime";
import { redactAuditText } from "../audit/log";
import type { DriverCallbacks, IDriver } from "./claude-driver";
import { resolveCodexCliPath } from "./codex-capabilities";
import { createCodexRuntimeNormalizer } from "./codex-normalize";
import {
  type CodexInitializeResult,
  type CodexInterruptResult,
  type CodexJsonRpcId,
  type CodexJsonRpcRequest,
  type CodexJsonRpcResponse,
  type CodexNotification,
  type CodexProtocolMessage,
  type CodexRuntimeEvent,
  type CodexThreadStartInput,
  type CodexThreadStartParams,
  type CodexThreadStartResult,
  type CodexTransport,
  type CodexTurnInterruptParams,
  type CodexTurnStartParams,
  type CodexTurnStartResult,
  type CodexUserInput,
  codexNotificationToRuntimeEvent,
  codexServerRequestToRuntimeEvent,
  codexTextInput,
  createCodexJsonRpcRequest,
  createCodexNotification,
  isCodexJsonRpcRequest,
  isCodexJsonRpcResponse,
  isCodexNotification,
  parseCodexProtocolLine,
} from "./codex-protocol";
import type { RuntimeSendMeta } from "./types";

const APP_SERVER_ARGS = ["app-server", "--listen", "stdio://"] as const;
const DEFAULT_REQUEST_TIMEOUT_MS = 5000;
const CLOSE_TIMEOUT_MS = 250;

export interface CodexAppServerSpawnOptions {
  cwd?: string;
  env?: Record<string, string>;
  stdio: ["pipe", "pipe", "pipe"];
}

export interface CodexAppServerSpawnedProcess extends EventEmitter {
  stdin?: Writable;
  stdout?: Readable;
  stderr?: Readable;
  killed?: boolean;
  kill(signal?: NodeJS.Signals | number): boolean;
}

export type CodexAppServerSpawn = (
  command: string,
  args: string[],
  options: CodexAppServerSpawnOptions,
) => CodexAppServerSpawnedProcess;

export interface CodexAppServerLogEntry {
  stream: "stdout" | "stderr";
  text: string;
}

export interface CodexAppServerClientOptions {
  cliPath?: string;
  cwd?: string;
  env?: Record<string, string | undefined>;
  spawn?: CodexAppServerSpawn;
  requestTimeoutMs?: number;
  startupTimeoutMs?: number;
  clientInfo?: { name: string; version: string };
  onLog?: (entry: CodexAppServerLogEntry) => void;
  onClientCreated?: (client: CodexAppServerClient) => void;
}

export class CodexAppServerUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "CodexAppServerUnavailableError";
  }
}

export interface CodexAppServerDriverOptions
  extends Omit<CodexAppServerClientOptions, "cwd"> {}

export class CodexAppServerDriver implements IDriver {
  private client: CodexAppServerClient | null = null;
  private startupClient: CodexAppServerClient | null = null;
  private clientPromise: Promise<CodexAppServerClient> | null = null;
  private unsubscribeEvents: (() => void) | null = null;
  private ended = false;
  private readonly normalizer = createCodexRuntimeNormalizer();

  constructor(
    private readonly callbacks: DriverCallbacks,
    private config: RuntimeConfig & { cwd: string },
    private readonly options: CodexAppServerDriverOptions = {},
  ) {}

  start(): void {
    void this.ensureClient().catch(() => {});
  }

  send(text: string, _meta?: RuntimeSendMeta): void {
    if (this.ended) return;
    void this.ensureClient()
      .then((client) =>
        client.send(text, {
          thread: threadStartInput(this.config),
        }),
      )
      .catch((error) => this.emitError(errorMessage(error)));
  }

  async setModel(model: string): Promise<void> {
    this.config = { ...this.config, model };
  }

  async setPermissionMode(mode: string): Promise<void> {
    this.config = {
      ...this.config,
      permissionMode: normalizePermissionMode(mode, this.config.permissionMode),
    };
  }

  async setSandboxMode(mode: string): Promise<void> {
    this.config = {
      ...this.config,
      sandboxMode: normalizeSandboxMode(mode, this.config.sandboxMode),
    };
  }

  async setReasoningEffort(effort: string): Promise<void> {
    this.config = {
      ...this.config,
      reasoningEffort: normalizeReasoningEffort(
        effort,
        this.config.reasoningEffort,
      ),
    };
  }

  async interrupt(): Promise<void> {
    await this.client?.interrupt();
  }

  end(): void {
    this.ended = true;
    this.unsubscribeEvents?.();
    this.unsubscribeEvents = null;
    void this.client?.close();
    void this.startupClient?.close();
    this.client = null;
    this.startupClient = null;
    this.clientPromise = null;
  }

  async getContextUsage(): Promise<{
    totalTokens: number;
    maxTokens: number;
  } | null> {
    return null;
  }

  async askPermission(): Promise<{ behavior: "deny"; message: string }> {
    return {
      behavior: "deny",
      message: "Codex app-server approvals are requested by the app-server.",
    };
  }

  respondPermission(promptId: string, result: PermissionResult): Promise<void> {
    return this.ensureClient()
      .then((client) => client.respondApproval(promptId, result.behavior))
      .then(() => this.emitPromptResolved(promptId));
  }

  respondQuestion(promptId: string, selectedLabels: string[]): Promise<void> {
    return this.ensureClient()
      .then((client) => client.respondQuestion(promptId, selectedLabels))
      .then(() => this.emitPromptResolved(promptId));
  }

  private ensureClient(): Promise<CodexAppServerClient> {
    if (this.client) return Promise.resolve(this.client);
    if (this.clientPromise) return this.clientPromise;
    this.emitStatus({ status: "starting" });
    this.clientPromise = CodexAppServerClient.start({
      ...this.options,
      cwd: this.config.cwd,
      onClientCreated: (client) => {
        this.startupClient = client;
        if (this.ended) void client.close();
      },
    })
      .then((client) => {
        if (this.ended) {
          void client.close();
          throw new Error("Codex app-server driver ended");
        }
        this.startupClient = null;
        this.client = client;
        this.unsubscribeEvents = client.onEvent((event) => {
          const drafts = this.normalizer.normalize(event);
          if (drafts.length > 0) this.callbacks.onDraft(drafts, Date.now());
        });
        this.emitStatus({
          status: "running",
          metadata: { mode: "app-server", realtime: true },
        });
        return client;
      })
      .catch((error) => {
        this.startupClient = null;
        this.clientPromise = null;
        if (!this.ended) {
          this.emitStatus({
            status: "error",
            error: errorMessage(error),
            metadata: { mode: "app-server", realtime: true },
          });
        }
        throw error;
      });
    return this.clientPromise;
  }

  private emitPromptResolved(promptId: string): void {
    this.callbacks.onDraft(
      [{ type: "prompt.resolved", payload: { promptId, result: "answered" } }],
      Date.now(),
    );
  }

  private emitError(message: string): void {
    this.callbacks.onDraft(
      [{ type: "session.error", payload: { message } }],
      Date.now(),
    );
  }

  private emitStatus(
    payload: Omit<RuntimeStatusPayload, "runtime" | "config" | "cwd">,
  ): void {
    this.callbacks.onDraft(
      [
        {
          type: "runtime.status",
          payload: {
            runtime: "codex",
            config: this.runtimeConfig(),
            cwd: this.config.cwd,
            ...payload,
          },
        },
      ],
      Date.now(),
    );
  }

  private runtimeConfig(): RuntimeConfig {
    const { cwd: _cwd, ...config } = this.config;
    return config;
  }
}

export class CodexAppServerClient implements CodexTransport {
  private activeThreadId: string | undefined;
  private activeTurnId: string | undefined;

  private constructor(
    private readonly transport: CodexStdioTransport,
    private readonly clientInfo: { name: string; version: string },
  ) {}

  static async start(
    options: CodexAppServerClientOptions = {},
  ): Promise<CodexAppServerClient> {
    const env = options.env ?? process.env;
    const cliPath = options.cliPath?.trim() || resolveCodexCliPath(env);
    const spawn = options.spawn ?? spawnCodexAppServerProcess;
    let child: CodexAppServerSpawnedProcess;
    try {
      child = spawn(cliPath, [...APP_SERVER_ARGS], {
        cwd: options.cwd,
        env: mergeEnv(process.env, options.env),
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (error) {
      throw new CodexAppServerUnavailableError(
        `Codex app-server unavailable: ${errorMessage(error)}. Verify \`${cliPath} app-server --listen stdio://\` works.`,
        { cause: error },
      );
    }
    const transport = new CodexStdioTransport(child, {
      requestTimeoutMs: options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
      onLog: options.onLog,
    });
    const client = new CodexAppServerClient(
      transport,
      options.clientInfo ?? { name: "roguent", version: "0" },
    );
    options.onClientCreated?.(client);

    try {
      await client.initialize(
        options.startupTimeoutMs ??
          options.requestTimeoutMs ??
          DEFAULT_REQUEST_TIMEOUT_MS,
      );
      await client.notify("initialized");
    } catch (error) {
      await client.close();
      throw new CodexAppServerUnavailableError(
        `Codex app-server unavailable: ${errorMessage(error)}. Verify \`${cliPath} app-server --listen stdio://\` works.`,
        { cause: error },
      );
    }

    return client;
  }

  request<T>(method: string, params?: unknown, timeoutMs?: number): Promise<T> {
    return this.transport.request<T>(method, params, timeoutMs);
  }

  notify(method: string, params?: unknown): Promise<void> {
    return this.transport.notify(method, params);
  }

  respond(id: CodexJsonRpcId, result: unknown): Promise<void> {
    return this.transport.respond(id, result);
  }

  respondApproval(
    requestId: CodexJsonRpcId,
    behavior: "allow" | "deny",
  ): Promise<void> {
    return this.respond(requestId, {
      decision: behavior === "allow" ? "approved" : "denied",
    });
  }

  respondQuestion(
    requestId: CodexJsonRpcId,
    selectedLabels: string[],
  ): Promise<void> {
    return this.respond(requestId, { selectedLabels });
  }

  onNotification(handler: (message: CodexNotification) => void): () => void {
    return this.transport.onNotification(handler);
  }

  onServerRequest(handler: (message: CodexJsonRpcRequest) => void): () => void {
    return this.transport.onServerRequest(handler);
  }

  onEvent(handler: (event: CodexRuntimeEvent) => void): () => void {
    const unsubscribeNotification = this.onNotification((notification) => {
      const event = codexNotificationToRuntimeEvent(notification);
      if (event) handler(event);
    });
    const unsubscribeRequest = this.onServerRequest((request) => {
      const event = codexServerRequestToRuntimeEvent(request);
      if (event) handler(event);
    });
    return () => {
      unsubscribeNotification();
      unsubscribeRequest();
    };
  }

  startThread(
    params: CodexThreadStartInput = {},
  ): Promise<CodexThreadStartResult> {
    return this.request<CodexThreadStartResult>(
      "thread/start",
      params satisfies CodexThreadStartParams,
    ).then((result) => {
      this.activeThreadId = result.thread.id;
      return result;
    });
  }

  startTurn(
    threadId: string,
    input: CodexUserInput[],
    params: Record<string, unknown> = {},
  ): Promise<CodexTurnStartResult> {
    const requestParams: CodexTurnStartParams = {
      ...params,
      threadId,
      input,
    };
    return this.request<CodexTurnStartResult>("turn/start", requestParams).then(
      (result) => {
        this.activeThreadId = threadId;
        this.activeTurnId = result.turn.id;
        return result;
      },
    );
  }

  async send(
    text: string,
    options: {
      thread?: CodexThreadStartInput;
      turn?: Record<string, unknown>;
    } = {},
  ): Promise<CodexTurnStartResult> {
    const threadId =
      this.activeThreadId ??
      (await this.startThread(options.thread ?? {})).thread.id;
    return this.startTurn(threadId, [codexTextInput(text)], options.turn);
  }

  interruptTurn(
    threadId: string,
    turnId: string,
  ): Promise<CodexInterruptResult> {
    const requestParams: CodexTurnInterruptParams = { threadId, turnId };
    return this.request<CodexInterruptResult>("turn/interrupt", requestParams);
  }

  interrupt(): Promise<CodexInterruptResult | null> {
    if (!this.activeThreadId || !this.activeTurnId) {
      return Promise.resolve(null);
    }
    return this.interruptTurn(this.activeThreadId, this.activeTurnId);
  }

  close(): Promise<void> {
    return this.transport.close();
  }

  private initialize(timeoutMs: number): Promise<CodexInitializeResult> {
    return this.request<CodexInitializeResult>(
      "initialize",
      {
        clientInfo: this.clientInfo,
        capabilities: { experimentalApi: true },
      },
      timeoutMs,
    );
  }
}

class CodexStdioTransport implements CodexTransport {
  private nextId = 1;
  private stdoutBuffer = "";
  private stderrBuffer = "";
  private closed = false;
  private closePromise: Promise<void> | undefined;
  private readonly pending = new Map<
    string,
    {
      method: string;
      timer: ReturnType<typeof setTimeout>;
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
    }
  >();
  private readonly notificationHandlers = new Set<
    (message: CodexNotification) => void
  >();
  private readonly serverRequestHandlers = new Set<
    (message: CodexJsonRpcRequest) => void
  >();

  constructor(
    private readonly child: CodexAppServerSpawnedProcess,
    private readonly options: {
      requestTimeoutMs: number;
      onLog?: (entry: CodexAppServerLogEntry) => void;
    },
  ) {
    child.stdout?.on("data", (chunk) => {
      this.handleStdout(String(chunk));
    });
    child.stderr?.on("data", (chunk) => {
      this.handleStderr(String(chunk));
    });
    child.stdin?.on("error", (error) => {
      this.closeWithError(new Error(`Codex app-server stdin error: ${error}`));
    });
    child.once("error", (error) => {
      this.closeWithError(new Error(`Codex app-server error: ${error}`));
    });
    child.once("close", (code, signal) => {
      this.closeWithError(
        new Error(
          `Codex app-server closed (code ${code ?? "unknown"}, signal ${
            signal ?? "none"
          })`,
        ),
      );
    });
  }

  request<T>(
    method: string,
    params?: unknown,
    timeoutMs = this.options.requestTimeoutMs,
  ): Promise<T> {
    if (this.closed) {
      return Promise.reject(new Error("Codex app-server closed"));
    }
    const id = this.nextId++;
    const request = createCodexJsonRpcRequest(id, method, params);
    const payload = `${JSON.stringify(request)}\n`;

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(String(id));
        reject(
          new Error(
            `Codex app-server request timed out: ${method} after ${timeoutMs}ms`,
          ),
        );
      }, timeoutMs);
      this.pending.set(String(id), {
        method,
        timer,
        resolve: resolve as (value: unknown) => void,
        reject,
      });

      const writable = this.child.stdin;
      if (!writable) {
        clearTimeout(timer);
        this.pending.delete(String(id));
        reject(new Error("Codex app-server stdin is unavailable"));
        return;
      }

      writable.write(payload, (error) => {
        if (!error) return;
        clearTimeout(timer);
        this.pending.delete(String(id));
        reject(new Error(`Codex app-server write failed: ${error}`));
      });
    });
  }

  notify(method: string, params?: unknown): Promise<void> {
    if (this.closed) {
      return Promise.reject(new Error("Codex app-server closed"));
    }
    const notification = createCodexNotification(method, params);
    return this.writeMessage(notification, method);
  }

  respond(id: CodexJsonRpcId, result: unknown): Promise<void> {
    if (this.closed) {
      return Promise.reject(new Error("Codex app-server closed"));
    }
    const response: CodexJsonRpcResponse = { jsonrpc: "2.0", id, result };
    return this.writeMessage(response, `response:${String(id)}`);
  }

  onNotification(handler: (message: CodexNotification) => void): () => void {
    this.notificationHandlers.add(handler);
    return () => {
      this.notificationHandlers.delete(handler);
    };
  }

  onServerRequest(handler: (message: CodexJsonRpcRequest) => void): () => void {
    this.serverRequestHandlers.add(handler);
    return () => {
      this.serverRequestHandlers.delete(handler);
    };
  }

  async close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.closePromise = new Promise((resolve) => {
      if (this.closed) {
        resolve();
        return;
      }
      this.closed = true;
      this.rejectAll(new Error("Codex app-server closed by client"));
      const timer = setTimeout(() => {
        this.child.kill("SIGKILL");
        resolve();
      }, CLOSE_TIMEOUT_MS);
      this.child.once("close", () => {
        clearTimeout(timer);
        resolve();
      });
      this.child.kill("SIGTERM");
    });
    await this.closePromise;
  }

  private handleStdout(chunk: string): void {
    this.stdoutBuffer += chunk;
    const lines = this.stdoutBuffer.split(/\r?\n/);
    this.stdoutBuffer = lines.pop() ?? "";
    for (const line of lines) {
      this.handleStdoutLine(line);
    }
  }

  private handleStderr(chunk: string): void {
    this.stderrBuffer += chunk;
    const lines = this.stderrBuffer.split(/\r?\n/);
    this.stderrBuffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) this.emitLog("stderr", line);
    }
  }

  private handleStdoutLine(line: string): void {
    if (!line.trim()) return;
    let message: CodexProtocolMessage;
    try {
      message = parseCodexProtocolLine(line);
    } catch {
      this.emitLog("stdout", line);
      return;
    }

    if (isCodexJsonRpcResponse(message)) {
      this.resolveResponse(message);
      return;
    }
    if (isCodexNotification(message)) {
      for (const handler of this.notificationHandlers) handler(message);
      return;
    }
    if (isCodexJsonRpcRequest(message)) {
      if (this.serverRequestHandlers.size === 0) {
        this.emitLog("stdout", JSON.stringify(message));
        return;
      }
      for (const handler of this.serverRequestHandlers) handler(message);
    }
  }

  private resolveResponse(response: CodexJsonRpcResponse): void {
    const pending = this.pending.get(String(response.id));
    if (!pending) {
      this.emitLog("stdout", JSON.stringify(response));
      return;
    }
    this.pending.delete(String(response.id));
    clearTimeout(pending.timer);
    if (response.error) {
      pending.reject(
        new Error(
          `Codex app-server request failed: ${pending.method}: ${response.error.message}`,
        ),
      );
      return;
    }
    pending.resolve(response.result);
  }

  private closeWithError(error: Error): void {
    if (this.closed) return;
    this.closed = true;
    this.rejectAll(error);
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private emitLog(stream: "stdout" | "stderr", text: string): void {
    this.options.onLog?.({ stream, text: redactAuditText(text) });
  }

  private writeMessage(message: unknown, method: string): Promise<void> {
    const writable = this.child.stdin;
    if (!writable) {
      return Promise.reject(new Error("Codex app-server stdin is unavailable"));
    }
    return new Promise((resolve, reject) => {
      writable.write(`${JSON.stringify(message)}\n`, (error) => {
        if (error) {
          reject(
            new Error(`Codex app-server write failed: ${method}: ${error}`),
          );
          return;
        }
        resolve();
      });
    });
  }
}

function spawnCodexAppServerProcess(
  command: string,
  args: string[],
  options: CodexAppServerSpawnOptions,
): CodexAppServerSpawnedProcess {
  return nodeSpawn(command, args, options) as CodexAppServerSpawnedProcess;
}

function threadStartInput(config: RuntimeConfig & { cwd: string }) {
  return {
    model: config.model,
    cwd: config.cwd,
    approvalPolicy: config.approvalPolicy,
    sandbox: { mode: config.sandboxMode, networkAccess: config.networkAccess },
    reasoningEffort: config.reasoningEffort,
    experimentalRawEvents: true,
  };
}

function mergeEnv(
  base: Record<string, string | undefined>,
  override: Record<string, string | undefined> | undefined,
): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries({ ...base, ...override })) {
    if (value !== undefined) merged[key] = value;
  }
  return merged;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
