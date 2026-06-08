import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSession } from "../../shared/domain";
import { useRoomStore } from "../store";
import { type RoomConnection, connectRoom } from "../ws-client";
import { RuntimeControls } from "./RuntimeControls";

const originalWebSocket = globalThis.WebSocket;
let connection: RoomConnection | null = null;

afterEach(() => {
  connection?.close();
  connection = null;
  globalThis.WebSocket = originalWebSocket;
  cleanup();
  useRoomStore.setState({
    sessions: {},
    currentSessionId: null,
    projectOrder: [],
    connection: "connecting",
    limits: null,
  });
});

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

test("Codex runtime controls send network access updates", async () => {
  FakeWebSocket.instances = [];
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  connection = connectRoom("ws://roguent.test");
  const user = userEvent.setup();
  const session = createSession({
    id: "s1",
    title: "Codex task",
    runtime: "codex",
    model: "gpt-5",
    permissionMode: "default",
    approvalPolicy: "on-request",
    sandboxMode: "workspace-write",
    reasoningEffort: "medium",
    networkAccess: false,
  });
  useRoomStore.setState({
    sessions: { s1: session },
    currentSessionId: "s1",
  });

  render(<RuntimeControls sessionId="s1" />);
  await user.click(screen.getByRole("checkbox", { name: "network access" }));

  const sent = FakeWebSocket.instances[0]?.sent ?? [];
  const command = JSON.parse(sent[sent.length - 1] ?? "{}") as Record<
    string,
    unknown
  >;
  expect(command).toMatchObject({
    cmd: "setRuntimeConfig",
    sessionId: "s1",
    config: {
      runtime: "codex",
      model: "gpt-5",
      permissionMode: "default",
      approvalPolicy: "on-request",
      sandboxMode: "workspace-write",
      reasoningEffort: "medium",
      networkAccess: true,
    },
  });
});

test("Claude runtime controls hide Codex-only provider fields", () => {
  const session = createSession({
    id: "s1",
    title: "Claude task",
    runtime: "claude",
    model: "claude-opus-4-8",
    permissionMode: "default",
    sandboxMode: "workspace-write",
    networkAccess: true,
  });
  useRoomStore.setState({
    sessions: { s1: session },
    currentSessionId: "s1",
  });

  render(<RuntimeControls sessionId="s1" />);

  expect(screen.queryByLabelText("reasoning effort")).toBeNull();
  expect(screen.queryByLabelText("approval policy")).toBeNull();
});
