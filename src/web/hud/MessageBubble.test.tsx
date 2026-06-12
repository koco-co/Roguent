import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  type TimelineMessageItem,
  createAgent,
  createSession,
} from "../../shared/domain";
import { MessageBubble } from "./MessageBubble";

function agentMessage(
  overrides: Partial<TimelineMessageItem> = {},
): TimelineMessageItem {
  return {
    kind: "message",
    id: "m1",
    role: "assistant",
    text: "hi",
    ts: 1,
    source: { kind: "desktop" },
    runtime: "claude",
    status: "final",
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: undefined,
  });
});

test("copies fenced code blocks independently from the whole message", async () => {
  const writes: string[] = [];
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async (text: string) => {
        writes.push(text);
      },
    },
  });

  const session = createSession({ id: "s1", title: "t", model: "m" });
  const item: TimelineMessageItem = {
    kind: "message",
    id: "m1",
    role: "assistant",
    text: "Use this:\n```ts\nconst x = 1;\nconsole.log(x);\n```",
    ts: 1,
    source: { kind: "desktop" },
    runtime: "claude",
    status: "final",
  };

  render(<MessageBubble item={item} session={session} />);

  await userEvent.click(screen.getByRole("button", { name: "复制代码" }));

  expect(writes).toEqual(["const x = 1;\nconsole.log(x);"]);
});

test("copy buttons tolerate unavailable or rejected clipboard writes", async () => {
  const session = createSession({ id: "s1", title: "t", model: "m" });
  const item: TimelineMessageItem = {
    kind: "message",
    id: "m1",
    role: "assistant",
    text: "Use this:\n```sh\nbun test\n```",
    ts: 1,
    source: { kind: "desktop" },
    runtime: "claude",
    status: "final",
  };

  const { rerender } = render(<MessageBubble item={item} session={session} />);

  await userEvent.click(screen.getByTitle("复制消息"));
  await userEvent.click(screen.getByRole("button", { name: "复制代码" }));

  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async () => {
        throw new Error("denied");
      },
    },
  });
  rerender(<MessageBubble item={{ ...item, id: "m2" }} session={session} />);

  await userEvent.click(screen.getByTitle("复制消息"));
  await userEvent.click(screen.getByRole("button", { name: "复制代码" }));
});

test("orchestrator message shows Title Case name plus a 主控 role badge", () => {
  const session = createSession({ id: "s1", title: "t", model: "m" });
  // orchestrator agent already seeded by createSession under ORCHESTRATOR_ID.
  const item = agentMessage({ agentId: "orchestrator" });

  const { container } = render(<MessageBubble item={item} session={session} />);

  expect(screen.getByText("Orchestrator")).toBeTruthy();
  const badge = container.querySelector(".cmsg-role");
  expect(badge?.textContent).toBe("主控");
});

test("subagent message derives name from role and shows a 分身 badge", () => {
  const session = createSession({ id: "s1", title: "t", model: "m" });
  session.agents.a1 = createAgent({
    id: "a1",
    role: "code-review",
    skin: "scout",
  });
  const item = agentMessage({ agentId: "a1" });

  const { container } = render(<MessageBubble item={item} session={session} />);

  expect(screen.getByText("Code Review")).toBeTruthy();
  const badge = container.querySelector(".cmsg-role");
  expect(badge?.textContent).toBe("分身");
});

test("user message shows 你 and no role badge", () => {
  const session = createSession({ id: "s1", title: "t", model: "m" });
  const item = agentMessage({ role: "user", text: "hello" });

  const { container } = render(<MessageBubble item={item} session={session} />);

  expect(screen.getByText("你")).toBeTruthy();
  expect(container.querySelector(".cmsg-role")).toBeNull();
});
