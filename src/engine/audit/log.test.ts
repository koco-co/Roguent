import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { createTestDatabase } from "../persistence/db";
import { migrate, readSchemaVersion } from "../persistence/migrations";
import { createRepositories } from "../persistence/repositories";
import {
  appendAuditRecord,
  appendAuditRecordSafe,
  sanitizeAuditPayload,
} from "./log";

type AuditRow = {
  id: string;
  source: string;
  action: string;
  session_id: string | null;
  delivery_id: string | null;
  payload_hash: string;
  summary: string;
  created_at: number;
};

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

test("sanitizeAuditPayload removes sensitive fields deeply", () => {
  const sanitized = sanitizeAuditPayload({
    user: "alice",
    token: "root-token",
    Authorization: "Bearer root",
    nested: {
      Password: "pw",
      visible: "keep",
      accessToken: "access-token",
      refresh_token: "refresh-token",
      Secret: "secret-value",
    },
    array: [{ cookie: "session-cookie", keep: 1 }, { value: "visible" }],
  });

  expect(sanitized).toEqual({
    user: "alice",
    nested: {
      visible: "keep",
    },
    array: [{ keep: 1 }, { value: "visible" }],
  });
  const serialized = JSON.stringify(sanitized);
  expect(serialized).not.toContain("root-token");
  expect(serialized).not.toContain("Bearer root");
  expect(serialized).not.toContain("pw");
  expect(serialized).not.toContain("access-token");
  expect(serialized).not.toContain("refresh-token");
  expect(serialized).not.toContain("secret-value");
  expect(serialized).not.toContain("session-cookie");
});

test("appendAuditRecord stores new audit shape without persisting raw payload", () => {
  const testDb = createTestDatabase();
  try {
    migrate(testDb.db);

    const record = appendAuditRecord(testDb.db, {
      id: "audit-input-1",
      source: "integration.wechat",
      action: "external.input.received",
      sessionId: "session-1",
      deliveryId: "delivery-1",
      payload: {
        text: "hello",
        accessToken: "access-token-value",
        nested: { password: "password-value", visible: "ok" },
      },
      summary: "received wechat message",
      createdAt: 1_717_452_000_000,
    });

    expect(record).toEqual({
      id: "audit-input-1",
      source: "integration.wechat",
      action: "external.input.received",
      sessionId: "session-1",
      deliveryId: "delivery-1",
      payloadHash: sha256Hex('{"nested":{"visible":"ok"},"text":"hello"}'),
      summary: "received wechat message",
      createdAt: 1_717_452_000_000,
    });
    expect(
      createRepositories(testDb.db).auditRecords.get("audit-input-1"),
    ).toEqual(record);

    const row = testDb.db
      .query<AuditRow, [string]>(
        "SELECT * FROM audit_records WHERE id = ? LIMIT 1",
      )
      .get("audit-input-1");
    expect(row).toEqual({
      id: "audit-input-1",
      source: "integration.wechat",
      action: "external.input.received",
      session_id: "session-1",
      delivery_id: "delivery-1",
      payload_hash: record.payloadHash,
      summary: "received wechat message",
      created_at: 1_717_452_000_000,
    });
    const persisted = JSON.stringify(row);
    expect(persisted).not.toContain("access-token-value");
    expect(persisted).not.toContain("password-value");
  } finally {
    testDb.cleanup();
  }
});

test("payloadHash is stable and ignores sanitized sensitive values", () => {
  const testDb = createTestDatabase();
  try {
    migrate(testDb.db);

    const first = appendAuditRecord(testDb.db, {
      id: "audit-stable-1",
      source: "scheduler",
      action: "scheduler.run.auto_started",
      payload: {
        b: 2,
        a: 1,
        nested: { token: "first-token", visible: true },
      },
      summary: "auto run started",
      createdAt: 1_717_452_000_000,
    });
    const second = appendAuditRecord(testDb.db, {
      id: "audit-stable-2",
      source: "scheduler",
      action: "scheduler.run.auto_started",
      payload: {
        nested: { visible: true, token: "second-token" },
        a: 1,
        b: 2,
      },
      summary: "auto run started",
      createdAt: 1_717_452_000_001,
    });

    expect(first.payloadHash).toBe(second.payloadHash);
    expect(first.payloadHash).toBe(
      sha256Hex('{"a":1,"b":2,"nested":{"visible":true}}'),
    );
  } finally {
    testDb.cleanup();
  }
});

test("appendAuditRecordSafe returns a session warning event instead of throwing", () => {
  const testDb = createTestDatabase();
  try {
    migrate(testDb.db);

    appendAuditRecord(testDb.db, {
      id: "audit-duplicate",
      source: "runtime",
      action: "runtime.status.changed",
      sessionId: "session-1",
      payload: { status: "running" },
      summary: "runtime started",
      createdAt: 1_717_452_000_000,
    });

    const result = appendAuditRecordSafe(testDb.db, {
      id: "audit-duplicate",
      source: "runtime",
      action: "runtime.status.changed",
      sessionId: "session-1",
      payload: { status: "idle" },
      summary: "runtime idled",
      createdAt: 1_717_452_000_001,
    });

    expect(result).toEqual({
      ok: false,
      warningEvent: {
        type: "session.error",
        sessionId: "session-1",
        payload: {
          message:
            "Audit log write failed for runtime/runtime.status.changed: UNIQUE constraint failed: audit_records.id",
        },
      },
    });
  } finally {
    testDb.cleanup();
  }
});

test("migration upgrades v2 audit rows into the Task 6 shape", () => {
  const testDb = createTestDatabase();
  try {
    testDb.db.exec(`
      CREATE TABLE schema_version (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        version INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      INSERT INTO schema_version (id, version, updated_at)
      VALUES (1, 2, 1_717_452_000_000);

      CREATE TABLE audit_records (
        id TEXT PRIMARY KEY,
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT,
        metadata_json TEXT,
        created_at INTEGER NOT NULL
      );

      INSERT INTO audit_records (
        id,
        actor,
        action,
        target_type,
        target_id,
        metadata_json,
        created_at
      )
      VALUES (
        'legacy-audit-1',
        'system',
        'pairing.upserted',
        'session',
        'session-legacy',
        '{"reason":"smoke-test"}',
        1_717_452_000_000
      );
    `);

    migrate(testDb.db);

    expect(readSchemaVersion(testDb.db)).toBe(3);
    expect(
      createRepositories(testDb.db).auditRecords.get("legacy-audit-1"),
    ).toEqual({
      id: "legacy-audit-1",
      source: "system",
      action: "pairing.upserted",
      sessionId: "session-legacy",
      deliveryId: null,
      payloadHash: sha256Hex('{"reason":"smoke-test"}'),
      summary: "legacy session session-legacy",
      createdAt: 1_717_452_000_000,
    });
  } finally {
    testDb.cleanup();
  }
});
