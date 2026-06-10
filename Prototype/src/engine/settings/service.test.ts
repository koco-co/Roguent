import { afterEach, expect, test } from "bun:test";
import type { RoguentSettings } from "../../shared/events";
import { type TestDatabase, createTestDatabase } from "../persistence/db";
import { migrate } from "../persistence/migrations";
import { MemorySecretStore } from "../secrets/memory-store";
import { createSettingsService } from "./service";

let testDb: TestDatabase | null = null;

afterEach(() => {
  testDb?.cleanup();
  testDb = null;
});

function rawDbText(db: TestDatabase): string {
  return db.db
    .query<{ settings_json: string }, []>("SELECT settings_json FROM settings")
    .all()
    .map((row) => row.settings_json)
    .join("\n");
}

test("settings service stores sensitive values in SecretStore and only secret refs in SQLite", async () => {
  testDb = createTestDatabase();
  migrate(testDb.db);
  const secrets = new MemorySecretStore();
  const service = createSettingsService(testDb.db, secrets, { now: () => 123 });
  const input: RoguentSettings = {
    runtime: {
      runtime: "codex",
      model: "gpt-5",
      permissionMode: "default",
      approvalPolicy: "never",
      sandboxMode: "danger-full-access",
      reasoningEffort: "high",
      networkAccess: true,
    },
    integrations: {
      github: {
        enabled: true,
        metadata: {
          repo: "poco/roguent",
          webhookSecret: "github-secret-value",
        },
      },
      x: {
        enabled: false,
        metadata: {
          bearerToken: "x-token-value",
        },
      },
    },
    scheduler: { enabled: true, timezone: "UTC" },
  };

  const payload = await service.update("user", input, ["integrations.github"]);
  const githubSecretRef = (
    payload.settings.integrations?.github?.metadata?.webhookSecret as {
      secretRef?: string;
    }
  ).secretRef;
  const xSecretRef = (
    payload.settings.integrations?.x?.metadata?.bearerToken as {
      secretRef?: string;
    }
  ).secretRef;

  expect(payload).toMatchObject({
    scope: "user",
    changedKeys: ["integrations.github"],
    settings: {
      runtime: { runtime: "codex", approvalPolicy: "never" },
      integrations: {
        github: {
          enabled: true,
          metadata: {
            repo: "poco/roguent",
            webhookSecret: { secretRef: expect.any(String) },
          },
        },
        x: {
          enabled: false,
          metadata: { bearerToken: { secretRef: expect.any(String) } },
        },
      },
    },
  });
  expect(githubSecretRef).toBeTruthy();
  expect(xSecretRef).toBeTruthy();
  expect(await secrets.get(githubSecretRef ?? "")).toBe("github-secret-value");
  expect(await secrets.get(xSecretRef ?? "")).toBe("x-token-value");
  expect(rawDbText(testDb)).not.toContain("github-secret-value");
  expect(rawDbText(testDb)).not.toContain("x-token-value");
  expect(rawDbText(testDb)).toContain("secretRef");
  expect(await service.load("user")).toEqual(payload.settings);
});

test("settings service deletes stale secret refs after a settings overwrite", async () => {
  testDb = createTestDatabase();
  migrate(testDb.db);
  const secrets = new MemorySecretStore();
  const service = createSettingsService(testDb.db, secrets, { now: () => 123 });

  const first = await service.update("user", {
    integrations: {
      github: {
        enabled: true,
        metadata: { webhookSecret: "old-secret-value" },
      },
    },
  });
  const staleRef = (
    first.settings.integrations?.github?.metadata?.webhookSecret as {
      secretRef?: string;
    }
  ).secretRef;
  expect(staleRef).toBeTruthy();
  expect(await secrets.get(staleRef ?? "")).toBe("old-secret-value");

  await service.update("user", {
    integrations: {
      github: {
        enabled: false,
        metadata: {},
      },
    },
  });

  expect(await secrets.get(staleRef ?? "")).toBeUndefined();
  expect(await secrets.listRefs("settings/user")).toEqual([]);
});
