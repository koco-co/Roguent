import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listLocalSessions, readTranscriptLines } from "./local-sessions";

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "roguent-cc-"));
  const proj = join(root, "-Users-me-proj");
  mkdirSync(proj);
  writeFileSync(
    join(proj, "s1.jsonl"),
    `${JSON.stringify({ type: "user", message: { role: "user", content: "hello there" } })}\n${JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "hi" }] } })}\n`,
  );
  writeFileSync(join(proj, "broken.jsonl"), "not json\n");
  return root;
}

test("listLocalSessions returns meta per .jsonl, newest first, with first-user preview", () => {
  const items = listLocalSessions(fixtureRoot());
  const s1 = items.find((i) => i.sessionId === "s1");
  expect(s1).toBeDefined();
  expect(s1?.project).toBe("-Users-me-proj");
  expect(s1?.firstMessage).toBe("hello there");
  expect(s1?.msgCount).toBe(2);
});

test("listLocalSessions on a missing root returns []", () => {
  expect(
    listLocalSessions(join(tmpdir(), "roguent-does-not-exist-xyz")),
  ).toEqual([]);
});

test("readTranscriptLines parses each JSON line and skips blanks/garbage", () => {
  const root = fixtureRoot();
  const lines = readTranscriptLines(
    join(root, "-Users-me-proj", "broken.jsonl"),
  );
  expect(lines).toEqual([]); // 唯一一行是坏的 → 跳过
});
