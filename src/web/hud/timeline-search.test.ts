import { expect, test } from "bun:test";
import type {
  TimelineItem,
  TimelineMessageItem,
  TimelineThinkingItem,
  TimelineToolItem,
} from "../../shared/domain";
import {
  filterTimelineByPinned,
  filterTimelineByQuery,
} from "./timeline-search";

function msg(
  id: string,
  text: string,
  role: TimelineMessageItem["role"] = "assistant",
): TimelineMessageItem {
  return {
    kind: "message",
    id,
    role,
    text,
    ts: Number(id),
    source: { kind: "desktop" },
    runtime: "claude",
    status: "final",
  };
}

function thinking(id: string, text: string): TimelineThinkingItem {
  return {
    kind: "thinking",
    id,
    text,
    ts: Number(id),
    source: { kind: "desktop" },
    runtime: "claude",
    status: "final",
  };
}

function tool(id: string, toolName: string): TimelineToolItem {
  return {
    kind: "tool",
    id,
    toolName,
    inputSummary: "summary",
    status: "ok",
    ts: Number(id),
    source: { kind: "desktop" },
    runtime: "claude",
  };
}

const sample: TimelineItem[] = [
  msg("1", "Run the test suite", "user"),
  thinking("2", "Let me think about tests"),
  tool("3", "Bash"),
  msg("4", "Tests are passing now"),
  msg("5", "Unrelated answer about deploys"),
];

test("empty query returns all items unchanged, matchCount 0", () => {
  const result = filterTimelineByQuery(sample, "");
  expect(result.items).toBe(sample);
  expect(result.matchCount).toBe(0);
  expect(result.normalized).toBe("");
});

test("whitespace-only query is treated as empty", () => {
  const result = filterTimelineByQuery(sample, "   ");
  expect(result.items).toBe(sample);
  expect(result.matchCount).toBe(0);
});

test("matches message text case-insensitively as a substring", () => {
  const result = filterTimelineByQuery(sample, "TEST");
  // only the two message items containing "test" (case-insensitive); thinking/tool hidden
  expect(result.items.map((i) => i.id)).toEqual(["1", "4"]);
  expect(result.matchCount).toBe(2);
  expect(result.normalized).toBe("test");
  expect(result.items.every((i) => i.kind === "message")).toBe(true);
});

test("hides non-message items even when their text would match", () => {
  // "think" appears in the thinking item but it must not be returned
  const result = filterTimelineByQuery(sample, "think");
  expect(result.items).toEqual([]);
  expect(result.matchCount).toBe(0);
});

test("no match returns an empty list", () => {
  const result = filterTimelineByQuery(sample, "zzz-nothing");
  expect(result.items).toEqual([]);
  expect(result.matchCount).toBe(0);
  expect(result.normalized).toBe("zzz-nothing");
});

test("matches user and assistant messages alike", () => {
  const result = filterTimelineByQuery(sample, "run");
  expect(result.items.map((i) => i.id)).toEqual(["1"]);
});

// ── pinned-only filter (B3) ────────────────────────────────────────────────
test("filterTimelineByPinned: empty pinned set returns []", () => {
  expect(filterTimelineByPinned(sample, [])).toEqual([]);
});

test("filterTimelineByPinned: keeps only pinned message items, in timeline order", () => {
  // pin ids out of order; result follows original timeline order, not pin order
  const result = filterTimelineByPinned(sample, ["5", "1"]);
  expect(result.map((i) => i.id)).toEqual(["1", "5"]);
  expect(result.every((i) => i.kind === "message")).toBe(true);
});

test("filterTimelineByPinned: never returns non-message items even if id matches", () => {
  // "3" is the Bash tool item; pinning by that id must not surface a tool card
  const result = filterTimelineByPinned(sample, ["3", "4"]);
  expect(result.map((i) => i.id)).toEqual(["4"]);
});
