import { afterEach, expect, test } from "bun:test";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Shop } from "../hud/Shop";
import { GachaPanel } from "../hud/economy/GachaPanel";
import { DEFAULT_SETTINGS, useSettingsStore } from "../settings-store";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { type RoomConnection, connectRoom } from "../ws-client";
import { HubPlaza, LobbyView } from "./HubPlaza";

const originalWebSocket = globalThis.WebSocket;
let connection: RoomConnection | null = null;

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
  connection?.close();
  connection = null;
  globalThis.WebSocket = originalWebSocket;
  FakeWebSocket.instances = [];
  cleanup();
  useSettingsStore.setState({ ...DEFAULT_SETTINGS });
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

test("lobby structures expose panel actions and keyboard activation", async () => {
  useSettingsStore.setState({ avatarHero: "orc_warrior" });

  render(
    <>
      <LobbyView />
      <Shop />
      <GachaPanel />
    </>,
  );

  expect(screen.getByRole("button", { name: /任务台/ })).toBeTruthy();
  expect(screen.getByRole("button", { name: /公告板/ })).toBeTruthy();
  expect(screen.getByRole("button", { name: /邮箱/ })).toBeTruthy();
  expect(screen.getByRole("button", { name: /排行榜/ })).toBeTruthy();
  expect(screen.getByRole("button", { name: /成就殿/ })).toBeTruthy();
  expect(screen.getByRole("button", { name: /扭蛋机/ })).toBeTruthy();

  await userEvent.click(screen.getByRole("button", { name: /邮箱/ }));
  expect(useUiStore.getState().activePanel).toBe("mailbox");

  act(() => useUiStore.setState({ activePanel: null }));
  screen.getByRole("button", { name: /排行榜/ }).focus();
  await userEvent.keyboard("{Enter}");
  expect(useUiStore.getState().activePanel).toBe("leaderboard");

  act(() => useUiStore.setState({ activePanel: null }));
  await userEvent.click(screen.getByRole("button", { name: /扭蛋机/ }));
  expect(useUiStore.getState().activePanel).toBe("gacha");
  // gacha 路由由真实 GachaPanel 接管(Shop 已摘除 gacha 分支)。
  expect(screen.getByTestId("gacha-balance")).toBeTruthy();
});

test("mailbox structure renders a real unread badge from store state", () => {
  useSettingsStore.setState({ avatarHero: "orc_warrior" });
  // 邮箱徽标接真:从 store 的 mailbox 真未读条数渲染 .mailbox-count(不造数据)。
  useRoomStore.setState({
    mailbox: {
      items: {
        a: {
          id: "a",
          source: "system",
          title: "Alert",
          summary: "x",
          ts: Date.now(),
          status: "unread",
        },
        b: {
          id: "b",
          source: "system",
          title: "Alert",
          summary: "y",
          ts: Date.now(),
          status: "unread",
        },
        c: {
          id: "c",
          source: "system",
          title: "Read",
          summary: "z",
          ts: Date.now(),
          status: "read",
        },
      },
      order: ["a", "b", "c"],
    },
  });

  const { container } = render(<LobbyView />);
  const badge = container.querySelector(".mailbox-count");
  expect(badge).toBeTruthy();
  expect(badge?.textContent).toBe("2");
});

test("clicking Codex and Claude doors sends runtime-specific newSession commands", async () => {
  FakeWebSocket.instances = [];
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  connection = connectRoom("ws://roguent.test");
  useSettingsStore.setState({ avatarHero: "orc_warrior" });

  render(<HubPlaza initialPosition={{ x: 1690, y: 760 }} />);

  await userEvent.click(screen.getByRole("button", { name: /Codex 项目/ }));
  await userEvent.click(screen.getByRole("button", { name: /Claude 项目/ }));

  await waitFor(() => expect(FakeWebSocket.instances[0]?.sent.length).toBe(2));
  const sent = FakeWebSocket.instances[0]?.sent.map((raw) => JSON.parse(raw));
  expect(sent?.[0]).toMatchObject({
    cmd: "newSession",
    sessionId: "s1",
    runtime: "codex",
    model: "gpt-5",
    approvalPolicy: "on-request",
  });
  expect(sent?.[1]).toMatchObject({
    cmd: "newSession",
    sessionId: "s2",
    runtime: "claude",
    model: "claude-opus-4-8",
  });
});

test("focused structure Enter is owned by the button and not the global proximity handler", async () => {
  FakeWebSocket.instances = [];
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  connection = connectRoom("ws://roguent.test");
  useSettingsStore.setState({ avatarHero: "orc_warrior" });

  render(<HubPlaza initialPosition={{ x: 1690, y: 760 }} />);

  screen.getByRole("button", { name: /Codex 项目/ }).focus();
  await userEvent.keyboard("{Enter}");

  await waitFor(() => expect(FakeWebSocket.instances[0]?.sent.length).toBe(1));
  const sent = FakeWebSocket.instances[0]?.sent.map((raw) => JSON.parse(raw));
  expect(sent?.[0]).toMatchObject({
    cmd: "newSession",
    runtime: "codex",
  });
});
