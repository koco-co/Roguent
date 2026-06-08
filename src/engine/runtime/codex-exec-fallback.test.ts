import { expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { DriverCallbacks } from "./claude-driver";
import {
  CodexExecFallbackDriver,
  type CodexExecSpawn,
  normalizeExecJsonLine,
} from "./codex-exec-fallback";
import type { DraftEvent } from "./types";

class FakeCodexExecProcess extends EventEmitter {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  killed = false;
  killedSignals: Array<NodeJS.Signals | number | undefined> = [];
  signal: NodeJS.Signals | number | undefined;
  stdinText = "";

  constructor() {
    super();
    this.stdin.on("data", (chunk) => {
      this.stdinText += String(chunk);
    });
  }

  kill(signal?: NodeJS.Signals | number): boolean {
    this.killed = true;
    this.signal = signal;
    this.killedSignals.push(signal);
    return true;
  }

  writeStdout(line: string): void {
    this.stdout.write(`${line}\n`);
  }

  writeStderr(line: string): void {
    this.stderr.write(`${line}\n`);
  }

  close(code = 0): void {
    this.stdout.end();
    this.stderr.end();
    this.emit("close", code, null);
  }
}

function collectDrafts(): {
  callbacks: DriverCallbacks;
  drafts: DraftEvent[];
} {
  const drafts: DraftEvent[] = [];
  return {
    drafts,
    callbacks: {
      onDraft(items) {
        drafts.push(...items);
      },
    },
  };
}

test("start emits degraded batch-mode Codex runtime status", () => {
  const { callbacks, drafts } = collectDrafts();
  const driver = new CodexExecFallbackDriver(callbacks, {
    runtime: "codex",
    model: "gpt-5",
    cwd: "/repo",
    permissionMode: "default",
    approvalPolicy: "on-request",
    sandboxMode: "workspace-write",
    reasoningEffort: "medium",
    networkAccess: false,
  });

  driver.start();

  expect(drafts).toHaveLength(1);
  expect(drafts[0]).toEqual({
    type: "runtime.status",
    payload: {
      runtime: "codex",
      status: "degraded",
      config: {
        runtime: "codex",
        model: "gpt-5",
        permissionMode: "default",
        approvalPolicy: "on-request",
        sandboxMode: "workspace-write",
        reasoningEffort: "medium",
        networkAccess: false,
      },
      cwd: "/repo",
      message:
        "Codex app-server unavailable; using codex exec --json batch mode.",
      metadata: {
        mode: "exec-json",
        realtime: false,
        degraded: true,
      },
    },
    raw: {
      source: "codex-exec",
      eventType: "runtime.status",
    },
  });
});

test("send runs codex exec --json once and normalizes assistant message and usage", async () => {
  const { callbacks, drafts } = collectDrafts();
  const child = new FakeCodexExecProcess();
  const calls: Array<{
    command: string;
    args: string[];
    cwd?: string;
    stdio: ["pipe", "pipe", "pipe"];
  }> = [];
  const spawn: CodexExecSpawn = (command, args, options) => {
    calls.push({ command, args, cwd: options.cwd, stdio: options.stdio });
    return child;
  };
  const driver = new CodexExecFallbackDriver(
    callbacks,
    {
      runtime: "codex",
      model: "gpt-5",
      cwd: "/repo",
      permissionMode: "default",
      approvalPolicy: "on-request",
      sandboxMode: "workspace-write",
      reasoningEffort: "medium",
      networkAccess: false,
    },
    { cliPath: "/bin/codex", spawn },
  );

  driver.send("finish task");
  child.writeStdout(
    JSON.stringify({ type: "assistant_message", text: "done" }),
  );
  child.writeStdout(
    JSON.stringify({
      type: "usage",
      usage: { inputTokens: 3, outputTokens: 4, costUsd: 0.001 },
    }),
  );
  child.close(0);

  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(calls).toEqual([
    {
      command: "/bin/codex",
      args: [
        "--model",
        "gpt-5",
        "--sandbox",
        "workspace-write",
        "--cd",
        "/repo",
        "--ask-for-approval",
        "on-request",
        "exec",
        "--json",
        "-c",
        'model_reasoning_effort="medium"',
        "-",
      ],
      cwd: "/repo",
      stdio: ["pipe", "pipe", "pipe"],
    },
  ]);
  expect(calls[0]?.args).not.toContain("finish task");
  expect(child.stdinText).toBe("finish task");
  expect(drafts).toEqual([
    {
      type: "message.final",
      payload: { text: "done" },
      raw: {
        source: "codex-exec",
        eventType: "assistant_message",
      },
    },
    {
      type: "usage.updated",
      payload: { tokens: 7, cost: 0.001 },
      raw: {
        source: "codex-exec",
        eventType: "usage",
      },
    },
  ]);
});

test("send applies Codex approval and network config as top-level CLI flags", () => {
  const { callbacks } = collectDrafts();
  const child = new FakeCodexExecProcess();
  const calls: Array<{ args: string[] }> = [];
  const spawn: CodexExecSpawn = (_command, args) => {
    calls.push({ args });
    return child;
  };
  const driver = new CodexExecFallbackDriver(
    callbacks,
    {
      runtime: "codex",
      model: "gpt-5",
      cwd: "/repo",
      permissionMode: "default",
      approvalPolicy: "never",
      sandboxMode: "workspace-write",
      reasoningEffort: "medium",
      networkAccess: true,
    },
    { spawn },
  );

  driver.send("search web");

  expect(calls[0]?.args).toEqual([
    "--model",
    "gpt-5",
    "--sandbox",
    "workspace-write",
    "--cd",
    "/repo",
    "--ask-for-approval",
    "never",
    "--search",
    "exec",
    "--json",
    "-c",
    'model_reasoning_effort="medium"',
    "-",
  ]);
});

test("setRuntimeConfig updates approval and network flags for future sends", async () => {
  const { callbacks } = collectDrafts();
  const calls: Array<{ args: string[] }> = [];
  const spawn: CodexExecSpawn = (_command, args) => {
    calls.push({ args });
    return new FakeCodexExecProcess();
  };
  const driver = new CodexExecFallbackDriver(
    callbacks,
    {
      runtime: "codex",
      model: "gpt-5",
      cwd: "/repo",
      permissionMode: "default",
      approvalPolicy: "on-request",
      sandboxMode: "workspace-write",
      reasoningEffort: "medium",
      networkAccess: false,
    },
    { spawn },
  );

  await driver.setRuntimeConfig({
    runtime: "codex",
    model: "gpt-5",
    permissionMode: "default",
    approvalPolicy: "never",
    sandboxMode: "workspace-write",
    reasoningEffort: "medium",
    networkAccess: true,
  });
  driver.send("search web");

  expect(calls[0]?.args).toContain("--search");
  expect(calls[0]?.args).toContain("never");
  expect(calls[0]?.args).not.toContain("on-request");
});

test("send uses current model sandbox and reasoning config without putting prompt in argv", async () => {
  const { callbacks } = collectDrafts();
  const child = new FakeCodexExecProcess();
  const calls: Array<{ args: string[] }> = [];
  const spawn: CodexExecSpawn = (_command, args) => {
    calls.push({ args });
    return child;
  };
  const driver = new CodexExecFallbackDriver(
    callbacks,
    {
      runtime: "codex",
      model: "gpt-5",
      cwd: "/repo",
      permissionMode: "default",
      approvalPolicy: "on-request",
      sandboxMode: "workspace-write",
      reasoningEffort: "medium",
      networkAccess: false,
    },
    { spawn },
  );

  await driver.setModel("gpt-5.1");
  await driver.setSandboxMode("read-only");
  await driver.setReasoningEffort("high");
  driver.send("secret prompt");

  expect(calls[0]?.args).toEqual([
    "--model",
    "gpt-5.1",
    "--sandbox",
    "read-only",
    "--cd",
    "/repo",
    "--ask-for-approval",
    "on-request",
    "exec",
    "--json",
    "-c",
    'model_reasoning_effort="high"',
    "-",
  ]);
  expect(calls[0]?.args).not.toContain("secret prompt");
  expect(child.stdinText).toBe("secret prompt");
});

test("runtime error redacts stderr before exposing it", async () => {
  const { callbacks, drafts } = collectDrafts();
  const child = new FakeCodexExecProcess();
  const driver = new CodexExecFallbackDriver(
    callbacks,
    {
      runtime: "codex",
      model: "gpt-5",
      cwd: "/repo",
      permissionMode: "default",
      approvalPolicy: "on-request",
      sandboxMode: "workspace-write",
      reasoningEffort: "medium",
      networkAccess: false,
    },
    { spawn: () => child },
  );

  driver.send("fail");
  child.writeStderr("token=sk-secret authorization: Bearer raw-secret");
  child.close(1);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const error = (drafts[0]?.payload as { error?: string } | undefined)?.error;
  expect(error).toContain("stderr:");
  expect(error).toContain("[REDACTED]");
  expect(error).not.toContain("sk-secret");
  expect(error).not.toContain("raw-secret");
  expect((error ?? "").length).toBeLessThanOrEqual(420);
});

test("interrupt escalates to SIGKILL when the exec child does not close", async () => {
  const { callbacks } = collectDrafts();
  const child = new FakeCodexExecProcess();
  const driver = new CodexExecFallbackDriver(
    callbacks,
    {
      runtime: "codex",
      model: "gpt-5",
      cwd: "/repo",
      permissionMode: "default",
      approvalPolicy: "on-request",
      sandboxMode: "workspace-write",
      reasoningEffort: "medium",
      networkAccess: false,
    },
    { spawn: () => child, killTimeoutMs: 1 },
  );

  driver.send("stop me");
  await driver.interrupt();
  await new Promise((resolve) => setTimeout(resolve, 5));

  expect(child.killedSignals).toEqual(["SIGTERM", "SIGKILL"]);
});

test("replacing an active exec child escalates the old child to SIGKILL", async () => {
  const { callbacks } = collectDrafts();
  const first = new FakeCodexExecProcess();
  const second = new FakeCodexExecProcess();
  const children = [first, second];
  const spawn: CodexExecSpawn = () => {
    const child = children.shift();
    if (!child) throw new Error("unexpected spawn");
    return child;
  };
  const driver = new CodexExecFallbackDriver(
    callbacks,
    {
      runtime: "codex",
      model: "gpt-5",
      cwd: "/repo",
      permissionMode: "default",
      approvalPolicy: "on-request",
      sandboxMode: "workspace-write",
      reasoningEffort: "medium",
      networkAccess: false,
    },
    { spawn, killTimeoutMs: 1 },
  );

  driver.send("first");
  driver.send("second");
  await new Promise((resolve) => setTimeout(resolve, 5));

  expect(first.killedSignals).toEqual(["SIGTERM", "SIGKILL"]);
  expect(second.killedSignals).toEqual([]);
});

test("interrupt and end kill an active exec child", async () => {
  const { callbacks } = collectDrafts();
  const child = new FakeCodexExecProcess();
  const driver = new CodexExecFallbackDriver(
    callbacks,
    {
      runtime: "codex",
      model: "gpt-5",
      cwd: "/repo",
      permissionMode: "default",
      approvalPolicy: "on-request",
      sandboxMode: "workspace-write",
      reasoningEffort: "medium",
      networkAccess: false,
    },
    { spawn: () => child },
  );

  driver.send("stop me");
  await driver.interrupt();

  expect(child.killed).toBe(true);
  expect(child.signal).toBe("SIGTERM");

  const secondChild = new FakeCodexExecProcess();
  const driver2 = new CodexExecFallbackDriver(
    callbacks,
    {
      runtime: "codex",
      model: "gpt-5",
      cwd: "/repo",
      permissionMode: "default",
      approvalPolicy: "on-request",
      sandboxMode: "workspace-write",
      reasoningEffort: "medium",
      networkAccess: false,
    },
    { spawn: () => secondChild },
  );

  driver2.send("end me");
  driver2.end();

  expect(secondChild.killed).toBe(true);
  expect(secondChild.signal).toBe("SIGTERM");
});

test("replacing an active exec child does not let the old child flush the new child's partial output", async () => {
  const { callbacks, drafts } = collectDrafts();
  const first = new FakeCodexExecProcess();
  const second = new FakeCodexExecProcess();
  const children = [first, second];
  const spawn: CodexExecSpawn = () => {
    const child = children.shift();
    if (!child) throw new Error("unexpected spawn");
    return child;
  };
  const driver = new CodexExecFallbackDriver(
    callbacks,
    {
      runtime: "codex",
      model: "gpt-5",
      cwd: "/repo",
      permissionMode: "default",
      approvalPolicy: "on-request",
      sandboxMode: "workspace-write",
      reasoningEffort: "medium",
      networkAccess: false,
    },
    { spawn },
  );

  driver.send("first");
  driver.send("second");

  second.stdout.write('{"type":"assistant_message","text":"new"');
  // Closing the interrupted first child must not flush the second child's partial JSON.
  first.close(0);
  second.stdout.write("}\n");
  second.close(0);

  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(drafts).toEqual([
    {
      type: "message.final",
      payload: { text: "new" },
      raw: {
        source: "codex-exec",
        eventType: "assistant_message",
      },
    },
  ]);
});

test("normalizes tolerant Codex exec result and nested token usage shapes", () => {
  const drafts = [
    ...normalizeExecJsonLine({
      type: "result",
      result: { output: "finished" },
    }),
    ...normalizeExecJsonLine({
      type: "token_usage",
      tokenUsage: {
        total: {
          totalTokens: 11,
          inputTokens: 5,
          outputTokens: 6,
        },
        costUsd: 0.002,
      },
    }),
  ];

  expect(drafts).toEqual([
    {
      type: "message.final",
      payload: { text: "finished" },
      raw: {
        source: "codex-exec",
        eventType: "result",
      },
    },
    {
      type: "usage.updated",
      payload: { tokens: 11, cost: 0.002 },
      raw: {
        source: "codex-exec",
        eventType: "token_usage",
      },
    },
  ]);
});
