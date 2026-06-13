import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSession } from "../../shared/domain";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { type RoomConnection, connectRoom } from "../ws-client";
import { Composer } from "./Composer";

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
  });
  useUiStore.setState({
    activePanel: null,
    selectedAgentId: null,
    selectedNpcId: null,
    transition: null,
    view: "overworld",
  });
});

function seedSession(status: "idle" | "busy" = "idle") {
  const session = createSession({ id: "s1", title: "Room", model: "sonnet" });
  session.status = status;
  useRoomStore.setState({ sessions: { s1: session }, currentSessionId: "s1" });
}

test("quick reply click sends the text via the real sendMessage path", async () => {
  FakeWebSocket.instances = [];
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  connection = connectRoom("ws://roguent.test");
  seedSession("idle");

  render(<Composer sessionId="s1" />);

  // 默认中文文案 "继续"
  await userEvent.click(screen.getByRole("button", { name: "继续" }));

  const sent = FakeWebSocket.instances[0]?.sent.map((raw) => JSON.parse(raw));
  expect(sent?.at(-1)).toEqual({
    cmd: "sendMessage",
    sessionId: "s1",
    text: "继续",
  });
});

test("quick replies are disabled while the session is busy", () => {
  seedSession("busy");

  render(<Composer sessionId="s1" />);

  const quick = screen.getByRole("button", { name: "继续" });
  expect((quick as HTMLButtonElement).disabled).toBe(true);
});
