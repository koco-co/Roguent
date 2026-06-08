import { expect, test } from "bun:test";
import type { ControlMessage } from "../shared/local-sessions";
import type { SessionManager } from "./session";
import { WsGateway } from "./ws-gateway";

function closeGateway(gateway: WsGateway): void {
  (gateway as unknown as { wss: { close(): void } }).wss.close();
}

function invokeOnCommand(
  gateway: WsGateway,
  raw: string,
  ws: unknown = {},
): void {
  (
    gateway as unknown as {
      onCommand(raw: string, ws: unknown): void;
    }
  ).onCommand(raw, ws);
}

test("WsGateway passes newSession runtime config through to SessionManager", () => {
  const calls: Array<{ id: string; opts: unknown }> = [];
  const mgr = {
    sessionIds: () => [],
    subscribe: () => () => {},
    createSession: (id: string, opts: unknown) => calls.push({ id, opts }),
  } as unknown as SessionManager;
  const gateway = new WsGateway(0, mgr);
  try {
    invokeOnCommand(
      gateway,
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
    );
  } finally {
    closeGateway(gateway);
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

test("WsGateway replies with commandError control when command parsing fails", () => {
  const sent: string[] = [];
  const ws = {
    OPEN: 1,
    readyState: 1,
    send: (msg: string) => sent.push(msg),
  };
  const mgr = {
    sessionIds: () => [],
    subscribe: () => () => {},
  } as unknown as SessionManager;
  const gateway = new WsGateway(0, mgr);
  try {
    invokeOnCommand(
      gateway,
      JSON.stringify({
        cmd: "newSession",
        sessionId: "s-bad",
        title: "Bad runtime",
        model: "m",
        runtime: "other",
      }),
      ws,
    );
  } finally {
    closeGateway(gateway);
  }

  expect(sent).toHaveLength(1);
  const msg = JSON.parse(sent[0] ?? "") as ControlMessage;
  expect(msg).toEqual({
    kind: "control",
    type: "commandError",
    sessionId: "s-bad",
    reason: "Invalid client command",
  });
  expect("seq" in msg).toBe(false);
});

test("WsGateway replies with commandError control for unimplemented prototype commands", () => {
  const sent: string[] = [];
  const ws = {
    OPEN: 1,
    readyState: 1,
    send: (msg: string) => sent.push(msg),
  };
  const mgr = {
    sessionIds: () => [],
    subscribe: () => () => {},
  } as unknown as SessionManager;
  const gateway = new WsGateway(0, mgr);
  try {
    invokeOnCommand(
      gateway,
      JSON.stringify({
        cmd: "settings",
        action: "update",
        scope: "user",
        settings: { scheduler: { enabled: true } },
      }),
      ws,
    );
  } finally {
    closeGateway(gateway);
  }

  expect(sent).toHaveLength(1);
  const msg = JSON.parse(sent[0] ?? "") as ControlMessage;
  expect(msg).toEqual({
    kind: "control",
    type: "commandError",
    reason: "Command not implemented: settings.update",
  });
  expect("seq" in msg).toBe(false);
});
