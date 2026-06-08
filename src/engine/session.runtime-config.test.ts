import { expect, test } from "bun:test";
import type { RoomEvent } from "../shared/events";
import type { DriverCallbacks, IDriver } from "./driver";
import type {
  RuntimeDriverConfigInput,
  RuntimeDriverCreator,
} from "./runtime/manager";
import { SessionManager } from "./session";

function driverStub(overrides: Partial<IDriver> = {}): IDriver {
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
    ...overrides,
  };
}

function runtimeManager(driver: IDriver): RuntimeDriverCreator {
  return {
    createDriver(
      _cb: DriverCallbacks,
      _config: RuntimeDriverConfigInput,
    ): IDriver {
      return driver;
    },
  };
}

test("setRuntimeConfig emits runtime.config.updated for network-only changes", async () => {
  const appliedConfigs: unknown[] = [];
  const driver = driverStub();
  driver.setRuntimeConfig = async (config) => {
    appliedConfigs.push(config);
  };
  const mgr = new SessionManager(runtimeManager(driver), "/tmp");
  const got: RoomEvent[] = [];
  mgr.subscribe((event) => got.push(event));
  mgr.createSession("s1", {
    title: "Codex",
    runtime: "codex",
    model: "gpt-5",
    approvalPolicy: "on-request",
    sandboxMode: "workspace-write",
    reasoningEffort: "medium",
    networkAccess: false,
  });

  await mgr.setRuntimeConfig("s1", {
    runtime: "codex",
    model: "gpt-5",
    permissionMode: "default",
    approvalPolicy: "on-request",
    sandboxMode: "workspace-write",
    reasoningEffort: "medium",
    networkAccess: true,
  });

  const event = got.at(-1);
  expect(event?.type).toBe("runtime.config.updated");
  expect(event?.payload).toMatchObject({
    config: { networkAccess: true },
    changedKeys: ["networkAccess"],
  });
  expect(appliedConfigs).toContainEqual(
    expect.objectContaining({
      approvalPolicy: "on-request",
      networkAccess: true,
    }),
  );
});

test("setRuntimeConfig reports driver setter failures as session errors", async () => {
  const driver = driverStub({
    async setRuntimeConfig() {
      throw new Error("sandbox backend offline");
    },
  });
  const mgr = new SessionManager(runtimeManager(driver), "/tmp");
  const got: RoomEvent[] = [];
  mgr.subscribe((event) => got.push(event));
  mgr.createSession("s1", {
    title: "Codex",
    runtime: "codex",
    model: "gpt-5",
    sandboxMode: "workspace-write",
    networkAccess: false,
  });

  await mgr.setRuntimeConfig("s1", {
    runtime: "codex",
    model: "gpt-5",
    permissionMode: "default",
    approvalPolicy: "on-request",
    sandboxMode: "read-only",
    reasoningEffort: "medium",
    networkAccess: false,
  });

  const emittedTypes = got.map((event) => event.type);
  expect(emittedTypes).not.toContain("runtime.config.updated");
  const error = got.at(-1);
  expect(error?.type).toBe("session.error");
  expect(error?.payload).toEqual({
    message: "Runtime config update failed: sandbox backend offline",
  });
});

test("setRuntimeConfig uses the aggregate driver hook instead of partial setters", async () => {
  const calls: string[] = [];
  const driver = driverStub({
    async setRuntimeConfig() {
      calls.push("config");
      throw new Error("aggregate failed");
    },
    async setModel() {
      calls.push("model");
    },
    async setPermissionMode() {
      calls.push("permission");
    },
    async setSandboxMode() {
      calls.push("sandbox");
    },
    async setReasoningEffort() {
      calls.push("reasoning");
    },
  });
  const mgr = new SessionManager(runtimeManager(driver), "/tmp");
  const got: RoomEvent[] = [];
  mgr.subscribe((event) => got.push(event));
  mgr.createSession("s1", {
    title: "Codex",
    runtime: "codex",
    model: "gpt-5",
    sandboxMode: "workspace-write",
    reasoningEffort: "medium",
    networkAccess: false,
  });

  await mgr.setRuntimeConfig("s1", {
    runtime: "codex",
    model: "gpt-5.1",
    permissionMode: "acceptEdits",
    approvalPolicy: "never",
    sandboxMode: "read-only",
    reasoningEffort: "high",
    networkAccess: true,
  });

  expect(calls).toEqual(["config"]);
  expect(got.at(-1)?.type).toBe("session.error");
});

test("context usage failures are surfaced as session errors", async () => {
  const driver = driverStub({
    getContextUsage: async () => {
      throw new Error("context unavailable");
    },
  });
  let callbacks: DriverCallbacks | undefined;
  const mgr = new SessionManager(
    {
      createDriver(cb) {
        callbacks = cb;
        return driver;
      },
    },
    "/tmp",
  );
  const got: RoomEvent[] = [];
  mgr.subscribe((event) => got.push(event));
  mgr.createSession("s1", { title: "Claude", model: "claude-opus-4-8" });

  callbacks?.onDraft(
    [{ type: "usage.updated", payload: { tokens: 1, cost: 0 } }],
    1,
  );
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(got.at(-1)?.type).toBe("session.error");
  expect(got.at(-1)?.payload).toEqual({
    message: "Context usage update failed: context unavailable",
  });
});
