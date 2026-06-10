import { expect, test } from "bun:test";
import { createTestDatabase } from "../persistence/db";
import { migrate } from "../persistence/migrations";
import { createRepositories } from "../persistence/repositories";
import { PairingService } from "./pairing";

type AuditRow = {
  source: string;
  action: string;
  session_id: string | null;
  summary: string;
};

function insertSession(db: ReturnType<typeof createTestDatabase>, id: string) {
  createRepositories(db.db).sessions.upsert({
    id,
    runtime: "claude",
    title: id,
    model: "claude-opus-4-8",
    cwd: `/tmp/${id}`,
    permissionMode: "default",
    sandboxMode: "workspace-write",
    reasoningEffort: null,
    networkAccess: true,
    approvalPolicy: null,
    metadataJson: null,
    createdAt: 1_717_452_000_000,
    updatedAt: 1_717_452_000_000,
  });
}

test("bind creates an active binding with forwarding enabled by default", async () => {
  const testDb = createTestDatabase();
  try {
    migrate(testDb.db);
    insertSession(testDb, "s1");
    const service = new PairingService(testDb.db);

    const binding = await service.bind({
      channel: "wechat",
      externalChatId: "chat1",
      sessionId: "s1",
      displayName: "My Work Account",
    });

    expect(binding).toMatchObject({
      channel: "wechat",
      externalChatId: "chat1",
      sessionId: "s1",
      status: "active",
      forwardingEnabled: true,
      displayName: "My Work Account",
    });
    await expect(service.resolve("wechat", "chat1")).resolves.toMatchObject({
      sessionId: "s1",
      forwardingEnabled: true,
    });
  } finally {
    testDb.cleanup();
  }
});

test("bind overwrites the old session for the same external chat and writes audit", async () => {
  const testDb = createTestDatabase();
  try {
    migrate(testDb.db);
    insertSession(testDb, "s1");
    insertSession(testDb, "s2");
    const service = new PairingService(testDb.db);

    await service.bind({
      channel: "wechat",
      externalChatId: "chat1",
      sessionId: "s1",
    });
    const rebound = await service.bind({
      channel: "wechat",
      externalChatId: "chat1",
      sessionId: "s2",
    });

    expect(rebound.sessionId).toBe("s2");
    await expect(service.resolve("wechat", "chat1")).resolves.toMatchObject({
      sessionId: "s2",
    });
    const auditRows = testDb.db
      .query<AuditRow, []>(
        "SELECT source, action, session_id, summary FROM audit_records",
      )
      .all();
    expect(auditRows).toEqual([
      {
        source: "integration.pairing",
        action: "pairing.binding.overwritten",
        session_id: "s2",
        summary: "wechat chat1 rebound from s1 to s2",
      },
    ]);
  } finally {
    testDb.cleanup();
  }
});

test("setForwarding updates forwarding without changing the bound session", async () => {
  const testDb = createTestDatabase();
  try {
    migrate(testDb.db);
    insertSession(testDb, "s1");
    const service = new PairingService(testDb.db);
    await service.bind({
      channel: "feishu",
      externalChatId: "chat1",
      sessionId: "s1",
    });

    const disabled = await service.setForwarding("feishu", "chat1", false);

    expect(disabled).toMatchObject({
      channel: "feishu",
      externalChatId: "chat1",
      sessionId: "s1",
      forwardingEnabled: false,
    });
    await expect(service.resolve("feishu", "chat1")).resolves.toMatchObject({
      sessionId: "s1",
      forwardingEnabled: false,
    });
  } finally {
    testDb.cleanup();
  }
});
