import { expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { WeChatConnectorError } from "./wechat";
import {
  type WeChatHostRequest,
  WeChatNodeHostConnector,
  type WeChatNodeHostProcess,
  type WeChatNodeHostSpawn,
  createWeChatConnector,
  parseNodeMajorVersion,
} from "./wechat-node-host";
import type { ImConnectorEvent, PairingQrState } from "./wechat-types";

test("parseNodeMajorVersion accepts common node version output", () => {
  expect(parseNodeMajorVersion("v22.11.0")).toBe(22);
  expect(parseNodeMajorVersion("22.3.1\n")).toBe(22);
  expect(parseNodeMajorVersion("not-node")).toBeNull();
});

test("startPairing blocks when Node major is below 22 and emits status", async () => {
  const fake = new FakeNodeHost();
  const connector = new WeChatNodeHostConnector({
    nodeVersion: "v20.19.0",
    spawn: fake.spawn,
    now: () => 1_717_452_000_000,
  });

  await expect(connector.startPairing("s1")).rejects.toMatchObject({
    code: "node_unavailable",
  });

  expect(fake.children).toHaveLength(0);
  expect(connector.observedEvents).toContainEqual({
    type: "status",
    status: expect.objectContaining({
      channel: "wechat",
      state: "error",
      error: "Node.js >=22 required for WeChat fallback host, got 20",
    }),
  });
});

test("startPairing sends newline JSON to the node host and resolves response", async () => {
  const fake = new FakeNodeHost();
  const connector = new WeChatNodeHostConnector({
    nodeVersion: "v22.11.0",
    spawn: fake.spawn,
    hostPath: "/tmp/wechat-node-host.mjs",
  });

  const pairing = connector.startPairing("s1");
  await waitFor(() => fake.requests.length === 1);
  const request = fake.requests[0];
  expect(fake.spawned).toEqual({
    command: "node",
    args: ["/tmp/wechat-node-host.mjs"],
  });
  expect(request).toMatchObject({ type: "startPairing", sessionId: "s1" });

  fake.respond(request?.id ?? "", {
    id: "qr1",
    channel: "wechat",
    sessionId: "s1",
    status: "pending",
    url: "https://wechat.example/qr",
  } satisfies PairingQrState);

  await expect(pairing).resolves.toMatchObject({
    channel: "wechat",
    sessionId: "s1",
    url: "https://wechat.example/qr",
  });
});

test("host event envelopes fan out through ImConnector events", async () => {
  const fake = new FakeNodeHost();
  const connector = new WeChatNodeHostConnector({
    nodeVersion: "v22.11.0",
    spawn: fake.spawn,
  });
  const observed: ImConnectorEvent[] = [];
  connector.onEvent((event) => {
    observed.push(event);
  });

  const pairing = connector.startPairing("s1");
  await waitFor(() => fake.requests.length === 1);
  fake.respond(fake.requests[0]?.id ?? "", {
    id: "qr1",
    channel: "wechat",
    sessionId: "s1",
    status: "pending",
  } satisfies PairingQrState);
  await pairing;

  fake.emitEvent({
    type: "message",
    event: {
      id: "in1",
      channel: "wechat",
      direction: "inbound",
      externalChatId: "chat1",
      summary: "hi",
      bodyText: "hi",
      receivedAt: 1,
    },
  });

  await waitFor(() => observed.some((event) => event.type === "message"));
  expect(observed.at(-1)).toMatchObject({
    type: "message",
    event: { externalChatId: "chat1", bodyText: "hi" },
  });
});

test("host crash rejects pending requests, emits status, and allows restart", async () => {
  const fake = new FakeNodeHost();
  const connector = new WeChatNodeHostConnector({
    nodeVersion: "v22.11.0",
    spawn: fake.spawn,
    requestTimeoutMs: 100,
    now: () => 1_717_452_000_000,
  });

  const first = connector.startPairing("s1");
  await waitFor(() => fake.requests.length === 1);
  fake.children[0]?.exit(1);

  await expect(first).rejects.toMatchObject({ code: "host_unavailable" });
  expect(connector.observedEvents).toContainEqual({
    type: "status",
    status: expect.objectContaining({
      channel: "wechat",
      state: "error",
      error: "WeChat Node host exited code=1 signal=null",
    }),
  });

  const second = connector.startPairing("s2");
  await waitFor(() => fake.children.length === 2 && fake.requests.length === 2);
  fake.respond(fake.requests[1]?.id ?? "", {
    id: "qr2",
    channel: "wechat",
    sessionId: "s2",
    status: "pending",
  } satisfies PairingQrState);

  await expect(second).resolves.toMatchObject({ sessionId: "s2" });
});

test("createWeChatConnector falls back to Node host on Bun incompatibility", async () => {
  const node = new RecordingConnector();
  const connector = createWeChatConnector({
    bun: new ThrowingBunConnector(),
    node,
  });

  const qr = await connector.startPairing("s1");

  expect(qr).toMatchObject({ sessionId: "s1", channel: "wechat" });
  expect(node.startPairingCalls).toEqual(["s1"]);
});

test("fallback connector switches outbound delivery to Node host on Bun incompatibility", async () => {
  const node = new RecordingConnector();
  const connector = createWeChatConnector({
    bun: new ThrowingSendBunConnector(),
    node,
  });

  const result = await connector.sendMessage(
    { externalChatId: "chat1" },
    "ship it",
  );

  expect(result).toMatchObject({ externalChatId: "chat1", channel: "wechat" });
  expect(node.sendMessageCalls).toEqual([
    { externalChatId: "chat1", text: "ship it" },
  ]);
});

class FakeNodeHostProcess
  extends EventEmitter
  implements WeChatNodeHostProcess
{
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  killed = false;

  kill(): boolean {
    this.killed = true;
    this.exit(0);
    return true;
  }

  exit(code: number): void {
    this.emit("exit", code, null);
    this.stdin.end();
    this.stdout.end();
    this.stderr.end();
  }
}

class FakeNodeHost {
  readonly children: FakeNodeHostProcess[] = [];
  readonly requests: WeChatHostRequest[] = [];
  spawned: { command: string; args: string[] } | null = null;

  readonly spawn: WeChatNodeHostSpawn = (command, args) => {
    const child = new FakeNodeHostProcess();
    this.spawned = { command, args };
    this.children.push(child);
    let buffer = "";
    child.stdin.on("data", (chunk) => {
      buffer += String(chunk);
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) this.requests.push(JSON.parse(line));
      }
    });
    return child;
  };

  respond(id: string, result: unknown): void {
    this.current.stdout.write(`${JSON.stringify({ id, ok: true, result })}\n`);
  }

  emitEvent(event: ImConnectorEvent): void {
    this.current.stdout.write(`${JSON.stringify({ type: "event", event })}\n`);
  }

  private get current(): FakeNodeHostProcess {
    const child = this.children.at(-1);
    if (!child) throw new Error("No fake child");
    return child;
  }
}

class RecordingConnector {
  readonly startPairingCalls: string[] = [];
  readonly sendMessageCalls: Array<{ externalChatId: string; text: string }> =
    [];
  readonly handlers = new Set<
    (event: ImConnectorEvent) => void | Promise<void>
  >();

  async startPairing(sessionId: string): Promise<PairingQrState> {
    this.startPairingCalls.push(sessionId);
    return {
      id: `qr-${sessionId}`,
      channel: "wechat",
      sessionId,
      status: "pending",
    };
  }

  async stopPairing(): Promise<void> {}

  async sendMessage(
    target: { externalChatId: string },
    text: string,
  ): Promise<{
    id: string;
    channel: "wechat";
    externalChatId: string;
    status: "delivered";
    sentAt: number;
  }> {
    this.sendMessageCalls.push({ externalChatId: target.externalChatId, text });
    return {
      id: "outbound-1",
      channel: "wechat" as const,
      externalChatId: target.externalChatId,
      status: "delivered" as const,
      sentAt: 1,
    };
  }

  onEvent(
    handler: (event: ImConnectorEvent) => void | Promise<void>,
  ): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
}

class ThrowingBunConnector extends RecordingConnector {
  override async startPairing(): Promise<PairingQrState> {
    throw new WeChatConnectorError(
      "wechat_bun_incompatible",
      "Bun cannot run this SDK",
    );
  }
}

class ThrowingSendBunConnector extends RecordingConnector {
  override async sendMessage(): Promise<never> {
    throw new WeChatConnectorError(
      "wechat_bun_incompatible",
      "Bun cannot deliver with this SDK",
    );
  }
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > 1000) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}
