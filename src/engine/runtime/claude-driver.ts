import {
  type CanUseTool,
  type Options,
  type PermissionMode,
  type PermissionResult,
  type Query,
  type SDKUserMessage,
  query,
} from "@anthropic-ai/claude-agent-sdk";
import type { RuntimeConfig } from "../../shared/runtime";
import type { RateLimitInfoLike } from "../limits-aggregator";
import {
  type DraftEvent,
  type HookLike,
  type SdkMessageLike,
  normalizeHook,
  normalizeSdkMessage,
  summarizeToolInput,
} from "../normalize";
import { readMacSystemProxy, resolveProxyEnv } from "../proxy";
import type { RuntimeDriver, RuntimeSendMeta } from "./types";

export function stripSubscriptionEnv(
  env: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const { ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, ...rest } = env;
  void ANTHROPIC_API_KEY;
  void ANTHROPIC_AUTH_TOKEN;
  return rest;
}

// 订阅 OAuth 下 SDK 的 system:init 实测把 apiKeySource 报成 'none'(无 api-key
// env),而非 spec 早先假设的 'oauth'。只有真用上了 api-key 源,才说明没走订阅。
const API_KEY_SOURCES = new Set(["user", "project", "org", "temporary"]);
export function usesApiKey(apiKeySource: string | undefined): boolean {
  return apiKeySource != null && API_KEY_SOURCES.has(apiKeySource);
}

const CLAUDE_PERMISSION_MODES = [
  "default",
  "acceptEdits",
  "bypassPermissions",
  "plan",
] as const satisfies readonly PermissionMode[];
type ClaudePermissionMode = (typeof CLAUDE_PERMISSION_MODES)[number];
const CLAUDE_PERMISSION_MODE_SET: ReadonlySet<string> = new Set(
  CLAUDE_PERMISSION_MODES,
);
export function isClaudePermissionMode(
  mode: string,
): mode is ClaudePermissionMode {
  return CLAUDE_PERMISSION_MODE_SET.has(mode);
}

// Tauri 打包后,host 把 .app 内的 claude CLI 资源路径经 env 传进来;dev(未设)
// 则回落 SDK 默认解析(node_modules 平台包)。返回 undefined 即"不覆盖默认"。
export function cliPathFromEnv(
  env: Record<string, string | undefined>,
): string | undefined {
  const trimmed = env.ROGUENT_CLI_PATH?.trim();
  return trimmed ? trimmed : undefined;
}

// Register passive observer hooks. Each returns {} immediately (never blocks the agent — spec §8.3/§10).
export function buildHooks(onHook: (h: HookLike) => void): Options["hooks"] {
  const observe = (i: unknown) => {
    onHook(i as HookLike);
    return Promise.resolve({});
  };
  return {
    PreToolUse: [{ matcher: "*", hooks: [observe] }],
    PostToolUse: [{ matcher: "*", hooks: [observe] }],
    PostToolUseFailure: [{ matcher: "*", hooks: [observe] }],
    SubagentStart: [{ hooks: [observe] }],
    SubagentStop: [{ hooks: [observe] }],
  };
}

export interface DriverCallbacks {
  onDraft: (drafts: DraftEvent[], ts: number) => void;
  // SDK 的 rate_limit_event:订阅用量(5h/7d util + 重置时刻)。账户级,不进 seq 信封,
  // 由 SessionManager 喂给 LimitsAggregator → pushLimits。可选 → 旧测试假 driver 不实现也不破。
  onRateLimit?: (info: RateLimitInfoLike) => void;
}

export interface ClaudeDriverCompatibility {
  getContextUsage(): Promise<{ totalTokens: number; maxTokens: number } | null>;
  askPermission(opts: {
    toolName: string;
    input: Record<string, unknown>;
    toolUseID: string;
    title?: string;
    displayName?: string;
    description?: string;
    agentID?: string;
  }): Promise<PermissionResult>;
  respondPermission(
    promptId: string,
    result: PermissionResult,
  ): void | Promise<void>;
}

export type IDriver = RuntimeDriver & ClaudeDriverCompatibility;

export class ClaudeDriver implements IDriver {
  private q: Query | null = null;
  private queue: SDKUserMessage[] = [];
  private resolveNext: (() => void) | null = null;
  private ended = false;
  private pendingPrompts = new Map<string, (r: PermissionResult) => void>();

  constructor(
    private cb: DriverCallbacks,
    private model: string,
    private cwd: string,
  ) {}

  private async *userStream(): AsyncGenerator<SDKUserMessage> {
    while (!this.ended || this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) {
        yield next;
        continue;
      }
      await new Promise<void>((r) => {
        this.resolveNext = r;
      });
    }
  }

  start(): void {
    const onHook = (h: HookLike) =>
      this.cb.onDraft(normalizeHook(h), Date.now());
    // 抹掉 api-key/token 回落订阅;再兜底代理:LaunchServices 启动的 .app 不继承
    // shell 的 HTTP(S)_PROXY,在需代理才能访问 Anthropic 的网络里会 403。环境已有
    // 代理则尊重,否则注入 macOS 系统代理(见 proxy.ts)。
    const baseEnv = stripSubscriptionEnv({ ...process.env });
    const env = { ...baseEnv, ...resolveProxyEnv(baseEnv, readMacSystemProxy) };
    const options: Options = {
      model: this.model,
      permissionMode: "default",
      settingSources: ["user", "project"], // load CLAUDE.md + skills (spec §7.4)
      cwd: this.cwd,
      env,
      pathToClaudeCodeExecutable: cliPathFromEnv(process.env),
      includePartialMessages: true,
      hooks: buildHooks(onHook),
      canUseTool: this.buildCanUseTool(),
    };
    this.q = query({ prompt: this.userStream(), options });
    void this.pump();
  }

  private async pump(): Promise<void> {
    if (!this.q) return;
    try {
      for await (const msg of this.q) {
        const m = msg as unknown as SdkMessageLike;
        // 订阅用量:转给 LimitsAggregator(账户级、非 seq 事件),不走 normalize/onDraft。
        if (m.type === "rate_limit_event") {
          if (m.rate_limit_info) this.cb.onRateLimit?.(m.rate_limit_info);
          continue;
        }
        if (
          m.type === "system" &&
          m.subtype === "init" &&
          usesApiKey(m.apiKeySource)
        ) {
          console.warn(
            `[driver] apiKeySource=${m.apiKeySource} — using an API key, not subscription OAuth (unset ANTHROPIC_API_KEY/ANTHROPIC_AUTH_TOKEN)`,
          );
        }
        this.cb.onDraft(normalizeSdkMessage(m), Date.now());
      }
    } catch (err) {
      this.cb.onDraft(
        [{ type: "session.error", payload: { message: String(err) } }],
        Date.now(),
      );
    }
  }

  send(text: string, meta?: RuntimeSendMeta): void {
    this.queue.push({
      type: "user",
      message: { role: "user", content: text },
      parent_tool_use_id: meta?.parentToolUseId ?? null,
    });
    this.resolveNext?.();
    this.resolveNext = null;
  }

  async setModel(model: string): Promise<void> {
    this.model = model;
    await this.q?.setModel(model);
  }

  async setPermissionMode(mode: string): Promise<void> {
    if (!isClaudePermissionMode(mode)) return;
    const q = this.q as {
      setPermissionMode?: (mode: ClaudePermissionMode) => Promise<void>;
    } | null;
    await q?.setPermissionMode?.(mode);
  }

  async setRuntimeConfig(config: RuntimeConfig): Promise<void> {
    if (config.model.trim() && config.model !== this.model) {
      await this.setModel(config.model);
    }
    await this.setPermissionMode(config.permissionMode);
  }

  async interrupt(): Promise<void> {
    await this.q?.interrupt();
  }

  async getContextUsage(): Promise<{
    totalTokens: number;
    maxTokens: number;
  } | null> {
    try {
      const r = await this.q?.getContextUsage();
      if (!r) return null;
      return { totalTokens: r.totalTokens, maxTokens: r.maxTokens };
    } catch {
      return null;
    }
  }

  end(): void {
    this.ended = true;
    this.resolveNext?.();
    this.resolveNext = null;
    // Auto-deny all pending permission prompts when session ends
    for (const [id, resolve] of this.pendingPrompts) {
      resolve({ behavior: "deny", message: "session ended" });
      this.cb.onDraft(
        [
          {
            type: "prompt.resolved",
            payload: { promptId: id, result: "dismissed" },
          },
        ],
        Date.now(),
      );
    }
    this.pendingPrompts.clear();
  }

  private buildCanUseTool(): CanUseTool {
    return async (toolName, input, opts) => {
      return this.askPermission({
        toolName,
        input,
        toolUseID: opts.toolUseID,
        title: opts.title,
        displayName: opts.displayName,
        description: opts.description,
        agentID: opts.agentID,
      });
    };
  }

  askPermission(opts: {
    toolName: string;
    input: Record<string, unknown>;
    toolUseID: string;
    title?: string;
    displayName?: string;
    description?: string;
    agentID?: string;
  }): Promise<PermissionResult> {
    const {
      toolUseID,
      toolName,
      input,
      title,
      displayName,
      description,
      agentID,
    } = opts;
    const inputSummary = summarizeToolInput(input);
    this.cb.onDraft(
      [
        {
          type: "prompt.requested",
          agentId: agentID,
          payload: {
            promptId: toolUseID,
            promptKind: "permission" as const,
            data: {
              toolName,
              inputSummary,
              title,
              displayName,
              description,
              agentId: agentID,
            },
          },
        },
      ],
      Date.now(),
    );
    return new Promise<PermissionResult>((resolve) => {
      this.pendingPrompts.set(toolUseID, resolve);
    });
  }

  respondPermission(promptId: string, result: PermissionResult): void {
    const resolve = this.pendingPrompts.get(promptId);
    if (resolve) {
      this.pendingPrompts.delete(promptId);
      resolve(result);
    }
    this.cb.onDraft(
      [{ type: "prompt.resolved", payload: { promptId, result: "answered" } }],
      Date.now(),
    );
  }
}
