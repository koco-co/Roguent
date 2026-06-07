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
  "password",
  "secret",
  "accesstoken",
  "refreshtoken",
]);

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
  return SENSITIVE_AUDIT_KEYS.has(canonicalizeAuditKey(key));
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
  const message = error instanceof Error ? error.message : String(error);
  return `Audit log write failed for ${input.source}/${input.action}: ${message}`;
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
          label: target.integration.label,
          account: target.integration.account,
          error: message,
          metadata: {
            ...target.integration.metadata,
            auditAction: input.action,
            auditSource: input.source,
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
      summary: input.summary,
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
