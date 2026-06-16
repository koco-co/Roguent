import { afterEach, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { useRoomStore } from "../store";
import { Currency } from "./Currency";

afterEach(() => {
  cleanup();
  useRoomStore.setState({
    sessions: {},
    currentSessionId: null,
    projectOrder: [],
    connection: "connecting",
    limits: null,
    ledger: { entries: [], balances: {} },
  });
});

/** Finds the gem cell value text inside the rendered currency bar. */
function gemCellText(container: HTMLElement): string | null {
  const cells = container.querySelectorAll(".cur-cell");
  // Layout: coins / gem / laurel — gem is the second cell.
  const gemCell = cells[1] as HTMLElement | undefined;
  return gemCell?.querySelector(".px")?.textContent ?? null;
}

test("renders the real gem balance from the ledger, not a mock value", () => {
  useRoomStore.setState({
    ledger: { entries: [], balances: { gem: 400 } },
  });
  const { container } = render(<Currency />);
  expect(gemCellText(container)).toBe("400");
  // The old hardcoded mock (1280) must be gone.
  expect(container.textContent).not.toContain("1,280");
});

test("formats large gem balances with locale separators", () => {
  useRoomStore.setState({
    ledger: { entries: [], balances: { gem: 12345 } },
  });
  const { container } = render(<Currency />);
  expect(gemCellText(container)).toBe((12345).toLocaleString());
});

test("shows 0 gems when the ledger has no gem balance", () => {
  useRoomStore.setState({
    ledger: { entries: [], balances: {} },
  });
  const { container } = render(<Currency />);
  expect(gemCellText(container)).toBe("0");
});

test("shows 0 gems when the ledger slice is absent (defensive default)", () => {
  // PlayerCard.test resets the store without a ledger slice; Currency must not
  // crash and must default to 0.
  useRoomStore.setState({ ledger: undefined });
  const { container } = render(<Currency />);
  expect(gemCellText(container)).toBe("0");
});
