import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type TimelineMessageItem, createSession } from "../../shared/domain";
import { MessageBubble } from "./MessageBubble";

afterEach(() => {
  cleanup();
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
