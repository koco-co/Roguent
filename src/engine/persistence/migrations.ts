import type { Database } from "bun:sqlite";
import { withTransaction } from "./db";

export const CURRENT_SCHEMA_VERSION = 2;

export const REQUIRED_TABLE_NAMES = [
  "sessions",
  "pairing_bindings",
  "connector_statuses",
  "inbox_items",
  "scheduler_tasks",
  "scheduler_runs",
  "ledger_entries",
  "inventory_items",
  "achievement_progress",
  "audit_records",
] as const;

type SchemaVersionRow = {
  version: number;
};

function ensureSchemaVersionTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
}

export function readSchemaVersion(db: Database): number {
  ensureSchemaVersionTable(db);
  const row = db
    .query<SchemaVersionRow, []>(
      "SELECT version FROM schema_version WHERE id = 1",
    )
    .get();
  return row?.version ?? 0;
}

function setSchemaVersion(db: Database, version: number): void {
  db.query<unknown, [number]>(`
    INSERT INTO schema_version (id, version, updated_at)
    VALUES (1, ?, unixepoch('now') * 1000)
    ON CONFLICT(id) DO UPDATE SET
      version = excluded.version,
      updated_at = excluded.updated_at
  `).run(version);
}

function migrateToVersion1(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
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

    CREATE TABLE IF NOT EXISTS pairing_bindings (
      id TEXT PRIMARY KEY,
      channel TEXT NOT NULL,
      external_chat_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      status TEXT NOT NULL,
      forwarding_enabled INTEGER NOT NULL DEFAULT 1 CHECK (forwarding_enabled IN (0, 1)),
      bound_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      external_user_id TEXT,
      display_name TEXT,
      secret_ref TEXT,
      metadata_json TEXT,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_pairing_bindings_external_key
      ON pairing_bindings(channel, external_chat_id);
    CREATE INDEX IF NOT EXISTS idx_pairing_bindings_session_id
      ON pairing_bindings(session_id);
    CREATE INDEX IF NOT EXISTS idx_pairing_bindings_status
      ON pairing_bindings(status);

    CREATE TABLE IF NOT EXISTS connector_statuses (
      id TEXT PRIMARY KEY,
      channel TEXT NOT NULL,
      state TEXT NOT NULL,
      label TEXT,
      account_ref TEXT,
      secret_ref TEXT,
      last_event_at INTEGER,
      error TEXT,
      metadata_json TEXT,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_connector_statuses_channel
      ON connector_statuses(channel);
    CREATE INDEX IF NOT EXISTS idx_connector_statuses_state
      ON connector_statuses(state);

    CREATE TABLE IF NOT EXISTS inbox_items (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      ts INTEGER NOT NULL,
      status TEXT NOT NULL,
      kind TEXT,
      priority TEXT,
      channel TEXT,
      session_id TEXT,
      agent_id TEXT,
      related_event_id TEXT,
      actions_json TEXT,
      metadata_json TEXT,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_inbox_items_status_ts
      ON inbox_items(status, ts);
    CREATE INDEX IF NOT EXISTS idx_inbox_items_session_id
      ON inbox_items(session_id);
    CREATE INDEX IF NOT EXISTS idx_inbox_items_channel
      ON inbox_items(channel);

    CREATE TABLE IF NOT EXISTS scheduler_tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      prompt_ref TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      next_run_at INTEGER,
      cwd TEXT,
      runtime_json TEXT,
      schedule_json TEXT,
      metadata_json TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_scheduler_tasks_status_next_run_at
      ON scheduler_tasks(status, next_run_at);

    CREATE TABLE IF NOT EXISTS scheduler_runs (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      status TEXT NOT NULL,
      queued_at INTEGER,
      started_at INTEGER,
      finished_at INTEGER,
      session_id TEXT,
      summary TEXT,
      error TEXT,
      metadata_json TEXT,
      FOREIGN KEY (task_id) REFERENCES scheduler_tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_scheduler_runs_task_id_started_at
      ON scheduler_runs(task_id, started_at);
    CREATE INDEX IF NOT EXISTS idx_scheduler_runs_status
      ON scheduler_runs(status);

    CREATE TABLE IF NOT EXISTS ledger_entries (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      agent_id TEXT,
      kind TEXT NOT NULL,
      amount INTEGER NOT NULL,
      currency TEXT NOT NULL,
      reason TEXT NOT NULL,
      related_event_id TEXT,
      metadata_json TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ledger_entries_session_id_created_at
      ON ledger_entries(session_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_ledger_entries_kind
      ON ledger_entries(kind);

    CREATE TABLE IF NOT EXISTS inventory_items (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      item_type TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      metadata_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_inventory_items_session_type
      ON inventory_items(session_id, item_type);

    CREATE TABLE IF NOT EXISTS achievement_progress (
      id TEXT PRIMARY KEY,
      achievement_key TEXT NOT NULL,
      session_id TEXT,
      progress INTEGER NOT NULL,
      target INTEGER NOT NULL,
      completed_at INTEGER,
      metadata_json TEXT,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_achievement_progress_global_key
      ON achievement_progress(achievement_key)
      WHERE session_id IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_achievement_progress_session_key
      ON achievement_progress(achievement_key, session_id)
      WHERE session_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS audit_records (
      id TEXT PRIMARY KEY,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      metadata_json TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_audit_records_target
      ON audit_records(target_type, target_id);
    CREATE INDEX IF NOT EXISTS idx_audit_records_created_at
      ON audit_records(created_at);
  `);
}

function migrateToVersion2(db: Database): void {
  db.exec(`
    DROP TABLE IF EXISTS achievement_progress_next;

    CREATE TABLE achievement_progress_next (
      id TEXT PRIMARY KEY,
      achievement_key TEXT NOT NULL,
      session_id TEXT,
      progress INTEGER NOT NULL,
      target INTEGER NOT NULL,
      completed_at INTEGER,
      metadata_json TEXT,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    INSERT INTO achievement_progress_next (
      id,
      achievement_key,
      session_id,
      progress,
      target,
      completed_at,
      metadata_json,
      updated_at
    )
    SELECT
      achievement.id,
      achievement.achievement_key,
      achievement.session_id,
      achievement.progress,
      achievement.target,
      achievement.completed_at,
      achievement.metadata_json,
      achievement.updated_at
    FROM achievement_progress AS achievement
    WHERE
      (
        achievement.session_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM sessions WHERE sessions.id = achievement.session_id
        )
      )
      OR
      (
        achievement.session_id IS NULL
        AND achievement.id = (
          SELECT global_achievement.id
          FROM achievement_progress AS global_achievement
          WHERE
            global_achievement.session_id IS NULL
            AND global_achievement.achievement_key = achievement.achievement_key
          ORDER BY global_achievement.updated_at DESC, global_achievement.id DESC
          LIMIT 1
        )
      );

    DROP TABLE achievement_progress;
    ALTER TABLE achievement_progress_next RENAME TO achievement_progress;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_achievement_progress_global_key
      ON achievement_progress(achievement_key)
      WHERE session_id IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_achievement_progress_session_key
      ON achievement_progress(achievement_key, session_id)
      WHERE session_id IS NOT NULL;
  `);
}

export function migrate(db: Database): void {
  withTransaction(db, () => {
    let version = readSchemaVersion(db);
    if (version > CURRENT_SCHEMA_VERSION) {
      throw new Error(
        `Database schema version ${version} is newer than supported version ${CURRENT_SCHEMA_VERSION}`,
      );
    }

    if (version < 1) {
      migrateToVersion1(db);
      setSchemaVersion(db, 1);
      version = 1;
    }

    if (version < 2) {
      migrateToVersion2(db);
      setSchemaVersion(db, 2);
    }
  });
}
