import { afterEach, expect, test } from "bun:test";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { type TimelinePromptItem, createSession } from "../shared/domain";
import type { RoomEvent } from "../shared/events";
import { PromptCard } from "./hud/PromptCard";
import {
  type RoomState,
  type RoomStateWithPrototype,
  reduce,
  useRoomStore,
} from "./store";
import { type RoomConnection, connectRoom } from "./ws-client";

const originalWebSocket = globalThis.WebSocket;
let connection: RoomConnection | null = null;

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readonly OPEN = 1;
  readonly CONNECTING = 0;
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

const initialState = (): RoomStateWithPrototype => ({
  sessions: {},
  currentSessionId: null,
  projectOrder: [],
  connection: "connecting",
  runtimeStatusBySession: {},
  connectorStatus: {},
  pairings: { qrByChannel: {}, byId: {}, byExternalKey: {} },
  mailbox: { items: {}, order: [] },
  scheduler: { tasks: {}, runs: {} },
  ledger: { entries: [], balances: {} },
  achievements: {},
  inventory: {},
  settings: null,
});

const ev = (patch: Partial<RoomEvent>): RoomEvent => ({
  seq: 1,
  ts: 0,
  sessionId: "s1",
  type: "session.created",
  payload: {},
  ...patch,
});

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

test("prompt.resolved updates prompt cards to answered and dismissed states", () => {
  let state: RoomState = reduce(
    initialState(),
    ev({
      type: "session.created",
      payload: { title: "codex", model: "gpt-5", runtime: "codex" },
    }),
  );
  state = reduce(
    state,
    ev({
      seq: 2,
      type: "prompt.requested",
      payload: {
        promptId: "p1",
        promptKind: "permission",
        data: { toolName: "Bash", inputSummary: "git status" },
      },
    }),
  );
  state = reduce(
    state,
    ev({
      seq: 3,
      type: "prompt.requested",
      payload: {
        promptId: "q1",
        promptKind: "question",
        data: {
          questions: [
            {
              header: "Pick",
              question: "Continue?",
              multiSelect: false,
              options: [{ label: "Yes" }],
            },
          ],
        },
      },
    }),
  );

  state = reduce(
    state,
    ev({
      seq: 4,
      type: "prompt.resolved",
      payload: { promptId: "p1", result: "answered" },
    }),
  );
  state = reduce(
    state,
    ev({
      seq: 5,
      type: "prompt.resolved",
      payload: { promptId: "q1", result: "dismissed" },
    }),
  );

  const prompts = state.sessions.s1?.timeline.filter(
    (item): item is TimelinePromptItem => item.kind === "prompt",
  );
  expect(prompts?.map((item) => [item.id, item.status])).toEqual([
    ["p1", "answered"],
    ["q1", "dismissed"],
  ]);
});

test("PromptCard disables repeated permission responses after a click", async () => {
  FakeWebSocket.instances = [];
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  connection = connectRoom("ws://roguent.test");
  const user = userEvent.setup();
  const item: TimelinePromptItem = {
    kind: "prompt",
    id: "p1",
    promptKind: "permission",
    data: { toolName: "Bash", inputSummary: "git status" },
    status: "pending",
    ts: 0,
    source: { kind: "desktop" },
    runtime: "codex",
  };

  render(createElement(PromptCard, { item, sessionId: "s1" }));
  const approve = screen.getByRole("button", { name: "允许" });
  await user.click(approve);
  await user.click(approve);

  const sent = FakeWebSocket.instances[0]?.sent.map((raw) => JSON.parse(raw));
  expect(sent).toEqual([
    {
      cmd: "respondPermission",
      sessionId: "s1",
      promptId: "p1",
      behavior: "allow",
    },
  ]);
  expect((approve as HTMLButtonElement).disabled).toBe(true);
});

test("PromptCard allows retry after a prompt response failure", async () => {
  FakeWebSocket.instances = [];
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  connection = connectRoom("ws://roguent.test");
  const user = userEvent.setup();
  const item: TimelinePromptItem = {
    kind: "prompt",
    id: "p1",
    promptKind: "permission",
    data: { toolName: "Bash", inputSummary: "git status" },
    status: "pending",
    ts: 0,
    source: { kind: "desktop" },
    runtime: "codex",
  };
  const session = createSession({
    id: "s1",
    title: "Codex task",
    runtime: "codex",
    model: "gpt-5",
    timeline: [item],
  });
  useRoomStore.setState({
    sessions: { s1: session },
    currentSessionId: "s1",
  });

  render(createElement(PromptCard, { item, sessionId: "s1" }));
  const approve = screen.getByRole("button", { name: "允许" });
  await user.click(approve);
  expect((approve as HTMLButtonElement).disabled).toBe(true);

  act(() => {
    useRoomStore.setState({
      sessions: {
        s1: {
          ...session,
          status: "error",
          timeline: [
            item,
            {
              kind: "message",
              id: "err1",
              role: "system",
              text: "Prompt response failed: transport closed",
              ts: 1,
              source: { kind: "desktop" },
              runtime: "codex",
              status: "final",
            },
          ],
        },
      },
    });
  });

  await waitFor(() =>
    expect((approve as HTMLButtonElement).disabled).toBe(false),
  );
  await user.click(approve);

  const sent = FakeWebSocket.instances[0]?.sent.map((raw) => JSON.parse(raw));
  expect(sent).toEqual([
    {
      cmd: "respondPermission",
      sessionId: "s1",
      promptId: "p1",
      behavior: "allow",
    },
    {
      cmd: "respondPermission",
      sessionId: "s1",
      promptId: "p1",
      behavior: "allow",
    },
  ]);
});
