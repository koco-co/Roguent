import { afterEach, beforeEach, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  type TimelineMessageItem,
  createAgent,
  createSession,
} from "../../shared/domain";
import { usePinnedStore } from "../pinned-store";
import { type RoomConnection, connectRoom } from "../ws-client";
import { MessageBubble } from "./MessageBubble";

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

function agentMessage(
  overrides: Partial<TimelineMessageItem> = {},
): TimelineMessageItem {
  return {
    kind: "message",
    id: "m1",
    role: "assistant",
    text: "hi",
    ts: 1,
    source: { kind: "desktop" },
    runtime: "claude",
    status: "final",
    ...overrides,
  };
}

beforeEach(() => {
  usePinnedStore.setState({ pinnedBySession: {} });
});

afterEach(() => {
  connection?.close();
  connection = null;
  globalThis.WebSocket = originalWebSocket;
  cleanup();
  usePinnedStore.setState({ pinnedBySession: {} });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: undefined,
  });
});

test("copies fenced code blocks independently from the whole message", async () => {
  const writes: string[] = [];
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async (text: string) => {
        writes.push(text);
      },
    },
  });

  const session = createSession({ id: "s1", title: "t", model: "m" });
  const item: TimelineMessageItem = {
    kind: "message",
    id: "m1",
    role: "assistant",
    text: "Use this:\n```ts\nconst x = 1;\nconsole.log(x);\n```",
    ts: 1,
    source: { kind: "desktop" },
    runtime: "claude",
    status: "final",
  };

  render(<MessageBubble item={item} session={session} sessionId="s1" />);

  await userEvent.click(screen.getByRole("button", { name: "复制代码" }));

  expect(writes).toEqual(["const x = 1;\nconsole.log(x);"]);
});

test("copy buttons tolerate unavailable or rejected clipboard writes", async () => {
  const session = createSession({ id: "s1", title: "t", model: "m" });
  const item: TimelineMessageItem = {
    kind: "message",
    id: "m1",
    role: "assistant",
    text: "Use this:\n```sh\nbun test\n```",
    ts: 1,
    source: { kind: "desktop" },
    runtime: "claude",
    status: "final",
  };

  const { rerender } = render(
    <MessageBubble item={item} session={session} sessionId="s1" />,
  );

  await userEvent.click(screen.getByTitle("复制消息"));
  await userEvent.click(screen.getByRole("button", { name: "复制代码" }));

  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async () => {
        throw new Error("denied");
      },
    },
  });
  rerender(
    <MessageBubble
      item={{ ...item, id: "m2" }}
      session={session}
      sessionId="s1"
    />,
  );

  await userEvent.click(screen.getByTitle("复制消息"));
  await userEvent.click(screen.getByRole("button", { name: "复制代码" }));
});

test("orchestrator message shows Title Case name plus a 主控 role badge", () => {
  const session = createSession({ id: "s1", title: "t", model: "m" });
  // orchestrator agent already seeded by createSession under ORCHESTRATOR_ID.
  const item = agentMessage({ agentId: "orchestrator" });

  const { container } = render(
    <MessageBubble item={item} session={session} sessionId="s1" />,
  );

  expect(screen.getByText("Orchestrator")).toBeTruthy();
  const badge = container.querySelector(".cmsg-role");
  expect(badge?.textContent).toBe("主控");
});

test("subagent message derives name from role and shows a 分身 badge", () => {
  const session = createSession({ id: "s1", title: "t", model: "m" });
  session.agents.a1 = createAgent({
    id: "a1",
    role: "code-review",
    skin: "scout",
  });
  const item = agentMessage({ agentId: "a1" });

  const { container } = render(
    <MessageBubble item={item} session={session} sessionId="s1" />,
  );

  expect(screen.getByText("Code Review")).toBeTruthy();
  const badge = container.querySelector(".cmsg-role");
  expect(badge?.textContent).toBe("分身");
});

test("user message shows 你 and no role badge", () => {
  const session = createSession({ id: "s1", title: "t", model: "m" });
  const item = agentMessage({ role: "user", text: "hello" });

  const { container } = render(
    <MessageBubble item={item} session={session} sessionId="s1" />,
  );

  expect(screen.getByText("你")).toBeTruthy();
  expect(container.querySelector(".cmsg-role")).toBeNull();
});

test("user message exposes a 重发 button that sends retryFrom with the bubble id", async () => {
  FakeWebSocket.instances = [];
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  connection = connectRoom("ws://roguent.test");

  const session = createSession({ id: "s1", title: "t", model: "m" });
  const item = agentMessage({ id: "42", role: "user", text: "redo this" });

  render(<MessageBubble item={item} session={session} sessionId="s1" />);

  await userEvent.click(screen.getByRole("button", { name: "重发" }));

  const sent = FakeWebSocket.instances[0]?.sent.map((raw) =>
    JSON.parse(raw),
  ) as Array<Record<string, unknown>>;
  expect(sent.at(-1)).toMatchObject({
    cmd: "retryFrom",
    sessionId: "s1",
    timelineItemId: "42",
  });
});

test("assistant message has no 重发 button", () => {
  const session = createSession({ id: "s1", title: "t", model: "m" });
  const item = agentMessage({ id: "43", role: "assistant", text: "an answer" });

  render(<MessageBubble item={item} session={session} sessionId="s1" />);

  expect(screen.queryByRole("button", { name: "重发" })).toBeNull();
});

test("editing a user message resends retryFrom with the edited text", async () => {
  FakeWebSocket.instances = [];
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  connection = connectRoom("ws://roguent.test");

  const session = createSession({ id: "s1", title: "t", model: "m" });
  const item = agentMessage({ id: "42", role: "user", text: "redo this" });

  render(<MessageBubble item={item} session={session} sessionId="s1" />);

  await userEvent.click(screen.getByRole("button", { name: "编辑" }));

  const textarea = screen.getByRole("textbox");
  expect((textarea as HTMLTextAreaElement).value).toBe("redo this");

  await userEvent.clear(textarea);
  await userEvent.type(textarea, "do it differently");
  await userEvent.click(screen.getByRole("button", { name: "保存" }));

  const sent = FakeWebSocket.instances[0]?.sent.map((raw) =>
    JSON.parse(raw),
  ) as Array<Record<string, unknown>>;
  expect(sent.at(-1)).toMatchObject({
    cmd: "retryFrom",
    sessionId: "s1",
    timelineItemId: "42",
    text: "do it differently",
  });
  // exits edit mode after save
  expect(screen.queryByRole("textbox")).toBeNull();
});

test("cancelling an edit sends nothing and restores the view", async () => {
  FakeWebSocket.instances = [];
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  connection = connectRoom("ws://roguent.test");

  const session = createSession({ id: "s1", title: "t", model: "m" });
  const item = agentMessage({ id: "42", role: "user", text: "redo this" });

  render(<MessageBubble item={item} session={session} sessionId="s1" />);

  await userEvent.click(screen.getByRole("button", { name: "编辑" }));
  await userEvent.type(screen.getByRole("textbox"), " extra");
  await userEvent.click(screen.getByRole("button", { name: "取消" }));

  expect(screen.queryByRole("textbox")).toBeNull();
  const sent = FakeWebSocket.instances[0]?.sent ?? [];
  expect(sent).toEqual([]);
});

test("saving an unchanged edit sends nothing and exits edit mode", async () => {
  FakeWebSocket.instances = [];
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  connection = connectRoom("ws://roguent.test");

  const session = createSession({ id: "s1", title: "t", model: "m" });
  const item = agentMessage({ id: "42", role: "user", text: "redo this" });

  render(<MessageBubble item={item} session={session} sessionId="s1" />);

  await userEvent.click(screen.getByRole("button", { name: "编辑" }));
  await userEvent.click(screen.getByRole("button", { name: "保存" }));

  expect(screen.queryByRole("textbox")).toBeNull();
  const sent = FakeWebSocket.instances[0]?.sent ?? [];
  expect(sent).toEqual([]);
});

test("assistant message has no 编辑 button", () => {
  const session = createSession({ id: "s1", title: "t", model: "m" });
  const item = agentMessage({ id: "43", role: "assistant", text: "an answer" });

  render(<MessageBubble item={item} session={session} sessionId="s1" />);

  expect(screen.queryByRole("button", { name: "编辑" })).toBeNull();
});

test("clicking 置顶 pins the message in the per-session store; toggling off unpins", async () => {
  const session = createSession({ id: "s1", title: "t", model: "m" });
  const item = agentMessage({ id: "42", role: "assistant", text: "keep me" });

  render(<MessageBubble item={item} session={session} sessionId="s1" />);

  // initially unpinned: button reads 置顶, store empty
  const pinBtn = screen.getByRole("button", { name: "置顶" });
  expect(usePinnedStore.getState().pinnedBySession).toEqual({});

  await userEvent.click(pinBtn);
  expect(usePinnedStore.getState().pinnedBySession).toEqual({ s1: ["42"] });
  // button flips to 取消置顶 and is pressed
  const unpinBtn = screen.getByRole("button", { name: "取消置顶" });
  expect(unpinBtn.getAttribute("aria-pressed")).toBe("true");

  await userEvent.click(unpinBtn);
  expect(usePinnedStore.getState().pinnedBySession).toEqual({});
  expect(
    screen.getByRole("button", { name: "置顶" }).getAttribute("aria-pressed"),
  ).toBe("false");
});

test("user messages can also be pinned (pin available on both roles)", async () => {
  const session = createSession({ id: "s1", title: "t", model: "m" });
  const item = agentMessage({ id: "7", role: "user", text: "my question" });

  render(<MessageBubble item={item} session={session} sessionId="s1" />);

  await userEvent.click(screen.getByRole("button", { name: "置顶" }));
  expect(usePinnedStore.getState().pinnedBySession).toEqual({ s1: ["7"] });
});

test("a pre-pinned message renders the 取消置顶 affordance and the pinned class", () => {
  usePinnedStore.setState({ pinnedBySession: { s1: ["42"] } });
  const session = createSession({ id: "s1", title: "t", model: "m" });
  const item = agentMessage({ id: "42", role: "assistant", text: "kept" });

  const { container } = render(
    <MessageBubble item={item} session={session} sessionId="s1" />,
  );

  expect(screen.getByRole("button", { name: "取消置顶" })).toBeTruthy();
  expect(container.querySelector(".cmsg.pinned")).toBeTruthy();
});

test("a user message with attachments renders a chip per attachment", () => {
  const session = createSession({ id: "s1", title: "t", model: "m" });
  const item = agentMessage({
    id: "9",
    role: "user",
    text: "see these",
    attachments: [
      { name: "a.png", mediaType: "image/png" },
      { name: "b.jpg", mediaType: "image/jpeg" },
    ],
  });

  const { container } = render(
    <MessageBubble item={item} session={session} sessionId="s1" />,
  );

  const chips = container.querySelectorAll(".cmsg-attach");
  expect(chips.length).toBe(2);
  expect(screen.getByText("a.png")).toBeTruthy();
  expect(screen.getByText("b.jpg")).toBeTruthy();
});

test("an attachment chip renders an inline image preview only for known media types via a data: URL", () => {
  const session = createSession({ id: "s1", title: "t", model: "m" });
  const item = agentMessage({
    id: "9",
    role: "user",
    text: "",
    attachments: [
      { name: "a.png", mediaType: "image/png", dataBase64: "QUJD" },
    ],
  });

  const { container } = render(
    <MessageBubble item={item} session={session} sessionId="s1" />,
  );

  const img = container.querySelector(".cmsg-attach img") as HTMLImageElement;
  expect(img).toBeTruthy();
  expect(img.getAttribute("src")).toBe("data:image/png;base64,QUJD");
});

test("an attachment with an unknown media type never produces an img/data URL", () => {
  const session = createSession({ id: "s1", title: "t", model: "m" });
  const item = agentMessage({
    id: "9",
    role: "user",
    text: "",
    attachments: [
      {
        name: "evil.svg",
        mediaType: "image/svg+xml",
        dataBase64: "PHN2Zz4=",
      },
    ],
  });

  const { container } = render(
    <MessageBubble item={item} session={session} sessionId="s1" />,
  );

  // Chip still shows the name, but no <img> / data: URL is injected.
  expect(screen.getByText("evil.svg")).toBeTruthy();
  expect(container.querySelector(".cmsg-attach img")).toBeNull();
});

test("a message without attachments renders no attachment chips", () => {
  const session = createSession({ id: "s1", title: "t", model: "m" });
  const item = agentMessage({ id: "9", role: "user", text: "plain" });

  const { container } = render(
    <MessageBubble item={item} session={session} sessionId="s1" />,
  );

  expect(container.querySelector(".cmsg-attach")).toBeNull();
});
