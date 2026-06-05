import { expect, test } from "bun:test";
import type { RoomEvent } from "../shared/events";
import type { DriverCallbacks, IDriver } from "./driver";
import { SessionManager } from "./session";

function fakeDriverFactory(captured: { cb?: DriverCallbacks }) {
  return (cb: DriverCallbacks): IDriver => {
    captured.cb = cb;
    return {
      start() {},
      send() {},
      async setModel() {},
      async interrupt() {},
      end() {},
      getContextUsage: async () => null,
    };
  };
}

test("createSession wires a driver; drafts become sequenced RoomEvents", () => {
  const captured: { cb?: DriverCallbacks } = {};
  const mgr = new SessionManager(fakeDriverFactory(captured), "/tmp");
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
  const mgr = new SessionManager(fakeDriverFactory(captured), "/tmp");
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
  const mgr = new SessionManager(fakeDriverFactory(captured), "/tmp");
  const got: RoomEvent[] = [];
  mgr.subscribe((e) => got.push(e));

  mgr.createSession("s1", { title: "code-review · kata", model: "m" });
  // SDK init 派生的 session.created 不带 title;engine 应注入建会话时的标题。
  captured.cb?.onDraft(
    [{ type: "session.created", payload: { title: "", model: "m" } }],
    0,
  );

  // got[0] 是 createSession 合成的;got[1] 是 SDK init 派生并被注入 title 的。
  expect(got[1]?.type).toBe("session.created");
  expect((got[1]?.payload as { title: string }).title).toBe(
    "code-review · kata",
  );
});

test("createSession stamps cwd + derived project onto session.created", () => {
  const captured: { cb?: DriverCallbacks } = {};
  // "/tmp" isn't a git repo → project falls back to the dir basename "tmp".
  const mgr = new SessionManager(fakeDriverFactory(captured), "/tmp");
  const got: RoomEvent[] = [];
  mgr.subscribe((e) => got.push(e));

  mgr.createSession("s1", { title: "t", model: "m" });
  const p = got[0]?.payload as { cwd: string; project: string };
  expect(p.cwd).toBe("/tmp");
  expect(p.project).toBe("tmp");
});

test("deleteSession ends the driver and drops it", () => {
  let ended = false;
  const factory = (cb: DriverCallbacks): IDriver => {
    void cb;
    return {
      start() {},
      send() {},
      async setModel() {},
      async interrupt() {},
      end() {
        ended = true;
      },
      getContextUsage: async () => null,
    };
  };
  const mgr = new SessionManager(factory, "/tmp");
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
    start() {},
    send() {},
    setModel: async () => {},
    interrupt: async () => {},
    end() {},
    getContextUsage: async () => ({
      totalTokens: 200_000,
      maxTokens: 1_000_000,
    }),
  };
  const mgr = new SessionManager(
    (c: DriverCallbacks, _model: string, _cwd: string) => {
      cb = c;
      return fakeDriver;
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

test("no context.updated when getContextUsage returns null", async () => {
  const events: RoomEvent[] = [];
  let cb: DriverCallbacks | null = null;
  const mgr = new SessionManager(
    (c: DriverCallbacks, _model: string, _cwd: string) => {
      cb = c;
      return {
        start() {},
        send() {},
        setModel: async () => {},
        interrupt: async () => {},
        end() {},
        getContextUsage: async () => null,
      };
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
