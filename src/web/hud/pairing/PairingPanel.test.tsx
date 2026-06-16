import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createSession } from "../../../shared/domain";
import { useRoomStore } from "../../store";
import { useUiStore } from "../../ui-store";
import { type RoomConnection, connectRoom } from "../../ws-client";
import { PairingPanel } from "./PairingPanel";

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
    pairings: { qrByChannel: {}, byId: {}, byExternalKey: {} },
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

test("renders WeChat and Feishu tabs with session binding state", () => {
  useRoomStore.setState({
    currentSessionId: "s1",
    sessions: {
      s1: createSession({ id: "s1", title: "Pairing target" }),
    },
    pairings: {
      qrByChannel: {
        wechat: {
          id: "qr-wechat",
          channel: "wechat",
          status: "pending",
          imageDataUrl:
            "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E",
          expiresAt: 1_717_452_600_000,
        },
      },
      byId: {
        "bind-1": {
          id: "bind-1",
          channel: "wechat",
          status: "active",
          externalChatId: "chat-1",
          sessionId: "s1",
          forwardingEnabled: true,
          displayName: "我的工作号",
          boundAt: 1_717_452_000_000,
          updatedAt: 1_717_452_100_000,
        },
      },
      byExternalKey: {},
    },
  });

  render(<PairingPanel sessionId="s1" onClose={() => {}} />);

  expect(screen.getByRole("dialog", { name: "Pairing" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "微信" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "飞书" })).toBeTruthy();
  expect(screen.getByText("我的工作号")).toBeTruthy();
  expect(screen.getByText(/chat-1/)).toBeTruthy();
  expect(screen.getByLabelText("WeChat QR code")).toBeTruthy();
});

test("toggling forwarding sends updatePairing command", async () => {
  FakeWebSocket.instances = [];
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  connection = connectRoom("ws://roguent.test");
  useRoomStore.setState({
    currentSessionId: "s1",
    sessions: {
      s1: createSession({ id: "s1", title: "Pairing target" }),
    },
    pairings: {
      qrByChannel: {},
      byId: {
        "bind-1": {
          id: "bind-1",
          channel: "wechat",
          status: "active",
          externalChatId: "chat-1",
          sessionId: "s1",
          forwardingEnabled: true,
          displayName: "我的工作号",
          boundAt: 1_717_452_000_000,
        },
      },
      byExternalKey: {},
    },
  });

  render(<PairingPanel sessionId="s1" onClose={() => {}} />);
  await userEvent.click(screen.getByRole("switch", { name: /转发/ }));

  const sent = FakeWebSocket.instances[0]?.sent ?? [];
  const command = JSON.parse(sent[sent.length - 1] ?? "{}") as Record<
    string,
    unknown
  >;
  expect(command).toMatchObject({
    cmd: "updatePairing",
    bindingId: "bind-1",
    forwardingEnabled: false,
  });
});

test("renders a scannable QR (svg) from qr.url, not plain url text", () => {
  useRoomStore.setState({
    currentSessionId: "s1",
    sessions: {
      s1: createSession({ id: "s1", title: "Pairing target" }),
    },
    pairings: {
      qrByChannel: {
        wechat: {
          id: "qr-wechat",
          channel: "wechat",
          status: "pending",
          url: "https://login.weixin.qq.com/l/abc123",
        },
      },
      byId: {},
      byExternalKey: {},
    },
  });

  const { container } = render(
    <PairingPanel sessionId="s1" onClose={() => {}} />,
  );

  // QRCodeSVG renders an <svg> inside the qr box (scannable image),
  // and the raw url is NOT dumped as the old plain-text .pair-qr-url node.
  const box = container.querySelector(".pair-qr-box");
  expect(box).toBeTruthy();
  expect(box?.querySelector("svg")).toBeTruthy();
  expect(container.querySelector(".pair-qr-url")).toBeNull();
});

test("with metadata.needVerifyCode, a verify-code input + submit appear and send submitVerifyCode", async () => {
  FakeWebSocket.instances = [];
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  connection = connectRoom("ws://roguent.test");
  useRoomStore.setState({
    currentSessionId: "s1",
    sessions: {
      s1: createSession({ id: "s1", title: "Pairing target" }),
    },
    pairings: {
      qrByChannel: {
        wechat: {
          id: "qr-wechat",
          channel: "wechat",
          status: "pending",
          url: "https://login.weixin.qq.com/l/abc123",
          metadata: { needVerifyCode: true, ilinkStatus: "need_verifycode" },
        },
      },
      byId: {},
      byExternalKey: {},
    },
  });

  render(<PairingPanel sessionId="s1" onClose={() => {}} />);

  const input = screen.getByRole("textbox", { name: /验证码|verify/i });
  expect(input).toBeTruthy();
  await userEvent.type(input, "1234");
  await userEvent.click(
    screen.getByRole("button", { name: /提交验证码|submit/i }),
  );

  const sent = FakeWebSocket.instances[0]?.sent.map((raw) =>
    JSON.parse(raw),
  ) as Array<Record<string, unknown>>;
  expect(sent.at(-1)).toMatchObject({
    cmd: "pairing",
    action: "submitVerifyCode",
    sessionId: "s1",
    channel: "wechat",
    code: "1234",
  });
});

test("verify-code input is hidden when needVerifyCode is absent", () => {
  useRoomStore.setState({
    currentSessionId: "s1",
    sessions: {
      s1: createSession({ id: "s1", title: "Pairing target" }),
    },
    pairings: {
      qrByChannel: {
        wechat: {
          id: "qr-wechat",
          channel: "wechat",
          status: "pending",
          url: "https://login.weixin.qq.com/l/abc123",
        },
      },
      byId: {},
      byExternalKey: {},
    },
  });

  render(<PairingPanel sessionId="s1" onClose={() => {}} />);
  expect(screen.queryByRole("textbox", { name: /验证码|verify/i })).toBeNull();
});

test("cancel button on a pending QR sends cancelQr", async () => {
  FakeWebSocket.instances = [];
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  connection = connectRoom("ws://roguent.test");
  useRoomStore.setState({
    currentSessionId: "s1",
    sessions: {
      s1: createSession({ id: "s1", title: "Pairing target" }),
    },
    pairings: {
      qrByChannel: {
        wechat: {
          id: "qr-wechat",
          channel: "wechat",
          status: "pending",
          url: "https://login.weixin.qq.com/l/abc123",
        },
      },
      byId: {},
      byExternalKey: {},
    },
  });

  render(<PairingPanel sessionId="s1" onClose={() => {}} />);
  await userEvent.click(screen.getByRole("button", { name: "取消" }));

  const sent = FakeWebSocket.instances[0]?.sent.map((raw) =>
    JSON.parse(raw),
  ) as Array<Record<string, unknown>>;
  expect(sent.at(-1)).toMatchObject({
    cmd: "pairing",
    action: "cancelQr",
    sessionId: "s1",
    channel: "wechat",
  });
});

test("creating QR and unpairing send real pairing commands", async () => {
  FakeWebSocket.instances = [];
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  connection = connectRoom("ws://roguent.test");
  useRoomStore.setState({
    currentSessionId: "s1",
    sessions: {
      s1: createSession({ id: "s1", title: "Pairing target" }),
    },
    pairings: {
      qrByChannel: {},
      byId: {
        "bind-1": {
          id: "bind-1",
          channel: "wechat",
          status: "active",
          externalChatId: "chat-1",
          sessionId: "s1",
          forwardingEnabled: true,
          displayName: "我的工作号",
          boundAt: 1_717_452_000_000,
        },
      },
      byExternalKey: {},
    },
  });

  render(<PairingPanel sessionId="s1" onClose={() => {}} />);
  await userEvent.click(screen.getByRole("button", { name: "生成 QR" }));
  await userEvent.click(screen.getByRole("button", { name: "解绑" }));

  const sent = FakeWebSocket.instances[0]?.sent.map((raw) =>
    JSON.parse(raw),
  ) as Array<Record<string, unknown>>;
  expect(sent.at(-2)).toMatchObject({
    cmd: "pairing",
    action: "generateQr",
    sessionId: "s1",
    channel: "wechat",
  });
  expect(sent.at(-1)).toMatchObject({
    cmd: "updatePairing",
    bindingId: "bind-1",
    status: "revoked",
    forwardingEnabled: false,
  });
});
