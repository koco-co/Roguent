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
import type { DriverCallbacks } from "./claude-driver";
import { resolveCodexCliPath } from "./codex-capabilities";
import type { DraftEvent, RuntimeDriver, RuntimeSendMeta } from "./types";

export interface CodexExecSpawnOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  stdio: ["pipe", "pipe", "pipe"];
}

export interface CodexExecProcess extends EventEmitter {
  stdin?: Writable;
  stdout?: Readable;
  stderr?: Readable;
  killed?: boolean;
  kill(signal?: NodeJS.Signals | number): boolean;
}

export type CodexExecSpawn = (
  command: string,
  args: string[],
  options: CodexExecSpawnOptions,
) => CodexExecProcess;

export interface CodexExecFallbackOptions {
  cliPath?: string;
  env?: Record<string, string | undefined>;
  spawn?: CodexExecSpawn;
  killTimeoutMs?: number;
}

type JsonRecord = Record<string, unknown>;
const DEFAULT_KILL_TIMEOUT_MS = 250;
const MAX_STDERR_SUMMARY_LENGTH = 240;

interface CodexExecChildState {
  stdoutBuffer: string;
  stderrBuffer: string;
  closed: boolean;
  terminating: boolean;
}

export class CodexExecFallbackDriver implements RuntimeDriver {
  readonly mode = "exec-json";
  private activeChild: CodexExecProcess | null = null;
  private activeChildState: CodexExecChildState | null = null;
  private ended = false;

  constructor(
    private readonly callbacks: DriverCallbacks,
    private config: RuntimeConfig & { cwd: string },
    private readonly options: CodexExecFallbackOptions = {},
  ) {}

  start(): void {
    this.emitStatus({
      status: "degraded",
      message:
        "Codex app-server unavailable; using codex exec --json batch mode.",
      metadata: {
        mode: this.mode,
        realtime: false,
        degraded: true,
      },
    });
  }

  send(text: string, _meta?: RuntimeSendMeta): void {
    if (this.ended) return;
    if (this.activeChild && !this.activeChild.killed) {
      this.killActiveChild();
    }

    const cliPath =
      this.options.cliPath?.trim() ||
      resolveCodexCliPath(this.options.env ?? process.env);
    const spawn = this.options.spawn ?? spawnCodexExecProcess;
    const childState: CodexExecChildState = {
      stdoutBuffer: "",
      stderrBuffer: "",
      closed: false,
      terminating: false,
    };

    let child: CodexExecProcess;
    try {
      child = spawn(cliPath, codexExecArgs(this.config), {
        cwd: this.config.cwd,
        env: { ...process.env, ...this.options.env },
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (error) {
      this.emitError(
        `Codex exec fallback failed to start: ${errorMessage(error)}`,
      );
      return;
    }
    this.activeChild = child;
    this.activeChildState = childState;
    this.writePrompt(child, text);

    child.stdout?.on("data", (chunk) => {
      if (this.activeChild !== child) return;
      this.handleStdout(childState, String(chunk));
    });
    child.stderr?.on("data", (chunk) => {
      if (this.activeChild !== child) return;
      childState.stderrBuffer += String(chunk);
      if (childState.stderrBuffer.length > MAX_STDERR_SUMMARY_LENGTH * 4) {
        childState.stderrBuffer = childState.stderrBuffer.slice(
          -MAX_STDERR_SUMMARY_LENGTH * 4,
        );
      }
    });
    child.once("error", (error) => {
      if (this.activeChild !== child) return;
      this.emitError(`Codex exec fallback failed: ${errorMessage(error)}`);
      this.activeChild = null;
      this.activeChildState = null;
    });
    child.once("close", (code, signal) => {
      childState.closed = true;
      if (this.activeChild !== child) return;
      this.activeChild = null;
      this.activeChildState = null;
      if (this.ended || child.killed) return;
      this.flushStdout(childState);
      if (code === 0) return;
      this.emitError(
        `Codex exec fallback exited with code ${code ?? "unknown"}${
          signal ? `, signal ${signal}` : ""
        }${
          childState.stderrBuffer.trim()
            ? `; stderr: ${safeErrorText(childState.stderrBuffer)}`
            : ""
        }`,
      );
    });
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

  async setRuntimeConfig(config: RuntimeConfig): Promise<void> {
    const next: RuntimeConfig & { cwd: string } = {
      ...this.config,
      runtime: "codex",
      model: config.model.trim() || this.config.model,
      permissionMode: normalizePermissionMode(
        config.permissionMode,
        this.config.permissionMode,
      ),
      sandboxMode: normalizeSandboxMode(
        config.sandboxMode,
        this.config.sandboxMode,
      ),
      networkAccess: config.networkAccess,
    };
    if (config.approvalPolicy !== undefined) {
      next.approvalPolicy = config.approvalPolicy;
    }
    const reasoningEffort = normalizeReasoningEffort(
      config.reasoningEffort,
      this.config.reasoningEffort,
    );
    if (reasoningEffort !== undefined) {
      next.reasoningEffort = reasoningEffort;
    }
    this.config = next;
  }

  async interrupt(): Promise<void> {
    this.killActiveChild();
  }

  end(): void {
    this.ended = true;
    this.killActiveChild();
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
      message:
        "Codex exec fallback runs in batch mode and cannot approve tools.",
    };
  }

  respondPermission(_promptId: string, _result: PermissionResult): void {}

  private handleStdout(state: CodexExecChildState, chunk: string): void {
    state.stdoutBuffer += chunk;
    const lines = state.stdoutBuffer.split(/\r?\n/);
    state.stdoutBuffer = lines.pop() ?? "";
    for (const line of lines) this.handleStdoutLine(line);
  }

  private flushStdout(state: CodexExecChildState): void {
    const line = state.stdoutBuffer;
    state.stdoutBuffer = "";
    if (line.trim()) this.handleStdoutLine(line);
  }

  private handleStdoutLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;
    let value: unknown;
    try {
      value = JSON.parse(trimmed);
    } catch {
      return;
    }
    const drafts = normalizeExecJsonLine(value);
    if (drafts.length > 0) this.callbacks.onDraft(drafts, Date.now());
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
          raw: {
            source: "codex-exec",
            eventType: "runtime.status",
          },
        },
      ],
      Date.now(),
    );
  }

  private emitError(message: string): void {
    this.callbacks.onDraft(
      [
        {
          type: "runtime.status",
          payload: {
            runtime: "codex",
            status: "error",
            config: this.runtimeConfig(),
            cwd: this.config.cwd,
            message: "Codex exec fallback failed.",
            error: message,
            metadata: {
              mode: this.mode,
              realtime: false,
              degraded: true,
            },
          },
          raw: {
            source: "codex-exec",
            eventType: "runtime.status",
          },
        },
      ],
      Date.now(),
    );
  }

  private killActiveChild(): void {
    const child = this.activeChild;
    const state = this.activeChildState;
    if (!child || child.killed) return;
    if (state?.terminating) return;
    if (state) state.terminating = true;
    child.kill("SIGTERM");
    const timeout = this.options.killTimeoutMs ?? DEFAULT_KILL_TIMEOUT_MS;
    const timer = setTimeout(() => {
      if (!state?.closed) child.kill("SIGKILL");
    }, timeout);
    timer.unref?.();
  }

  private writePrompt(child: CodexExecProcess, text: string): void {
    if (!child.stdin) {
      this.emitError("Codex exec fallback stdin is unavailable.");
      return;
    }
    child.stdin.on("error", (error) => {
      if (this.activeChild === child) {
        this.emitError(
          `Codex exec fallback stdin failed: ${errorMessage(error)}`,
        );
      }
    });
    child.stdin.end(text);
  }

  private runtimeConfig(): RuntimeConfig {
    const { cwd: _cwd, ...config } = this.config;
    return config;
  }
}

function codexExecArgs(config: RuntimeConfig & { cwd: string }): string[] {
  const args = [
    "--model",
    config.model,
    "--sandbox",
    config.sandboxMode,
    "--cd",
    config.cwd,
  ];
  if (config.approvalPolicy) {
    args.push("--ask-for-approval", config.approvalPolicy);
  }
  if (config.networkAccess) {
    args.push("--search");
  }
  args.push("exec", "--json");
  if (config.reasoningEffort) {
    args.push("-c", `model_reasoning_effort="${config.reasoningEffort}"`);
  }
  args.push("-");
  return args;
}

function safeErrorText(value: string): string {
  const redacted = redactAuditText(value.trim()).replaceAll(/\s+/g, " ");
  if (redacted.length <= MAX_STDERR_SUMMARY_LENGTH) return redacted;
  return `${redacted.slice(0, MAX_STDERR_SUMMARY_LENGTH - 3)}...`;
}

export function normalizeExecJsonLine(value: unknown): DraftEvent[] {
  const record = asRecord(value);
  if (!record) return [];

  const eventType = eventTypeFrom(record);
  const drafts: DraftEvent[] = [];
  const text = assistantText(record, eventType);
  if (text) {
    drafts.push({
      type: "message.final",
      payload: { text },
      raw: {
        source: "codex-exec",
        eventType,
      },
    });
  }

  const usage = usagePayload(record);
  if (usage) {
    drafts.push({
      type: "usage.updated",
      payload: usage,
      raw: {
        source: "codex-exec",
        eventType,
      },
    });
  }

  return drafts;
}

function spawnCodexExecProcess(
  command: string,
  args: string[],
  options: CodexExecSpawnOptions,
): CodexExecProcess {
  return nodeSpawn(command, args, options);
}

function eventTypeFrom(record: JsonRecord): string {
  return (
    stringField(record, "type", "kind", "event", "eventType") ?? "codex.exec"
  );
}

function assistantText(record: JsonRecord, eventType: string): string | null {
  if (isUsageEvent(record, eventType)) return null;
  const role = stringField(record, "role");
  const text =
    stringField(record, "text", "content", "message", "output") ??
    stringField(
      asRecord(record.result),
      "text",
      "content",
      "message",
      "output",
    );
  if (!text) return null;
  if (
    role === "assistant" ||
    eventType.includes("assistant") ||
    eventType === "message" ||
    eventType === "result" ||
    eventType === "output"
  ) {
    return text;
  }
  return null;
}

function usagePayload(
  value: JsonRecord,
): { tokens: number; cost: number } | null {
  const usage =
    asRecord(value.usage) ??
    asRecord(value.tokenUsage) ??
    asRecord(value.token_usage) ??
    (isUsageEvent(value, eventTypeFrom(value)) ? value : null);
  return usage ? usageRecordPayload(usage) : null;
}

function usageRecordPayload(
  usage: JsonRecord,
): { tokens: number; cost: number } | null {
  if (!usage) return null;

  const total = asRecord(usage.total);
  if (total) {
    const nested = usageRecordPayload(total);
    if (!nested) return null;
    return {
      tokens: nested.tokens,
      cost:
        numberField(usage, "cost", "costUsd", "cost_usd", "totalCostUsd") ??
        nested.cost,
    };
  }

  const input = numberField(usage, "inputTokens", "input_tokens") ?? 0;
  const output = numberField(usage, "outputTokens", "output_tokens") ?? 0;
  const tokens =
    numberField(usage, "tokens", "totalTokens", "total_tokens") ??
    input + output;
  if (tokens <= 0) return null;
  return {
    tokens,
    cost:
      numberField(usage, "cost", "costUsd", "cost_usd", "totalCostUsd") ?? 0,
  };
}

function isUsageEvent(record: JsonRecord, eventType: string): boolean {
  return (
    eventType === "usage" ||
    eventType === "usage.updated" ||
    Boolean(record.usage) ||
    Boolean(record.tokenUsage) ||
    Boolean(record.token_usage)
  );
}

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object"
    ? (value as JsonRecord)
    : null;
}

function stringField(
  record: JsonRecord | null,
  ...names: string[]
): string | null {
  if (!record) return null;
  for (const name of names) {
    const value = record[name];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function numberField(
  record: JsonRecord | null,
  ...names: string[]
): number | undefined {
  if (!record) return undefined;
  for (const name of names) {
    const value = record[name];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
