/**
 * Gacha engine — pure deterministic functions over a seeded PRNG.
 *
 * Design rules:
 * - No side effects: `pullGacha` is a pure function; callers decide whether to
 *   commit the returned ledger entries.
 * - Seeded PRNG: uses a small hashing-based RNG so results are reproducible in
 *   tests. Math.random() is never called.
 * - Insufficient balance: returns a typed { ok: false } value — never throws.
 * - Duplicate items: refunds DUPLICATE_REFUND_FRACTION of pull cost back as gems.
 */

import type {
  InventoryItem,
  InventoryLedgerMutation,
} from "../../shared/economy";

// ── constants ─────────────────────────────────────────────────────────────────

/** Cost in gems to do one pull. */
export const GACHA_PULL_COST = 100;

/** Fraction of pull cost refunded on duplicate (0.25 = 25 gems back). */
export const DUPLICATE_REFUND_FRACTION = 0.25;

// ── pool definition ───────────────────────────────────────────────────────────

export type GachaRarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

export interface GachaPoolItem {
  id: string;
  sku: string;
  kind: InventoryItem["kind"];
  label: string;
  rarity: GachaRarity;
  /** Relative weight in the weighted draw; higher = more likely. */
  weight: number;
}

export const GACHA_POOL: GachaPoolItem[] = [
  {
    id: "skin.ninja",
    sku: "skin.ninja",
    kind: "skin",
    label: "忍者皮肤",
    rarity: "rare",
    weight: 10,
  },
  {
    id: "skin.cyber",
    sku: "skin.cyber",
    kind: "skin",
    label: "赛博皮肤",
    rarity: "uncommon",
    weight: 20,
  },
  {
    id: "skin.forest",
    sku: "skin.forest",
    kind: "skin",
    label: "森林皮肤",
    rarity: "common",
    weight: 30,
  },
  {
    id: "pet.black-cat",
    sku: "pet.black-cat",
    kind: "pet",
    label: "黑猫伙伴",
    rarity: "uncommon",
    weight: 20,
  },
  {
    id: "pet.slime",
    sku: "pet.slime",
    kind: "pet",
    label: "史莱姆伙伴",
    rarity: "common",
    weight: 30,
  },
  {
    id: "badge.gold-frame",
    sku: "badge.gold-frame",
    kind: "badge",
    label: "黄金边框",
    rarity: "epic",
    weight: 5,
  },
  {
    id: "room.neon-tiles",
    sku: "room.neon-tiles",
    kind: "room",
    label: "霓虹地砖",
    rarity: "uncommon",
    weight: 20,
  },
  {
    id: "skin.legend",
    sku: "skin.legend",
    kind: "skin",
    label: "传说皮肤",
    rarity: "legendary",
    weight: 2,
  },
];

// ── PRNG (seeded, hashing-based) ──────────────────────────────────────────────

/**
 * Simple seeded PRNG using xmur3 seed → mulberry32 generator.
 * Returns a function that produces floats in [0, 1) deterministically.
 */
function createPrng(seed: string): () => number {
  // xmur3: hash a string into a 32-bit integer seed
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // mulberry32 generator
  let state = h >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let z = state;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

// ── weighted pick ─────────────────────────────────────────────────────────────

function weightedPick(pool: GachaPoolItem[], rand: number): GachaPoolItem {
  const total = pool.reduce((sum, item) => sum + item.weight, 0);
  let cursor = 0;
  for (const item of pool) {
    cursor += item.weight / total;
    if (rand < cursor) return item;
  }
  // Fallback: last item (handles floating-point edge at rand = 1.0)
  return pool[pool.length - 1] as GachaPoolItem;
}

// ── ledger entry shape (lightweight — callers decide on IDs/timestamps) ───────

export interface GachaLedgerEntryInput {
  amount: number;
  currency: string;
  reason: string;
  inventory?: InventoryLedgerMutation;
}

// ── result types ──────────────────────────────────────────────────────────────

export type GachaPullSuccess = {
  ok: true;
  itemId: string;
  sku: string;
  rarity: GachaRarity;
  label: string;
  kind: InventoryItem["kind"];
  duplicate: boolean;
  costDeducted: number;
  refund: number;
  /** Ledger entry inputs in application order: [0] = cost debit, [1?] = refund credit. */
  ledgerEntries: GachaLedgerEntryInput[];
};

export type GachaPullFailure = {
  ok: false;
  reason: "insufficient_balance";
  required: number;
  actual: number;
};

export type GachaPullResult = GachaPullSuccess | GachaPullFailure;

// ── input ─────────────────────────────────────────────────────────────────────

export interface GachaPullInput {
  seed: string;
  pool: GachaPoolItem[];
  /** Current gem balance of the player. */
  balance: number;
  /** Current inventory (item id → InventoryItem). Used to detect duplicates. */
  inventory: Record<string, InventoryItem>;
  /** Cost override; defaults to GACHA_PULL_COST. */
  cost?: number;
  /**
   * Timestamp (ms since epoch) to embed in the ledger-persisted InventoryItem
   * as `acquiredAt`. The caller (GachaService) supplies this so the ledger-
   * derived inventory carries a sensible acquisition time. Tests may omit it
   * (defaults to undefined, which is acceptable for pure-function tests that
   * don't exercise the ledger path).
   */
  acquiredAt?: number;
}

// ── main function ─────────────────────────────────────────────────────────────

export function pullGacha(input: GachaPullInput): GachaPullResult {
  const cost = input.cost ?? GACHA_PULL_COST;

  if (input.balance < cost) {
    return {
      ok: false,
      reason: "insufficient_balance",
      required: cost,
      actual: input.balance,
    };
  }

  const rand = createPrng(input.seed);
  const picked = weightedPick(input.pool, rand());

  const isDuplicate = picked.id in input.inventory;
  const refund = isDuplicate ? Math.floor(cost * DUPLICATE_REFUND_FRACTION) : 0;

  const inventoryItem: InventoryItem = {
    id: picked.id,
    sku: picked.sku,
    kind: picked.kind,
    label: picked.label,
    quantity: 1,
    // acquiredAt is threaded in from the caller so the ledger-embedded item
    // carries a sensible acquisition time. Pure-function tests may omit it.
    acquiredAt: input.acquiredAt,
  };

  const ledgerEntries: GachaLedgerEntryInput[] = [
    {
      amount: -cost,
      currency: "gem",
      reason: "gacha.pull",
      inventory: {
        item: inventoryItem,
        action: isDuplicate ? "updated" : "added",
      },
    },
  ];

  if (isDuplicate && refund > 0) {
    ledgerEntries.push({
      amount: refund,
      currency: "gem",
      reason: "gacha.duplicate.refund",
    });
  }

  return {
    ok: true,
    itemId: picked.id,
    sku: picked.sku,
    rarity: picked.rarity,
    label: picked.label,
    kind: picked.kind,
    duplicate: isDuplicate,
    costDeducted: cost,
    refund,
    ledgerEntries,
  };
}
