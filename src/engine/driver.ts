import {
  type Options,
  type Query,
  type SDKUserMessage,
  query,
} from "@anthropic-ai/claude-agent-sdk";
import {
  type DraftEvent,
  type HookLike,
  type SdkMessageLike,
  normalizeHook,
  normalizeSdkMessage,
} from "./normalize";
import { readMacSystemProxy, resolveProxyEnv } from "./proxy";

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
}

export interface IDriver {
  start(): void;
  send(text: string): void;
  setModel(model: string): Promise<void>;
  interrupt(): Promise<void>;
  end(): void;
  getContextUsage(): Promise<{ totalTokens: number; maxTokens: number } | null>;
}

export class Driver implements IDriver {
  private q: Query | null = null;
  private queue: SDKUserMessage[] = [];
  private resolveNext: (() => void) | null = null;
  private ended = false;

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
      includePartialMessages: false,
      hooks: buildHooks(onHook),
    };
    this.q = query({ prompt: this.userStream(), options });
    void this.pump();
  }

  private async pump(): Promise<void> {
    if (!this.q) return;
    try {
      for await (const msg of this.q) {
        const m = msg as unknown as SdkMessageLike;
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

  send(text: string): void {
    this.queue.push({
      type: "user",
      message: { role: "user", content: text },
      parent_tool_use_id: null,
    });
    this.resolveNext?.();
    this.resolveNext = null;
  }

  async setModel(model: string): Promise<void> {
    await this.q?.setModel(model);
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
  }
}
