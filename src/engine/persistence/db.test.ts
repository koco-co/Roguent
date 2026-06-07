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

type CountRow = {
  count: number;
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

function createOldV1AchievementSchema(
  testDb: ReturnType<typeof createTestDatabase>,
): void {
  testDb.db.exec(`
    CREATE TABLE schema_version (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    INSERT INTO schema_version (id, version, updated_at)
    VALUES (1, 1, 1_717_452_000_000);

    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      runtime TEXT NOT NULL,
      title TEXT NOT NULL,
      model TEXT NOT NULL,
      cwd TEXT,
      permission_mode TEXT NOT NULL,
      sandbox_mode TEXT NOT NULL,
      reasoning_effort TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      network_access INTEGER NOT NULL DEFAULT 0 CHECK (network_access IN (0, 1)),
      approval_policy TEXT,
      metadata_json TEXT
    );

    CREATE TABLE achievement_progress (
      id TEXT PRIMARY KEY,
      achievement_key TEXT NOT NULL,
      session_id TEXT,
      progress INTEGER NOT NULL,
      target INTEGER NOT NULL,
      completed_at INTEGER,
      metadata_json TEXT,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
    );

    CREATE UNIQUE INDEX idx_achievement_progress_key_session
      ON achievement_progress(achievement_key, session_id);
  `);
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

test("pairing binding rebinding replaces boundAt with the new input", () => {
  const testDb = createTestDatabase();
  try {
    migrate(testDb.db);

    const repositories = createRepositories(testDb.db);
    const firstBoundAt = 1_717_452_000_000;
    const reboundAt = firstBoundAt + 60_000;

    repositories.sessions.upsert({
      id: "session-original",
      runtime: "claude",
      title: "Original session",
      model: "claude-opus-4-8",
      cwd: "/tmp/original",
      permissionMode: "default",
      sandboxMode: "workspace-write",
      reasoningEffort: null,
      networkAccess: true,
      approvalPolicy: null,
      metadataJson: null,
      createdAt: firstBoundAt,
      updatedAt: firstBoundAt,
    });
    repositories.sessions.upsert({
      id: "session-rebound",
      runtime: "claude",
      title: "Rebound session",
      model: "claude-opus-4-8",
      cwd: "/tmp/rebound",
      permissionMode: "default",
      sandboxMode: "workspace-write",
      reasoningEffort: null,
      networkAccess: true,
      approvalPolicy: null,
      metadataJson: null,
      createdAt: reboundAt,
      updatedAt: reboundAt,
    });

    repositories.pairingBindings.upsert({
      id: "binding-original",
      channel: "wechat",
      externalChatId: "external-chat-rebound",
      sessionId: "session-original",
      status: "active",
      forwardingEnabled: true,
      boundAt: firstBoundAt,
      updatedAt: firstBoundAt,
      externalUserId: null,
      displayName: "Original Chat",
      secretRef: "keychain://wechat/original",
      metadataJson: null,
    });
    repositories.pairingBindings.upsert({
      id: "binding-rebound",
      channel: "wechat",
      externalChatId: "external-chat-rebound",
      sessionId: "session-rebound",
      status: "active",
      forwardingEnabled: true,
      boundAt: reboundAt,
      updatedAt: reboundAt,
      externalUserId: null,
      displayName: "Rebound Chat",
      secretRef: "keychain://wechat/rebound",
      metadataJson: null,
    });

    expect(
      repositories.pairingBindings.getByExternalKey(
        "wechat",
        "external-chat-rebound",
      ),
    ).toMatchObject({
      id: "binding-rebound",
      sessionId: "session-rebound",
      boundAt: reboundAt,
      updatedAt: reboundAt,
    });
  } finally {
    testDb.cleanup();
  }
});

test("achievement_progress enforces one global row per achievement key", () => {
  const testDb = createTestDatabase();
  try {
    migrate(testDb.db);

    const insertGlobalAchievement = (id: string) => {
      testDb.db
        .query<unknown, [string, string, number, number, number]>(`
          INSERT INTO achievement_progress (
            id,
            achievement_key,
            session_id,
            progress,
            target,
            updated_at
          )
          VALUES (?, ?, NULL, ?, ?, ?)
        `)
        .run(id, "first-global-win", 1, 10, 1_717_452_000_000);
    };

    insertGlobalAchievement("achievement-global-1");
    expect(() => insertGlobalAchievement("achievement-global-2")).toThrow();

    const row = testDb.db
      .query<CountRow, [string]>(`
        SELECT COUNT(*) AS count
        FROM achievement_progress
        WHERE achievement_key = ? AND session_id IS NULL
      `)
      .get("first-global-win");

    expect(row?.count).toBe(1);
  } finally {
    testDb.cleanup();
  }
});

test("migration upgrades old v1 achievement index to reject duplicate global achievements", () => {
  const testDb = createTestDatabase();
  try {
    createOldV1AchievementSchema(testDb);

    migrate(testDb.db);

    expect(readSchemaVersion(testDb.db)).toBe(CURRENT_SCHEMA_VERSION);

    const insertGlobalAchievement = (id: string) => {
      testDb.db
        .query<unknown, [string, string, number, number, number]>(`
          INSERT INTO achievement_progress (
            id,
            achievement_key,
            session_id,
            progress,
            target,
            updated_at
          )
          VALUES (?, ?, NULL, ?, ?, ?)
        `)
        .run(id, "upgraded-global-key", 1, 10, 1_717_452_000_000);
    };

    insertGlobalAchievement("achievement-upgraded-global-1");
    expect(() =>
      insertGlobalAchievement("achievement-upgraded-global-2"),
    ).toThrow();

    const row = testDb.db
      .query<CountRow, [string]>(`
        SELECT COUNT(*) AS count
        FROM achievement_progress
        WHERE achievement_key = ? AND session_id IS NULL
      `)
      .get("upgraded-global-key");

    expect(row?.count).toBe(1);
  } finally {
    testDb.cleanup();
  }
});

test("deleting sessions cascades session achievements without creating duplicate globals", () => {
  const testDb = createTestDatabase();
  try {
    migrate(testDb.db);

    const repositories = createRepositories(testDb.db);
    const now = 1_717_452_000_000;

    for (const sessionId of [
      "session-achievement-1",
      "session-achievement-2",
    ]) {
      repositories.sessions.upsert({
        id: sessionId,
        runtime: "claude",
        title: sessionId,
        model: "claude-opus-4-8",
        cwd: "/tmp/project",
        permissionMode: "default",
        sandboxMode: "workspace-write",
        reasoningEffort: null,
        networkAccess: true,
        approvalPolicy: null,
        metadataJson: null,
        createdAt: now,
        updatedAt: now,
      });
    }

    testDb.db
      .query<unknown, [string, string, string, number, number, number]>(`
        INSERT INTO achievement_progress (
          id,
          achievement_key,
          session_id,
          progress,
          target,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .run(
        "achievement-session-1",
        "same-session-key",
        "session-achievement-1",
        1,
        10,
        now,
      );
    testDb.db
      .query<unknown, [string, string, string, number, number, number]>(`
        INSERT INTO achievement_progress (
          id,
          achievement_key,
          session_id,
          progress,
          target,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .run(
        "achievement-session-2",
        "same-session-key",
        "session-achievement-2",
        2,
        10,
        now,
      );

    expect(() => {
      testDb.db
        .query<unknown, [string]>("DELETE FROM sessions WHERE id = ?")
        .run("session-achievement-1");
      testDb.db
        .query<unknown, [string]>("DELETE FROM sessions WHERE id = ?")
        .run("session-achievement-2");
    }).not.toThrow();

    const globalRow = testDb.db
      .query<CountRow, [string]>(`
        SELECT COUNT(*) AS count
        FROM achievement_progress
        WHERE achievement_key = ? AND session_id IS NULL
      `)
      .get("same-session-key");
    const totalRow = testDb.db
      .query<CountRow, [string]>(`
        SELECT COUNT(*) AS count
        FROM achievement_progress
        WHERE achievement_key = ?
      `)
      .get("same-session-key");

    expect(globalRow?.count).toBe(0);
    expect(totalRow?.count).toBe(0);
  } finally {
    testDb.cleanup();
  }
});
