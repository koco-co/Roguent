import type { Database } from "bun:sqlite";
import type {
  RoguentSettings,
  SettingsScope,
  SettingsUpdatedPayload,
} from "../../shared/events";
import type { SecretStore } from "../secrets/types";

interface SettingsRow {
  settings_json: string;
}

export interface SettingsServiceOptions {
  now?: () => number;
}

export interface SettingsService {
  update(
    scope: SettingsScope,
    settings: RoguentSettings,
    changedKeys?: string[],
    metadata?: Record<string, unknown>,
  ): Promise<SettingsUpdatedPayload>;
  load(scope: SettingsScope): Promise<RoguentSettings | null>;
}

const SENSITIVE_KEY = /(token|secret|password|private.?key|access.?key)/i;

export function createSettingsService(
  db: Database,
  secrets: SecretStore,
  options: SettingsServiceOptions = {},
): SettingsService {
  const now = options.now ?? Date.now;

  return {
    async update(scope, settings, changedKeys, metadata) {
      const secretPrefix = `settings/${scope}`;
      const sanitized = (await sanitizeSettings(
        settings,
        secrets,
        secretPrefix,
      )) as RoguentSettings;
      db.query<
        unknown,
        [string, string, string | null, string | null, number]
      >(`
        INSERT INTO settings (
          scope,
          settings_json,
          changed_keys_json,
          metadata_json,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(scope) DO UPDATE SET
          settings_json = excluded.settings_json,
          changed_keys_json = excluded.changed_keys_json,
          metadata_json = excluded.metadata_json,
          updated_at = excluded.updated_at
      `).run(
        scope,
        JSON.stringify(sanitized),
        changedKeys ? JSON.stringify(changedKeys) : null,
        metadata ? JSON.stringify(metadata) : null,
        now(),
      );
      await pruneStaleSecretRefs(secrets, secretPrefix, sanitized);

      return {
        scope,
        settings: sanitized,
        ...(changedKeys ? { changedKeys } : {}),
        ...(metadata ? { metadata } : {}),
      };
    },

    async load(scope) {
      const row = db
        .query<SettingsRow, [string]>(
          "SELECT settings_json FROM settings WHERE scope = ? LIMIT 1",
        )
        .get(scope);
      if (!row) return null;
      return JSON.parse(row.settings_json) as RoguentSettings;
    },
  };
}

async function sanitizeSettings(
  value: unknown,
  secrets: SecretStore,
  path: string,
): Promise<unknown> {
  if (Array.isArray(value)) {
    return Promise.all(
      value.map((entry, index) =>
        sanitizeSettings(entry, secrets, `${path}.${index}`),
      ),
    );
  }
  if (value === null || typeof value !== "object") return value;

  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (typeof entry === "string" && SENSITIVE_KEY.test(key)) {
      const secretRef = childPath.replaceAll(/[^a-zA-Z0-9_.:/-]/g, "_");
      await secrets.put(secretRef, entry);
      output[key] = { secretRef };
    } else {
      output[key] = await sanitizeSettings(entry, secrets, childPath);
    }
  }
  return output;
}

async function pruneStaleSecretRefs(
  secrets: SecretStore,
  prefix: string,
  settings: RoguentSettings,
): Promise<void> {
  const activeRefs = new Set<string>();
  collectSecretRefs(settings, activeRefs);
  const refs = await secrets.listRefs(prefix);
  await Promise.all(
    refs
      .filter((ref) => !activeRefs.has(ref))
      .map((ref) => secrets.delete(ref)),
  );
}

function collectSecretRefs(value: unknown, refs: Set<string>): void {
  if (Array.isArray(value)) {
    for (const entry of value) collectSecretRefs(entry, refs);
    return;
  }
  if (value === null || typeof value !== "object") return;
  if (
    "secretRef" in value &&
    typeof (value as { secretRef?: unknown }).secretRef === "string"
  ) {
    refs.add((value as { secretRef: string }).secretRef);
  }
  for (const entry of Object.values(value)) collectSecretRefs(entry, refs);
}
