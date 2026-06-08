import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSession } from "../../shared/domain";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { type RoomConnection, connectRoom } from "../ws-client";
import { ChatDrawer } from "./ChatDrawer";

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
  useUiStore.setState({
    activePanel: null,
    selectedAgentId: null,
    selectedNpcId: null,
    view: "overworld",
    transition: null,
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

test("shows Codex batch mode in the chat header", () => {
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
  useUiStore.setState({ activePanel: "chat" });

  render(<ChatDrawer />);

  expect(screen.getByText("Codex task")).toBeTruthy();
  expect(screen.getByText(/Codex.*Batch/)).toBeTruthy();
});

test("new session from a Codex chat inherits runtime config", async () => {
  FakeWebSocket.instances = [];
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  connection = connectRoom("ws://roguent.test");
  const session = createSession({
    id: "s1",
    title: "Codex task",
    runtime: "codex",
    model: "gpt-5",
    approvalPolicy: "never",
    sandboxMode: "read-only",
    reasoningEffort: "high",
    networkAccess: true,
  });
  useRoomStore.setState({
    sessions: { s1: session },
    currentSessionId: "s1",
  });
  useUiStore.setState({ activePanel: "chat" });

  render(<ChatDrawer />);
  await userEvent.click(screen.getByRole("button", { name: "会话" }));
  await userEvent.click(screen.getByRole("button", { name: /新会话/ }));

  const sent = FakeWebSocket.instances[0]?.sent ?? [];
  const command = JSON.parse(sent[sent.length - 1] ?? "{}") as Record<
    string,
    unknown
  >;
  expect(command).toMatchObject({
    cmd: "newSession",
    sessionId: "s2",
    title: "会话 2",
    runtime: "codex",
    model: "gpt-5",
    approvalPolicy: "never",
    sandboxMode: "read-only",
    reasoningEffort: "high",
    networkAccess: true,
  });
});

test("Codex runtime controls expose reasoning effort and send config updates", async () => {
  FakeWebSocket.instances = [];
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  connection = connectRoom("ws://roguent.test");
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
  useUiStore.setState({ activePanel: "chat" });

  render(<ChatDrawer />);

  expect(screen.getByText(/Codex.*gpt-5/)).toBeTruthy();

  await userEvent.selectOptions(
    screen.getByLabelText("reasoning effort"),
    "high",
  );

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
      reasoningEffort: "high",
      networkAccess: false,
    },
  });
});
