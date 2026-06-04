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
