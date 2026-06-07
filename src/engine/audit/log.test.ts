import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { createTestDatabase } from "../persistence/db";
import { migrate, readSchemaVersion } from "../persistence/migrations";
import { createRepositories } from "../persistence/repositories";
import {
  appendAuditRecord,
  appendAuditRecordSafe,
  createAuditWarningEvent,
  hashAuditPayload,
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

test("sanitizeAuditPayload removes common sensitive key variants", () => {
  const sanitized = sanitizeAuditPayload({
    api_key: "api-key-value",
    apiKey: "api-key-camel-value",
    auth_token: "auth-token-value",
    bearer_token: "bearer-token-value",
    client_secret: "client-secret-value",
    webhook_secret: "webhook-secret-value",
    set_cookie: "set-cookie-value",
    cookies: "cookies-value",
    "AUTH.TOKEN": "punctuated-auth-token-value",
    "Client Secret": "punctuated-client-secret-value",
    nested: {
      "Webhook-Secret": "punctuated-webhook-secret-value",
      visible: "keep",
    },
  });

  expect(sanitized).toEqual({
    nested: {
      visible: "keep",
    },
  });
  const serialized = JSON.stringify(sanitized);
  for (const leakedValue of [
    "api-key-value",
    "api-key-camel-value",
    "auth-token-value",
    "bearer-token-value",
    "client-secret-value",
    "webhook-secret-value",
    "set-cookie-value",
    "cookies-value",
    "punctuated-auth-token-value",
    "punctuated-client-secret-value",
    "punctuated-webhook-secret-value",
  ]) {
    expect(serialized).not.toContain(leakedValue);
  }
});

test("sanitizeAuditPayload removes structured authorization header variants", () => {
  const sanitized = sanitizeAuditPayload({
    authorization_header: "Basic basic-secret",
    AuthorizationHeader: "Bearer auth-secret",
    visible: "keep",
  });

  expect(sanitized).toEqual({
    visible: "keep",
  });
  const serialized = JSON.stringify(sanitized);
  expect(serialized).not.toContain("basic-secret");
  expect(serialized).not.toContain("auth-secret");
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

test("appendAuditRecord redacts secret-like values from persisted summary", () => {
  const testDb = createTestDatabase();
  try {
    migrate(testDb.db);

    const record = appendAuditRecord(testDb.db, {
      id: "audit-summary-1",
      source: "integration.wechat",
      action: "external.input.received",
      payload: { text: "visible body" },
      summary:
        "received chat password=hunter2 accessToken=access-summary Authorization: Bearer auth-summary keep visible",
      createdAt: 1_717_452_000_000,
    });

    expect(record.summary).toContain("received chat");
    expect(record.summary).toContain("keep visible");
    expect(record.summary).toContain("[REDACTED]");
    const row = testDb.db
      .query<AuditRow, [string]>(
        "SELECT * FROM audit_records WHERE id = ? LIMIT 1",
      )
      .get("audit-summary-1");
    const persisted = JSON.stringify(row);
    expect(persisted).not.toContain("hunter2");
    expect(persisted).not.toContain("access-summary");
    expect(persisted).not.toContain("auth-summary");
  } finally {
    testDb.cleanup();
  }
});

test("appendAuditRecord redacts JSON-style secret pairs from persisted summary", () => {
  const testDb = createTestDatabase();
  try {
    migrate(testDb.db);

    appendAuditRecord(testDb.db, {
      id: "audit-summary-json-1",
      source: "integration.wechat",
      action: "external.input.received",
      payload: { text: "visible body" },
      summary:
        'payload {"api_key":"json-secret","password":"json-password","visible":"keep"}',
      createdAt: 1_717_452_000_000,
    });

    const row = testDb.db
      .query<AuditRow, [string]>(
        "SELECT * FROM audit_records WHERE id = ? LIMIT 1",
      )
      .get("audit-summary-json-1");
    const persisted = JSON.stringify(row);
    expect(persisted).toContain("visible");
    expect(persisted).toContain("keep");
    expect(persisted).toContain("[REDACTED]");
    expect(persisted).not.toContain("json-secret");
    expect(persisted).not.toContain("json-password");
  } finally {
    testDb.cleanup();
  }
});

test("appendAuditRecord redacts escaped-quote JSON-style secret pairs from persisted summary", () => {
  const testDb = createTestDatabase();
  try {
    migrate(testDb.db);

    appendAuditRecord(testDb.db, {
      id: "audit-summary-json-escaped-1",
      source: "integration.wechat",
      action: "external.input.received",
      payload: { text: "visible body" },
      summary:
        'payload {"api_key":"json-secret\\"suffix","password":"json-password\\"suffix","visible":"keep"}',
      createdAt: 1_717_452_000_000,
    });

    const row = testDb.db
      .query<AuditRow, [string]>(
        "SELECT * FROM audit_records WHERE id = ? LIMIT 1",
      )
      .get("audit-summary-json-escaped-1");
    const persisted = JSON.stringify(row);
    expect(persisted).toContain("visible");
    expect(persisted).toContain("keep");
    expect(persisted).toContain("[REDACTED]");
    expect(persisted).not.toContain("json-secret");
    expect(persisted).not.toContain("json-password");
    expect(persisted).not.toContain("suffix");
  } finally {
    testDb.cleanup();
  }
});

test("appendAuditRecord redacts suffix-style secret keys from persisted summary", () => {
  const testDb = createTestDatabase();
  try {
    migrate(testDb.db);

    appendAuditRecord(testDb.db, {
      id: "audit-summary-suffix-1",
      source: "integration.wechat",
      action: "external.input.received",
      payload: { text: "visible body" },
      summary:
        'session_token=session-secret id_token=id-secret csrf_token=csrf-secret authorization_header=Basic basic-secret payload {"session_token":"json-secret","visible":"keep"} https://example.test/callback?session_token=query-secret&visible=1',
      createdAt: 1_717_452_000_000,
    });

    const row = testDb.db
      .query<AuditRow, [string]>(
        "SELECT * FROM audit_records WHERE id = ? LIMIT 1",
      )
      .get("audit-summary-suffix-1");
    const persisted = JSON.stringify(row);
    expect(persisted).toContain("visible");
    expect(persisted).toContain("keep");
    expect(persisted).toContain("[REDACTED]");
    expect(persisted).not.toContain("session-secret");
    expect(persisted).not.toContain("id-secret");
    expect(persisted).not.toContain("csrf-secret");
    expect(persisted).not.toContain("basic-secret");
    expect(persisted).not.toContain("json-secret");
    expect(persisted).not.toContain("query-secret");
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

test("payloadHash ignores structured authorization header values", () => {
  const first = hashAuditPayload({
    authorization_header: "Basic first-basic-secret",
    AuthorizationHeader: "Bearer first-auth-secret",
    visible: "keep",
  });
  const second = hashAuditPayload({
    authorization_header: "Basic second-basic-secret",
    AuthorizationHeader: "Bearer second-auth-secret",
    visible: "keep",
  });

  expect(first).toBe(second);
  expect(first).toBe(sha256Hex('{"visible":"keep"}'));
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

test("createAuditWarningEvent redacts JSON-style secret pairs in diagnostics", () => {
  const warningEvent = createAuditWarningEvent(
    {
      source: 'runtime {"api_key":"source-json-secret"}',
      action: 'runtime.status.changed {"password":"action-json-password"}',
      sessionId: "session-1",
      payload: { status: "idle" },
      summary: "runtime idled",
    },
    new Error(
      'database failed {"api_key":"error-json-secret","password":"error-json-password"}',
    ),
  );

  const warningEventJson = JSON.stringify(warningEvent);
  expect(warningEventJson).toContain("Audit log write failed");
  expect(warningEventJson).toContain("[REDACTED]");
  expect(warningEventJson).not.toContain("source-json-secret");
  expect(warningEventJson).not.toContain("action-json-password");
  expect(warningEventJson).not.toContain("error-json-secret");
  expect(warningEventJson).not.toContain("error-json-password");
});

test("createAuditWarningEvent redacts escaped-quote JSON-style secret pairs in diagnostics", () => {
  const warningEvent = createAuditWarningEvent(
    {
      source: 'runtime {"api_key":"source-json-secret\\"suffix"}',
      action:
        'runtime.status.changed {"password":"action-json-password\\"suffix"}',
      sessionId: "session-1",
      payload: { status: "idle" },
      summary: "runtime idled",
    },
    new Error(
      'database failed {"api_key":"error-json-secret\\"suffix","password":"error-json-password\\"suffix"}',
    ),
  );

  const warningEventJson = JSON.stringify(warningEvent);
  expect(warningEventJson).toContain("Audit log write failed");
  expect(warningEventJson).toContain("[REDACTED]");
  expect(warningEventJson).not.toContain("source-json-secret");
  expect(warningEventJson).not.toContain("action-json-password");
  expect(warningEventJson).not.toContain("error-json-secret");
  expect(warningEventJson).not.toContain("error-json-password");
  expect(warningEventJson).not.toContain("suffix");
});

test("createAuditWarningEvent redacts suffix-style secret keys in diagnostics", () => {
  const warningEvent = createAuditWarningEvent(
    {
      source:
        'runtime session_token=session-secret payload {"session_token":"json-secret","visible":"keep"}',
      action:
        "runtime.status.changed id_token=id-secret https://example.test/callback?session_token=query-secret&visible=1",
      sessionId: "session-1",
      payload: { status: "idle" },
      summary: "runtime idled",
    },
    new Error(
      "database failed csrf_token=csrf-secret authorization_header=Basic basic-secret",
    ),
  );

  const warningEventJson = JSON.stringify(warningEvent);
  expect(warningEventJson).toContain("Audit log write failed");
  expect(warningEventJson).toContain("visible");
  expect(warningEventJson).toContain("keep");
  expect(warningEventJson).toContain("[REDACTED]");
  expect(warningEventJson).not.toContain("session-secret");
  expect(warningEventJson).not.toContain("id-secret");
  expect(warningEventJson).not.toContain("csrf-secret");
  expect(warningEventJson).not.toContain("basic-secret");
  expect(warningEventJson).not.toContain("json-secret");
  expect(warningEventJson).not.toContain("query-secret");
});

test("createAuditWarningEvent redacts warning diagnostics and metadata", () => {
  const warningEvent = createAuditWarningEvent(
    {
      id: "audit-warning-1",
      source: "runtime token=source-secret",
      action: "runtime.status.changed webhook_secret=action-secret",
      sessionId: "session-1",
      payload: { status: "idle" },
      summary: "runtime idled",
      createdAt: 1_717_452_000_000,
    },
    new Error("database failed password=diagnostic-secret"),
    {
      type: "integration.status",
      sessionId: "session-1",
      integration: {
        id: "wechat",
        channel: "wechat",
        metadata: {
          visible: "keep",
          password: "metadata-password",
          nested: { apiKey: "metadata-api-key" },
        },
      },
    },
  );

  const warningEventJson = JSON.stringify(warningEvent);
  expect(warningEventJson).toContain("Audit log write failed");
  expect(warningEventJson).toContain("keep");
  expect(warningEventJson).not.toContain("source-secret");
  expect(warningEventJson).not.toContain("action-secret");
  expect(warningEventJson).not.toContain("diagnostic-secret");
  expect(warningEventJson).not.toContain("metadata-password");
  expect(warningEventJson).not.toContain("metadata-api-key");
});

test("createAuditWarningEvent strips structured authorization header metadata", () => {
  const warningEvent = createAuditWarningEvent(
    {
      source: "runtime",
      action: "runtime.status.changed",
      sessionId: "session-1",
      payload: { status: "idle" },
      summary: "runtime idled",
    },
    new Error("database failed"),
    {
      type: "integration.status",
      sessionId: "session-1",
      integration: {
        id: "wechat",
        channel: "wechat",
        metadata: {
          authorization_header: "Basic basic-secret",
          AuthorizationHeader: "Bearer auth-secret",
          visible: "keep",
        },
      },
    },
  );

  const warningEventJson = JSON.stringify(warningEvent);
  expect(warningEventJson).toContain("keep");
  expect(warningEventJson).not.toContain("basic-secret");
  expect(warningEventJson).not.toContain("auth-secret");
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
