import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type TimelineMessageItem, createSession } from "../../shared/domain";
import { MessageBubble } from "./MessageBubble";

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
