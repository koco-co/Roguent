import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSession } from "../../../shared/domain";
import type { MailboxItem } from "../../../shared/events";
import { useRoomStore } from "../../store";
import { useUiStore } from "../../ui-store";
import { type RoomConnection, connectRoom } from "../../ws-client";
import { BoardPanel } from "./BoardPanel";
import { InboxItemRow } from "./InboxItemRow";
import { MailboxPanel } from "./MailboxPanel";

const originalWebSocket = globalThis.WebSocket;
const originalOpen = globalThis.open;
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

function item(overrides: Partial<MailboxItem>): MailboxItem {
  return {
    id: "i1",
    source: "github",
    title: "CI failed",
    summary: "build failed on main",
    ts: Date.UTC(2026, 0, 2, 10),
    status: "unread",
    kind: "event",
    priority: "high",
    ...overrides,
  };
}

function seedMailbox(items: MailboxItem[]) {
  useRoomStore.setState({
    sessions: {
      s1: createSession({ id: "s1", title: "Roguent", model: "sonnet" }),
    },
    currentSessionId: "s1",
    mailbox: {
      items: Object.fromEntries(items.map((mail) => [mail.id, mail])),
      order: items.map((mail) => mail.id),
    },
    connectorStatus: {
      github: { id: "github", channel: "github", state: "connected" },
      x: {
        id: "x",
        channel: "x",
        state: "blocked",
        error: "webhook entitlement missing",
      },
    },
  });
}

afterEach(() => {
  connection?.close();
  connection = null;
  globalThis.WebSocket = originalWebSocket;
  globalThis.open = originalOpen;
  FakeWebSocket.instances = [];
  cleanup();
  useRoomStore.setState({
    sessions: {},
    currentSessionId: null,
    projectOrder: [],
    connection: "connecting",
    connectorStatus: {},
    mailbox: { items: {}, order: [] },
  });
  useUiStore.setState({
    activePanel: null,
    selectedAgentId: null,
    selectedNpcId: null,
    transition: null,
    view: "overworld",
  });
});

test("mailbox panel filters real items and shows connector configuration state", async () => {
  seedMailbox([
    item({
      id: "github-1",
      source: "github",
      title: "GitHub workflow failed",
      metadata: { sourceUrl: "https://github.example/run/1" },
      sessionId: "s1",
    }),
    item({
      id: "x-1",
      source: "x",
      title: "X mention",
      summary: "customer asked for status",
    }),
  ]);
  useUiStore.setState({ activePanel: "mailbox" });

  render(<MailboxPanel />);

  expect(screen.getByText("GitHub workflow failed")).toBeTruthy();
  expect(screen.getByText("X mention")).toBeTruthy();
  expect(screen.getAllByText("configuration-required")).toHaveLength(2);
  expect(screen.getByText("webhook entitlement missing")).toBeTruthy();

  await userEvent.click(screen.getByRole("tab", { name: "GitHub" }));

  expect(screen.getByText("GitHub workflow failed")).toBeTruthy();
  expect(screen.queryByText("X mention")).toBeNull();
});

test("mailbox row actions send archive, mark read, resend, open source, and open session", async () => {
  FakeWebSocket.instances = [];
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  connection = connectRoom("ws://roguent.test");
  const opened: string[] = [];
  globalThis.open = ((url?: string | URL) => {
    if (url) opened.push(String(url));
    return null;
  }) as typeof globalThis.open;
  seedMailbox([
    item({
      id: "i1",
      source: "github",
      title: "GitHub workflow failed",
      metadata: { sourceUrl: "https://github.example/run/1" },
      sessionId: "s1",
    }),
  ]);
  useUiStore.setState({ activePanel: "mailbox" });

  render(<MailboxPanel />);

  await userEvent.click(screen.getByRole("button", { name: "Open Source" }));
  expect(opened).toEqual(["https://github.example/run/1"]);

  await userEvent.click(screen.getByRole("button", { name: "Resend" }));
  await userEvent.click(screen.getByRole("button", { name: "Mark Read" }));
  await userEvent.click(screen.getByRole("button", { name: "Archive" }));

  const sent = FakeWebSocket.instances[0]?.sent.map((raw) => JSON.parse(raw));
  expect(sent?.slice(-3)).toEqual([
    {
      cmd: "mailbox",
      action: "invokeAction",
      itemId: "i1",
      actionId: "resend",
    },
    { cmd: "mailbox", action: "markRead", itemId: "i1" },
    { cmd: "mailbox", action: "archive", itemId: "i1" },
  ]);

  await userEvent.click(screen.getByRole("button", { name: "Open Session" }));
  expect(useRoomStore.getState().currentSessionId).toBe("s1");
  expect(useUiStore.getState().activePanel).toBeNull();
});

test("open source only enables safe http urls and supports url fallback", async () => {
  const opened: string[] = [];
  globalThis.open = ((url?: string | URL) => {
    if (url) opened.push(String(url));
    return null;
  }) as typeof globalThis.open;

  for (const metadata of [
    { sourceUrl: "javascript:alert(1)" },
    { sourceUrl: "file:///etc/passwd" },
    { sourceUrl: "not a url" },
    { sourceUrl: 42 },
  ]) {
    const { unmount } = render(
      <InboxItemRow item={item({ metadata })} onOpenSession={() => {}} />,
    );
    const openSource = screen.getByRole("button", { name: "Open Source" });
    expect((openSource as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(openSource);
    unmount();
  }

  render(
    <InboxItemRow
      item={item({ metadata: { url: "https://github.example/fallback" } })}
      onOpenSession={() => {}}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "Open Source" }));

  expect(opened).toEqual(["https://github.example/fallback"]);
});

test("board panel renders board-selected mailbox items without samples", () => {
  const now = Date.now();
  seedMailbox([
    item({
      id: "today-board",
      title: "Today board item",
      ts: now,
      status: "read",
      metadata: { board: true },
    }),
    item({
      id: "old-alert",
      source: "runtime",
      title: "Old runtime alert",
      ts: now - 48 * 60 * 60 * 1000,
      status: "unread",
      kind: "alert",
      priority: "high",
    }),
  ]);
  useUiStore.setState({ activePanel: "board" });

  render(<BoardPanel />);

  expect(screen.getByText("Today board item")).toBeTruthy();
  expect(screen.getByText("Old runtime alert")).toBeTruthy();
  expect(screen.queryByText("Board is clear")).toBeNull();
});
