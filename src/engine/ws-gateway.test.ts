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

test("parseCommand accepts newSession with an optional cwd", () => {
  expect(
    parseCommand(
      '{"cmd":"newSession","sessionId":"s1","title":"t","model":"m","cwd":"/repo"}',
    ),
  ).toEqual({
    cmd: "newSession",
    sessionId: "s1",
    title: "t",
    model: "m",
    cwd: "/repo",
  });
  // cwd omitted is fine (server defaults); a non-string cwd is rejected.
  expect(
    parseCommand(
      '{"cmd":"newSession","sessionId":"s1","title":"t","model":"m"}',
    )?.cmd,
  ).toBe("newSession");
  expect(
    parseCommand(
      '{"cmd":"newSession","sessionId":"s1","title":"t","model":"m","cwd":5}',
    ),
  ).toBeNull();
});

test("parseCommand accepts deleteSession", () => {
  expect(parseCommand('{"cmd":"deleteSession","sessionId":"s1"}')).toEqual({
    cmd: "deleteSession",
    sessionId: "s1",
  });
  expect(parseCommand('{"cmd":"deleteSession"}')).toBeNull();
});

test("parseCommand accepts listLocalSessions / importSession", () => {
  expect(parseCommand('{"cmd":"listLocalSessions"}')).toEqual({
    cmd: "listLocalSessions",
  });
  expect(parseCommand('{"cmd":"importSession","path":"/a/b.jsonl"}')).toEqual({
    cmd: "importSession",
    path: "/a/b.jsonl",
  });
  // 非法:path 非字符串 / 缺字段。
  expect(parseCommand('{"cmd":"importSession","path":5}')).toBeNull();
  expect(parseCommand('{"cmd":"importSession"}')).toBeNull();
});
