import { expect, test } from "bun:test";
import {
  Driver,
  buildHooks,
  cliPathFromEnv,
  stripSubscriptionEnv,
  usesApiKey,
} from "./driver";
import type { DraftEvent, HookLike } from "./normalize";

test("usesApiKey: subscription OAuth ('none'/'oauth'/undefined) is not flagged", () => {
  // 订阅模式实测 apiKeySource='none';这些都不应被当成"用了 API key"
  expect(usesApiKey("none")).toBe(false);
  expect(usesApiKey(undefined)).toBe(false);
  expect(usesApiKey("oauth")).toBe(false);
  // 真用上 api-key 源才告警
  expect(usesApiKey("user")).toBe(true);
  expect(usesApiKey("project")).toBe(true);
  expect(usesApiKey("temporary")).toBe(true);
});

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

test("cliPathFromEnv: 有 ROGUENT_CLI_PATH 用之,否则 undefined", () => {
  expect(
    cliPathFromEnv({
      ROGUENT_CLI_PATH: "/Applications/Roguent.app/.../claude",
    }),
  ).toBe("/Applications/Roguent.app/.../claude");
  expect(cliPathFromEnv({})).toBeUndefined();
  expect(cliPathFromEnv({ ROGUENT_CLI_PATH: "" })).toBeUndefined();
  expect(cliPathFromEnv({ ROGUENT_CLI_PATH: "   " })).toBeUndefined();
  expect(
    cliPathFromEnv({
      ROGUENT_CLI_PATH: "  /x/claude  ",
    }),
  ).toBe("/x/claude");
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

test("askPermission emits prompt.requested draft and resolves on respondPermission", async () => {
  const drafts: DraftEvent[] = [];
  const driver = new Driver(
    { onDraft: (ds) => drafts.push(...ds) },
    "claude-opus-4-8",
    "/tmp",
  );

  const pending = driver.askPermission({
    toolName: "Bash",
    input: { command: "ls" },
    toolUseID: "t1",
    title: "Run bash",
    displayName: "Bash",
    description: "ls /tmp",
  });

  // prompt.requested should have been emitted
  const req = drafts.find((d) => d.type === "prompt.requested");
  expect(req).toBeDefined();
  expect((req?.payload as { promptId: string }).promptId).toBe("t1");
  expect((req?.payload as { promptKind: string }).promptKind).toBe(
    "permission",
  );

  // resolve it
  driver.respondPermission("t1", { behavior: "allow" });
  const result = await pending;
  expect(result.behavior).toBe("allow");

  // prompt.resolved should have been emitted
  const res = drafts.find((d) => d.type === "prompt.resolved");
  expect(res).toBeDefined();
});

test("Driver.end() auto-denies pending permissions", async () => {
  const drafts: DraftEvent[] = [];
  const driver = new Driver(
    { onDraft: (ds) => drafts.push(...ds) },
    "m",
    "/tmp",
  );

  const pending = driver.askPermission({
    toolName: "Write",
    input: {},
    toolUseID: "t2",
  });

  driver.end();
  const result = await pending;
  expect(result.behavior).toBe("deny");

  const dismissed = drafts.find(
    (d) =>
      d.type === "prompt.resolved" &&
      (d.payload as { result: string }).result === "dismissed",
  );
  expect(dismissed).toBeDefined();
});
