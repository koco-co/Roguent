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

const RUNTIME_KINDS = [
  "claude",
  "codex",
] as const satisfies readonly RuntimeKind[];
const PERMISSION_MODES = [
  "default",
  "acceptEdits",
  "bypassPermissions",
  "plan",
] as const satisfies readonly PermissionMode[];
const CODEX_APPROVAL_POLICIES = [
  "untrusted",
  "on-failure",
  "on-request",
  "never",
] as const satisfies readonly CodexApprovalPolicy[];
const SANDBOX_MODES = [
  "read-only",
  "workspace-write",
  "danger-full-access",
] as const satisfies readonly SandboxMode[];
const REASONING_EFFORTS = [
  "low",
  "medium",
  "high",
] as const satisfies readonly ReasoningEffort[];

export function isRuntimeKind(value: unknown): value is RuntimeKind {
  return (
    typeof value === "string" && RUNTIME_KINDS.includes(value as RuntimeKind)
  );
}

export function isPermissionMode(value: unknown): value is PermissionMode {
  return (
    typeof value === "string" &&
    PERMISSION_MODES.includes(value as PermissionMode)
  );
}

export function isCodexApprovalPolicy(
  value: unknown,
): value is CodexApprovalPolicy {
  return (
    typeof value === "string" &&
    CODEX_APPROVAL_POLICIES.includes(value as CodexApprovalPolicy)
  );
}

export function isSandboxMode(value: unknown): value is SandboxMode {
  return (
    typeof value === "string" && SANDBOX_MODES.includes(value as SandboxMode)
  );
}

export function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return (
    typeof value === "string" &&
    REASONING_EFFORTS.includes(value as ReasoningEffort)
  );
}

export function normalizeRuntimeKind(
  value: unknown,
  fallback: RuntimeKind = "claude",
): RuntimeKind {
  return isRuntimeKind(value) ? value : fallback;
}

export function normalizePermissionMode(
  value: unknown,
  fallback: PermissionMode = "default",
): PermissionMode {
  return isPermissionMode(value) ? value : fallback;
}

export function normalizeSandboxMode(
  value: unknown,
  fallback: SandboxMode = "workspace-write",
): SandboxMode {
  return isSandboxMode(value) ? value : fallback;
}

export function normalizeReasoningEffort(
  value: unknown,
  fallback?: ReasoningEffort,
): ReasoningEffort | undefined {
  return isReasoningEffort(value) ? value : fallback;
}

export function normalizeCodexApprovalPolicy(
  value: unknown,
  fallback?: CodexApprovalPolicy,
): CodexApprovalPolicy | undefined {
  return isCodexApprovalPolicy(value) ? value : fallback;
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
