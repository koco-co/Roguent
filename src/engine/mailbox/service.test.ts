import { expect, test } from "bun:test";
import type { MailboxItem } from "../../shared/events";
import { createTestDatabase } from "../persistence/db";
import { migrate } from "../persistence/migrations";
import { createRepositories } from "../persistence/repositories";
import { createMailboxService } from "./service";

const day = new Date(2026, 0, 2, 12).getTime();

function item(overrides: Partial<MailboxItem> = {}): MailboxItem {
  return {
    id: overrides.id ?? "mail-1",
    source: overrides.source ?? "github",
    title: overrides.title ?? "Workflow failed",
    summary: overrides.summary ?? "CI failed on main",
    ts: overrides.ts ?? day,
    status: overrides.status ?? "unread",
    kind: overrides.kind ?? "event",
    priority: overrides.priority ?? "high",
    channel: overrides.channel ?? "github",
    sessionId: overrides.sessionId,
    relatedEventId: overrides.relatedEventId ?? "delivery-1",
    actions: overrides.actions,
    metadata: overrides.metadata ?? {
      board: true,
      sourceUrl: "https://github.example/actions/1",
    },
  };
}

function insertSession(
  db: ReturnType<typeof createTestDatabase>,
  id: string,
): void {
  createRepositories(db.db).sessions.upsert({
    id,
    runtime: "claude",
    title: id,
    model: "claude-sonnet-4",
    cwd: null,
    permissionMode: "default",
    sandboxMode: "workspace-write",
    reasoningEffort: null,
    networkAccess: false,
    approvalPolicy: null,
    metadataJson: null,
    createdAt: 1,
    updatedAt: 1,
  });
}

test("createOrUpdate persists mailbox field mappings through the existing table", () => {
  const testDb = createTestDatabase();
  try {
    migrate(testDb.db);
    insertSession(testDb, "routed-session");
    const service = createMailboxService(testDb.db);

    service.createOrUpdate(
      item({
        id: "mail-map",
        priority: "high",
        sessionId: "routed-session",
        ts: day,
        metadata: { sourceUrl: "https://example.test/source" },
      }),
    );

    const stored = service.get("mail-map");
    expect(stored?.source).toBe("github");
    expect(stored?.summary).toBe("CI failed on main");
    expect(stored?.priority).toBe("high");
    expect(stored?.metadata?.sourceUrl).toBe("https://example.test/source");
    expect(stored?.sessionId).toBe("routed-session");
    expect(stored?.ts).toBe(day);
  } finally {
    testDb.cleanup();
  }
});

test("boardItems returns today's board items and unread alerts newest first", () => {
  const testDb = createTestDatabase();
  try {
    migrate(testDb.db);
    const service = createMailboxService(testDb.db);
    const yesterday = new Date(2026, 0, 1, 23).getTime();

    service.createOrUpdate(
      item({ id: "board-read", status: "read", metadata: { board: true } }),
    );
    service.createOrUpdate(
      item({
        id: "alert-high",
        source: "runtime",
        kind: "alert",
        priority: "high",
        ts: day + 10,
        metadata: {},
      }),
    );
    service.createOrUpdate(
      item({
        id: "old-board",
        status: "read",
        ts: yesterday,
        metadata: { board: true },
      }),
    );
    service.createOrUpdate(
      item({
        id: "old-unread-alert",
        source: "runtime",
        kind: "alert",
        priority: "high",
        ts: yesterday,
        metadata: {},
      }),
    );
    service.createOrUpdate(
      item({
        id: "read-alert",
        kind: "alert",
        priority: "high",
        status: "read",
        ts: day + 20,
        metadata: {},
      }),
    );
    service.createOrUpdate(
      item({
        id: "archived-board",
        status: "archived",
        ts: day + 30,
        metadata: { board: true },
      }),
    );
    service.createOrUpdate(
      item({
        id: "normal",
        kind: "message",
        priority: "normal",
        ts: day + 40,
        metadata: {},
      }),
    );

    expect(service.boardItems({ now: day + 60 }).map((i) => i.id)).toEqual([
      "alert-high",
      "board-read",
      "old-unread-alert",
    ]);
  } finally {
    testDb.cleanup();
  }
});

test("resend returns session input details and records an audit action", () => {
  const testDb = createTestDatabase();
  try {
    migrate(testDb.db);
    insertSession(testDb, "original-session");
    const service = createMailboxService(testDb.db, { now: () => day + 100 });
    service.createOrUpdate(
      item({
        id: "mail-resend",
        title: "Ask from X",
        summary: "Please triage this post",
        source: "x",
        sessionId: "original-session",
        metadata: { url: "https://x.example/post/1" },
      }),
    );

    const result = service.resend("mail-resend", {
      targetSessionId: "target-session",
    });

    expect(result.targetSessionId).toBe("target-session");
    expect(result.text).toContain("Ask from X");
    expect(result.text).toContain("Please triage this post");
    expect(result.text).toContain("https://x.example/post/1");
    expect(result.auditRecord.action).toBe("mailbox.resend");
    expect(result.auditRecord.sessionId).toBe("target-session");
    expect(result.auditRecord.createdAt).toBe(day + 100);
  } finally {
    testDb.cleanup();
  }
});
