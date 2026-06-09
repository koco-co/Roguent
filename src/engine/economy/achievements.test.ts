import { expect, test } from "bun:test";
import type { RoomEvent } from "../../shared/events";
import { createTestDatabase } from "../persistence/db";
import { migrate } from "../persistence/migrations";
import { createRepositories } from "../persistence/repositories";
import { createAchievementsService } from "./achievements";
import { createEconomyLedgerService } from "./ledger";

const now = Date.parse("2026-01-02T08:00:00.000Z");

function createHarness() {
  const testDb = createTestDatabase();
  migrate(testDb.db);
  createRepositories(testDb.db).sessions.upsert({
    id: "session-1",
    runtime: "codex",
    title: "Codex session",
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
  let nextLedgerId = 1;
  const ledger = createEconomyLedgerService(testDb.db, {
    now: () => now,
    createId: () => `ledger-${nextLedgerId++}`,
  });
  const achievements = createAchievementsService(ledger, { now: () => now });
  return { ...testDb, achievements, ledger };
}

function sessionCreated(runtime: "claude" | "codex"): RoomEvent {
  return {
    seq: 1,
    ts: now,
    sessionId: "session-1",
    type: "session.created",
    payload: {
      title: "Session",
      model: runtime === "codex" ? "gpt-5" : "claude-opus-4-8",
      permissionMode: "default",
      runtime,
      apiKeySource: "none",
      slashCommands: [],
    },
  };
}

test("creating first Codex session unlocks first-codex-session", () => {
  const harness = createHarness();
  try {
    const updates = harness.achievements.applyEvent(sessionCreated("codex"));

    expect(updates).toHaveLength(1);
    expect(updates[0]?.achievement).toMatchObject({
      id: "first-codex-session",
      progress: 1,
      target: 1,
      completed: true,
      claimed: false,
      reward: { gem: 20 },
    });
  } finally {
    harness.cleanup();
  }
});

test("non-Codex session does not advance Codex achievement", () => {
  const harness = createHarness();
  try {
    expect(harness.achievements.applyEvent(sessionCreated("claude"))).toEqual(
      [],
    );
    expect(harness.achievements.list()).toEqual([]);
  } finally {
    harness.cleanup();
  }
});

test("claim appends reward ledger entry once and marks achievement claimed", () => {
  const harness = createHarness();
  try {
    harness.achievements.applyEvent(sessionCreated("codex"));

    const claimed = harness.achievements.claim("first-codex-session", {
      sessionId: "session-1",
      sourceEventId: "claim-1",
    });
    const duplicate = harness.achievements.claim("first-codex-session", {
      sessionId: "session-1",
      sourceEventId: "claim-duplicate",
    });

    expect(claimed.ok).toBe(true);
    if (!claimed.ok) throw new Error("claim should succeed");
    expect(claimed.achievement).toMatchObject({
      id: "first-codex-session",
      claimed: true,
    });
    expect(claimed.ledgerEntry).toMatchObject({
      id: "ledger-1",
      amount: 20,
      currency: "gem",
      reason: "achievement.claimed",
      sourceEventId: "claim-1",
      metadata: { achievementId: "first-codex-session" },
    });
    expect(duplicate).toMatchObject({
      ok: false,
      reason: "already_claimed",
    });
    expect(harness.ledger.entries("session-1")).toHaveLength(1);
    expect(harness.ledger.balance("session-1")).toEqual({ gem: 20 });
  } finally {
    harness.cleanup();
  }
});

test("claim rejects incomplete achievements without appending reward", () => {
  const harness = createHarness();
  try {
    const result = harness.achievements.claim("first-codex-session", {
      sessionId: "session-1",
      sourceEventId: "claim-1",
    });

    expect(result).toEqual({ ok: false, reason: "not_completed" });
    expect(harness.ledger.entries("session-1")).toEqual([]);
  } finally {
    harness.cleanup();
  }
});
