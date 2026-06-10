import { Database } from "bun:sqlite";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";

export interface TestDatabase {
  db: Database;
  path: string;
  cleanup: () => void;
}

export function configureDatabase(db: Database): Database {
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA journal_mode = WAL");
  return db;
}

export function openDatabase(path: string): Database {
  mkdirSync(dirname(path), { recursive: true });
  return configureDatabase(
    new Database(path, { create: true, readwrite: true, strict: true }),
  );
}

export function resolveDatabasePath(
  env: Record<string, string | undefined> = process.env,
): string {
  return (
    env.ROGUENT_DB_PATH?.trim() || join(homedir(), ".roguent", "roguent.sqlite")
  );
}

export function withTransaction<T>(db: Database, fn: () => T): T {
  const transaction = db.transaction(fn);
  return transaction();
}

export function createTestDatabase(): TestDatabase {
  const dir = mkdtempSync(join(tmpdir(), "roguent-db-"));
  const path = join(dir, "test.sqlite");
  const db = openDatabase(path);
  let cleaned = false;

  return {
    db,
    path,
    cleanup: () => {
      if (cleaned) {
        return;
      }
      cleaned = true;
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
