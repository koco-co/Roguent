import { expect, test } from "bun:test";
import type { DriverCallbacks, IDriver } from "./claude-driver";
import type { CodexCapabilities } from "./codex-capabilities";
import { RuntimeManager } from "./manager";

function fakeDriver(): IDriver {
  return {
    start() {},
    send() {},
    async setModel() {},
    async setPermissionMode() {},
    async interrupt() {},
    end() {},
    getContextUsage: async () => null,
    askPermission: async () => ({ behavior: "allow" as const }),
    respondPermission() {},
  };
}

test("RuntimeManager defaults missing runtime to Claude and constructs a Claude driver", () => {
  const driver = fakeDriver();
  const calls: Array<{ model: string; cwd: string }> = [];
  const manager = new RuntimeManager({
    createClaudeDriver: (_cb: DriverCallbacks, model: string, cwd: string) => {
      calls.push({ model, cwd });
      return driver;
    },
  });

  const created = manager.createDriver(
    { onDraft() {} },
    { model: "claude-sonnet-4-5", cwd: "/tmp/project" },
  );

  expect(created).toBe(driver);
  expect(calls).toEqual([{ model: "claude-sonnet-4-5", cwd: "/tmp/project" }]);
});

test("RuntimeManager constructs a Claude driver when runtime is explicitly claude", () => {
  const driver = fakeDriver();
  let calls = 0;
  const manager = new RuntimeManager({
    createClaudeDriver: () => {
      calls += 1;
      return driver;
    },
  });

  expect(
    manager.createDriver(
      { onDraft() {} },
      {
        runtime: "claude",
        model: "claude-opus-4-8",
        cwd: "/repo",
        permissionMode: "default",
        sandboxMode: "workspace-write",
        networkAccess: true,
      },
    ),
  ).toBe(driver);
  expect(calls).toBe(1);
});

test("RuntimeManager creates a Codex stub without constructing Claude", () => {
  const drafts: Array<{ type: string; payload: unknown }> = [];
  const manager = new RuntimeManager({
    createClaudeDriver: () => {
      throw new Error("Claude driver should not be constructed for Codex");
    },
  });

  const driver = manager.createDriver(
    { onDraft: (items) => drafts.push(...items) },
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
  );

  expect(() => driver.start()).not.toThrow();
  expect(() => driver.send("hello")).not.toThrow();
  expect(drafts).toHaveLength(1);
  expect(drafts[0]?.type).toBe("runtime.status");
  const payload = drafts[0]?.payload as {
    runtime: string;
    status: string;
    config: { runtime: string; model: string };
    cwd: string;
  };
  expect(payload.runtime).toBe("codex");
  expect(payload.status).toBe("idle");
  expect(payload.config.runtime).toBe("codex");
  expect(payload.config.model).toBe("gpt-5");
  expect(payload.cwd).toBe("/repo");
});

test("RuntimeManager includes provided Codex capabilities in stub status metadata", () => {
  const drafts: Array<{ type: string; payload: unknown }> = [];
  const capabilities: CodexCapabilities = {
    cliPath: "/tmp/codex",
    version: "codex-cli 0.133.0",
    appServer: "unavailable",
    execJson: "available",
    reason: "app-server unavailable",
  };
  const manager = new RuntimeManager({ codexCapabilities: capabilities });

  const driver = manager.createDriver(
    { onDraft: (items) => drafts.push(...items) },
    { runtime: "codex", model: "gpt-5", cwd: "/repo" },
  );

  driver.start();

  const payload = drafts[0]?.payload as {
    metadata?: { capabilities?: CodexCapabilities };
  };
  expect(payload.metadata?.capabilities).toEqual(capabilities);
});
