export type CurrencyBalances = Record<string, number>;

export interface EconomyLedgerEntry {
  id: string;
  ts: number;
  reason: string;
  delta: CurrencyBalances;
  balance: CurrencyBalances;
  source?: string;
  actorId?: string;
  metadata?: Record<string, unknown>;
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
