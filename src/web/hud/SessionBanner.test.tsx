import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { createSession } from "../../shared/domain";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { SessionBanner } from "./SessionBanner";

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

test("shows Codex batch mode tag for exec fallback sessions", () => {
  const session = createSession({
    id: "s1",
    title: "Codex task",
    runtime: "codex",
    model: "gpt-5",
    runtimeStatus: {
      runtime: "codex",
      status: "degraded",
      config: {
        runtime: "codex",
        model: "gpt-5",
        permissionMode: "default",
        sandboxMode: "workspace-write",
        networkAccess: false,
      },
      cwd: "/repo",
      metadata: {
        mode: "exec-json",
        realtime: false,
        degraded: true,
      },
    },
  });
  useRoomStore.setState({
    sessions: { s1: session },
    currentSessionId: "s1",
  });
  useUiStore.setState({ view: { interior: "s1" } });

  render(<SessionBanner />);

  expect(screen.getByText("Codex")).toBeTruthy();
  expect(screen.getByText("Batch")).toBeTruthy();
});
