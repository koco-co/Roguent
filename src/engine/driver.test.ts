import { expect, test } from "bun:test";
import { buildHooks, stripSubscriptionEnv } from "./driver";
import type { HookLike } from "./normalize";

test("stripSubscriptionEnv removes API key + auth token, keeps the rest", () => {
  const out = stripSubscriptionEnv({
    PATH: "/bin",
    ANTHROPIC_API_KEY: "sk-x",
    ANTHROPIC_AUTH_TOKEN: "t",
  });
  expect(out.PATH).toBe("/bin");
  expect(out.ANTHROPIC_API_KEY).toBeUndefined();
  expect(out.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
});

test("buildHooks forwards hook input and returns a non-blocking {}", async () => {
  const seen: HookLike[] = [];
  const hooks = buildHooks((h) => seen.push(h));
  const cb = hooks?.PreToolUse?.[0]?.hooks[0];
  const out = await cb?.(
    { hook_event_name: "PreToolUse", tool_name: "Bash" } as never,
    "t1",
    { signal: new AbortController().signal },
  );
  expect(out).toEqual({});
  expect(seen[0]?.tool_name).toBe("Bash");
});
