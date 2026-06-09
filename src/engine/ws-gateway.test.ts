import { expect, test } from "bun:test";
import type { MailboxItem } from "../shared/events";
import type { ControlMessage } from "../shared/local-sessions";
import type { SchedulerTask } from "../shared/scheduler";
import type { SessionManager } from "./session";
import {
  type GatewayMailboxService,
  type GatewaySchedulerService,
  type GatewaySettingsService,
  WsGateway,
} from "./ws-gateway";

type TestWebSocketServer = {
  address(): unknown;
  close(cb?: () => void): void;
  once(event: "listening" | "error", cb: () => void): void;
  off(event: "listening" | "error", cb: () => void): void;
};

function closeGateway(gateway: WsGateway): Promise<void> {
  const wss = (gateway as unknown as { wss: TestWebSocketServer }).wss;
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      wss.off("listening", close);
      wss.off("error", finish);
      resolve();
    };
    const close = () => wss.close(finish);

    if (wss.address()) close();
    else {
      wss.once("listening", close);
      wss.once("error", finish);
    }
  });
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

function invokeHandleConnection(gateway: WsGateway, ws: unknown): void {
  (
    gateway as unknown as {
      handleConnection(ws: unknown): void;
    }
  ).handleConnection(ws);
}

test("WsGateway passes newSession runtime config through to SessionManager", async () => {
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
    await closeGateway(gateway);
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

test("WsGateway replies with commandError control when command parsing fails", async () => {
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
    await closeGateway(gateway);
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

test("WsGateway replies with commandError control for unimplemented prototype commands", async () => {
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
        cmd: "economy",
        action: "claimAchievement",
        achievementId: "first-codex-session",
      }),
      ws,
    );
  } finally {
    await closeGateway(gateway);
  }

  expect(sent).toHaveLength(1);
  const msg = JSON.parse(sent[0] ?? "") as ControlMessage;
  expect(msg).toEqual({
    kind: "control",
    type: "commandError",
    reason: "Command not implemented: economy.claimAchievement",
  });
  expect("seq" in msg).toBe(false);
});

test("WsGateway handles settings commands through SettingsService and publishes updates", async () => {
  const sent: string[] = [];
  const published: unknown[] = [];
  const settingsCalls: unknown[] = [];
  const ws = {
    OPEN: 1,
    readyState: 1,
    send: (msg: string) => sent.push(msg),
  };
  const settings: GatewaySettingsService = {
    async load() {
      return null;
    },
    async update(scope, input, changedKeys, metadata) {
      settingsCalls.push({ scope, input, changedKeys, metadata });
      return {
        scope,
        settings: input,
        ...(changedKeys ? { changedKeys } : {}),
        ...(metadata ? { metadata } : {}),
      };
    },
  };
  const mgr = {
    sessionIds: () => [],
    subscribe: () => () => {},
    publishIntegrationEvent: (event: unknown) => published.push(event),
  } as unknown as SessionManager;
  const gateway = new WsGateway(0, mgr, undefined, { settings });
  try {
    invokeOnCommand(
      gateway,
      JSON.stringify({
        cmd: "settings",
        action: "update",
        scope: "user",
        settings: { scheduler: { enabled: true, timezone: "UTC" } },
        changedKeys: ["scheduler.enabled"],
        metadata: { source: "settings-panel" },
      }),
      ws,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  } finally {
    await closeGateway(gateway);
  }

  expect(sent).toEqual([]);
  expect(settingsCalls).toEqual([
    {
      scope: "user",
      input: { scheduler: { enabled: true, timezone: "UTC" } },
      changedKeys: ["scheduler.enabled"],
      metadata: { source: "settings-panel" },
    },
  ]);
  expect(published).toEqual([
    {
      sessionId: "__settings__",
      type: "settings.updated",
      ts: expect.any(Number),
      payload: {
        scope: "user",
        settings: { scheduler: { enabled: true, timezone: "UTC" } },
        changedKeys: ["scheduler.enabled"],
        metadata: { source: "settings-panel" },
      },
    },
  ]);
});

test("WsGateway publishes saved settings when a client connects", async () => {
  const sent: string[] = [];
  const published: unknown[] = [];
  const ws = {
    OPEN: 1,
    readyState: 1,
    send: (msg: string) => sent.push(msg),
    on: () => undefined,
  };
  const settings: GatewaySettingsService = {
    async load(scope) {
      expect(scope).toBe("user");
      return {
        runtime: {
          runtime: "codex",
          model: "gpt-5",
          permissionMode: "default",
          approvalPolicy: "on-request",
          sandboxMode: "workspace-write",
          networkAccess: false,
        },
        metadata: { codex: { mcpProfile: "mobile-dev" } },
      };
    },
    async update() {
      throw new Error("not used");
    },
  };
  const mgr = {
    sessionIds: () => [],
    subscribe: () => () => {},
    publishIntegrationEvent: (event: unknown) => published.push(event),
  } as unknown as SessionManager;
  const gateway = new WsGateway(0, mgr, undefined, { settings });
  try {
    invokeHandleConnection(gateway, ws);
    await new Promise((resolve) => setTimeout(resolve, 0));
  } finally {
    await closeGateway(gateway);
  }

  expect(JSON.parse(sent[0] ?? "")).toEqual({
    kind: "control",
    type: "roster",
    sessionIds: [],
  });
  expect(published).toEqual([
    {
      sessionId: "__settings__",
      type: "settings.updated",
      ts: expect.any(Number),
      payload: {
        scope: "user",
        settings: {
          runtime: {
            runtime: "codex",
            model: "gpt-5",
            permissionMode: "default",
            approvalPolicy: "on-request",
            sandboxMode: "workspace-write",
            networkAccess: false,
          },
          metadata: { codex: { mcpProfile: "mobile-dev" } },
        },
        metadata: { source: "settings-load" },
      },
    },
  ]);
});

test("WsGateway handles mailbox commands through MailboxService and publishes updates", async () => {
  const sent: string[] = [];
  const published: unknown[] = [];
  const runtimeMessages: unknown[] = [];
  const mailboxCalls: unknown[] = [];
  const item: MailboxItem = {
    id: "mail-1",
    source: "github",
    title: "CI failed",
    summary: "build failed",
    ts: 100,
    status: "unread",
    sessionId: "s1",
  };
  const ws = {
    OPEN: 1,
    readyState: 1,
    send: (msg: string) => sent.push(msg),
  };
  const mailbox: GatewayMailboxService = {
    markRead(itemId) {
      mailboxCalls.push({ action: "markRead", itemId });
      return { ...item, status: "read" };
    },
    archive(itemId) {
      mailboxCalls.push({ action: "archive", itemId });
      return { ...item, status: "archived" };
    },
    resend(itemId, options) {
      mailboxCalls.push({ action: "resend", itemId, options });
      return {
        item,
        targetSessionId: options?.targetSessionId ?? item.sessionId ?? "s1",
        text: "resend text",
      };
    },
  };
  const mgr = {
    sessionIds: () => [],
    subscribe: () => () => {},
    sendMessage: (sessionId: string, text: string) =>
      runtimeMessages.push({ sessionId, text }),
    publishIntegrationEvent: (event: unknown) => published.push(event),
  } as unknown as SessionManager;
  const gateway = new WsGateway(0, mgr, undefined, { mailbox });
  try {
    invokeOnCommand(
      gateway,
      JSON.stringify({ cmd: "mailbox", action: "markRead", itemId: "mail-1" }),
      ws,
    );
    invokeOnCommand(
      gateway,
      JSON.stringify({ cmd: "mailbox", action: "archive", itemId: "mail-1" }),
      ws,
    );
    invokeOnCommand(
      gateway,
      JSON.stringify({
        cmd: "mailbox",
        action: "invokeAction",
        itemId: "mail-1",
        actionId: "resend",
        metadata: { targetSessionId: "s2" },
      }),
      ws,
    );
  } finally {
    await closeGateway(gateway);
  }

  expect(sent).toEqual([]);
  expect(mailboxCalls).toEqual([
    { action: "markRead", itemId: "mail-1" },
    { action: "archive", itemId: "mail-1" },
    {
      action: "resend",
      itemId: "mail-1",
      options: { targetSessionId: "s2" },
    },
  ]);
  expect(runtimeMessages).toEqual([{ sessionId: "s2", text: "resend text" }]);
  expect(published).toEqual([
    {
      sessionId: "s1",
      type: "mailbox.item.updated",
      ts: expect.any(Number),
      payload: {
        item: { ...item, status: "read" },
        changes: { status: "read" },
      },
    },
    {
      sessionId: "s1",
      type: "mailbox.item.updated",
      ts: expect.any(Number),
      payload: {
        item: { ...item, status: "archived" },
        changes: { status: "archived" },
      },
    },
    {
      sessionId: "s1",
      type: "mailbox.item.updated",
      ts: expect.any(Number),
      payload: { item },
    },
  ]);
});

test("WsGateway handles scheduler commands through SchedulerService and publishes updates", async () => {
  const sent: string[] = [];
  const published: unknown[] = [];
  const schedulerCalls: unknown[] = [];
  const task: SchedulerTask = {
    id: "task-1",
    title: "Daily review",
    prompt: "Summarize",
    status: "enabled",
    createdAt: 100,
    updatedAt: 100,
    nextRunAt: 200,
    cwd: "/repo",
    targetSessionId: "s-target",
    runtime: {
      runtime: "codex",
      model: "gpt-5",
      permissionMode: "bypassPermissions",
      approvalPolicy: "never",
      sandboxMode: "danger-full-access",
      reasoningEffort: "high",
      networkAccess: true,
    },
    schedule: { kind: "daily", hour: 9, minute: 0, timezone: "UTC" },
  };
  const ws = {
    OPEN: 1,
    readyState: 1,
    send: (msg: string) => sent.push(msg),
  };
  const scheduler: GatewaySchedulerService = {
    createTask(input) {
      schedulerCalls.push({ action: "createTask", input });
      return { ...input, nextRunAt: task.nextRunAt };
    },
    updateTask(taskId, changes) {
      schedulerCalls.push({ action: "updateTask", taskId, changes });
      return { ...task, ...changes };
    },
    deleteTask(taskId) {
      schedulerCalls.push({ action: "deleteTask", taskId });
      return { ...task, status: "archived" };
    },
    runTask(taskId) {
      schedulerCalls.push({ action: "runTask", taskId });
      return {
        id: "run-1",
        taskId,
        status: "queued",
        queuedAt: 300,
      };
    },
  };
  const mgr = {
    sessionIds: () => [],
    subscribe: () => () => {},
    publishIntegrationEvent: (event: unknown) => published.push(event),
  } as unknown as SessionManager;
  const gateway = new WsGateway(0, mgr, undefined, { scheduler });
  try {
    invokeOnCommand(
      gateway,
      JSON.stringify({ cmd: "scheduler", action: "createTask", task }),
      ws,
    );
    invokeOnCommand(
      gateway,
      JSON.stringify({
        cmd: "scheduler",
        action: "updateTask",
        taskId: task.id,
        changes: { status: "disabled" },
      }),
      ws,
    );
    invokeOnCommand(
      gateway,
      JSON.stringify({
        cmd: "scheduler",
        action: "deleteTask",
        taskId: task.id,
      }),
      ws,
    );
    invokeOnCommand(
      gateway,
      JSON.stringify({ cmd: "scheduler", action: "runTask", taskId: task.id }),
      ws,
    );
  } finally {
    await closeGateway(gateway);
  }

  expect(sent).toEqual([]);
  expect(schedulerCalls).toEqual([
    { action: "createTask", input: task },
    { action: "updateTask", taskId: task.id, changes: { status: "disabled" } },
    { action: "deleteTask", taskId: task.id },
    { action: "runTask", taskId: task.id },
  ]);
  expect(published).toEqual([
    {
      sessionId: "s-target",
      type: "scheduler.task.created",
      ts: expect.any(Number),
      payload: { task: { ...task, nextRunAt: 200 } },
    },
    {
      sessionId: "s-target",
      type: "scheduler.task.updated",
      ts: expect.any(Number),
      payload: {
        task: { ...task, status: "disabled" },
      },
    },
    {
      sessionId: "s-target",
      type: "scheduler.task.updated",
      ts: expect.any(Number),
      payload: {
        task: { ...task, status: "archived" },
      },
    },
  ]);
});

test("WsGateway passes setRuntimeConfig through to SessionManager", async () => {
  const calls: unknown[] = [];
  const sent: string[] = [];
  const ws = {
    OPEN: 1,
    readyState: 1,
    send: (msg: string) => sent.push(msg),
  };
  const mgr = {
    sessionIds: () => [],
    subscribe: () => () => {},
    setRuntimeConfig: (sessionId: string, config: unknown) =>
      calls.push({ sessionId, config }),
  } as unknown as SessionManager;
  const gateway = new WsGateway(0, mgr);
  try {
    invokeOnCommand(
      gateway,
      JSON.stringify({
        cmd: "setRuntimeConfig",
        sessionId: "s-codex",
        config: {
          runtime: "codex",
          model: "gpt-5",
          permissionMode: "default",
          approvalPolicy: "on-request",
          sandboxMode: "workspace-write",
          reasoningEffort: "high",
          networkAccess: false,
        },
      }),
      ws,
    );
  } finally {
    await closeGateway(gateway);
  }

  expect(sent).toEqual([]);
  expect(calls).toEqual([
    {
      sessionId: "s-codex",
      config: {
        runtime: "codex",
        model: "gpt-5",
        permissionMode: "default",
        approvalPolicy: "on-request",
        sandboxMode: "workspace-write",
        reasoningEffort: "high",
        networkAccess: false,
      },
    },
  ]);
});

test("WsGateway dispatches rollback and retryFrom commands to SessionManager", async () => {
  const calls: unknown[] = [];
  const sent: string[] = [];
  const ws = {
    OPEN: 1,
    readyState: 1,
    send: (msg: string) => sent.push(msg),
  };
  const mgr = {
    sessionIds: () => [],
    subscribe: () => () => {},
    rollback: (sessionId: string, checkpointId: string) =>
      calls.push({ cmd: "rollback", sessionId, checkpointId }),
    retryFrom: (sessionId: string, timelineItemId: string) =>
      calls.push({ cmd: "retryFrom", sessionId, timelineItemId }),
  } as unknown as SessionManager;
  const gateway = new WsGateway(0, mgr);
  try {
    invokeOnCommand(
      gateway,
      JSON.stringify({
        cmd: "rollback",
        sessionId: "s1",
        checkpointId: "checkpoint-1",
      }),
      ws,
    );
    invokeOnCommand(
      gateway,
      JSON.stringify({
        cmd: "retryFrom",
        sessionId: "s1",
        timelineItemId: "item-1",
      }),
      ws,
    );
  } finally {
    await closeGateway(gateway);
  }

  expect(sent).toEqual([]);
  expect(calls).toEqual([
    {
      cmd: "rollback",
      sessionId: "s1",
      checkpointId: "checkpoint-1",
    },
    {
      cmd: "retryFrom",
      sessionId: "s1",
      timelineItemId: "item-1",
    },
  ]);
});
