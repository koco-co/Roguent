import { expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import {
  CodexAppServerClient,
  type CodexAppServerSpawn,
  type CodexAppServerSpawnedProcess,
  CodexAppServerUnavailableError,
} from "./codex-app-server";
import type {
  CodexJsonRpcRequest,
  CodexNotification,
  CodexRuntimeEvent,
} from "./codex-protocol";
import { codexTextInput } from "./codex-protocol";

test("start spawns codex app-server over stdio and closes the process", async () => {
  const fake = new FakeCodexServer();

  const client = await CodexAppServerClient.start({
    cliPath: "/opt/codex",
    spawn: fake.spawn,
    requestTimeoutMs: 50,
  });

  expect(fake.spawned).toEqual({
    command: "/opt/codex",
    args: ["app-server", "--listen", "stdio://"],
  });
  expect(fake.requests.map((request) => request.method)).toEqual([
    "initialize",
  ]);

  await client.close();

  expect(fake.children[0]?.killed).toBe(true);
});

test("request sends incrementing ids and resolves matching responses", async () => {
  const fake = new FakeCodexServer();
  const client = await CodexAppServerClient.start({
    spawn: fake.spawn,
    requestTimeoutMs: 50,
  });

  const thread = await client.startThread({ cwd: "/tmp/project" });
  const turn = await client.startTurn(thread.thread.id, [
    codexTextInput("hello"),
  ]);

  expect(thread).toEqual({ thread: { id: "thread-1" } });
  expect(turn).toEqual({ turn: { id: "turn-1" } });
  expect(fake.requests.map((request) => request.id)).toEqual([1, 2, 3]);
  expect(fake.requests.map((request) => request.method)).toEqual([
    "initialize",
    "thread/start",
    "turn/start",
  ]);
  expect(fake.requests[1]?.params).toEqual({
    cwd: "/tmp/project",
    experimentalRawEvents: true,
    persistExtendedHistory: true,
  });
  expect(fake.requests[2]?.params).toEqual({
    threadId: "thread-1",
    input: [{ type: "text", text: "hello", text_elements: [] }],
  });

  await client.close();
});

test("send creates a thread, sends generated text input, and interrupt uses active turn", async () => {
  const fake = new FakeCodexServer();
  const client = await CodexAppServerClient.start({
    spawn: fake.spawn,
    requestTimeoutMs: 50,
  });

  await client.send("ship it");
  await client.interrupt();

  const turnStart = fake.requests.find(
    (request) => request.method === "turn/start",
  );
  expect(turnStart?.params).toEqual({
    threadId: "thread-1",
    input: [{ type: "text", text: "ship it", text_elements: [] }],
  });
  const interrupt = fake.requests.find(
    (request) => request.method === "turn/interrupt",
  );
  expect(interrupt?.params).toEqual({
    threadId: "thread-1",
    turnId: "turn-1",
  });

  await client.close();
});

test("client maps generated app-server notifications into runtime events", async () => {
  const fake = new FakeCodexServer();
  const client = await CodexAppServerClient.start({
    spawn: fake.spawn,
    requestTimeoutMs: 50,
  });
  const events: CodexRuntimeEvent[] = [];
  const unsubscribe = client.onEvent((event) => {
    events.push(event);
  });

  const thread = await client.startThread();
  await client.startTurn(thread.thread.id, [codexTextInput("hello")]);

  await waitFor(() =>
    events.some(
      (event) => event.kind === "assistant.delta" && event.text === "hello",
    ),
  );
  expect(events).toContainEqual({
    kind: "thread.started",
    threadId: "thread-1",
    thread: { id: "thread-1" },
  });
  expect(events).toContainEqual({
    kind: "turn.started",
    threadId: "thread-1",
    turnId: "turn-1",
    turn: { id: "turn-1" },
  });
  expect(events).toContainEqual({
    kind: "assistant.delta",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: "item-1",
    text: "hello",
    delta: "hello",
  });

  unsubscribe();
  await client.close();
});

test("interrupt sends a JSON-RPC request for the active thread", async () => {
  const fake = new FakeCodexServer();
  const client = await CodexAppServerClient.start({
    spawn: fake.spawn,
    requestTimeoutMs: 50,
  });

  await client.interruptTurn("thread-1", "turn-1");

  const interrupt = fake.requests.find(
    (request) => request.method === "turn/interrupt",
  );
  expect(interrupt?.params).toEqual({
    threadId: "thread-1",
    turnId: "turn-1",
  });

  await client.close();
});

test("request rejects on timeout without closing the app-server", async () => {
  const fake = new FakeCodexServer();
  fake.ignoreMethods.add("turn/never");
  const client = await CodexAppServerClient.start({
    spawn: fake.spawn,
    requestTimeoutMs: 50,
  });

  const error = await captureError(() => client.request("turn/never", {}, 10));

  expect(error.message).toContain("Codex app-server request timed out");
  expect(error.message).toContain("turn/never");
  expect(fake.children[0]?.killed).toBe(false);

  await client.close();
});

test("close rejects pending requests with an explicit client close reason", async () => {
  const fake = new FakeCodexServer();
  fake.ignoreMethods.add("turn/wait");
  const client = await CodexAppServerClient.start({
    spawn: fake.spawn,
    requestTimeoutMs: 50,
  });

  const pending = client.request("turn/wait", {}, 1000);
  await waitFor(() =>
    fake.requests.some((request) => request.method === "turn/wait"),
  );
  await client.close();

  const error = await captureError(() => pending);
  expect(error.message).toContain("Codex app-server closed by client");
  expect(fake.children[0]?.killed).toBe(true);
});

test("pending requests reject when the app-server closes", async () => {
  const fake = new FakeCodexServer();
  fake.closeOnMethods.add("turn/close");
  const client = await CodexAppServerClient.start({
    spawn: fake.spawn,
    requestTimeoutMs: 50,
  });

  const error = await captureError(() => client.request("turn/close", {}, 50));

  expect(error.message).toContain("Codex app-server closed");
});

test("stdout and stderr logs are sanitized before being emitted", async () => {
  const fake = new FakeCodexServer();
  const logs: string[] = [];

  const client = await CodexAppServerClient.start({
    spawn: fake.spawn,
    requestTimeoutMs: 50,
    onLog: (entry) => {
      logs.push(`${entry.stream}:${entry.text}`);
    },
  });
  fake.writeStdout("authorization: Bearer stdout-secret token=abc123\n");
  fake.writeStderr("password=hunter2 client_secret=stderr-secret\n");
  await waitFor(() => logs.length >= 2);

  expect(logs.join("\n")).not.toContain("stdout-secret");
  expect(logs.join("\n")).not.toContain("hunter2");
  expect(logs.join("\n")).not.toContain("stderr-secret");
  expect(logs.join("\n")).toContain("[REDACTED]");

  await client.close();
});

test("start rejects with a clear capability error when app-server cannot spawn", async () => {
  const spawn: CodexAppServerSpawn = () => {
    const child = new FakeChildProcess();
    queueMicrotask(() => {
      child.emit("error", new Error("ENOENT codex"));
    });
    return child;
  };

  const error = await captureError(() =>
    CodexAppServerClient.start({
      spawn,
      requestTimeoutMs: 10,
      startupTimeoutMs: 10,
    }),
  );

  expect(error).toBeInstanceOf(CodexAppServerUnavailableError);
  expect(error.message).toContain("Codex app-server unavailable");
  expect(error.message).toContain("codex app-server --listen stdio://");
  expect(error.message).toContain("ENOENT");
});

test("start wraps synchronous spawn failures in a clear capability error", async () => {
  const spawn: CodexAppServerSpawn = () => {
    throw new Error("spawn exploded");
  };

  const error = await captureError(() =>
    CodexAppServerClient.start({
      spawn,
      requestTimeoutMs: 10,
      startupTimeoutMs: 10,
    }),
  );

  expect(error).toBeInstanceOf(CodexAppServerUnavailableError);
  expect(error.message).toContain("Codex app-server unavailable");
  expect(error.message).toContain("spawn exploded");
});

class FakeChildProcess
  extends EventEmitter
  implements CodexAppServerSpawnedProcess
{
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  killed = false;
  private closed = false;

  kill(_signal?: NodeJS.Signals | number): boolean {
    this.killed = true;
    this.close(null);
    return true;
  }

  close(code: number | null = 0): void {
    if (this.closed) return;
    this.closed = true;
    this.stdin.end();
    this.stdout.end();
    this.stderr.end();
    this.emit("close", code, null);
  }
}

class FakeCodexServer {
  readonly children: FakeChildProcess[] = [];
  readonly requests: CodexJsonRpcRequest[] = [];
  readonly ignoreMethods = new Set<string>();
  readonly closeOnMethods = new Set<string>();
  spawned?: { command: string; args: string[] };
  private currentChild: FakeChildProcess | undefined;

  readonly spawn: CodexAppServerSpawn = (command, args) => {
    this.spawned = { command, args };
    const child = new FakeChildProcess();
    this.children.push(child);
    this.currentChild = child;
    this.bind(child);
    return child;
  };

  writeStdout(text: string): void {
    this.currentChild?.stdout.write(text);
  }

  writeStderr(text: string): void {
    this.currentChild?.stderr.write(text);
  }

  private bind(child: FakeChildProcess): void {
    let buffer = "";
    child.stdin.on("data", (chunk) => {
      buffer += String(chunk);
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        this.handle(child, JSON.parse(line) as CodexJsonRpcRequest);
      }
    });
  }

  private handle(child: FakeChildProcess, request: CodexJsonRpcRequest): void {
    this.requests.push(request);
    if (this.closeOnMethods.has(request.method)) {
      child.close(1);
      return;
    }
    if (this.ignoreMethods.has(request.method)) return;

    if (request.method === "initialize") {
      this.respond(child, request.id, {
        userAgent: "fake-codex-app-server/1.0",
      });
      return;
    }
    if (request.method === "thread/start") {
      this.respond(child, request.id, { thread: { id: "thread-1" } });
      this.notify(child, {
        method: "thread/started",
        params: { thread: { id: "thread-1" } },
      });
      return;
    }
    if (request.method === "turn/start") {
      this.respond(child, request.id, { turn: { id: "turn-1" } });
      this.notify(child, {
        method: "turn/started",
        params: { threadId: "thread-1", turn: { id: "turn-1" } },
      });
      this.notify(child, {
        method: "item/agentMessage/delta",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          itemId: "item-1",
          delta: "hello",
        },
      });
      return;
    }
    if (request.method === "turn/interrupt") {
      this.respond(child, request.id, { interrupted: true });
      return;
    }

    this.respond(child, request.id, null);
  }

  private respond(
    child: FakeChildProcess,
    id: number | string,
    result: unknown,
  ) {
    child.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
  }

  private notify(
    child: FakeChildProcess,
    notification: CodexNotification,
  ): void {
    child.stdout.write(
      `${JSON.stringify({ jsonrpc: "2.0", ...notification })}\n`,
    );
  }
}

async function captureError(run: () => Promise<unknown>): Promise<Error> {
  try {
    await run();
  } catch (error) {
    return error as Error;
  }
  throw new Error("expected promise to reject");
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 100,
): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}
