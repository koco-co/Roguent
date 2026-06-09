export type CurrencyBalances = Record<string, number>;

export interface EconomyLedgerReducibleEntry {
  amount?: number;
  currency?: string;
  delta?: CurrencyBalances;
  [key: string]: unknown;
}

export interface EconomyLedgerEntry {
  id: string;
  ts: number;
  reason: string;
  amount: number;
  currency: string;
  delta: CurrencyBalances;
  balance: CurrencyBalances;
  source?: string;
  sourceEventId: string;
  actorId?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
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
  return entry.delta ?? {};
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

export type InventoryLedgerAction =
  | "added"
  | "updated"
  | "removed"
  | "equipped"
  | "unequipped";

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

export interface InventoryLedgerMutation {
  item: InventoryItem;
  action?: InventoryLedgerAction;
}

export interface InventoryUpdatedPayload {
  item: InventoryItem;
  action?: InventoryLedgerAction;
}

export function reduceInventoryFromLedger(
  entries: Iterable<EconomyLedgerEntry>,
): Record<string, InventoryItem> {
  const inventory: Record<string, InventoryItem> = {};
  for (const entry of entries) {
    const mutation = ledgerInventoryMutation(entry);
    if (!mutation) continue;
    if (mutation.action === "removed") {
      delete inventory[mutation.item.id];
      continue;
    }
    inventory[mutation.item.id] = mutation.item;
  }
  return inventory;
}

function ledgerInventoryMutation(
  entry: EconomyLedgerEntry,
): InventoryLedgerMutation | null {
  const value = entry.metadata?.inventory;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const item = raw.item;
  if (!isInventoryItem(item)) return null;
  const action = raw.action;
  if (
    action !== undefined &&
    action !== "added" &&
    action !== "updated" &&
    action !== "removed" &&
    action !== "equipped" &&
    action !== "unequipped"
  ) {
    return null;
  }
  return { item, action };
}

function isInventoryItem(value: unknown): value is InventoryItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.sku === "string" &&
    typeof item.kind === "string" &&
    typeof item.label === "string" &&
    typeof item.quantity === "number" &&
    Number.isFinite(item.quantity)
  );
}
