import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useUiStore } from "../ui-store";
import { ErrorOverlay } from "./ErrorOverlay";

afterEach(() => {
  cleanup();
  useUiStore.setState({
    activePanel: null,
    localSessions: [],
    importError: null,
    commandError: null,
    selectedAgentId: null,
    selectedNpcId: null,
    view: "overworld",
    transition: null,
  });
});

test("shows command errors and lets the user dismiss them", async () => {
  useUiStore.setState({ commandError: "Command not implemented" });

  render(<ErrorOverlay />);

  expect(screen.getByText("命令失败")).toBeTruthy();
  expect(screen.getByText("Command not implemented")).toBeTruthy();

  await userEvent.click(screen.getByRole("button", { name: "关闭" }));

  expect(useUiStore.getState().commandError).toBeNull();
});
