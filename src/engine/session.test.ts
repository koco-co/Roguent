import { expect, test } from "bun:test";
import type { AccountLimits, RoomEvent } from "../shared/events";
import type { DriverCallbacks, IDriver } from "./driver";
import { ClaudeDriver } from "./runtime/claude-driver";
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
}): RuntimeDriverCreator {
  return {
    createDriver(
      cb: DriverCallbacks,
      config: RuntimeDriverConfigInput,
    ): IDriver {
      captured.cb = cb;
      captured.config = config;
      return driverStub();
    },
  };
}

test("createSession wires a driver; drafts become sequenced RoomEvents", () => {
  const captured: { cb?: DriverCallbacks } = {};
  const mgr = new SessionManager(fakeRuntimeManager(captured), "/tmp");
  const got: RoomEvent[] = [];
  mgr.subscribe((e) => got.push(e));

  mgr.createSession("s1", { title: "t", model: "claude-opus-4-8" });
  captured.cb?.onDraft(
    [{ type: "agent.spawned", agentId: "ag-1", payload: { role: "coder" } }],
    100,
  );

  // createSession 先合成 session.created(seq 1),agent.spawned draft 随后(seq 2)。
  expect(got).toHaveLength(2);
  expect(got[0]?.type).toBe("session.created");
  expect(got[1]?.seq).toBe(2);
  expect(got[1]?.sessionId).toBe("s1");
  expect(got[1]?.agentId).toBe("ag-1");
});

test("createSession synthesizes session.created up-front (no SDK init needed)", () => {
  const captured: { cb?: DriverCallbacks } = {};
  const mgr = new SessionManager(fakeRuntimeManager(captured), "/tmp");
  const got: RoomEvent[] = [];
  mgr.subscribe((e) => got.push(e));

  // 不投任何 driver draft —— 模拟「新建会话后用户还没发消息」,SDK init 尚未到来。
  mgr.createSession("s1", { title: "会话 1", model: "claude-opus-4-8" });

  expect(got).toHaveLength(1);
  expect(got[0]?.type).toBe("session.created");
  expect(got[0]?.sessionId).toBe("s1");
  expect((got[0]?.payload as { title: string }).title).toBe("会话 1");
  expect((got[0]?.payload as { model: string }).model).toBe("claude-opus-4-8");
});

test("session.created draft from SDK init is enriched with the user title", () => {
  const captured: { cb?: DriverCallbacks } = {};
  const mgr = new SessionManager(fakeRuntimeManager(captured), "/tmp");
  const got: RoomEvent[] = [];
  mgr.subscribe((e) => got.push(e));

  mgr.createSession("s1", { title: "code-review · kata", model: "m" });
  // SDK init 派生的 session.created 不带 title;engine 应注入建会话时的标题。
  captured.cb?.onDraft(
    [
      {
        type: "session.created",
        payload: {
          title: "",
          model: "sdk-model",
          permissionMode: "acceptEdits",
          slashCommands: ["/compact"],
        },
      },
    ],
    0,
  );

  // got[0] 是 createSession 合成的;got[1] 是 SDK init 派生并被注入 title 的。
  expect(got[1]?.type).toBe("session.created");
  const payload = got[1]?.payload as {
    title: string;
    model: string;
    permissionMode: string;
    slashCommands: string[];
  };
  expect(payload.title).toBe("code-review · kata");
  expect(payload.model).toBe("sdk-model");
  expect(payload.permissionMode).toBe("acceptEdits");
  expect(payload.slashCommands).toEqual(["/compact"]);
});

test("createSession stamps cwd + derived project onto session.created", () => {
  const captured: { cb?: DriverCallbacks } = {};
  // "/tmp" isn't a git repo → project falls back to the dir basename "tmp".
  const mgr = new SessionManager(fakeRuntimeManager(captured), "/tmp");
  const got: RoomEvent[] = [];
  mgr.subscribe((e) => got.push(e));

  mgr.createSession("s1", { title: "t", model: "m" });
  const p = got[0]?.payload as { cwd: string; project: string };
  expect(p.cwd).toBe("/tmp");
  expect(p.project).toBe("tmp");
});

test("createSession emits Claude default runtime config in session.created", () => {
  const captured: { cb?: DriverCallbacks; config?: RuntimeDriverConfigInput } =
    {};
  const mgr = new SessionManager(fakeRuntimeManager(captured), "/tmp");
  const got: RoomEvent[] = [];
  mgr.subscribe((e) => got.push(e));

  mgr.createSession("s1", { title: "t", model: "claude-opus-4-8" });

  expect(captured.config).toEqual({
    runtime: "claude",
    model: "claude-opus-4-8",
    cwd: "/tmp",
    permissionMode: "default",
    sandboxMode: "workspace-write",
    networkAccess: true,
  });
  const p = got[0]?.payload as {
    runtime: string;
    model: string;
    permissionMode: string;
    sandboxMode: string;
    networkAccess: boolean;
    approvalPolicy?: string;
    reasoningEffort?: string;
    cwd: string;
    project: string;
  };
  expect(p.runtime).toBe("claude");
  expect(p.model).toBe("claude-opus-4-8");
  expect(p.permissionMode).toBe("default");
  expect(p.sandboxMode).toBe("workspace-write");
  expect(p.networkAccess).toBe(true);
  expect(p.approvalPolicy).toBeUndefined();
  expect(p.reasoningEffort).toBeUndefined();
  expect(p.cwd).toBe("/tmp");
  expect(p.project).toBe("tmp");
});

test("createSession emits Codex runtime config and uses the Codex stub path", () => {
  const got: RoomEvent[] = [];
  const mgr = new SessionManager(
    {
      createDriver: (cb: DriverCallbacks, config: RuntimeDriverConfigInput) =>
        driverStub({
          start() {
            cb.onDraft(
              [
                {
                  type: "runtime.status",
                  payload: {
                    runtime: config.runtime,
                    status: "idle",
                    config,
                    cwd: config.cwd,
                  },
                },
              ],
              111,
            );
          },
        }),
    },
    "/tmp",
  );
  mgr.subscribe((e) => got.push(e));

  mgr.createSession("s-codex", {
    title: "Codex",
    runtime: "codex",
    model: "gpt-5",
    cwd: "/tmp/project",
    permissionMode: "default",
    approvalPolicy: "on-request",
    sandboxMode: "workspace-write",
    reasoningEffort: "medium",
    networkAccess: false,
  });

  const created = got[0]?.payload as {
    runtime: string;
    model: string;
    approvalPolicy?: string;
    sandboxMode: string;
    reasoningEffort?: string;
    networkAccess: boolean;
    cwd: string;
    project: string;
  };
  expect(got[0]?.type).toBe("session.created");
  expect(created.runtime).toBe("codex");
  expect(created.model).toBe("gpt-5");
  expect(created.approvalPolicy).toBe("on-request");
  expect(created.sandboxMode).toBe("workspace-write");
  expect(created.reasoningEffort).toBe("medium");
  expect(created.networkAccess).toBe(false);
  expect(created.cwd).toBe("/tmp/project");
  expect(created.project).toBe("project");
  expect(got[1]?.type).toBe("runtime.status");
});

test("deleteSession ends the driver and drops it", () => {
  let ended = false;
  const runtimeManager: RuntimeDriverCreator = {
    createDriver: () =>
      driverStub({
        end() {
          ended = true;
        },
      }),
  };
  const mgr = new SessionManager(runtimeManager, "/tmp");
  mgr.createSession("s1", { title: "t", model: "m" });
  mgr.deleteSession("s1");
  expect(ended).toBe(true);
  // sending after delete is a no-op (driver gone), not a throw.
  expect(() => mgr.sendMessage("s1", "hi")).not.toThrow();
});

test("emits context.updated after a turn (usage.updated), from getContextUsage", async () => {
  const events: RoomEvent[] = [];
  let cb: DriverCallbacks | null = null;
  const fakeDriver: IDriver = {
    ...driverStub(),
    getContextUsage: async () => ({
      totalTokens: 200_000,
      maxTokens: 1_000_000,
    }),
  };
  const mgr = new SessionManager(
    {
      createDriver(c: DriverCallbacks) {
        cb = c;
        return fakeDriver;
      },
    },
    "/tmp",
  );
  mgr.subscribe((e) => events.push(e));
  mgr.createSession("s1", { title: "t", model: "claude-opus-4-8" });
  // 模拟一轮结束:driver 回吐 usage.updated
  (cb as DriverCallbacks | null)?.onDraft(
    [{ type: "usage.updated", payload: { tokens: 10, cost: 0 } }],
    123,
  );
  await new Promise((r) => setTimeout(r, 0)); // flush microtasks
  const ctx = events.find((e) => e.type === "context.updated");
  expect(ctx).toBeDefined();
  expect(ctx?.payload).toEqual({
    usedTokens: 200_000,
    windowSize: 1_000_000,
    utilization: 20,
  });
});

test("driver rate_limit_event → subscribeLimits 收到合并后的 AccountLimits", () => {
  const captured: { cb?: DriverCallbacks } = {};
  const mgr = new SessionManager(fakeRuntimeManager(captured), "/tmp");
  const limits: AccountLimits[] = [];
  mgr.subscribeLimits((l) => limits.push(l));
  mgr.createSession("s1", { title: "t", model: "m" });

  // keychain 轮询先给 planName(SDK 流里没有 plan 名)
  mgr.applyPollLimits({
    planName: "Max",
    fiveHour: { utilization: null, resetsAt: null },
    sevenDay: { utilization: null, resetsAt: null },
  });
  // SDK 每轮 API 回包的真实用量(经 driver.onRateLimit 流进来)
  captured.cb?.onRateLimit?.({
    rateLimitType: "five_hour",
    utilization: 58,
    resetsAt: 1_700_000_000,
  });

  const last = limits.at(-1);
  expect(last?.planName).toBe("Max");
  expect(last?.fiveHour).toEqual({
    utilization: 58,
    resetsAt: 1_700_000_000_000,
  });
});

test("no context.updated when getContextUsage returns null", async () => {
  const events: RoomEvent[] = [];
  let cb: DriverCallbacks | null = null;
  const mgr = new SessionManager(
    {
      createDriver(c: DriverCallbacks) {
        cb = c;
        return driverStub({
          getContextUsage: async () => null,
        });
      },
    },
    "/tmp",
  );
  mgr.subscribe((e) => events.push(e));
  mgr.createSession("s1", { title: "t", model: "m" });
  (cb as DriverCallbacks | null)?.onDraft(
    [{ type: "usage.updated", payload: { tokens: 1, cost: 0 } }],
    1,
  );
  await new Promise((r) => setTimeout(r, 0));
  expect(events.some((e) => e.type === "context.updated")).toBe(false);
});

test("setModel broadcasts session.created with updated model (idempotent merge)", async () => {
  const captured: { cb?: DriverCallbacks } = {};
  const mgr = new SessionManager(fakeRuntimeManager(captured), "/tmp");
  const got: RoomEvent[] = [];
  mgr.subscribe((e) => got.push(e));

  mgr.createSession("s1", { title: "t", model: "claude-opus-4-8" });
  const before = got.length; // 1 (session.created from createSession)

  await mgr.setModel("s1", "claude-sonnet-4-5");

  // setModel must emit exactly one more session.created with the new model.
  expect(got.length).toBe(before + 1);
  const ev = got.at(-1)!;
  expect(ev.type).toBe("session.created");
  expect(ev.sessionId).toBe("s1");
  expect((ev.payload as { model: string }).model).toBe("claude-sonnet-4-5");
});

test("setModel on unknown session does not emit", async () => {
  const mgr = new SessionManager(fakeRuntimeManager({}), "/tmp");
  const got: RoomEvent[] = [];
  mgr.subscribe((e) => got.push(e));

  // No createSession — session does not exist.
  await mgr.setModel("ghost", "claude-opus-4-8");
  expect(got).toHaveLength(0);
});

test("setPermissionMode forwards to driver adapter when supported", async () => {
  const modes: string[] = [];
  const driver: IDriver & { setPermissionMode(mode: string): Promise<void> } = {
    ...driverStub(),
    async setPermissionMode(mode: string) {
      modes.push(mode);
    },
  };
  const mgr = new SessionManager({ createDriver: () => driver }, "/tmp");
  mgr.createSession("s1", { title: "t", model: "m" });

  await mgr.setPermissionMode("s1", "acceptEdits");

  expect(modes).toEqual(["acceptEdits"]);
});

test("setPermissionMode does not throw for an unsupported Claude adapter mode", async () => {
  const modes: string[] = [];
  const adapter = new ClaudeDriver({ onDraft: () => {} }, "m", "/tmp");
  (
    adapter as unknown as {
      q: { setPermissionMode: (mode: string) => Promise<void> };
    }
  ).q = {
    setPermissionMode: async (mode) => {
      modes.push(mode);
    },
  };
  const driver: IDriver = {
    ...driverStub(),
    send: adapter.send.bind(adapter),
    setModel: adapter.setModel.bind(adapter),
    setPermissionMode: adapter.setPermissionMode.bind(adapter),
    interrupt: adapter.interrupt.bind(adapter),
    end: adapter.end.bind(adapter),
    getContextUsage: adapter.getContextUsage.bind(adapter),
    askPermission: adapter.askPermission.bind(adapter),
    respondPermission: adapter.respondPermission.bind(adapter),
  };
  const mgr = new SessionManager({ createDriver: () => driver }, "/tmp");
  mgr.createSession("s1", { title: "t", model: "m" });

  await mgr.setPermissionMode("s1", "codex-auto");
  await mgr.setPermissionMode("ghost", "codex-auto");

  expect(modes).toEqual([]);
});

test("setRuntimeConfig forwards changed fields and emits runtime config update", async () => {
  const calls: string[] = [];
  const driver: IDriver = {
    ...driverStub(),
    async setModel(model: string) {
      calls.push(`model:${model}`);
    },
    async setPermissionMode(mode: string) {
      calls.push(`permission:${mode}`);
    },
    async setSandboxMode(mode: string) {
      calls.push(`sandbox:${mode}`);
    },
    async setReasoningEffort(effort: string) {
      calls.push(`reasoning:${effort}`);
    },
  };
  const mgr = new SessionManager({ createDriver: () => driver }, "/tmp");
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
    model: "gpt-5.1",
    permissionMode: "default",
    approvalPolicy: "never",
    sandboxMode: "read-only",
    reasoningEffort: "high",
    networkAccess: false,
  });

  expect(calls).toEqual([
    "model:gpt-5.1",
    "sandbox:read-only",
    "reasoning:high",
  ]);
  const event = got.at(-1);
  expect(event?.type).toBe("runtime.config.updated");
  expect(event?.sessionId).toBe("s1");
  expect(event?.payload).toMatchObject({
    config: {
      runtime: "codex",
      model: "gpt-5.1",
      permissionMode: "default",
      approvalPolicy: "never",
      sandboxMode: "read-only",
      reasoningEffort: "high",
      networkAccess: false,
    },
    changedKeys: ["model", "approvalPolicy", "sandboxMode", "reasoningEffort"],
  });
});
