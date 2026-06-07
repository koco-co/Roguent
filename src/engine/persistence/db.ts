import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
  return configureDatabase(
    new Database(path, { create: true, readwrite: true, strict: true }),
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
