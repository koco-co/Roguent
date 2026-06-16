import { expect, test } from "bun:test";
import type { RoomEvent } from "../../shared/events";
import type { DriverCallbacks, IDriver } from "../driver";
import { createTestDatabase } from "../persistence/db";
import { migrate } from "../persistence/migrations";
import type { RuntimeDriverCreator } from "../runtime/manager";
import { SessionManager } from "../session";
import { WsGateway, type WsGatewayOptions } from "../ws-gateway";
import { WELCOME_BONUS, wireEconomyServices } from "./wiring";

function driverStub(): IDriver {
  return {
    start() {},
    send() {},
    async setModel() {},
    async setPermissionMode() {},
    async interrupt() {},
    end() {},
    getContextUsage: async () => null,
    askPermission: async () => ({ behavior: "allow" as const }),
    respondPermission() {},
  };
}

// Minimal runtime manager so mgr.createSession does not spawn a real SDK driver.
// createSession still synthesizes a real `session.created` RoomEvent (carrying
// runtime) through the mgr.subscribe pipeline — the exact production path that
// reaches WsGateway.publishAchievementUpdatesFor.
const fakeRuntimeManager: RuntimeDriverCreator = {
  createDriver(_cb: DriverCallbacks): IDriver {
    return driverStub();
  },
};

/**
 * Integration-style tests for the LIVE economy wiring. These construct the
 * gateway via the SAME path server.ts uses: real EconomyLedgerService +
 * GachaService + AchievementsService over a real (in-memory tmp) SQLite DB,
 * fed into `new WsGateway(...)` with { gacha, achievements, initialPullSeq }.
 *
 * They protect against the regression that shipped: services implemented +
 * unit-tested but never instantiated outside tests, so purchaseItem replied
 * "Gacha service unavailable", claimAchievement replied "...unavailable",
 * achievement progress never advanced, and the gem balance was permanently 0.
 */

function harness() {
  const testDb = createTestDatabase();
  migrate(testDb.db);
  const economy = wireEconomyServices(testDb.db);
  const mgr = new SessionManager(fakeRuntimeManager, "/repo");
  const published: RoomEvent[] = [];
  mgr.subscribe((e) => published.push(e));

  const sent: string[] = [];
  const ws = { OPEN: 1, readyState: 1, send: (m: string) => sent.push(m) };

  const options: WsGatewayOptions = {
    listen: false,
    gacha: economy.gacha,
    achievements: economy.achievements,
    initialPullSeq: economy.initialPullSeq,
  };
  const gateway = new WsGateway(0, mgr, undefined, options);

  const onCommand = (raw: string) =>
    (
      gateway as unknown as { onCommand(raw: string, ws: unknown): void }
    ).onCommand(raw, ws);

  return { ...testDb, economy, mgr, published, sent, ws, gateway, onCommand };
}

function ledgerEvents(published: RoomEvent[]) {
  return published.filter((e) => e.type === "economy.ledger.appended");
}

test("wireEconomyServices grants a real welcome bonus once (idempotent)", () => {
  const testDb = createTestDatabase();
  migrate(testDb.db);
  try {
    const first = wireEconomyServices(testDb.db);
    expect(first.ledger.balance(null).gem).toBe(WELCOME_BONUS.amount);

    // Re-wiring (simulating an engine restart against a persisted DB) must NOT
    // double-credit — the welcome bonus is granted exactly once.
    const second = wireEconomyServices(testDb.db);
    expect(second.ledger.balance(null).gem).toBe(WELCOME_BONUS.amount);

    const welcomeEntries = first.ledger
      .entries(null)
      .filter((entry) => entry.reason === WELCOME_BONUS.reason);
    expect(welcomeEntries).toHaveLength(1);
  } finally {
    testDb.cleanup();
  }
});

test("purchaseItem mutates the ledger and broadcasts economy.ledger.appended (NOT 'Gacha service unavailable')", async () => {
  const h = harness();
  try {
    const before = h.economy.ledger.balance(null).gem ?? 0;
    h.onCommand(
      JSON.stringify({
        cmd: "economy",
        action: "purchaseItem",
        sku: "gacha.hero",
      }),
    );

    // No "unavailable" / error reply to the client.
    expect(h.sent).toEqual([]);

    // Ledger actually mutated: gems were spent.
    const after = h.economy.ledger.balance(null).gem ?? 0;
    expect(after).toBeLessThan(before);

    // A ledger.appended event for the gacha pull was broadcast.
    const ledger = ledgerEvents(h.published);
    expect(ledger.length).toBeGreaterThanOrEqual(1);
    const pull = ledger.find(
      (e) =>
        (e.payload as { entry: { reason: string } }).entry.reason ===
        "gacha.pull",
    );
    expect(pull).toBeDefined();
    // The pull entry carries the embedded inventory mutation (drives the UI
    // inventory via reduceInventoryFromLedger).
    const entry = (pull?.payload as { entry: { metadata?: unknown } }).entry;
    expect(entry.metadata).toBeDefined();
  } finally {
    h.cleanup();
  }
});

test("claimAchievement credits a real reward to the ledger after the achievement completes", async () => {
  const h = harness();
  try {
    // Advance the achievement via the production path: creating a codex session
    // emits a real `session.created` (runtime: "codex") through mgr.subscribe,
    // which the gateway feeds to publishAchievementUpdatesFor.
    h.mgr.createSession("s-codex", {
      title: "Codex",
      model: "gpt-5",
      runtime: "codex",
    });

    // achievement.updated must have been broadcast as a side effect of the
    // runtime event flowing through publishAchievementUpdatesFor.
    const achEvents = h.published.filter(
      (e) => e.type === "achievement.updated",
    );
    expect(achEvents.length).toBeGreaterThanOrEqual(1);

    const balanceBefore = h.economy.ledger.balance(null).gem ?? 0;
    h.onCommand(
      JSON.stringify({
        cmd: "economy",
        action: "claimAchievement",
        achievementId: "first-codex-session",
      }),
    );

    // No "unavailable" reply.
    expect(h.sent).toEqual([]);

    // The reward credited real gems.
    const balanceAfter = h.economy.ledger.balance(null).gem ?? 0;
    expect(balanceAfter).toBeGreaterThan(balanceBefore);

    const rewardEntry = h.economy.ledger
      .entries(null)
      .find((entry) => entry.reason === "achievement.claimed");
    expect(rewardEntry).toBeDefined();
    expect(rewardEntry?.amount).toBeGreaterThan(0);
  } finally {
    h.cleanup();
  }
});

test("a codex session.created runtime event broadcasts achievement.updated", async () => {
  const h = harness();
  try {
    h.mgr.createSession("s-codex", {
      title: "Codex",
      model: "gpt-5",
      runtime: "codex",
    });
    const achEvents = h.published.filter(
      (e) => e.type === "achievement.updated",
    );
    expect(achEvents).toHaveLength(1);
    const ach = (
      achEvents[0]?.payload as { achievement: { id: string; progress: number } }
    ).achievement;
    expect(ach.id).toBe("first-codex-session");
    expect(ach.progress).toBe(1);
  } finally {
    h.cleanup();
  }
});
