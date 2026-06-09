import type { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import {
  type CurrencyBalances,
  type EconomyLedgerEntry,
  type EconomyLedgerReducibleEntry,
  type InventoryLedgerMutation,
  reduceEconomyLedgerBalances,
} from "../../shared/economy";
import { type AuditRecordInput, appendAuditRecord } from "../audit/log";
import { withTransaction } from "../persistence/db";
import {
  type StoredAuditRecord,
  type StoredLedgerEntry,
  createRepositories,
} from "../persistence/repositories";

export interface EconomyLedgerAppendInput {
  sessionId?: string | null;
  actorId?: string | null;
  amount: number;
  currency: string;
  reason: string;
  sourceEventId: string;
  metadata?: Record<string, unknown>;
  inventory?: InventoryLedgerMutation;
}

export interface EconomyLedgerServiceOptions {
  now?: () => number;
  createId?: () => string;
  audit?: (input: AuditRecordInput) => StoredAuditRecord;
}

export type EconomyLedgerAppendResult =
  | { ok: true; entry: EconomyLedgerEntry }
  | {
      ok: false;
      reason: "negative_balance";
      audit: StoredAuditRecord;
      balance: CurrencyBalances;
    };

export function reduceLedgerBalances<T extends EconomyLedgerReducibleEntry>(
  entries: Iterable<T>,
): CurrencyBalances {
  return reduceEconomyLedgerBalances(entries);
}

export class EconomyLedgerService {
  private readonly repositories: ReturnType<typeof createRepositories>;

  constructor(
    private readonly db: Database,
    private readonly options: EconomyLedgerServiceOptions = {},
  ) {
    this.repositories = createRepositories(db);
  }

  append(input: EconomyLedgerAppendInput): EconomyLedgerAppendResult {
    const normalized = this.normalizeInput(input);
    const currentBalance = this.balance(normalized.sessionId);
    const attemptedBalance =
      (currentBalance[normalized.currency] ?? 0) + normalized.amount;

    if (attemptedBalance < 0) {
      const audit = this.audit({
        source: "economy",
        action: "economy.ledger.rejected",
        sessionId: normalized.sessionId,
        deliveryId: normalized.sourceEventId,
        payload: {
          amount: normalized.amount,
          currency: normalized.currency,
          reason: normalized.reason,
          sourceEventId: normalized.sourceEventId,
          balanceBefore: currentBalance,
          attemptedBalance,
        },
        summary: `reject ledger entry ${normalized.sourceEventId}: ${normalized.currency} balance would become negative`,
        createdAt: this.now(),
      });
      return {
        ok: false,
        reason: "negative_balance",
        audit,
        balance: currentBalance,
      };
    }

    const stored: StoredLedgerEntry = {
      id: this.createId(),
      sessionId: normalized.sessionId,
      agentId: normalized.actorId,
      kind: normalized.amount < 0 ? "debit" : "credit",
      amount: normalized.amount,
      currency: normalized.currency,
      reason: normalized.reason,
      relatedEventId: normalized.sourceEventId,
      metadataJson: normalized.metadata
        ? JSON.stringify(normalized.metadata)
        : null,
      createdAt: this.now(),
    };

    return withTransaction(this.db, () => {
      this.repositories.ledgerEntries.append(stored);
      const entry = this.requireEntry(stored.id, normalized.sessionId);
      return { ok: true, entry };
    });
  }

  entries(sessionId?: string | null): EconomyLedgerEntry[] {
    const rows =
      sessionId === undefined
        ? this.repositories.ledgerEntries.list()
        : this.repositories.ledgerEntries.listBySession(sessionId);
    return materializeLedgerEntries(rows);
  }

  balance(sessionId?: string | null): CurrencyBalances {
    return reduceLedgerBalances(this.entries(sessionId));
  }

  private requireEntry(
    entryId: string,
    sessionId: string | null,
  ): EconomyLedgerEntry {
    const entry = this.entries(sessionId).find((candidate) => {
      return candidate.id === entryId;
    });
    if (!entry) throw new Error(`Economy ledger entry ${entryId} not found`);
    return entry;
  }

  private normalizeInput(input: EconomyLedgerAppendInput): Required<
    Pick<
      EconomyLedgerAppendInput,
      "amount" | "currency" | "reason" | "sourceEventId"
    >
  > &
    Pick<EconomyLedgerAppendInput, "metadata" | "inventory"> & {
      sessionId: string | null;
      actorId: string | null;
    } {
    if (!Number.isSafeInteger(input.amount)) {
      throw new Error("Economy ledger amount must be a safe integer");
    }
    const currency = input.currency.trim();
    if (!currency) throw new Error("Economy ledger currency is required");
    const reason = input.reason.trim();
    if (!reason) throw new Error("Economy ledger reason is required");
    const sourceEventId = input.sourceEventId.trim();
    if (!sourceEventId) {
      throw new Error("Economy ledger source event id is required");
    }
    return {
      amount: input.amount,
      currency,
      reason,
      sourceEventId,
      sessionId: input.sessionId ?? null,
      actorId: input.actorId ?? null,
      metadata: mergeLedgerMetadata(input.metadata, input.inventory),
      inventory: input.inventory,
    };
  }

  private audit(input: AuditRecordInput): StoredAuditRecord {
    return this.options.audit?.(input) ?? appendAuditRecord(this.db, input);
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  private createId(): string {
    return this.options.createId?.() ?? randomUUID();
  }
}

function mergeLedgerMetadata(
  metadata: Record<string, unknown> | undefined,
  inventory: InventoryLedgerMutation | undefined,
): Record<string, unknown> | undefined {
  if (!inventory) return metadata;
  return { ...(metadata ?? {}), inventory };
}

export function createEconomyLedgerService(
  db: Database,
  options?: EconomyLedgerServiceOptions,
): EconomyLedgerService {
  return new EconomyLedgerService(db, options);
}

function materializeLedgerEntries(
  rows: StoredLedgerEntry[],
): EconomyLedgerEntry[] {
  const balances: CurrencyBalances = {};
  return rows.map((row) => {
    balances[row.currency] = (balances[row.currency] ?? 0) + row.amount;
    if (Object.is(balances[row.currency], -0)) balances[row.currency] = 0;
    const sourceEventId = row.relatedEventId ?? row.id;
    const entry: EconomyLedgerEntry = {
      id: row.id,
      ts: row.createdAt,
      reason: row.reason,
      amount: row.amount,
      currency: row.currency,
      delta: { [row.currency]: row.amount },
      balance: { ...balances },
      source: row.relatedEventId ?? undefined,
      sourceEventId,
      actorId: row.agentId ?? undefined,
      metadata: parseMetadata(row.metadataJson),
    };
    return entry;
  });
}

function parseMetadata(
  metadataJson: string | null,
): Record<string, unknown> | undefined {
  if (metadataJson === null) return undefined;
  try {
    const parsed = JSON.parse(metadataJson);
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
    ) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return undefined;
  }
  return undefined;
}
