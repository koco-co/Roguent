import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RoomEvent, SessionCreatedPayload } from "../shared/events";
import { Replayer } from "./import";
import { SessionManager } from "./session";
import type { TimedDraft } from "./transcript";

test("Replayer caps long gaps at 2s and scales by speed", async () => {
  const drafts: TimedDraft[] = [
    { type: "session.created", payload: {}, ts: 0 },
    { type: "message.delta", payload: { text: "a" }, ts: 100 }, // gap 100
    { type: "message.delta", payload: { text: "b" }, ts: 999100 }, // gap capped → 2000
  ];
  const slept: number[] = [];
  const emitted: TimedDraft[] = [];
  const r = new Replayer(drafts, 2, {
    emit: (d) => emitted.push(d),
    sleep: async (ms) => {
      slept.push(ms);
    },
  });
  await r.run();
  expect(emitted).toHaveLength(3);
  // speed=2：gap 100 → 50ms；capped 2000 → 1000ms。
  expect(slept).toEqual([50, 1000]);
});

test("setSpeed mid-flight changes subsequent pacing", async () => {
  const drafts: TimedDraft[] = [
    { type: "session.created", payload: {}, ts: 0 },
    { type: "message.delta", payload: { text: "a" }, ts: 1000 },
    { type: "message.delta", payload: { text: "b" }, ts: 2000 },
  ];
  const slept: number[] = [];
  const r = new Replayer(drafts, 1, {
    emit: () => {},
    sleep: async (ms) => {
      slept.push(ms);
      if (slept.length === 1) r.setSpeed(4); // 提速后第二段 1000/4=250
    },
  });
  await r.run();
  expect(slept).toEqual([1000, 250]);
});

test("SessionManager.importSession stamps seq, injects project, broadcasts in order", async () => {
  const dir = mkdtempSync(join(tmpdir(), "roguent-imp-"));
  const path = join(dir, "t.jsonl");
  writeFileSync(
    path,
    `${JSON.stringify({ type: "user", timestamp: "2026-06-05T10:00:00Z", cwd: dir, message: { role: "user", content: "go" } })}\n${JSON.stringify({ type: "assistant", timestamp: "2026-06-05T10:00:00Z", message: { role: "assistant", content: [{ type: "text", text: "ok" }] } })}\n`,
  );
  const got: RoomEvent[] = [];
  const mgr = new SessionManager();
  mgr.subscribe((e) => got.push(e));
  await mgr.importSession("imp1", path, 1, { sleep: async () => {} });

  expect(got[0]?.type).toBe("session.created");
  expect(got[0]?.seq).toBe(1);
  expect(got[1]?.seq).toBe(2);
  // project 由 SessionManager 注入（projectFor(cwd)）。
  expect((got[0]?.payload as SessionCreatedPayload).project).toBeDefined();
  expect(got.some((e) => e.type === "message.delta")).toBe(true);
});

test("Replayer.cancel() stops further emission", async () => {
  const drafts: TimedDraft[] = [
    { type: "session.created", payload: {}, ts: 0 },
    { type: "message.delta", payload: { text: "a" }, ts: 1000 },
    { type: "message.delta", payload: { text: "b" }, ts: 2000 },
  ];
  const emitted: TimedDraft[] = [];
  const r = new Replayer(drafts, 1, {
    emit: (d) => emitted.push(d),
    sleep: async () => {
      if (emitted.length === 1) r.cancel(); // cancel after first emit
    },
  });
  await r.run();
  expect(emitted).toHaveLength(1);
});

test("deleteSession cancels an in-flight import (no further events)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "roguent-impdel-"));
  const path = join(dir, "t.jsonl");
  writeFileSync(
    path,
    `${JSON.stringify({ type: "user", timestamp: "2026-06-05T10:00:00Z", cwd: dir, message: { role: "user", content: "go" } })}\n${JSON.stringify({ type: "assistant", timestamp: "2026-06-05T10:00:10Z", message: { role: "assistant", content: [{ type: "text", text: "late" }] } })}\n`,
  );
  const got: RoomEvent[] = [];
  const mgr = new SessionManager();
  mgr.subscribe((e) => got.push(e));
  // sleep that deletes the session on the first gap, before the assistant delta is emitted.
  await mgr.importSession("impDel", path, 1, {
    sleep: async () => {
      mgr.deleteSession("impDel");
    },
  });
  expect(got.some((e) => e.type === "message.delta")).toBe(false);
});
