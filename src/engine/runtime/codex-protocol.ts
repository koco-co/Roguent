export type CodexJsonRpcId = number | string;

export interface CodexJsonRpcRequest {
  jsonrpc: "2.0";
  id: CodexJsonRpcId;
  method: string;
  params?: unknown;
}

export interface CodexJsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface CodexJsonRpcResponse<T = unknown> {
  jsonrpc?: "2.0";
  id: CodexJsonRpcId;
  result?: T;
  error?: CodexJsonRpcError;
}

export interface CodexNotification {
  jsonrpc?: "2.0";
  method: string;
  params?: unknown;
}

export type CodexProtocolMessage =
  | CodexJsonRpcRequest
  | CodexJsonRpcResponse
  | CodexNotification;

export interface CodexRuntimeEvent {
  kind: string;
  threadId?: string;
  turnId?: string;
  text?: string;
  [key: string]: unknown;
}

export interface CodexInitializeResult {
  userAgent: string;
  codexHome?: string;
  [key: string]: unknown;
}

export interface CodexThread {
  id: string;
  [key: string]: unknown;
}

export interface CodexTurn {
  id: string;
  [key: string]: unknown;
}

export interface CodexTextUserInput {
  type: "text";
  text: string;
  text_elements: unknown[];
}

export type CodexUserInput =
  | CodexTextUserInput
  | {
      type: "image" | "localImage" | "skill" | "mention";
      [key: string]: unknown;
    };

/**
 * SandboxMode mirrors the codex-cli 0.133.0 app-server ThreadStartParams.sandbox field.
 * It is a plain string — NOT an object.  The three valid values come from the
 * codex app-server JSON Schema (generate-json-schema) definition of SandboxMode.
 *
 * Per-thread network access is NOT part of ThreadStartParams; it is controlled via
 * TurnStartParams.sandboxPolicy (a richer object) or the global config.toml sandbox settings.
 * We do not send a per-turn sandboxPolicy here — the sandbox mode set at thread-start
 * is sufficient for Roguent's use-case (one sandbox level per conversation).
 */
export type CodexSandboxMode =
  | "read-only"
  | "workspace-write"
  | "danger-full-access";

export interface CodexThreadStartParams {
  model?: string;
  cwd?: string;
  approvalPolicy?: string;
  /** Plain string, one of CodexSandboxMode.  See comment above. */
  sandbox?: CodexSandboxMode;
  persistExtendedHistory?: boolean;
  [key: string]: unknown;
}

export type CodexThreadStartInput = CodexThreadStartParams;

export interface CodexThreadStartResult {
  thread: CodexThread;
  [key: string]: unknown;
}

export interface CodexTurnStartParams {
  threadId: string;
  input: CodexUserInput[];
  [key: string]: unknown;
}

export interface CodexTurnStartResult {
  turn: CodexTurn;
  [key: string]: unknown;
}

export interface CodexTurnInterruptParams {
  threadId: string;
  turnId: string;
}

export interface CodexInterruptResult {
  interrupted?: boolean;
  [key: string]: unknown;
}

export interface CodexTransport {
  request<T>(method: string, params?: unknown, timeoutMs?: number): Promise<T>;
  notify(method: string, params?: unknown): Promise<void>;
  onNotification(handler: (message: CodexNotification) => void): () => void;
  onServerRequest(handler: (message: CodexJsonRpcRequest) => void): () => void;
  respond(id: CodexJsonRpcId, result: unknown): Promise<void>;
  close(): Promise<void>;
}

export function createCodexJsonRpcRequest(
  id: CodexJsonRpcId,
  method: string,
  params?: unknown,
): CodexJsonRpcRequest {
  const request: CodexJsonRpcRequest = {
    jsonrpc: "2.0",
    id,
    method,
  };
  if (params !== undefined) request.params = params;
  return request;
}

export function createCodexNotification(
  method: string,
  params?: unknown,
): CodexNotification {
  const notification: CodexNotification = { method };
  if (params !== undefined) notification.params = params;
  return notification;
}

export function codexTextInput(text: string): CodexTextUserInput {
  return {
    type: "text",
    text,
    text_elements: [],
  };
}

export function parseCodexProtocolLine(line: string): CodexProtocolMessage {
  const parsed = JSON.parse(line) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("Codex app-server emitted non-object JSON-RPC message");
  }
  if (isCodexJsonRpcResponse(parsed)) return parsed;
  if (isCodexNotification(parsed)) return parsed;
  if (isCodexJsonRpcRequest(parsed)) return parsed;
  throw new Error("Codex app-server emitted malformed JSON-RPC message");
}

export function isCodexJsonRpcResponse(
  value: unknown,
): value is CodexJsonRpcResponse {
  if (!isRecord(value) || !hasJsonRpcId(value)) return false;
  return "result" in value || "error" in value;
}

export function isCodexNotification(
  value: unknown,
): value is CodexNotification {
  return (
    isRecord(value) && !("id" in value) && typeof value.method === "string"
  );
}

export function isCodexJsonRpcRequest(
  value: unknown,
): value is CodexJsonRpcRequest {
  return (
    isRecord(value) && hasJsonRpcId(value) && typeof value.method === "string"
  );
}

export function codexNotificationToRuntimeEvent(
  notification: CodexNotification,
): CodexRuntimeEvent | null {
  if (!isRecord(notification.params)) return null;
  const params = notification.params;

  if (notification.method === "thread/started") {
    const thread = isRecord(params.thread) ? params.thread : undefined;
    const threadId =
      typeof thread?.id === "string" ? thread.id : asString(params.threadId);
    return { ...params, kind: "thread.started", threadId };
  }

  if (notification.method === "turn/started") {
    const turn = isRecord(params.turn) ? params.turn : undefined;
    const turnId =
      typeof turn?.id === "string" ? turn.id : asString(params.turnId);
    return {
      ...params,
      kind: "turn.started",
      threadId: asString(params.threadId),
      turnId,
    };
  }

  if (notification.method === "item/agentMessage/delta") {
    return {
      ...params,
      kind: "assistant.delta",
      threadId: asString(params.threadId),
      turnId: asString(params.turnId),
      itemId: asString(params.itemId),
      text: typeof params.delta === "string" ? params.delta : undefined,
    };
  }

  const fallback: CodexRuntimeEvent = {
    ...params,
    kind:
      typeof params.kind === "string"
        ? params.kind
        : notification.method.replaceAll("/", "."),
  };
  const text = textFromParams(params);
  if (text !== undefined) fallback.text = text;
  return fallback;
}

export function codexServerRequestToRuntimeEvent(
  request: CodexJsonRpcRequest,
): CodexRuntimeEvent | null {
  const params = isRecord(request.params) ? request.params : {};
  const approvalMethods = new Set([
    "item/commandExecution/requestApproval",
    "item/fileChange/requestApproval",
    "item/permissions/requestApproval",
    "execCommandApproval",
    "applyPatchApproval",
  ]);
  const userInputMethods = new Set([
    "item/tool/requestUserInput",
    "mcpServer/elicitation/request",
  ]);
  let kind = "server.request";
  if (approvalMethods.has(request.method)) kind = "approval.requested";
  if (userInputMethods.has(request.method)) kind = "question.requested";
  return {
    ...params,
    kind,
    requestId: String(request.id),
    method: request.method,
    threadId: asString(params.threadId),
    turnId: asString(params.turnId),
    itemId: asString(params.itemId),
  };
}

function hasJsonRpcId(
  value: Record<string, unknown>,
): value is Record<string, unknown> & { id: CodexJsonRpcId } {
  return typeof value.id === "number" || typeof value.id === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function textFromParams(params: Record<string, unknown>): string | undefined {
  for (const key of ["delta", "text", "output"]) {
    const value = params[key];
    if (typeof value === "string") return value;
  }
  return undefined;
}
