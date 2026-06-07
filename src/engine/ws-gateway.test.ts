import { expect, test } from "bun:test";
import type { SessionManager } from "./session";
import { parseCommand } from "./ws-gateway";
import { WsGateway } from "./ws-gateway";

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
    runtime: "claude",
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

test("parseCommand accepts newSession runtime config and defaults runtime to Claude", () => {
  expect(
    parseCommand(
      JSON.stringify({
        cmd: "newSession",
        sessionId: "s1",
        title: "t",
        model: "claude-sonnet-4-5",
        cwd: "/repo",
        permissionMode: "acceptEdits",
        sandboxMode: "danger-full-access",
        reasoningEffort: "high",
        networkAccess: false,
        approvalPolicy: "never",
      }),
    ),
  ).toEqual({
    cmd: "newSession",
    sessionId: "s1",
    title: "t",
    model: "claude-sonnet-4-5",
    runtime: "claude",
    cwd: "/repo",
    permissionMode: "acceptEdits",
    sandboxMode: "danger-full-access",
    reasoningEffort: "high",
    networkAccess: false,
    approvalPolicy: "never",
  });

  const codexCommand = parseCommand(
    JSON.stringify({
      cmd: "newSession",
      sessionId: "s2",
      title: "t",
      model: "gpt-5",
      runtime: "codex",
    }),
  );
  expect(codexCommand?.cmd).toBe("newSession");
  expect(codexCommand?.cmd === "newSession" && codexCommand.runtime).toBe(
    "codex",
  );
});

test("parseCommand rejects invalid newSession runtime config fields", () => {
  const base = {
    cmd: "newSession",
    sessionId: "s1",
    title: "t",
    model: "m",
  };
  for (const patch of [
    { runtime: "other" },
    { permissionMode: "ask" },
    { sandboxMode: "unsafe" },
    { reasoningEffort: "extreme" },
    { approvalPolicy: "always" },
    { networkAccess: "true" },
    { cwd: 5 },
  ]) {
    expect(parseCommand(JSON.stringify({ ...base, ...patch }))).toBeNull();
  }
});

test("WsGateway passes newSession runtime config through to SessionManager", () => {
  const calls: Array<{ id: string; opts: unknown }> = [];
  const mgr = {
    sessionIds: () => [],
    subscribe: () => () => {},
    createSession: (id: string, opts: unknown) => calls.push({ id, opts }),
  } as unknown as SessionManager;
  const gateway = new WsGateway(0, mgr);
  try {
    (
      gateway as unknown as {
        onCommand(raw: string, ws: unknown): void;
      }
    ).onCommand(
      JSON.stringify({
        cmd: "newSession",
        sessionId: "s-codex",
        title: "Codex",
        runtime: "codex",
        model: "gpt-5",
        cwd: "/repo",
        permissionMode: "default",
        approvalPolicy: "on-request",
        sandboxMode: "workspace-write",
        reasoningEffort: "medium",
        networkAccess: false,
      }),
      {},
    );
  } finally {
    (gateway as unknown as { wss: { close(): void } }).wss.close();
  }

  expect(calls).toEqual([
    {
      id: "s-codex",
      opts: {
        title: "Codex",
        runtime: "codex",
        model: "gpt-5",
        cwd: "/repo",
        permissionMode: "default",
        approvalPolicy: "on-request",
        sandboxMode: "workspace-write",
        reasoningEffort: "medium",
        networkAccess: false,
      },
    },
  ]);
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

test("parseCommand respondPermission valid", () => {
  const c = parseCommand(
    JSON.stringify({
      cmd: "respondPermission",
      sessionId: "s1",
      promptId: "p1",
      behavior: "allow",
    }),
  );
  expect(c?.cmd).toBe("respondPermission");
});

test("parseCommand respondPermission deny with message", () => {
  const c = parseCommand(
    JSON.stringify({
      cmd: "respondPermission",
      sessionId: "s1",
      promptId: "p1",
      behavior: "deny",
      message: "no",
    }),
  );
  expect(c?.cmd).toBe("respondPermission");
  expect((c as { behavior: string })?.behavior).toBe("deny");
});

test("parseCommand respondPermission invalid behavior → null", () => {
  const c = parseCommand(
    JSON.stringify({
      cmd: "respondPermission",
      sessionId: "s1",
      promptId: "p1",
      behavior: "maybe",
    }),
  );
  expect(c).toBeNull();
});

test("parseCommand respondQuestion valid", () => {
  const c = parseCommand(
    JSON.stringify({
      cmd: "respondQuestion",
      sessionId: "s1",
      promptId: "p1",
      selectedLabels: ["A"],
    }),
  );
  expect(c?.cmd).toBe("respondQuestion");
});

test("parseCommand setPermissionMode valid", () => {
  const c = parseCommand(
    JSON.stringify({
      cmd: "setPermissionMode",
      sessionId: "s1",
      mode: "acceptEdits",
    }),
  );
  expect(c?.cmd).toBe("setPermissionMode");
});
