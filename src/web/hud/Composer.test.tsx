import { afterEach, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ImageAttachment } from "../../shared/commands";
import { createSession } from "../../shared/domain";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { type RoomConnection, connectRoom } from "../ws-client";
import { Composer } from "./Composer";
import type { ReadAttachmentResult } from "./attachments";

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

// Use happy-dom's File so synthetic input/drop/paste events carry a real Blob.
const WinFile = (globalThis as unknown as { window: { File: typeof File } })
  .window.File;

function pngFile(name = "shot.png", type = "image/png"): File {
  return new WinFile([new Uint8Array([1, 2, 3])], name, { type });
}

const okAttachment = (name: string, type = "image/png"): ImageAttachment => ({
  kind: "image",
  name,
  mediaType: type as ImageAttachment["mediaType"],
  dataBase64: "QUJD",
});

// A fake reader that maps File -> a deterministic ImageAttachment, bypassing the
// real FileReader (happy-dom's rejects Bun/cross-realm Blobs in this harness).
function fakeReadOk(): (file: File) => Promise<ReadAttachmentResult> {
  return (file) =>
    Promise.resolve({
      ok: true,
      attachment: okAttachment(file.name, file.type),
    });
}

function fakeReadReject(
  reason: "type" | "size",
): (file: File) => Promise<ReadAttachmentResult> {
  return (file) => Promise.resolve({ ok: false, reason, name: file.name });
}

function lastSent(): Record<string, unknown> | undefined {
  const raw = FakeWebSocket.instances[0]?.sent.map((r) => JSON.parse(r));
  return raw?.at(-1) as Record<string, unknown> | undefined;
}

function openWs() {
  FakeWebSocket.instances = [];
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  connection = connectRoom("ws://roguent.test");
}

test("quick reply click sends the text via the real sendMessage path", async () => {
  openWs();
  seedSession("idle");

  render(<Composer sessionId="s1" />);

  await userEvent.click(screen.getByRole("button", { name: "继续" }));

  expect(lastSent()).toEqual({
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

test("selecting an image file via the picker adds a thumbnail chip", async () => {
  seedSession("idle");
  render(<Composer sessionId="s1" readAttachment={fakeReadOk()} />);

  const input = screen.getByTestId("composer-file-input") as HTMLInputElement;
  await userEvent.upload(input, pngFile("a.png"));

  expect(screen.getByText("a.png")).toBeTruthy();
  // chip exposes a remove control
  expect(screen.getByRole("button", { name: "移除 a.png" })).toBeTruthy();
});

test("removing a chip drops the attachment", async () => {
  seedSession("idle");
  render(<Composer sessionId="s1" readAttachment={fakeReadOk()} />);

  const input = screen.getByTestId("composer-file-input") as HTMLInputElement;
  await userEvent.upload(input, pngFile("a.png"));
  expect(screen.getByText("a.png")).toBeTruthy();

  await userEvent.click(screen.getByRole("button", { name: "移除 a.png" }));
  expect(screen.queryByText("a.png")).toBeNull();
});

test("send dispatches sendMessage with attachments and then clears them", async () => {
  openWs();
  seedSession("idle");
  render(<Composer sessionId="s1" readAttachment={fakeReadOk()} />);

  const input = screen.getByTestId("composer-file-input") as HTMLInputElement;
  await userEvent.upload(input, pngFile("a.png"));

  const textarea = screen.getByRole("textbox");
  await userEvent.type(textarea, "look at this");
  await userEvent.click(screen.getByRole("button", { name: "发送" }));

  expect(lastSent()).toEqual({
    cmd: "sendMessage",
    sessionId: "s1",
    text: "look at this",
    attachments: [okAttachment("a.png")],
  });
  // attachments cleared after send
  expect(screen.queryByText("a.png")).toBeNull();
});

test("can send with attachments and empty text", async () => {
  openWs();
  seedSession("idle");
  render(<Composer sessionId="s1" readAttachment={fakeReadOk()} />);

  const input = screen.getByTestId("composer-file-input") as HTMLInputElement;
  await userEvent.upload(input, pngFile("a.png"));

  // send button enabled even with blank text because an attachment is present
  await userEvent.click(screen.getByRole("button", { name: "发送" }));

  expect(lastSent()).toEqual({
    cmd: "sendMessage",
    sessionId: "s1",
    text: "",
    attachments: [okAttachment("a.png")],
  });
});

test("send button stays disabled with no text and no attachments", () => {
  seedSession("idle");
  render(<Composer sessionId="s1" readAttachment={fakeReadOk()} />);

  const send = screen.getByRole("button", {
    name: "发送",
  }) as HTMLButtonElement;
  expect(send.disabled).toBe(true);
});

test("a wrong-type file is rejected: no chip, shows an error hint", async () => {
  // Wrong-type can only reach the handler via drag/paste — the picker's
  // `accept` attr filters it out first. Exercise the drop path here.
  seedSession("idle");
  const { container } = render(
    <Composer sessionId="s1" readAttachment={fakeReadReject("type")} />,
  );

  const dropZone = container.querySelector(".cdrawer-composer");
  if (!dropZone) throw new Error("drop zone not found");
  fireEvent.drop(dropZone, {
    dataTransfer: {
      files: [pngFile("bad.svg", "image/svg+xml")],
      items: [],
      types: ["Files"],
    },
  });

  expect(screen.queryByText("bad.svg")).toBeNull();
  // an error hint is shown (DICT key 不支持的图片类型)
  expect(await screen.findByTestId("composer-attach-error")).toBeTruthy();
});

test("an oversize file is rejected: no chip, shows an error hint", async () => {
  seedSession("idle");
  render(<Composer sessionId="s1" readAttachment={fakeReadReject("size")} />);

  const input = screen.getByTestId("composer-file-input") as HTMLInputElement;
  await userEvent.upload(input, pngFile("huge.png"));

  expect(screen.queryByText("huge.png")).toBeNull();
  expect(screen.getByTestId("composer-attach-error")).toBeTruthy();
});

test("attachment count is capped at 4", async () => {
  seedSession("idle");
  render(<Composer sessionId="s1" readAttachment={fakeReadOk()} />);

  const input = screen.getByTestId("composer-file-input") as HTMLInputElement;
  await userEvent.upload(input, [
    pngFile("1.png"),
    pngFile("2.png"),
    pngFile("3.png"),
    pngFile("4.png"),
    pngFile("5.png"),
  ]);

  // only the first 4 become chips
  expect(screen.getByText("1.png")).toBeTruthy();
  expect(screen.getByText("4.png")).toBeTruthy();
  expect(screen.queryByText("5.png")).toBeNull();
});

test("dropping an image file onto the composer adds a chip", async () => {
  seedSession("idle");
  const { container } = render(
    <Composer sessionId="s1" readAttachment={fakeReadOk()} />,
  );

  const dropZone = container.querySelector(".cdrawer-composer");
  if (!dropZone) throw new Error("drop zone not found");

  const file = pngFile("dropped.png");
  fireEvent.drop(dropZone, {
    dataTransfer: { files: [file], items: [], types: ["Files"] },
  });

  expect(await screen.findByText("dropped.png")).toBeTruthy();
});

test("pasting an image from the clipboard adds a chip", async () => {
  seedSession("idle");
  render(<Composer sessionId="s1" readAttachment={fakeReadOk()} />);

  const textarea = screen.getByRole("textbox");
  const file = pngFile("pasted.png");
  fireEvent.paste(textarea, {
    clipboardData: {
      files: [file],
      items: [{ kind: "file", type: "image/png" }],
    },
  });

  expect(await screen.findByText("pasted.png")).toBeTruthy();
});
