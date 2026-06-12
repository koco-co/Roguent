import { afterEach, expect, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { createSession } from "../../shared/domain";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { PlayerCard } from "./PlayerCard";

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

/** Renders an interior session whose context utilization drives the XP bar. */
function mountInterior(util: number) {
  const session = createSession({ id: "s1", title: "Build" });
  session.context = { utilization: util, usedTokens: 0, windowSize: 0 };
  useRoomStore.setState({ sessions: { s1: session }, currentSessionId: "s1" });
  useUiStore.setState({ view: { interior: "s1" } });
}

test("renders the playercard panel", () => {
  const { container } = render(<PlayerCard />);
  expect(container.querySelector(".playercard")).toBeTruthy();
});

test("context utilization fills the XP bar (real, interior only)", () => {
  mountInterior(88);
  const { container, getByText } = render(<PlayerCard />);
  // XP value label shows the real utilization.
  expect(getByText("88%")).toBeTruthy();
  const fill = container.querySelector(".pc-xp-fill") as HTMLElement | null;
  expect(fill).toBeTruthy();
  expect(fill?.style.width).toBe("88%");
});

test("clicking the card opens the PROFILE (account) panel", () => {
  const { container } = render(<PlayerCard />);
  const card = container.querySelector(".playercard") as HTMLElement;
  fireEvent.click(card);
  expect(useUiStore.getState().activePanel).toBe("account");
});
