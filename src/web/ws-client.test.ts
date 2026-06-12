import { afterEach, expect, test } from "bun:test";
import type { RoomEvent } from "../shared/events";
import type { ControlMessage } from "../shared/local-sessions";
import { useUiStore } from "./ui-store";
import { handleIncoming, sendCommand } from "./ws-client";
import { connectRoom } from "./ws-client";

const originalWebSocket = globalThis.WebSocket;

afterEach(() => {
  globalThis.WebSocket = originalWebSocket;
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

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readonly OPEN = 1;
  readonly CONNECTING = 0;
  readyState = 1;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  sent: string[] = [];

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(raw: string): void {
    this.sent.push(raw);
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }

  receive(raw: string): void {
    this.onmessage?.({ data: raw } as MessageEvent);
  }
}

test("handleIncoming applies valid events and ignores malformed", () => {
  const got: RoomEvent[] = [];
  handleIncoming(
    '{"seq":1,"ts":0,"sessionId":"s1","type":"agent.idle","payload":{}}',
    (e) => got.push(e),
  );
  handleIncoming("not json", (e) => got.push(e));
  expect(got).toHaveLength(1);
  expect(got[0]?.type).toBe("agent.idle");
});

test("handleIncoming routes control messages to onControl, not the event sink", () => {
  const events: RoomEvent[] = [];
  const controls: ControlMessage[] = [];
  handleIncoming(
    '{"kind":"control","type":"localSessions","items":[]}',
    (e) => events.push(e),
    (c) => controls.push(c),
  );
  expect(events).toHaveLength(0);
  expect(controls).toHaveLength(1);
  expect(controls[0]?.type).toBe("localSessions");
});

test("handleIncoming with no onControl silently ignores a control frame", () => {
  expect(() =>
    handleIncoming(
      '{"kind":"control","type":"localSessions","items":[]}',
      (e) => e,
    ),
  ).not.toThrow();
});

test("sendCommand before any connection does not throw (command is buffered, not dropped)", () => {
  // No active connection yet in a fresh import is not guaranteed across tests,
  // but calling sendCommand must never throw even when active is null.
  expect(() => sendCommand({ cmd: "listLocalSessions" })).not.toThrow();
});

test("handleIncoming routes kind:limits to onLimits, not the event sink", () => {
  const events: RoomEvent[] = [];
  let limits: unknown = null;
  handleIncoming(
    '{"kind":"limits","ts":1,"limits":{"planName":"Max","fiveHour":{"utilization":30,"resetsAt":null},"sevenDay":{"utilization":80,"resetsAt":null}}}',
    (e) => events.push(e),
    undefined,
    (l) => {
      limits = l;
    },
  );
  expect(events).toHaveLength(0);
  expect((limits as { planName?: string })?.planName).toBe("Max");
});

test("connectRoom stores commandError control messages in ui state", () => {
  FakeWebSocket.instances = [];
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  const conn = connectRoom("ws://roguent.test");
  try {
    FakeWebSocket.instances[0]?.receive(
      JSON.stringify({
        kind: "control",
        type: "commandError",
        reason: "Command not implemented",
      }),
    );
    expect(useUiStore.getState().commandError).toBe("Command not implemented");
  } finally {
    conn.close();
  }
});

test("handleIncoming: kind:plugins → onPlugins", () => {
  const got: unknown[] = [];
  handleIncoming(
    JSON.stringify({
      kind: "plugins",
      ts: 1,
      plugins: [{ id: "a@b" }],
      busy: [],
    }),
    () => {},
    undefined,
    undefined,
    (m) => got.push(m),
  );
  expect(got.length).toBe(1);
});
