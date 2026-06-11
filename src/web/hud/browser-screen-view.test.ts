import { expect, test } from "bun:test";
import {
  type TimelineToolItem,
  createAgent,
  createSession,
} from "../../shared/domain";
import { screenViewOf } from "./browser-screen-view";

const toolItem = (
  partial: Partial<TimelineToolItem> &
    Pick<TimelineToolItem, "id" | "toolName" | "inputSummary" | "status">,
): TimelineToolItem => ({
  kind: "tool",
  agentId: undefined,
  ts: 0,
  source: { kind: "desktop" },
  runtime: "claude",
  ...partial,
});

test("no tool activity → idle, tab is session title, url/caption empty", () => {
  const session = createSession({ id: "s1", title: "Roguent · Dev" });
  const view = screenViewOf(session);
  expect(view.idle).toBe(true);
  expect(view.busy).toBe(false);
  expect(view.tab).toBe("Roguent · Dev");
  expect(view.url).toBe("");
  expect(view.caption).toBe("");
});

test("latest running tool → busy, not idle, caption has agent role and toolName", () => {
  const session = createSession({ id: "s1", title: "Roguent · Dev" });
  session.agents.a1 = createAgent({
    id: "a1",
    role: "Surveyor",
    skin: "rogue",
  });
  session.timeline.push(
    toolItem({
      id: "t0",
      toolName: "Read",
      inputSummary: "old.ts",
      status: "ok",
      agentId: "a1",
    }),
    toolItem({
      id: "t1",
      toolName: "Grep",
      inputSummary: "pattern",
      status: "running",
      agentId: "a1",
    }),
  );
  const view = screenViewOf(session);
  expect(view.busy).toBe(true);
  expect(view.idle).toBe(false);
  expect(view.caption).toBe("Surveyor · Grep");
  expect(view.url).toBe("pattern");
});

test("inputSummary longer than 64 chars → url truncated to 63 + ellipsis", () => {
  const session = createSession({ id: "s1", title: "Roguent · Dev" });
  const longSummary = "x".repeat(120);
  session.timeline.push(
    toolItem({
      id: "t1",
      toolName: "Bash",
      inputSummary: longSummary,
      status: "ok",
    }),
  );
  const view = screenViewOf(session);
  expect(view.url.length).toBe(64);
  expect(view.url.endsWith("…")).toBe(true);
  expect(view.url).toBe(`${"x".repeat(63)}…`);
  // 缺 agentId → 归主控
  expect(view.caption).toBe("Orchestrator · Bash");
});
