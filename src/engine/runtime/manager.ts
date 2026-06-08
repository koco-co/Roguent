import type {
  CodexApprovalPolicy,
  PermissionMode,
  ReasoningEffort,
  RuntimeConfig,
  RuntimeKind,
  SandboxMode,
} from "../../shared/runtime";
import {
  defaultRuntimeConfig,
  normalizePermissionMode,
  normalizeReasoningEffort,
  normalizeRuntimeKind,
  normalizeSandboxMode,
} from "../../shared/runtime";
import {
  ClaudeDriver,
  type DriverCallbacks,
  type IDriver,
} from "./claude-driver";
import type { CodexCapabilities } from "./codex-capabilities";
import type { RuntimeSendMeta } from "./types";

export interface RuntimeDriverConfigInput {
  runtime?: RuntimeKind;
  model?: string;
  cwd: string;
  permissionMode?: PermissionMode;
  approvalPolicy?: CodexApprovalPolicy;
  sandboxMode?: SandboxMode;
  reasoningEffort?: ReasoningEffort;
  networkAccess?: boolean;
}

export type RuntimeDriverConfig = RuntimeConfig & { cwd: string };

export interface RuntimeDriverCreator {
  createDriver(
    callbacks: DriverCallbacks,
    config: RuntimeDriverConfigInput,
  ): IDriver;
}

export type ClaudeDriverFactory = (
  callbacks: DriverCallbacks,
  model: string,
  cwd: string,
) => IDriver;

export interface RuntimeManagerOptions {
  createClaudeDriver?: ClaudeDriverFactory;
  codexCapabilities?: CodexCapabilities;
}

export function resolveRuntimeDriverConfig(
  input: RuntimeDriverConfigInput,
): RuntimeDriverConfig {
  const runtime = normalizeRuntimeKind(input.runtime);
  const defaults = defaultRuntimeConfig(runtime);
  const model = input.model?.trim() || defaults.model;
  const permissionMode = normalizePermissionMode(
    input.permissionMode,
    defaults.permissionMode,
  );
  const sandboxMode = normalizeSandboxMode(
    input.sandboxMode,
    defaults.sandboxMode,
  );
  const approvalPolicy =
    runtime === "codex"
      ? (input.approvalPolicy ?? defaults.approvalPolicy)
      : undefined;
  const reasoningEffort = normalizeReasoningEffort(
    input.reasoningEffort,
    defaults.reasoningEffort,
  );
  const config: RuntimeDriverConfig = {
    runtime,
    model,
    cwd: input.cwd,
    permissionMode,
    sandboxMode,
    networkAccess: input.networkAccess ?? defaults.networkAccess,
  };
  if (approvalPolicy !== undefined) config.approvalPolicy = approvalPolicy;
  if (reasoningEffort !== undefined) config.reasoningEffort = reasoningEffort;
  return config;
}

export class RuntimeManager implements RuntimeDriverCreator {
  private readonly createClaudeDriver: ClaudeDriverFactory;
  private readonly codexCapabilities?: CodexCapabilities;

  constructor(options: RuntimeManagerOptions = {}) {
    this.createClaudeDriver =
      options.createClaudeDriver ??
      ((callbacks, model, cwd) => new ClaudeDriver(callbacks, model, cwd));
    this.codexCapabilities = options.codexCapabilities;
  }

  createDriver(
    callbacks: DriverCallbacks,
    config: RuntimeDriverConfigInput,
  ): IDriver {
    const resolved = resolveRuntimeDriverConfig(config);
    if (resolved.runtime === "claude") {
      return this.createClaudeDriver(callbacks, resolved.model, resolved.cwd);
    }
    return new CodexStubDriver(callbacks, resolved, this.codexCapabilities);
  }
}

class CodexStubDriver implements IDriver {
  constructor(
    private readonly callbacks: DriverCallbacks,
    private config: RuntimeDriverConfig,
    private readonly capabilities?: CodexCapabilities,
  ) {}

  start(): void {
    this.callbacks.onDraft(
      [
        {
          type: "runtime.status",
          payload: {
            runtime: "codex",
            status: "idle",
            config: this.runtimeConfig(),
            cwd: this.config.cwd,
            message: "Codex runtime is not implemented yet.",
            ...(this.capabilities
              ? { metadata: { capabilities: this.capabilities } }
              : {}),
          },
        },
      ],
      Date.now(),
    );
  }

  send(_text: string, _meta?: RuntimeSendMeta): void {}

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

  async interrupt(): Promise<void> {}

  end(): void {}

  async getContextUsage(): Promise<{
    totalTokens: number;
    maxTokens: number;
  } | null> {
    return null;
  }

  async askPermission(): Promise<{ behavior: "deny"; message: string }> {
    return {
      behavior: "deny",
      message: "Codex stub runtime does not run tools yet.",
    };
  }

  respondPermission(): void {}

  private runtimeConfig(): RuntimeConfig {
    const { cwd: _cwd, ...config } = this.config;
    return config;
  }
}
