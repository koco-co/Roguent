/**
 * Live economy wiring — instantiates the gem ledger + gacha + achievements
 * services over the production SQLite DB and grants a one-time welcome bonus so
 * a fresh user actually has gems to spend.
 *
 * This is the single path both `server.ts` (LIVE engine) and the integration
 * tests go through, so "works in test" and "works in production" cannot drift
 * apart again. The bug this fixes: the services were implemented + unit-tested
 * but never instantiated outside tests, so purchaseItem/claimAchievement replied
 * "...unavailable" and the gem balance was permanently 0.
 *
 * Gem source: a real `economy.ledger` credit (reason "welcome_bonus",
 * source "system"), mirroring the design fixture. It is the genuine ledger
 * append API — NOT a fabricated balance — and it is idempotent: a fixed
 * sourceEventId lets us skip the grant if it already exists, so restarting the
 * engine against a persisted DB never double-credits. Achievement rewards
 * (claim → ledger credit) are the second real gem source and flow through the
 * same ledger.
 */

import type { Database } from "bun:sqlite";
import { createAchievementsService } from "./achievements";
import { createGachaService } from "./gacha-service";
import {
  type EconomyLedgerService,
  createEconomyLedgerService,
} from "./ledger";

/** The one-time welcome bonus granted to a fresh ledger. */
export const WELCOME_BONUS = {
  amount: 500,
  currency: "gem",
  reason: "welcome_bonus",
  /**
   * Fixed source event id so the grant is idempotent across engine restarts:
   * if a ledger entry with this id already exists we skip re-crediting.
   */
  sourceEventId: "economy:welcome-bonus:v1",
} as const;

export interface WiredEconomyServices {
  ledger: EconomyLedgerService;
  gacha: ReturnType<typeof createGachaService>;
  achievements: ReturnType<typeof createAchievementsService>;
  /**
   * Persistent monotonic pull-seed seed for WsGatewayOptions.initialPullSeq.
   * Using the null-session ledger entry count keeps gacha seeds unique across
   * gateway restarts without Math.random()/Date.now().
   */
  initialPullSeq: () => number;
}

/**
 * Grant the welcome bonus exactly once. Returns true if it credited gems this
 * call, false if a prior grant already exists (idempotent no-op on restart).
 */
export function grantWelcomeBonusIfNeeded(
  ledger: EconomyLedgerService,
): boolean {
  const alreadyGranted = ledger
    .entries(null)
    .some((entry) => entry.sourceEventId === WELCOME_BONUS.sourceEventId);
  if (alreadyGranted) return false;

  const result = ledger.append({
    sessionId: null,
    actorId: "system",
    amount: WELCOME_BONUS.amount,
    currency: WELCOME_BONUS.currency,
    reason: WELCOME_BONUS.reason,
    sourceEventId: WELCOME_BONUS.sourceEventId,
    metadata: { source: "system" },
  });
  return result.ok;
}

export function wireEconomyServices(db: Database): WiredEconomyServices {
  const ledger = createEconomyLedgerService(db);
  grantWelcomeBonusIfNeeded(ledger);
  const gacha = createGachaService(ledger);
  const achievements = createAchievementsService(ledger);
  return {
    ledger,
    gacha,
    achievements,
    initialPullSeq: () => ledger.entries(null).length,
  };
}
