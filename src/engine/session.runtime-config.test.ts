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
  const driver = driverStub();
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
});

test("setRuntimeConfig reports driver setter failures as session errors", async () => {
  const driver = driverStub({
    async setSandboxMode() {
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
