/**
 * GachaService — wraps `pullGacha` (pure fn) with ledger persistence.
 *
 * Implements `GatewayGachaService` so `WsGateway.handlePurchaseItem` can call
 * it the same way it calls `GatewayAchievementsService.claim` — one call returns
 * the committed ledger entries + the inventory update, or a typed failure.
 *
 * Seed policy: the gateway passes a deterministic seed derived from a monotonic
 * pull counter; this service does NOT call Math.random() or Date.now() for
 * game-logic decisions.
 */

import { reduceInventoryFromLedger } from "../../shared/economy";
import type {
  EconomyLedgerAppendedPayload,
  InventoryItem,
  InventoryUpdatedPayload,
} from "../../shared/events";
import type { GatewayGachaService } from "../ws-gateway";
import {
  GACHA_POOL,
  GACHA_PULL_COST,
  type GachaPoolItem,
  pullGacha,
} from "./gacha";
import type { EconomyLedgerService } from "./ledger";

export interface GachaServiceOptions {
  /** Pool of items available for gacha. Defaults to GACHA_POOL. */
  pool?: GachaPoolItem[];
  /** Pull cost override. Defaults to GACHA_PULL_COST. */
  cost?: number;
  now?: () => number;
}

export class GachaService implements GatewayGachaService {
  private readonly pool: GachaPoolItem[];
  private readonly cost: number;

  constructor(
    private readonly ledger: EconomyLedgerService,
    private readonly options: GachaServiceOptions = {},
  ) {
    this.pool = options.pool ?? GACHA_POOL;
    this.cost = options.cost ?? GACHA_PULL_COST;
  }

  pull(
    sku: string,
    seed: string,
  ):
    | {
        ok: true;
        ledgerEntries: EconomyLedgerAppendedPayload["entry"][];
        inventoryUpdate: InventoryUpdatedPayload;
      }
    | { ok: false; reason: "insufficient_balance" | "unknown_sku" | string } {
    // Resolve the requested sku against the pool.
    // For the canonical gacha SKU ("gacha.hero"), treat it as a pool pull
    // (pick any item). For item-specific SKUs that match a pool item, pull
    // that specific item. Unknown SKUs are rejected.
    const isCatalogSku = sku === "gacha.hero" || sku === "gacha.pool";
    const poolItem = isCatalogSku
      ? undefined
      : this.pool.find((p) => p.sku === sku);

    if (!isCatalogSku && poolItem === undefined) {
      return { ok: false, reason: "unknown_sku" };
    }

    // Build current inventory from ledger (append-only source of truth).
    const allEntries = this.ledger.entries(null);
    const currentInventory = reduceInventoryFromLedger(allEntries);

    // Use global (null-session) gem balance.
    const balances = this.ledger.balance(null);
    const balance = balances.gem ?? 0;

    // Use the relevant pool (full pool for catalog pulls, single-item pool otherwise).
    const activePool = poolItem ? [poolItem] : this.pool;

    const now = this.options.now?.() ?? Date.now();
    const result = pullGacha({
      seed,
      pool: activePool,
      balance,
      inventory: currentInventory,
      cost: this.cost,
      // Thread the acquisition timestamp into pullGacha so the ledger-embedded
      // InventoryItem.acquiredAt is set. The store derives inventory from ledger
      // entries, so this is the only path that makes acquiredAt visible in the UI.
      acquiredAt: now,
    });

    if (!result.ok) {
      return { ok: false, reason: result.reason };
    }

    // Commit ledger entries one by one.
    //
    // Atomicity invariant: the first entry is always a debit (gems spent), and
    // any subsequent entry is a refund credit (amount > 0). A credit can never
    // make the balance go negative, so the ledger will never reject it.
    // Therefore partial commitment (debit committed, credit rejected) is a dead
    // path — the ledger only rejects entries that would produce a negative
    // balance. This assertion documents the invariant so that a future change to
    // the ledger's rejection logic cannot silently introduce a double-spend.
    const committedEntries: EconomyLedgerAppendedPayload["entry"][] = [];
    for (const input of result.ledgerEntries) {
      const appended = this.ledger.append({
        sessionId: null,
        amount: input.amount,
        currency: input.currency,
        reason: input.reason,
        sourceEventId: `${seed}:${input.reason}`,
        // Note: do NOT pass metadata here — ledger.normalizeInput calls
        // mergeLedgerMetadata which already embeds the inventory field into the
        // stored metadata JSON. Passing a duplicate { inventory } in metadata
        // would double-embed it.
        inventory: input.inventory,
      });
      if (!appended.ok) {
        // This branch should be unreachable for credit entries (amount > 0)
        // because credits never make the balance go negative. If we get here it
        // means a debit entry was rejected after a prior debit was committed,
        // which is only possible if the ledger's rejection criteria changed.
        if (input.amount > 0) {
          throw new Error(
            `Invariant violation: gacha refund credit was rejected by ledger (reason=${appended.reason}). A credit with amount > 0 cannot make the balance negative.`,
          );
        }
        // Debit rejected (insufficient balance after all — race or concurrent mutation).
        return { ok: false, reason: "insufficient_balance" };
      }
      committedEntries.push(appended.entry);
    }

    // Materialize the won item from the committed debit entry's inventory mutation.
    const wonItem: InventoryItem = {
      id: result.itemId,
      sku: result.sku,
      kind: result.kind,
      label: result.label,
      quantity: 1,
      acquiredAt: now,
    };

    const inventoryUpdate: InventoryUpdatedPayload = {
      item: wonItem,
      action: result.duplicate ? "updated" : "added",
    };

    return { ok: true, ledgerEntries: committedEntries, inventoryUpdate };
  }
}

export function createGachaService(
  ledger: EconomyLedgerService,
  options?: GachaServiceOptions,
): GachaService {
  return new GachaService(ledger, options);
}
