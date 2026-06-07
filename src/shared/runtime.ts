export type RuntimeKind = "claude" | "codex";
export type PermissionMode =
  | "default"
  | "acceptEdits"
  | "bypassPermissions"
  | "plan";
export type CodexApprovalPolicy =
  | "untrusted"
  | "on-failure"
  | "on-request"
  | "never";
export type SandboxMode =
  | "read-only"
  | "workspace-write"
  | "danger-full-access";
export type ReasoningEffort = "low" | "medium" | "high";

export interface RuntimeConfig {
  runtime: RuntimeKind;
  model: string;
  permissionMode: PermissionMode;
  approvalPolicy?: CodexApprovalPolicy;
  sandboxMode: SandboxMode;
  reasoningEffort?: ReasoningEffort;
  networkAccess: boolean;
}

export function normalizePermissionMode(
  value: unknown,
  fallback: PermissionMode = "default",
): PermissionMode {
  switch (value) {
    case "default":
    case "acceptEdits":
    case "bypassPermissions":
    case "plan":
      return value;
    default:
      return fallback;
  }
}

export function defaultRuntimeConfig(runtime: RuntimeKind): RuntimeConfig {
  if (runtime === "codex") {
    return {
      runtime,
      model: "gpt-5",
      permissionMode: "default",
      approvalPolicy: "on-request",
      sandboxMode: "workspace-write",
      reasoningEffort: "medium",
      networkAccess: false,
    };
  }

  return {
    runtime,
    model: "claude-opus-4-8",
    permissionMode: "default",
    sandboxMode: "workspace-write",
    networkAccess: true,
  };
}
