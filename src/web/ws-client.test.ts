import { expect, test } from "bun:test";
import type { RoomEvent } from "../shared/events";
import { handleIncoming } from "./ws-client";

test("handleIncoming applies valid events and ignores malformed", () => {
  const got: RoomEvent[] = [];
  handleIncoming(
    '{"seq":1,"ts":0,"sessionId":"s1","type":"agent.idle","payload":{}}',
    (e) => got.push(e),
  );
  handleIncoming("not json", (e) => got.push(e));
  expect(got).toHaveLength(1);
  expect(got[0]?.type).toBe("agent.idle");
});
