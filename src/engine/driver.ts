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

export function stripSubscriptionEnv(
  env: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const { ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, ...rest } = env;
  void ANTHROPIC_API_KEY;
  void ANTHROPIC_AUTH_TOKEN;
  return rest;
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
    const options: Options = {
      model: this.model,
      permissionMode: "default",
      settingSources: ["user", "project"], // load CLAUDE.md + skills (spec §7.4)
      cwd: this.cwd,
      env: stripSubscriptionEnv({ ...process.env }),
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
          m.apiKeySource &&
          m.apiKeySource !== "oauth"
        ) {
          console.warn(
            `[driver] apiKeySource=${m.apiKeySource} (expected 'oauth' for subscription)`,
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

  end(): void {
    this.ended = true;
    this.resolveNext?.();
    this.resolveNext = null;
  }
}
