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

function fakeRuntimeManager(captured: {
  cb?: DriverCallbacks;
  config?: RuntimeDriverConfigInput;
  driver?: IDriver;
}): RuntimeDriverCreator {
  return {
    createDriver(
      cb: DriverCallbacks,
      config: RuntimeDriverConfigInput,
    ): IDriver {
      captured.cb = cb;
      captured.config = config;
      captured.driver ??= driverStub();
      return captured.driver;
    },
  };
}

test("interrupt calls the runtime driver and emits stopped runtime status", async () => {
  let interruptCalls = 0;
  const captured: { driver?: IDriver } = {
    driver: driverStub({
      async interrupt() {
        interruptCalls += 1;
      },
    }),
  };
  const mgr = new SessionManager(fakeRuntimeManager(captured), "/tmp");
  const got: RoomEvent[] = [];
  mgr.subscribe((event) => got.push(event));
  mgr.createSession("s1", { title: "Task", model: "m", runtime: "codex" });

  await mgr.interrupt("s1");

  expect(interruptCalls).toBe(1);
  expect(got.at(-1)).toMatchObject({
    sessionId: "s1",
    type: "runtime.status",
    payload: {
      runtime: "codex",
      status: "stopped",
      message: "Interrupted",
    },
  });
});

test("rollback rejects unknown local checkpoints before touching the driver", async () => {
  let rollbackCalls = 0;
  const captured: { driver?: IDriver } = {
    driver: driverStub({
      async rollback() {
        rollbackCalls += 1;
      },
    } as Partial<IDriver>),
  };
  const mgr = new SessionManager(fakeRuntimeManager(captured), "/tmp");
  const got: RoomEvent[] = [];
  mgr.subscribe((event) => got.push(event));
  mgr.createSession("s1", { title: "Task", model: "m" });

  await mgr.rollback("s1", "missing-checkpoint");

  expect(rollbackCalls).toBe(0);
  expect(got.at(-1)).toMatchObject({
    sessionId: "s1",
    type: "session.error",
    payload: {
      message: "Rollback checkpoint is not locally known: missing-checkpoint",
    },
  });
});

test("rollback emits an explicit unsupported runtime error for known checkpoints", async () => {
  const captured: { cb?: DriverCallbacks } = {};
  const mgr = new SessionManager(fakeRuntimeManager(captured), "/tmp");
  const got: RoomEvent[] = [];
  mgr.subscribe((event) => got.push(event));
  mgr.createSession("s1", { title: "Task", model: "m", runtime: "claude" });
  captured.cb?.onDraft(
    [{ type: "message.final", payload: { text: "known reply" } }],
    10,
  );

  await mgr.rollback("s1", "2");

  expect(got.at(-1)).toMatchObject({
    sessionId: "s1",
    type: "session.error",
    payload: { message: "Rollback is not supported by claude runtime" },
  });
});

test("rollback calls supported runtime with known checkpoint and emits rollback event", async () => {
  const rollbackIds: string[] = [];
  const captured: { cb?: DriverCallbacks; driver?: IDriver } = {
    driver: driverStub({
      async rollback(checkpointId: string) {
        rollbackIds.push(checkpointId);
      },
    } as Partial<IDriver>),
  };
  const mgr = new SessionManager(fakeRuntimeManager(captured), "/tmp");
  const got: RoomEvent[] = [];
  mgr.subscribe((event) => got.push(event));
  mgr.createSession("s1", { title: "Task", model: "m" });
  captured.cb?.onDraft(
    [{ type: "message.final", payload: { text: "checkpoint" } }],
    10,
  );

  await mgr.rollback("s1", "2");

  expect(rollbackIds).toEqual(["2"]);
  expect(got.at(-1)).toMatchObject({
    sessionId: "s1",
    type: "session.rolled_back",
    payload: { checkpointId: "2" },
  });
});

test("retryFrom reuses the same session text and appends a session-visible audit record", () => {
  const sent: string[] = [];
  const captured: { cb?: DriverCallbacks; driver?: IDriver } = {
    driver: driverStub({
      send(text: string) {
        sent.push(text);
      },
    }),
  };
  const mgr = new SessionManager(fakeRuntimeManager(captured), "/tmp");
  const got: RoomEvent[] = [];
  mgr.subscribe((event) => got.push(event));
  mgr.createSession("s1", { title: "Task", model: "m" });
  captured.cb?.onDraft(
    [{ type: "message.final", payload: { text: "try this again" } }],
    10,
  );

  mgr.retryFrom("s1", "2");

  expect(sent).toEqual(["try this again"]);
  expect(got.at(-1)).toMatchObject({
    sessionId: "s1",
    type: "message.final",
    payload: {
      role: "system",
      text: "Audit: retryFrom resent timeline item 2 in session s1",
    },
  });
});

test("retryFrom emits a clear error for unknown timeline item ids", () => {
  const sent: string[] = [];
  const captured: { driver?: IDriver } = {
    driver: driverStub({
      send(text: string) {
        sent.push(text);
      },
    }),
  };
  const mgr = new SessionManager(fakeRuntimeManager(captured), "/tmp");
  const got: RoomEvent[] = [];
  mgr.subscribe((event) => got.push(event));
  mgr.createSession("s1", { title: "Task", model: "m" });

  mgr.retryFrom("s1", "missing");

  expect(sent).toEqual([]);
  expect(got.at(-1)).toMatchObject({
    sessionId: "s1",
    type: "session.error",
    payload: {
      message:
        "Cannot retry from unknown or non-message timeline item: missing",
    },
  });
});
