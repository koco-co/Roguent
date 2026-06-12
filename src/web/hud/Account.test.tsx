import { afterEach, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { createSession } from "../../shared/domain";
import type { AccountLimits } from "../../shared/events";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { Account } from "./Account";

afterEach(() => {
  cleanup();
  useRoomStore.setState({
    sessions: {},
    currentSessionId: null,
    projectOrder: [],
    connection: "connecting",
    limits: null,
  });
  useUiStore.setState({
    activePanel: null,
    selectedAgentId: null,
    selectedNpcId: null,
    view: "overworld",
    transition: null,
  });
});

const LIMITS: AccountLimits = {
  planName: "Max",
  fiveHour: { utilization: 42, resetsAt: Date.now() + 3_600_000 },
  sevenDay: { utilization: 71, resetsAt: Date.now() + 86_400_000 },
  stale: false,
};

test("PROFILE header shows avatar frame + Lv + Context bar", () => {
  const session = createSession({ id: "s1", title: "Build" });
  session.context = { utilization: 30, usedTokens: 0, windowSize: 0 };
  useRoomStore.setState({
    sessions: { s1: session },
    currentSessionId: "s1",
    limits: LIMITS,
  });
  useUiStore.setState({ activePanel: "account", view: { interior: "s1" } });

  const { container, getByText } = render(<Account />);

  // Decorative hero header present (frame + canvas portrait + mock Lv).
  expect(container.querySelector(".acct2-hero")).toBeTruthy();
  expect(container.querySelector(".acct2-portrait-canvas")).toBeTruthy();
  expect(getByText("Lv 47")).toBeTruthy();
  // Real Context XP echo reflects the interior session utilization.
  const fill = container.querySelector(".acct2-xpfill") as HTMLElement | null;
  expect(fill?.style.width).toBe("30%");
});

test("real 5h / Weekly usage rows remain in PROFILE", () => {
  useRoomStore.setState({ limits: LIMITS });
  useUiStore.setState({ activePanel: "account" });

  const { getByText } = render(<Account />);

  // The Usage section + both real usage bars still render.
  expect(getByText("Usage")).toBeTruthy();
  expect(getByText("5h")).toBeTruthy();
  expect(getByText("Weekly")).toBeTruthy();
  expect(getByText("42%")).toBeTruthy();
  expect(getByText("71%")).toBeTruthy();
});

test("auth buttons remain placeholders", () => {
  useUiStore.setState({ activePanel: "account" });
  const { getByText } = render(<Account />);
  expect(getByText("/login")).toBeTruthy();
});
