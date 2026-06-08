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

export interface CodexThreadStartParams {
  model?: string;
  cwd?: string;
  approvalPolicy?: string;
  sandbox?: unknown;
  experimentalRawEvents: boolean;
  persistExtendedHistory: boolean;
  [key: string]: unknown;
}

export type CodexThreadStartInput = Omit<
  CodexThreadStartParams,
  "experimentalRawEvents" | "persistExtendedHistory"
> &
  Partial<
    Pick<
      CodexThreadStartParams,
      "experimentalRawEvents" | "persistExtendedHistory"
    >
  >;

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
  onNotification(handler: (message: CodexNotification) => void): () => void;
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
    return { kind: "thread.started", ...params, threadId };
  }

  if (notification.method === "turn/started") {
    const turn = isRecord(params.turn) ? params.turn : undefined;
    const turnId =
      typeof turn?.id === "string" ? turn.id : asString(params.turnId);
    return {
      kind: "turn.started",
      ...params,
      threadId: asString(params.threadId),
      turnId,
    };
  }

  if (notification.method === "item/agentMessage/delta") {
    return {
      kind: "assistant.delta",
      ...params,
      threadId: asString(params.threadId),
      turnId: asString(params.turnId),
      itemId: asString(params.itemId),
      text: typeof params.delta === "string" ? params.delta : undefined,
    };
  }

  if (typeof params.kind !== "string") return null;
  return params as CodexRuntimeEvent;
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
