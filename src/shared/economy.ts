export type CurrencyBalances = Record<string, number>;

export interface EconomyLedgerReducibleEntry {
  amount?: number;
  currency?: string;
  delta: CurrencyBalances;
  [key: string]: unknown;
}

export interface EconomyLedgerEntry extends EconomyLedgerReducibleEntry {
  id: string;
  ts: number;
  reason: string;
  amount?: number;
  currency?: string;
  delta: CurrencyBalances;
  balance: CurrencyBalances;
  source?: string;
  sourceEventId?: string;
  actorId?: string;
  metadata?: Record<string, unknown>;
}

export function ledgerEntryDelta<T extends EconomyLedgerReducibleEntry>(
  entry: T,
): CurrencyBalances {
  if (
    typeof entry.currency === "string" &&
    entry.currency.length > 0 &&
    typeof entry.amount === "number" &&
    Number.isFinite(entry.amount)
  ) {
    return { [entry.currency]: entry.amount };
  }
  return entry.delta;
}

export function reduceEconomyLedgerBalances<
  T extends EconomyLedgerReducibleEntry,
>(entries: Iterable<T>): CurrencyBalances {
  const balances: CurrencyBalances = {};
  for (const entry of entries) {
    for (const [currency, amount] of Object.entries(ledgerEntryDelta(entry))) {
      if (!Number.isFinite(amount)) continue;
      balances[currency] = (balances[currency] ?? 0) + amount;
      if (Object.is(balances[currency], -0)) balances[currency] = 0;
    }
  }
  return balances;
}

export interface EconomyLedgerAppendedPayload {
  entry: EconomyLedgerEntry;
}

export interface AchievementProgress {
  id: string;
  title: string;
  progress: number;
  target: number;
  completed: boolean;
  claimed?: boolean;
  updatedAt: number;
  description?: string;
  reward?: CurrencyBalances;
  metadata?: Record<string, unknown>;
}

export interface AchievementUpdatedPayload {
  achievement: AchievementProgress;
}

export type InventoryItemKind =
  | "skin"
  | "pet"
  | "room"
  | "badge"
  | "consumable"
  | "other";

export interface InventoryItem {
  id: string;
  sku: string;
  kind: InventoryItemKind;
  label: string;
  quantity: number;
  acquiredAt?: number;
  equipped?: boolean;
  metadata?: Record<string, unknown>;
}

export interface InventoryUpdatedPayload {
  item: InventoryItem;
  action?: "added" | "updated" | "removed" | "equipped" | "unequipped";
}
