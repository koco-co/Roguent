import type { Database } from "bun:sqlite";
import { createHash, randomUUID } from "node:crypto";
import type {
  IntegrationChannel,
  IntegrationStatusPayload,
  SessionErrorPayload,
} from "../../shared/events";
import { withTransaction } from "../persistence/db";
import {
  type StoredAuditRecord,
  createRepositories,
} from "../persistence/repositories";

const SENSITIVE_AUDIT_KEYS = new Set([
  "token",
  "authorization",
  "cookie",
  "cookies",
  "password",
  "secret",
  "apikey",
  "authtoken",
  "bearertoken",
  "accesstoken",
  "refreshtoken",
  "clientsecret",
  "webhooksecret",
  "setcookie",
]);

const SENSITIVE_TEXT_KEY_PATTERN =
  "(?:authorization(?:[-_.\\s]*header)?|(?:[A-Za-z0-9]+[-_.\\s]*)*(?:token|secret|password|api[-_.\\s]*key|apikey|cookies?|cookie))";
const SENSITIVE_TEXT_VALUE_PATTERN = String.raw`Bearer\s+[^\s,;]+|Basic\s+[^\s,;]+|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;]+`;
const SENSITIVE_TEXT_QUOTED_PAIR = new RegExp(
  `(["'])(${SENSITIVE_TEXT_KEY_PATTERN})\\1(\\s*:\\s*)("(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*')`,
  "gi",
);
const SENSITIVE_TEXT_ASSIGNMENT = new RegExp(
  `\\b(${SENSITIVE_TEXT_KEY_PATTERN})(\\s*[:=]\\s*)(${SENSITIVE_TEXT_VALUE_PATTERN})`,
  "gi",
);
const SENSITIVE_TEXT_QUERY_PARAM = new RegExp(
  `([?&](${SENSITIVE_TEXT_KEY_PATTERN})=)([^&#\\s]+)`,
  "gi",
);
const SENSITIVE_TEXT_BEARER = /\bBearer\s+[^\s,;]+/gi;

export interface AuditRecordInput {
  id?: string;
  source: string;
  action: string;
  sessionId?: string | null;
  deliveryId?: string | null;
  payload?: unknown;
  summary: string;
  createdAt?: number;
}

export type AuditWarningEvent =
  | {
      type: "session.error";
      sessionId: string;
      payload: SessionErrorPayload;
    }
  | {
      type: "integration.status";
      sessionId: string;
      payload: IntegrationStatusPayload;
    };

export type AuditWarningTarget =
  | {
      type?: "session.error";
      sessionId?: string | null;
    }
  | {
      type: "integration.status";
      sessionId?: string | null;
      integration: {
        id: string;
        channel: IntegrationChannel;
        label?: string;
        account?: string;
        metadata?: Record<string, unknown>;
      };
    };

export type AppendAuditRecordSafeResult =
  | { ok: true; record: StoredAuditRecord }
  | { ok: false; warningEvent: AuditWarningEvent };

function canonicalizeAuditKey(key: string): string {
  return key.replaceAll(/[^a-z0-9]/gi, "").toLowerCase();
}

function isSensitiveAuditKey(key: string): boolean {
  const canonicalKey = canonicalizeAuditKey(key);
  if (SENSITIVE_AUDIT_KEYS.has(canonicalKey)) {
    return true;
  }

  return (
    canonicalKey.endsWith("token") ||
    canonicalKey.endsWith("secret") ||
    canonicalKey.endsWith("password") ||
    canonicalKey.endsWith("apikey") ||
    canonicalKey.endsWith("cookie")
  );
}

export function redactAuditText(value: string): string {
  return value
    .replace(
      SENSITIVE_TEXT_QUOTED_PAIR,
      (
        _match,
        keyQuote: string,
        key: string,
        separator: string,
        quotedValue: string,
      ) => {
        const valueQuote = quotedValue.startsWith("'") ? "'" : '"';
        return `${keyQuote}${key}${keyQuote}${separator}${valueQuote}[REDACTED]${valueQuote}`;
      },
    )
    .replace(
      SENSITIVE_TEXT_ASSIGNMENT,
      (_match, key: string, separator: string) =>
        `${key}${separator}[REDACTED]`,
    )
    .replace(
      SENSITIVE_TEXT_QUERY_PARAM,
      (_match, prefix: string) => `${prefix}[REDACTED]`,
    )
    .replace(SENSITIVE_TEXT_BEARER, "Bearer [REDACTED]");
}

function sanitizeValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null) {
    return null;
  }

  if (value === undefined) {
    return null;
  }

  if (typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "symbol" || typeof value === "function") {
    return null;
  }

  if (seen.has(value)) {
    return "[Circular]";
  }

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  }

  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => sanitizeValue(item, seen));
    }

    if (value instanceof Error) {
      return sanitizeObject(
        {
          name: value.name,
          message: value.message,
          ...Object.fromEntries(Object.entries(value)),
        },
        seen,
      );
    }

    return sanitizeObject(value as Record<string, unknown>, seen);
  } finally {
    seen.delete(value);
  }
}

function sanitizeObject(
  value: Record<string, unknown>,
  seen: WeakSet<object>,
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (isSensitiveAuditKey(key)) {
      continue;
    }
    sanitized[key] = sanitizeValue(nestedValue, seen);
  }
  return sanitized;
}

export function sanitizeAuditPayload(payload: unknown): unknown {
  return sanitizeValue(payload, new WeakSet<object>());
}

function sanitizeWarningValue(value: unknown, seen: WeakSet<object>): unknown {
  const sanitizedValue = sanitizeValue(value, seen);
  return redactStrings(sanitizedValue, new WeakSet<object>());
}

function redactStrings(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === "string") {
    return redactAuditText(value);
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  if (seen.has(value)) {
    return "[Circular]";
  }

  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => redactStrings(item, seen));
    }

    const redacted: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      redacted[key] = redactStrings(nestedValue, seen);
    }
    return redacted;
  } finally {
    seen.delete(value);
  }
}

function warningMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const sanitizedMetadata = sanitizeWarningValue(
    metadata ?? {},
    new WeakSet<object>(),
  );
  if (
    sanitizedMetadata !== null &&
    typeof sanitizedMetadata === "object" &&
    !Array.isArray(sanitizedMetadata)
  ) {
    return sanitizedMetadata as Record<string, unknown>;
  }
  return {};
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = sortJsonValue((value as Record<string, unknown>)[key]);
  }
  return sorted;
}

function stableJsonStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

export function hashAuditPayload(payload: unknown): string {
  const sanitizedPayload = sanitizeAuditPayload(payload);
  return createHash("sha256")
    .update(stableJsonStringify(sanitizedPayload))
    .digest("hex");
}

function describeAuditWriteFailure(input: AuditRecordInput, error: unknown) {
  return redactAuditText(
    `Audit log write failed for ${input.source}/${input.action}: ${safeErrorMessage(error)}`,
  );
}

function safeErrorMessage(error: unknown): string {
  try {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  } catch {
    return "unreadable error";
  }
}

export function createAuditWarningEvent(
  input: AuditRecordInput,
  error: unknown,
  target: AuditWarningTarget = {},
): AuditWarningEvent {
  const message = describeAuditWriteFailure(input, error);
  const sessionId = target.sessionId ?? input.sessionId ?? "system";

  if (target.type === "integration.status") {
    return {
      type: "integration.status",
      sessionId,
      payload: {
        status: {
          id: target.integration.id,
          channel: target.integration.channel,
          state: "degraded",
          label:
            target.integration.label === undefined
              ? undefined
              : redactAuditText(target.integration.label),
          account:
            target.integration.account === undefined
              ? undefined
              : redactAuditText(target.integration.account),
          error: message,
          metadata: {
            ...warningMetadata(target.integration.metadata),
            auditAction: redactAuditText(input.action),
            auditSource: redactAuditText(input.source),
          },
        },
      },
    };
  }

  return {
    type: "session.error",
    sessionId,
    payload: { message },
  };
}

export function appendAuditRecord(
  db: Database,
  input: AuditRecordInput,
): StoredAuditRecord {
  return withTransaction(db, () => {
    const repositories = createRepositories(db);
    const record: StoredAuditRecord = {
      id: input.id ?? randomUUID(),
      source: input.source,
      action: input.action,
      sessionId: input.sessionId ?? null,
      deliveryId: input.deliveryId ?? null,
      payloadHash: hashAuditPayload(input.payload),
      summary: redactAuditText(input.summary),
      createdAt: input.createdAt ?? Date.now(),
    };

    repositories.auditRecords.append(record);
    return record;
  });
}

export function appendAuditRecordSafe(
  db: Database,
  input: AuditRecordInput,
  target?: AuditWarningTarget,
): AppendAuditRecordSafeResult {
  try {
    return { ok: true, record: appendAuditRecord(db, input) };
  } catch (error) {
    return {
      ok: false,
      warningEvent: createAuditWarningEvent(input, error, target),
    };
  }
}
