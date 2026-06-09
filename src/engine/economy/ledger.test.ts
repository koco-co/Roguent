import { expect, test } from "bun:test";
import { createTestDatabase } from "../persistence/db";
import { migrate } from "../persistence/migrations";
import { createRepositories } from "../persistence/repositories";
import { createEconomyLedgerService, reduceLedgerBalances } from "./ledger";

const now = Date.parse("2026-01-02T08:00:00.000Z");

function createServiceHarness() {
  const testDb = createTestDatabase();
  migrate(testDb.db);
  createRepositories(testDb.db).sessions.upsert({
    id: "session-1",
    runtime: "codex",
    title: "Economy test",
    model: "gpt-5",
    cwd: "/repo",
    permissionMode: "default",
    sandboxMode: "workspace-write",
    reasoningEffort: null,
    networkAccess: false,
    approvalPolicy: null,
    metadataJson: null,
    createdAt: now,
    updatedAt: now,
  });
  const ids = ["ledger-1", "ledger-2", "ledger-3", "ledger-4"];
  const service = createEconomyLedgerService(testDb.db, {
    now: () => now,
    createId: () => ids.shift() ?? "ledger-next",
  });
  return { ...testDb, service };
}

function createLongLedgerHarness() {
  const testDb = createTestDatabase();
  migrate(testDb.db);
  createRepositories(testDb.db).sessions.upsert({
    id: "session-1",
    runtime: "codex",
    title: "Economy test",
    model: "gpt-5",
    cwd: "/repo",
    permissionMode: "default",
    sandboxMode: "workspace-write",
    reasoningEffort: null,
    networkAccess: false,
    approvalPolicy: null,
    metadataJson: null,
    createdAt: now,
    updatedAt: now,
  });
  let nextId = 1;
  const service = createEconomyLedgerService(testDb.db, {
    now: () => now,
    createId: () => `ledger-${nextId++}`,
  });
  return { ...testDb, service };
}

test("append stores amount currency reason source event id and derived balance", () => {
  const harness = createServiceHarness();
  try {
    const result = harness.service.append({
      sessionId: "session-1",
      actorId: "agent-1",
      amount: 10,
      currency: "gems",
      reason: "task.completed",
      sourceEventId: "event-1",
      metadata: { taskId: "task-1" },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("append should succeed");
    expect(result.entry).toMatchObject({
      id: "ledger-1",
      ts: now,
      reason: "task.completed",
      amount: 10,
      currency: "gems",
      source: "event-1",
      sourceEventId: "event-1",
      actorId: "agent-1",
      delta: { gems: 10 },
      balance: { gems: 10 },
      metadata: { taskId: "task-1" },
    });

    const row = harness.db
      .query<
        {
          id: string;
          kind: string;
          amount: number;
          currency: string;
          reason: string;
          related_event_id: string | null;
        },
        []
      >("SELECT * FROM ledger_entries WHERE id = 'ledger-1'")
      .get();
    expect(row).toMatchObject({
      id: "ledger-1",
      kind: "credit",
      amount: 10,
      currency: "gems",
      reason: "task.completed",
      related_event_id: "event-1",
    });
  } finally {
    harness.cleanup();
  }
});

test("balance is derived by reducing persisted multi-currency entries", () => {
  const harness = createServiceHarness();
  try {
    harness.service.append({
      sessionId: "session-1",
      amount: 10,
      currency: "gems",
      reason: "achievement",
      sourceEventId: "event-1",
    });
    harness.service.append({
      sessionId: "session-1",
      amount: 7,
      currency: "coins",
      reason: "event",
      sourceEventId: "event-2",
    });
    harness.service.append({
      sessionId: "session-1",
      amount: -3,
      currency: "gems",
      reason: "shop.purchase",
      sourceEventId: "event-3",
    });

    expect(harness.service.balance("session-1")).toEqual({
      coins: 7,
      gems: 7,
    });
    expect(
      harness.service.entries("session-1").map((entry) => entry.balance),
    ).toEqual([{ gems: 10 }, { coins: 7, gems: 10 }, { coins: 7, gems: 7 }]);
  } finally {
    harness.cleanup();
  }
});

test("append stores inventory mutations inside append-only ledger metadata", () => {
  const harness = createServiceHarness();
  try {
    const result = harness.service.append({
      sessionId: "session-1",
      amount: 1,
      currency: "item:skin.green",
      reason: "gacha.pull",
      sourceEventId: "event-item-1",
      inventory: {
        item: {
          id: "skin-1",
          sku: "skin.green",
          kind: "skin",
          label: "Green",
          quantity: 1,
        },
        action: "added",
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("append should succeed");
    expect(result.entry.metadata?.inventory).toMatchObject({
      action: "added",
      item: {
        id: "skin-1",
        sku: "skin.green",
        kind: "skin",
        quantity: 1,
      },
    });
    expect(harness.service.balance("session-1")).toEqual({
      "item:skin.green": 1,
    });
  } finally {
    harness.cleanup();
  }
});

test("reduceLedgerBalances derives balances from entries without trusting embedded balance", () => {
  expect(
    reduceLedgerBalances([
      {
        id: "ledger-1",
        ts: now,
        reason: "bonus",
        amount: 5,
        currency: "gems",
        delta: { gems: 5 },
        balance: { gems: 999 },
      },
      {
        id: "ledger-2",
        ts: now + 1,
        reason: "purchase",
        amount: -2,
        currency: "gems",
        delta: { gems: -2 },
        balance: { gems: 997 },
      },
      {
        id: "legacy-coins",
        ts: now + 2,
        reason: "legacy",
        delta: { coins: 4 },
        balance: { coins: 99 },
      },
    ]),
  ).toEqual({ coins: 4, gems: 3 });
});

test("balance reduction includes more than one thousand ledger entries", () => {
  const harness = createLongLedgerHarness();
  try {
    for (let i = 0; i < 1_001; i++) {
      harness.service.append({
        sessionId: "session-1",
        amount: 1,
        currency: "coins",
        reason: "event",
        sourceEventId: `event-${i}`,
      });
    }

    expect(harness.service.balance("session-1")).toEqual({ coins: 1_001 });
  } finally {
    harness.cleanup();
  }
});

test("negative balances are rejected and write audit without appending ledger row", () => {
  const harness = createServiceHarness();
  try {
    const rejected = harness.service.append({
      sessionId: "session-1",
      amount: -1,
      currency: "gems",
      reason: "shop.purchase",
      sourceEventId: "event-1",
    });

    expect(rejected.ok).toBe(false);
    if (rejected.ok) throw new Error("append should be rejected");
    expect(rejected.reason).toBe("negative_balance");
    expect(rejected.audit.action).toBe("economy.ledger.rejected");
    expect(harness.service.entries("session-1")).toEqual([]);

    const rows = harness.db
      .query<
        { action: string; summary: string; session_id: string | null },
        []
      >(
        "SELECT action, summary, session_id FROM audit_records ORDER BY created_at",
      )
      .all();
    expect(rows).toEqual([
      {
        action: "economy.ledger.rejected",
        summary:
          "reject ledger entry event-1: gems balance would become negative",
        session_id: "session-1",
      },
    ]);
  } finally {
    harness.cleanup();
  }
});
