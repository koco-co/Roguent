import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../App";
import { DEFAULT_SETTINGS, useSettingsStore } from "../settings-store";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";

const originalWebSocket = globalThis.WebSocket;

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readonly OPEN = 1;
  readyState = 1;
  sent: string[] = [];
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
    queueMicrotask(() => this.onopen?.(new Event("open")));
  }

  send(raw: string): void {
    this.sent.push(raw);
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.(new CloseEvent("close"));
  }
}

afterEach(() => {
  cleanup();
  globalThis.WebSocket = originalWebSocket;
  FakeWebSocket.instances = [];
  useSettingsStore.setState({ ...DEFAULT_SETTINGS });
  useRoomStore.setState({
    sessions: {},
    currentSessionId: null,
    projectOrder: [],
    connection: "connecting",
  });
  useUiStore.setState({
    view: "overworld",
    activePanel: null,
    selectedNpcId: null,
    selectedAgentId: null,
  });
});

test("start gate chooses a hero, persists it, enters lobby, and does not block engine connection", async () => {
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;

  render(<App />);

  await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
  expect(FakeWebSocket.instances[0]?.url).toBe("ws://localhost:8787");
  expect(screen.getByRole("button", { name: /Start/i })).toBeTruthy();

  await userEvent.click(screen.getByRole("button", { name: /Start/i }));
  await userEvent.click(screen.getByRole("button", { name: /Orc/i }));

  expect(useSettingsStore.getState().avatarHero).toBe("orc_warrior");
  expect(screen.getByTestId("lobby-view")).toBeTruthy();
});
