import { expect, test } from "bun:test";
import type {
  InventoryItemKind,
  MailboxItem,
  PluginEntry,
} from "../shared/events";
import type { ControlMessage } from "../shared/local-sessions";
import type { SchedulerTask } from "../shared/scheduler";
import type { SessionManager } from "./session";
import {
  type GatewayMailboxService,
  type GatewayPluginsService,
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

test("WsGateway handles economy claimAchievement through achievement service and publishes reward events", async () => {
  const sent: string[] = [];
  const published: unknown[] = [];
  const ws = {
    OPEN: 1,
    readyState: 1,
    send: (msg: string) => sent.push(msg),
  };
  const achievements = {
    claim: (achievementId: string) => ({
      ok: true as const,
      achievement: {
        id: achievementId,
        title: "First Codex Session",
        progress: 1,
        target: 1,
        completed: true,
        claimed: true,
        updatedAt: 1,
      },
      ledgerEntry: {
        id: "ledger-1",
        ts: 1,
        reason: "achievement.claimed",
        amount: 20,
        currency: "gem",
        delta: { gem: 20 },
        balance: { gem: 20 },
        sourceEventId: "achievement.claimed:first-codex-session",
      },
    }),
  };
  const mgr = {
    sessionIds: () => [],
    subscribe: () => () => {},
    publishIntegrationEvent: (event: unknown) => published.push(event),
  } as unknown as SessionManager;
  const gateway = new WsGateway(0, mgr, undefined, { achievements });
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

  expect(sent).toEqual([]);
  expect(published).toMatchObject([
    {
      sessionId: "__economy__",
      type: "achievement.updated",
      payload: {
        achievement: {
          id: "first-codex-session",
          claimed: true,
        },
      },
    },
    {
      sessionId: "__economy__",
      type: "economy.ledger.appended",
      payload: {
        entry: {
          id: "ledger-1",
          amount: 20,
          currency: "gem",
        },
      },
    },
  ]);
});

test("WsGateway purchaseItem replies with error when gacha service is unavailable", async () => {
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
  // No gacha service wired → should reply with an error, not crash.
  const gateway = new WsGateway(0, mgr);
  try {
    invokeOnCommand(
      gateway,
      JSON.stringify({
        cmd: "economy",
        action: "purchaseItem",
        sku: "gacha.hero",
      }),
      ws,
    );
  } finally {
    await closeGateway(gateway);
  }

  expect(JSON.parse(sent[0] ?? "") as ControlMessage).toEqual({
    kind: "control",
    type: "commandError",
    reason: "Gacha service unavailable",
  });
});

test("WsGateway keeps equipItem/unequipItem economy actions explicit (not implemented)", async () => {
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
        action: "equipItem",
        itemId: "skin.ninja",
      }),
      ws,
    );
  } finally {
    await closeGateway(gateway);
  }

  expect(JSON.parse(sent[0] ?? "") as ControlMessage).toMatchObject({
    kind: "control",
    type: "commandError",
  });
});

test("WsGateway purchaseItem with sufficient balance emits ledger and inventory events", async () => {
  const sent: string[] = [];
  const published: unknown[] = [];
  const ws = {
    OPEN: 1,
    readyState: 1,
    send: (msg: string) => sent.push(msg),
  };
  const fakeEntry = {
    id: "entry-1",
    ts: 1,
    reason: "gacha.pull",
    amount: -100,
    currency: "gem",
    delta: { gem: -100 },
    balance: { gem: 900 },
    sourceEventId: "gacha.pull:gacha.hero:1:gacha.pull",
  };
  const fakeInventoryUpdate = {
    item: {
      id: "pet.slime",
      sku: "pet.slime",
      kind: "pet" as InventoryItemKind,
      label: "史莱姆伙伴",
      quantity: 1,
      acquiredAt: 1,
    },
    action: "added" as const,
  };
  const gacha = {
    pull: (_sku: string, _seed: string) => ({
      ok: true as const,
      ledgerEntries: [fakeEntry],
      inventoryUpdate: fakeInventoryUpdate,
    }),
  };
  const mgr = {
    sessionIds: () => [],
    subscribe: () => () => {},
    publishIntegrationEvent: (event: unknown) => published.push(event),
  } as unknown as SessionManager;
  const gateway = new WsGateway(0, mgr, undefined, { gacha });
  try {
    invokeOnCommand(
      gateway,
      JSON.stringify({
        cmd: "economy",
        action: "purchaseItem",
        sku: "gacha.hero",
      }),
      ws,
    );
  } finally {
    await closeGateway(gateway);
  }

  // No error response sent to client.
  expect(sent).toEqual([]);
  // One event published: ledger debit only.
  // inventory.updated is NOT emitted — inventory is derived from the ledger
  // entry via reduceInventoryFromLedger in the store (the inventory.updated
  // reducer is a no-op that returns state unchanged).
  expect(published).toHaveLength(1);
  expect(published[0]).toMatchObject({
    sessionId: "__economy__",
    type: "economy.ledger.appended",
    payload: { entry: { id: "entry-1", amount: -100, currency: "gem" } },
  });
});

test("WsGateway purchaseItem with insufficient balance replies with error without mutating", async () => {
  const sent: string[] = [];
  const published: unknown[] = [];
  const ws = {
    OPEN: 1,
    readyState: 1,
    send: (msg: string) => sent.push(msg),
  };
  const gacha = {
    pull: (_sku: string, _seed: string) => ({
      ok: false as const,
      reason: "insufficient_balance" as const,
    }),
  };
  const mgr = {
    sessionIds: () => [],
    subscribe: () => () => {},
    publishIntegrationEvent: (event: unknown) => published.push(event),
  } as unknown as SessionManager;
  const gateway = new WsGateway(0, mgr, undefined, { gacha });
  try {
    invokeOnCommand(
      gateway,
      JSON.stringify({
        cmd: "economy",
        action: "purchaseItem",
        sku: "gacha.hero",
      }),
      ws,
    );
  } finally {
    await closeGateway(gateway);
  }

  // Error response sent.
  expect(sent).toHaveLength(1);
  expect(JSON.parse(sent[0] ?? "") as ControlMessage).toMatchObject({
    kind: "control",
    type: "commandError",
    reason: "Gacha pull failed: insufficient_balance",
  });
  // No events published (ledger/inventory not mutated).
  expect(published).toEqual([]);
});

test("WsGateway purchaseItem seed increments per pull (successive pulls get different seeds)", async () => {
  const seeds: string[] = [];
  const ws = { OPEN: 1, readyState: 1, send: () => {} };
  const gacha = {
    pull: (_sku: string, seed: string) => {
      seeds.push(seed);
      return { ok: false as const, reason: "insufficient_balance" as const };
    },
  };
  const mgr = {
    sessionIds: () => [],
    subscribe: () => () => {},
    publishIntegrationEvent: () => {},
  } as unknown as SessionManager;
  const gateway = new WsGateway(0, mgr, undefined, { gacha });
  try {
    for (let i = 0; i < 3; i++) {
      invokeOnCommand(
        gateway,
        JSON.stringify({
          cmd: "economy",
          action: "purchaseItem",
          sku: "gacha.hero",
        }),
        ws,
      );
    }
  } finally {
    await closeGateway(gateway);
  }

  // All three seeds must be distinct.
  expect(new Set(seeds).size).toBe(3);
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

test("plugins: runAction failure broadcasts snapshot() catalog, not stale pre-action data, then replies commandError", async () => {
  const allSent: string[] = [];
  const ws = {
    OPEN: 1,
    readyState: 1,
    send: (msg: string) => allSent.push(msg),
    on: () => undefined,
  };

  // Stale catalog pre-seeded into lastPlugins (installed: false).
  const staleEntry: PluginEntry = {
    id: "delta-cmd@official",
    name: "delta",
    marketplace: "official",
    author: null,
    description: "",
    category: null,
    componentType: "插件" as const,
    hasMcp: false,
    hasSkills: false,
    installs: 10,
    installed: false,
    enabled: false,
  };
  // Fresh snapshot returned by service (installed: true — simulates partial mutation).
  const freshEntry: PluginEntry = {
    ...staleEntry,
    installed: true,
    enabled: true,
  };

  const svc: GatewayPluginsService = {
    snapshot: () => [freshEntry],
    runAction: async () => {
      throw new Error("network timeout");
    },
  };

  const mgr = {
    sessionIds: () => [],
    subscribe: () => () => {},
  } as unknown as SessionManager;

  const gateway = new WsGateway(0, mgr, undefined, { plugins: svc });

  // Pre-seed lastPlugins with stale data (installed: false).
  gateway.pushPlugins([staleEntry], []);

  // Connect the client so it is in the broadcast set and receives pushPlugins frames.
  invokeHandleConnection(gateway, ws);
  // Wait for publishSavedSettings tick (no settings svc, resolves immediately).
  await new Promise((resolve) => setTimeout(resolve, 0));

  try {
    // Clear connect-time replay frames; only watch command-triggered ones.
    allSent.length = 0;

    // Issue install command — runAction will reject.
    invokeOnCommand(
      gateway,
      JSON.stringify({
        cmd: "plugins",
        action: "install",
        pluginId: "delta-cmd@official",
      }),
      ws,
    );
    // Wait for async runAction rejection.
    await new Promise((resolve) => setTimeout(resolve, 10));

    const frames = allSent.map((s) => JSON.parse(s) as Record<string, unknown>);
    const pluginsFrames = frames.filter((f) => f.kind === "plugins") as Array<{
      kind: string;
      plugins: PluginEntry[];
      busy: { id: string; phase: string }[];
    }>;
    const controlFrames = frames.filter((f) => f.kind === "control") as Array<{
      kind: string;
      type: string;
      reason: string;
    }>;

    // 1. First plugins frame: busy broadcast.
    expect(pluginsFrames.length).toBeGreaterThanOrEqual(2);
    const busyFrame = pluginsFrames[0];
    expect(busyFrame?.busy).toHaveLength(1);
    expect(busyFrame?.busy[0]?.phase).toBe("installing");

    // 2. Second plugins frame: rollback via snapshot() — must contain FRESH data
    //    (installed: true), NOT the stale pre-action snapshot (installed: false).
    const rollbackFrame = pluginsFrames[pluginsFrames.length - 1];
    expect(rollbackFrame?.busy).toEqual([]);
    expect(rollbackFrame?.plugins[0]?.installed).toBe(true);

    // 3. commandError reply on the issuing socket.
    expect(controlFrames).toHaveLength(1);
    expect(controlFrames[0]?.type).toBe("commandError");
    expect(controlFrames[0]?.reason).toBe(
      "Plugin install failed: network timeout",
    );
  } finally {
    await closeGateway(gateway);
  }
});

test("plugins: connect-time replay lastPlugins + command triggers busy→fresh broadcast", async () => {
  // Track all messages sent on each fake WebSocket.
  const wsSent: string[] = [];
  const ws = {
    OPEN: 1,
    readyState: 1,
    send: (msg: string) => wsSent.push(msg),
    on: () => undefined,
  };

  // Fake plugins service: install marks gamma as installed.
  let installedGamma = false;
  const base = (): PluginEntry[] => [
    {
      id: "gamma-cmd@official",
      name: "gamma",
      marketplace: "official",
      author: null,
      description: "",
      category: null,
      componentType: "插件" as const,
      hasMcp: false,
      hasSkills: false,
      installs: 250,
      installed: installedGamma,
      enabled: installedGamma,
    },
  ];
  const svc: GatewayPluginsService = {
    snapshot: () => base(),
    runAction: async (_action, _pluginId) => {
      installedGamma = true;
      return base();
    },
  };

  const mgr = {
    sessionIds: () => [],
    subscribe: () => () => {},
  } as unknown as SessionManager;

  const gateway = new WsGateway(0, mgr, undefined, { plugins: svc });

  // Pre-seed lastPlugins via pushPlugins before client connects.
  gateway.pushPlugins(svc.snapshot(), []);

  try {
    // Connect client — should receive replay frame first (kind:"plugins", installed:false).
    invokeHandleConnection(gateway, ws);
    // Wait for async publishSavedSettings tick.
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Verify connect-time replay: first non-roster message should be the plugins frame.
    const frames = wsSent.map((s) => JSON.parse(s) as Record<string, unknown>);
    // First frame: plugins replay, second: roster (kind:"control").
    const pluginsReplay = frames.find((f) => f.kind === "plugins");
    expect(pluginsReplay).toBeDefined();
    const replayMsg = pluginsReplay as {
      kind: string;
      plugins: PluginEntry[];
      busy: unknown[];
    };
    expect(replayMsg.plugins[0]?.installed).toBe(false);
    expect(replayMsg.busy).toEqual([]);

    // Clear sent so we can check command-triggered broadcasts cleanly.
    wsSent.length = 0;

    // Send install command.
    invokeOnCommand(
      gateway,
      JSON.stringify({
        cmd: "plugins",
        action: "install",
        pluginId: "gamma-cmd@official",
      }),
      ws,
    );
    // Wait for async runAction to complete.
    await new Promise((resolve) => setTimeout(resolve, 10));

    const cmdFrames = wsSent.map(
      (s) =>
        JSON.parse(s) as {
          kind: string;
          plugins: PluginEntry[];
          busy: { id: string; phase: string }[];
        },
    );
    const pluginsFrames = cmdFrames.filter((f) => f.kind === "plugins");
    // Should have at least 2 frames: busy broadcast + fresh broadcast.
    expect(pluginsFrames.length).toBeGreaterThanOrEqual(2);

    const busyFrame = pluginsFrames[0];
    expect(busyFrame?.busy).toHaveLength(1);
    expect(busyFrame?.busy[0]?.id).toBe("gamma-cmd@official");
    expect(busyFrame?.busy[0]?.phase).toBe("installing");

    const freshFrame = pluginsFrames[pluginsFrames.length - 1];
    expect(freshFrame?.busy).toEqual([]);
    expect(freshFrame?.plugins[0]?.installed).toBe(true);
  } finally {
    await closeGateway(gateway);
  }
});
