import { expect, test } from "bun:test";
import type {
  EconomyLedgerEntry,
  InventoryItem,
  RoomEvent,
} from "../shared/events";
import { type RoomStateWithPrototype, reduce } from "./store";

const initialState = (): RoomStateWithPrototype => ({
  sessions: {},
  currentSessionId: null,
  projectOrder: [],
  connection: "connecting",
  runtimeStatusBySession: {},
  connectorStatus: {},
  pairings: { qrByChannel: {}, byId: {}, byExternalKey: {} },
  mailbox: { items: {}, order: [] },
  scheduler: { tasks: {}, runs: {} },
  ledger: { entries: [], balances: {} },
  achievements: {},
  inventory: {},
  settings: null,
});

const ev = (entry: EconomyLedgerEntry, seq: number): RoomEvent => ({
  seq,
  ts: entry.ts,
  sessionId: "session-1",
  type: "economy.ledger.appended",
  payload: { entry },
});

function ledgerEntry(
  overrides: Partial<EconomyLedgerEntry>,
): EconomyLedgerEntry {
  const amount = overrides.amount ?? 1;
  const currency = overrides.currency ?? "gems";
  return {
    id: overrides.id ?? "ledger-1",
    ts: overrides.ts ?? 1,
    reason: overrides.reason ?? "test",
    amount,
    currency,
    source: overrides.source ?? overrides.sourceEventId ?? "event-1",
    sourceEventId: overrides.sourceEventId ?? overrides.source ?? "event-1",
    delta: overrides.delta ?? { [currency]: amount },
    balance: overrides.balance ?? { [currency]: amount },
    metadata: overrides.metadata,
  };
}

test("economy ledger balances are reduced from appended entries", () => {
  let state = initialState();
  state = reduce(
    state,
    ev(
      ledgerEntry({
        id: "ledger-1",
        amount: 10,
        currency: "gems",
        delta: { gems: 10 },
        balance: { gems: 999 },
      }),
      1,
    ),
  );
  state = reduce(
    state,
    ev(
      ledgerEntry({
        id: "ledger-2",
        amount: -3,
        currency: "gems",
        delta: { gems: -3 },
        balance: { gems: 996 },
      }),
      2,
    ),
  );
  state = reduce(
    state,
    ev(
      ledgerEntry({
        id: "ledger-3",
        amount: 4,
        currency: "coins",
        delta: { coins: 4 },
        balance: { coins: 777, gems: 777 },
      }),
      3,
    ),
  );

  expect(state.ledger.entries.map((entry) => entry.id)).toEqual([
    "ledger-1",
    "ledger-2",
    "ledger-3",
  ]);
  expect(state.ledger.balances).toEqual({ coins: 4, gems: 7 });
});

test("legacy ledger entries with only delta still reduce into balances", () => {
  const state = reduce(
    initialState(),
    ev(
      {
        id: "legacy-ledger",
        ts: 1,
        reason: "legacy",
        delta: { coins: 6 },
        balance: { coins: 600 },
      },
      1,
    ),
  );

  expect(state.ledger.balances).toEqual({ coins: 6 });
});

test("inventory removal remains explicit and does not mutate balances", () => {
  const item: InventoryItem = {
    id: "skin-1",
    sku: "skin.green",
    kind: "skin",
    label: "Green",
    quantity: 1,
  };
  let state = reduce(initialState(), {
    seq: 1,
    ts: 1,
    sessionId: "session-1",
    type: "economy.ledger.appended",
    payload: {
      entry: ledgerEntry({
        id: "ledger-1",
        amount: 5,
        currency: "gems",
        delta: { gems: 5 },
        balance: { gems: 5 },
      }),
    },
  });
  state = reduce(state, {
    seq: 2,
    ts: 2,
    sessionId: "session-1",
    type: "inventory.updated",
    payload: { item, action: "added" },
  });
  state = reduce(state, {
    seq: 3,
    ts: 3,
    sessionId: "session-1",
    type: "inventory.updated",
    payload: { item: { ...item, quantity: 0 }, action: "removed" },
  });

  expect(state.inventory["skin-1"]).toBeUndefined();
  expect(state.ledger.balances).toEqual({ gems: 5 });
});
