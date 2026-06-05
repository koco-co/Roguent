import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MessagePayload, RoomEvent } from "../shared/events";
import type { SessionCreatedPayload } from "../shared/events";
import { SessionManager } from "./session";

test("importSession stamps seq, injects project, emits the whole history in order", () => {
  const dir = mkdtempSync(join(tmpdir(), "roguent-imp-"));
  const path = join(dir, "t.jsonl");
  writeFileSync(
    path,
    `${JSON.stringify({ type: "user", timestamp: "2026-06-05T10:00:00Z", cwd: dir, message: { role: "user", content: "go" } })}\n${JSON.stringify({ type: "assistant", timestamp: "2026-06-05T10:00:00Z", message: { role: "assistant", content: [{ type: "text", text: "ok" }] } })}\n`,
  );
  const got: RoomEvent[] = [];
  const mgr = new SessionManager();
  mgr.subscribe((e) => got.push(e));
  mgr.importSession("imp1", path);

  expect(got[0]?.type).toBe("session.created");
  expect(got[0]?.seq).toBe(1);
  expect(got[1]?.seq).toBe(2);
  // project 由 SessionManager 注入（projectFor(cwd)）。
  expect((got[0]?.payload as SessionCreatedPayload).project).toBeDefined();

  // 用户轮次与助手轮次都进了聊天历史(云存档同步式回看)。
  const msgs = got.filter((e) => e.type === "message.delta");
  expect((msgs[0]?.payload as MessagePayload).role).toBe("user");
  expect((msgs[0]?.payload as MessagePayload).text).toBe("go");
  expect(
    msgs.some((e) => (e.payload as MessagePayload).role === "assistant"),
  ).toBe(true);
});

test("importSession throws on an empty/unreadable transcript (so the gateway can surface importError)", () => {
  const mgr = new SessionManager();
  const got: RoomEvent[] = [];
  mgr.subscribe((e) => got.push(e));
  expect(() =>
    mgr.importSession("nope", "/no/such/transcript-xyz.jsonl"),
  ).toThrow();
  expect(got).toHaveLength(0); // no phantom session.created emitted
});
