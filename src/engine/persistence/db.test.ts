import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { createTestDatabase } from "./db";
import {
  CURRENT_SCHEMA_VERSION,
  REQUIRED_TABLE_NAMES,
  migrate,
  readSchemaVersion,
} from "./migrations";
import { createRepositories } from "./repositories";

type ColumnRow = {
  table_name: string;
  column_name: string;
};

type IndexListRow = {
  name: string;
  unique: number;
};

type IndexInfoRow = {
  name: string;
};

const FORBIDDEN_SECRET_COLUMNS = new Set([
  "token",
  "password",
  "access_token",
  "refresh_token",
  "private_key",
]);

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

test("migrations are idempotent", () => {
  const testDb = createTestDatabase();
  try {
    migrate(testDb.db);
    migrate(testDb.db);

    expect(readSchemaVersion(testDb.db)).toBe(CURRENT_SCHEMA_VERSION);
  } finally {
    testDb.cleanup();
  }
});

test("all required tables exist", () => {
  const testDb = createTestDatabase();
  try {
    migrate(testDb.db);

    const rows = testDb.db
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type = 'table'",
      )
      .all();
    const tableNames = new Set(rows.map((row) => row.name));

    for (const tableName of REQUIRED_TABLE_NAMES) {
      expect(tableNames.has(tableName)).toBe(true);
    }
  } finally {
    testDb.cleanup();
  }
});

test("pairing_bindings has a unique index on channel and external_chat_id", () => {
  const testDb = createTestDatabase();
  try {
    migrate(testDb.db);

    const indexes = testDb.db
      .query<IndexListRow, []>("PRAGMA index_list('pairing_bindings')")
      .all();
    const hasRequiredIndex = indexes.some((index) => {
      if (index.unique !== 1) {
        return false;
      }

      const columns = testDb.db
        .query<IndexInfoRow, []>(
          `PRAGMA index_info(${quoteIdentifier(index.name)})`,
        )
        .all()
        .map((row) => row.name);

      return columns.join(",") === "channel,external_chat_id";
    });

    expect(hasRequiredIndex).toBe(true);
  } finally {
    testDb.cleanup();
  }
});

test("schema does not include plaintext credential column names", () => {
  const testDb = createTestDatabase();
  try {
    migrate(testDb.db);

    const columns = testDb.db
      .query<ColumnRow, []>(`
        SELECT sqlite_master.name AS table_name, pragma_table_info.name AS column_name
        FROM sqlite_master
        JOIN pragma_table_info(sqlite_master.name)
        WHERE sqlite_master.type = 'table'
      `)
      .all();
    const offenders = columns.filter((column) =>
      FORBIDDEN_SECRET_COLUMNS.has(column.column_name.toLowerCase()),
    );

    expect(offenders).toEqual([]);
    expect(columns.some((column) => column.column_name === "secret_ref")).toBe(
      true,
    );
  } finally {
    testDb.cleanup();
  }
});

test("temp database cleanup removes the temp directory and file", () => {
  const testDb = createTestDatabase();
  const dbPath = testDb.path;
  const dbDir = dirname(dbPath);

  testDb.db.query("SELECT 1").get();
  expect(existsSync(dbPath)).toBe(true);
  expect(existsSync(dbDir)).toBe(true);

  testDb.cleanup();

  expect(existsSync(dbPath)).toBe(false);
  expect(existsSync(dbDir)).toBe(false);
});

test("repositories can upsert sessions and pairing bindings and append audit records", () => {
  const testDb = createTestDatabase();
  try {
    migrate(testDb.db);

    const repositories = createRepositories(testDb.db);
    const now = 1_717_452_000_000;

    repositories.sessions.upsert({
      id: "session-1",
      runtime: "claude",
      title: "Prototype session",
      model: "claude-opus-4-8",
      cwd: "/tmp/project",
      permissionMode: "default",
      sandboxMode: "workspace-write",
      reasoningEffort: null,
      networkAccess: true,
      approvalPolicy: null,
      metadataJson: '{"source":"test"}',
      createdAt: now,
      updatedAt: now,
    });

    repositories.pairingBindings.upsert({
      id: "binding-1",
      channel: "wechat",
      externalChatId: "external-chat-1",
      sessionId: "session-1",
      status: "active",
      forwardingEnabled: true,
      boundAt: now,
      updatedAt: now,
      externalUserId: "external-user-1",
      displayName: "Team Chat",
      secretRef: "keychain://wechat/external-chat-1",
      metadataJson: '{"source":"test"}',
    });

    repositories.auditRecords.append({
      id: "audit-1",
      actor: "system",
      action: "pairing.upserted",
      targetType: "pairing_binding",
      targetId: "binding-1",
      metadataJson: '{"reason":"smoke-test"}',
      createdAt: now,
    });

    expect(repositories.sessions.get("session-1")).toEqual({
      id: "session-1",
      runtime: "claude",
      title: "Prototype session",
      model: "claude-opus-4-8",
      cwd: "/tmp/project",
      permissionMode: "default",
      sandboxMode: "workspace-write",
      reasoningEffort: null,
      networkAccess: true,
      approvalPolicy: null,
      metadataJson: '{"source":"test"}',
      createdAt: now,
      updatedAt: now,
    });
    expect(
      repositories.pairingBindings.getByExternalKey(
        "wechat",
        "external-chat-1",
      ),
    ).toEqual({
      id: "binding-1",
      channel: "wechat",
      externalChatId: "external-chat-1",
      sessionId: "session-1",
      status: "active",
      forwardingEnabled: true,
      boundAt: now,
      updatedAt: now,
      externalUserId: "external-user-1",
      displayName: "Team Chat",
      secretRef: "keychain://wechat/external-chat-1",
      metadataJson: '{"source":"test"}',
    });
    expect(repositories.auditRecords.get("audit-1")).toEqual({
      id: "audit-1",
      actor: "system",
      action: "pairing.upserted",
      targetType: "pairing_binding",
      targetId: "binding-1",
      metadataJson: '{"reason":"smoke-test"}',
      createdAt: now,
    });
  } finally {
    testDb.cleanup();
  }
});
