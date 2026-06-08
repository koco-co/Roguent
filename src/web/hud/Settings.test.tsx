import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { Settings } from "./Settings";

afterEach(() => {
  cleanup();
  useRoomStore.setState({
    connectorStatus: {},
    connection: "connecting",
    currentSessionId: null,
    projectOrder: [],
    sessions: {},
  });
  useUiStore.setState({
    activePanel: null,
    selectedAgentId: null,
    selectedNpcId: null,
    transition: null,
    view: "overworld",
  });
});

test("settings panel shows relay connector status from the room store", () => {
  useUiStore.setState({ activePanel: "settings" });
  useRoomStore.setState({
    connectorStatus: {
      relay: {
        id: "relay",
        channel: "relay",
        state: "blocked",
        error: "relay entitlement missing",
      },
    },
  });

  render(<Settings />);

  expect(screen.getByText("Relay")).toBeTruthy();
  expect(screen.getByText("blocked")).toBeTruthy();
  expect(screen.getByText("relay entitlement missing")).toBeTruthy();
});
