/**
 * Integration tests for GachaService against a real in-memory ledger.
 *
 * These tests use createTestDatabase / migrate (same helpers as ledger.test.ts)
 * so they exercise the full ledger persistence path — not mocks.
 */

import { expect, test } from "bun:test";
import { reduceInventoryFromLedger } from "../../shared/economy";
import { createTestDatabase } from "../persistence/db";
import { migrate } from "../persistence/migrations";
import { GACHA_PULL_COST } from "./gacha";
import { createGachaService } from "./gacha-service";
import { createEconomyLedgerService } from "./ledger";

const FIXED_NOW = Date.parse("2026-01-02T08:00:00.000Z");

function createHarness(overrides: { initialBalance?: number } = {}) {
  const testDb = createTestDatabase();
  migrate(testDb.db);

  let nextId = 1;
  const ledger = createEconomyLedgerService(testDb.db, {
    now: () => FIXED_NOW,
    createId: () => `entry-${nextId++}`,
  });

  // Seed an initial gem balance for pull tests.
  const initialBalance = overrides.initialBalance ?? GACHA_PULL_COST * 5;
  if (initialBalance > 0) {
    ledger.append({
      sessionId: null,
      amount: initialBalance,
      currency: "gem",
      reason: "test.setup.credit",
      sourceEventId: "setup:initial-balance",
    });
  }

  const service = createGachaService(ledger, {
    now: () => FIXED_NOW,
  });

  return { testDb, ledger, service };
}

// ── (a) successful pull mutates ledger + gem balance drops by cost ─────────────

test("GachaService: successful pull decreases gem balance by cost", () => {
  const { testDb, ledger, service } = createHarness();
  try {
    const balanceBefore = ledger.balance(null).gem ?? 0;
    const result = service.pull("gacha.hero", "test-seed-success");

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("pull should succeed");

    const balanceAfter = ledger.balance(null).gem ?? 0;
    expect(balanceBefore - balanceAfter).toBeGreaterThanOrEqual(
      GACHA_PULL_COST,
    );
    // Ledger must have at least the debit entry.
    expect(result.ledgerEntries.length).toBeGreaterThanOrEqual(1);
    expect(result.ledgerEntries[0]?.amount).toBe(-GACHA_PULL_COST);
  } finally {
    testDb.cleanup();
  }
});

test("GachaService: successful pull embeds item in ledger (inventory derived from ledger)", () => {
  const { testDb, ledger, service } = createHarness();
  try {
    const result = service.pull("gacha.hero", "test-seed-inventory");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("pull should succeed");

    // Inventory is derived from ledger entries — NOT from the returned inventoryUpdate.
    const allEntries = ledger.entries(null);
    const inventory = reduceInventoryFromLedger(allEntries);

    // The pulled item must appear in the ledger-derived inventory.
    expect(Object.keys(inventory).length).toBeGreaterThan(0);

    // The embedded item should carry the acquiredAt timestamp threaded from GachaService.
    const [wonEntry] = result.ledgerEntries;
    const itemInInventory = wonEntry ? inventory[wonEntry.id] : undefined;
    // At least one item should have acquiredAt set.
    const hasAcquiredAt = Object.values(inventory).some(
      (item) => item.acquiredAt !== undefined,
    );
    expect(hasAcquiredAt).toBe(true);
    // Silence unused variable warning for itemInInventory (it's accessed above via inventory).
    void itemInInventory;
  } finally {
    testDb.cleanup();
  }
});

// ── (b) insufficient balance returns typed failure, ledger NOT mutated ─────────

test("GachaService: insufficient balance returns typed failure", () => {
  // Start with zero balance (skip initial credit).
  const { testDb, ledger, service } = createHarness({ initialBalance: 0 });
  try {
    const entriesBefore = ledger.entries(null).length;
    const result = service.pull("gacha.hero", "test-seed-broke");

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("pull should fail");
    expect(result.reason).toBe("insufficient_balance");

    // Ledger must NOT have gained any new entries.
    const entriesAfter = ledger.entries(null).length;
    expect(entriesAfter).toBe(entriesBefore);
  } finally {
    testDb.cleanup();
  }
});

test("GachaService: insufficient balance does not mutate gem balance", () => {
  const { testDb, ledger, service } = createHarness({
    initialBalance: GACHA_PULL_COST - 1,
  });
  try {
    const balanceBefore = ledger.balance(null).gem ?? 0;
    service.pull("gacha.hero", "test-seed-near-broke");
    const balanceAfter = ledger.balance(null).gem ?? 0;
    expect(balanceAfter).toBe(balanceBefore);
  } finally {
    testDb.cleanup();
  }
});

// ── (c) unknown SKU returns typed failure ──────────────────────────────────────

test("GachaService: unknown SKU returns typed failure without mutating ledger", () => {
  const { testDb, ledger, service } = createHarness();
  try {
    const entriesBefore = ledger.entries(null).length;
    const result = service.pull("nonexistent.sku", "test-seed-unknown");

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("pull should fail");
    expect(result.reason).toBe("unknown_sku");

    // Ledger must NOT have gained any new entries.
    expect(ledger.entries(null).length).toBe(entriesBefore);
  } finally {
    testDb.cleanup();
  }
});

// ── (d) duplicate pull produces debit + refund credit entries ─────────────────

test("GachaService: duplicate pull produces both a debit and a refund credit entry", () => {
  const { testDb, ledger, service } = createHarness({
    initialBalance: GACHA_PULL_COST * 10,
  });
  try {
    // First pull with this seed — establishes the item in inventory.
    const first = service.pull("gacha.hero", "dup-seed-svc");
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("first pull should succeed");

    // Second pull with the same seed — same item is drawn → duplicate path.
    const second = service.pull("gacha.hero", "dup-seed-svc");
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error("second pull should succeed");

    // Duplicate pull must produce 2 ledger entries: debit + refund credit.
    expect(second.ledgerEntries).toHaveLength(2);
    const [debit, credit] = second.ledgerEntries;
    expect(debit?.amount).toBe(-GACHA_PULL_COST);
    expect(debit?.currency).toBe("gem");
    // Credit must be positive (refund).
    if (credit === undefined) throw new Error("expected refund credit entry");
    expect(credit.amount).toBeGreaterThan(0);
    expect(credit.currency).toBe("gem");

    // Both entries must be persisted in the ledger.
    const allEntries = ledger.entries(null);
    expect(allEntries.some((e) => e.id === debit?.id)).toBe(true);
    expect(allEntries.some((e) => e.id === credit.id)).toBe(true);
  } finally {
    testDb.cleanup();
  }
});

// ── inventory item carries acquiredAt from GachaService.now ───────────────────

test("GachaService: ledger-embedded item has acquiredAt set to service now()", () => {
  const { testDb, ledger, service } = createHarness();
  try {
    const result = service.pull("gacha.hero", "test-seed-acquiredat");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("pull should succeed");

    const allEntries = ledger.entries(null);
    const inventory = reduceInventoryFromLedger(allEntries);
    const items = Object.values(inventory);
    expect(items.length).toBeGreaterThan(0);
    // Every item added by this service call should have acquiredAt = FIXED_NOW.
    for (const item of items) {
      expect(item.acquiredAt).toBe(FIXED_NOW);
    }
  } finally {
    testDb.cleanup();
  }
});

// ── metadata does NOT double-embed inventory (issue #6 regression guard) ──────

test("GachaService: ledger entry metadata contains inventory exactly once", () => {
  const { testDb, ledger, service } = createHarness();
  try {
    const result = service.pull("gacha.hero", "test-seed-metadata");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("pull should succeed");

    // Read the raw stored entry to verify metadata JSON isn't double-embedded.
    const allEntries = ledger.entries(null);
    const debitEntry = allEntries.find((e) => e.reason === "gacha.pull");
    expect(debitEntry).toBeDefined();
    if (!debitEntry) throw new Error("debit entry not found");

    // metadata should have an inventory key (from mergeLedgerMetadata).
    expect(debitEntry.metadata).toBeDefined();
    expect(typeof debitEntry.metadata?.inventory).toBe("object");
    // There should NOT be a nested metadata.metadata — just a flat inventory key.
    expect(debitEntry.metadata?.metadata).toBeUndefined();
  } finally {
    testDb.cleanup();
  }
});
