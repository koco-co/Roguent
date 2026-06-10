import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GACHA_PULL_COST } from "../../../engine/economy/gacha";
import type { InventoryItem } from "../../../shared/economy";
import { useRoomStore } from "../../store";
import { useUiStore } from "../../ui-store";
import { type RoomConnection, connectRoom } from "../../ws-client";
import { GachaPanel } from "./GachaPanel";

const originalWebSocket = globalThis.WebSocket;
let connection: RoomConnection | null = null;

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readonly OPEN = 1;
  readyState = 1;
  sent: string[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(raw: string): void {
    this.sent.push(raw);
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.(new CloseEvent("close"));
  }
}

function makeItem(id: string): InventoryItem {
  return {
    id,
    sku: id,
    kind: "skin",
    label: id,
    quantity: 1,
  };
}

afterEach(() => {
  connection?.close();
  connection = null;
  globalThis.WebSocket = originalWebSocket;
  FakeWebSocket.instances = [];
  cleanup();
  useRoomStore.setState({
    sessions: {},
    currentSessionId: null,
    projectOrder: [],
    connection: "connecting",
    ledger: { entries: [], balances: {} },
    inventory: {},
  });
  useUiStore.setState({
    activePanel: null,
    selectedAgentId: null,
    selectedNpcId: null,
    transition: null,
    view: "overworld",
  });
});

// ── renders nothing when panel is not active ──────────────────────────────────

test("GachaPanel renders nothing when not active", () => {
  useUiStore.setState({ activePanel: null });
  const { container } = render(<GachaPanel />);
  expect(container.firstChild).toBeNull();
});

// ── insufficient balance state ────────────────────────────────────────────────

test("GachaPanel shows insufficient balance warning when gems < pull cost", () => {
  useRoomStore.setState({
    ledger: { entries: [], balances: { gem: GACHA_PULL_COST - 1 } },
    inventory: {},
  });
  useUiStore.setState({ activePanel: "gacha" });

  render(<GachaPanel />);

  // Pull button must be disabled
  const pullBtn = screen.getByRole("button", { name: /pull/i });
  expect((pullBtn as HTMLButtonElement).disabled).toBe(true);
  // Must show some indication of insufficient balance
  expect(screen.getByTestId("gacha-balance").textContent).toContain(
    String(GACHA_PULL_COST - 1),
  );
});

// ── sufficient balance ────────────────────────────────────────────────────────

test("GachaPanel pull button is enabled with sufficient balance", () => {
  useRoomStore.setState({
    ledger: { entries: [], balances: { gem: GACHA_PULL_COST } },
    inventory: {},
  });
  useUiStore.setState({ activePanel: "gacha" });

  render(<GachaPanel />);

  const pullBtn = screen.getByRole("button", { name: /pull/i });
  expect((pullBtn as HTMLButtonElement).disabled).toBe(false);
});

// ── pull sends economy purchaseItem command ───────────────────────────────────

test("GachaPanel pull button sends economy purchaseItem command", async () => {
  FakeWebSocket.instances = [];
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  connection = connectRoom("ws://roguent.test");

  useRoomStore.setState({
    ledger: { entries: [], balances: { gem: GACHA_PULL_COST * 5 } },
    inventory: {},
  });
  useUiStore.setState({ activePanel: "gacha" });

  render(<GachaPanel />);

  await userEvent.click(screen.getByRole("button", { name: /pull/i }));

  const sent = FakeWebSocket.instances[0]?.sent.map((raw) => JSON.parse(raw));
  const lastSent = sent?.at(-1);
  expect(lastSent).toMatchObject({
    cmd: "economy",
    action: "purchaseItem",
    sku: "gacha.hero",
  });
});

// ── inventory display ─────────────────────────────────────────────────────────

test("GachaPanel displays owned inventory items", () => {
  useRoomStore.setState({
    ledger: { entries: [], balances: { gem: GACHA_PULL_COST } },
    inventory: {
      "skin.ninja": makeItem("skin.ninja"),
      "pet.slime": makeItem("pet.slime"),
    },
  });
  useUiStore.setState({ activePanel: "gacha" });

  render(<GachaPanel />);

  // Both items should be shown somewhere in the panel
  expect(screen.getByTestId("inventory-item-skin.ninja")).toBeTruthy();
  expect(screen.getByTestId("inventory-item-pet.slime")).toBeTruthy();
});

test("GachaPanel shows empty message when inventory is empty", () => {
  useRoomStore.setState({
    ledger: { entries: [], balances: { gem: GACHA_PULL_COST } },
    inventory: {},
  });
  useUiStore.setState({ activePanel: "gacha" });

  render(<GachaPanel />);

  expect(screen.getByTestId("gacha-inventory-empty")).toBeTruthy();
});

// ── duplicate indicator ───────────────────────────────────────────────────────

test("GachaPanel marks owned pool items as duplicate", () => {
  // When a pool item is already in inventory, render it with a visual marker
  useRoomStore.setState({
    ledger: { entries: [], balances: { gem: GACHA_PULL_COST * 5 } },
    inventory: {
      "skin.ninja": makeItem("skin.ninja"),
    },
  });
  useUiStore.setState({ activePanel: "gacha" });

  render(<GachaPanel />);

  const ownedEl = screen.getByTestId("inventory-item-skin.ninja");
  expect(ownedEl.getAttribute("data-duplicate")).toBe("true");
});
