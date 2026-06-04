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

  expect(got).toHaveLength(1);
  expect(got[0]?.seq).toBe(1);
  expect(got[0]?.sessionId).toBe("s1");
  expect(got[0]?.agentId).toBe("ag-1");
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

  expect(got[0]?.type).toBe("session.created");
  expect((got[0]?.payload as { title: string }).title).toBe(
    "code-review · kata",
  );
});
