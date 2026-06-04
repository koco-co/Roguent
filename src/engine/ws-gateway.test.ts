import { expect, test } from "bun:test";
import { parseCommand } from "./ws-gateway";

test("parseCommand accepts known commands and rejects junk", () => {
  expect(
    parseCommand('{"cmd":"sendMessage","sessionId":"s1","text":"hi"}'),
  ).toEqual({ cmd: "sendMessage", sessionId: "s1", text: "hi" });
  expect(
    parseCommand(
      '{"cmd":"setModel","sessionId":"s1","model":"claude-opus-4-8"}',
    )?.cmd,
  ).toBe("setModel");
  expect(parseCommand("not json")).toBeNull();
  expect(parseCommand('{"cmd":"explode"}')).toBeNull();
});
