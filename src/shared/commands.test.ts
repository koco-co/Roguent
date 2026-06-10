import { expect, test } from "bun:test";
import { parseClientCommand } from "./commands";

test("parseClientCommand accepts known commands and rejects junk", () => {
  expect(
    parseClientCommand('{"cmd":"sendMessage","sessionId":"s1","text":"hi"}'),
  ).toEqual({
    ok: true,
    command: { cmd: "sendMessage", sessionId: "s1", text: "hi" },
  });
  const setModel = parseClientCommand({
    cmd: "setModel",
    sessionId: "s1",
    model: "claude-opus-4-8",
  });
  expect(setModel.ok && setModel.command.cmd).toBe("setModel");
  expect(parseClientCommand("not json").ok).toBe(false);
  expect(parseClientCommand({ cmd: "explode" }).ok).toBe(false);
});

test("parseClientCommand rejects type-only protocol", () => {
  expect(parseClientCommand({ type: "unknown" }).ok).toBe(false);
  expect(
    parseClientCommand({
      type: "newSession",
      sessionId: "s1",
      title: "Wrong protocol",
      model: "claude-sonnet-4",
    }).ok,
  ).toBe(false);
});

test("parseClientCommand accepts newSession with an optional cwd", () => {
  expect(
    parseClientCommand({
      cmd: "newSession",
      sessionId: "s1",
      title: "t",
      model: "m",
      cwd: "/repo",
    }),
  ).toEqual({
    ok: true,
    command: {
      cmd: "newSession",
      sessionId: "s1",
      title: "t",
      model: "m",
      runtime: "claude",
      cwd: "/repo",
    },
  });
  const omitted = parseClientCommand({
    cmd: "newSession",
    sessionId: "s1",
    title: "t",
    model: "m",
  });
  expect(omitted.ok && omitted.command.cmd).toBe("newSession");
  expect(
    parseClientCommand({
      cmd: "newSession",
      sessionId: "s1",
      title: "t",
      model: "m",
      cwd: 5,
    }).ok,
  ).toBe(false);
});

test("parseClientCommand accepts newSession runtime config and defaults runtime to Claude", () => {
  expect(
    parseClientCommand({
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
  ).toEqual({
    ok: true,
    command: {
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
    },
  });

  const codexCommand = parseClientCommand({
    cmd: "newSession",
    sessionId: "s2",
    title: "t",
    model: "gpt-5",
    runtime: "codex",
  });
  expect(
    codexCommand.ok &&
      codexCommand.command.cmd === "newSession" &&
      codexCommand.command.runtime,
  ).toBe("codex");
});

test("parseClientCommand rejects invalid newSession runtime config fields", () => {
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
    expect(parseClientCommand({ ...base, ...patch }).ok).toBe(false);
  }
});

test("parseClientCommand accepts existing session and prompt commands", () => {
  expect(parseClientCommand({ cmd: "interrupt", sessionId: "s1" })).toEqual({
    ok: true,
    command: { cmd: "interrupt", sessionId: "s1" },
  });
  expect(parseClientCommand({ cmd: "interrupt" }).ok).toBe(false);
  expect(
    parseClientCommand({
      cmd: "rollback",
      sessionId: "s1",
      checkpointId: "checkpoint-1",
    }),
  ).toEqual({
    ok: true,
    command: {
      cmd: "rollback",
      sessionId: "s1",
      checkpointId: "checkpoint-1",
    },
  });
  expect(parseClientCommand({ cmd: "rollback", sessionId: "s1" }).ok).toBe(
    false,
  );
  expect(
    parseClientCommand({
      cmd: "retryFrom",
      sessionId: "s1",
      timelineItemId: "item-1",
    }),
  ).toEqual({
    ok: true,
    command: {
      cmd: "retryFrom",
      sessionId: "s1",
      timelineItemId: "item-1",
    },
  });
  expect(parseClientCommand({ cmd: "retryFrom", sessionId: "s1" }).ok).toBe(
    false,
  );
  expect(parseClientCommand({ cmd: "deleteSession", sessionId: "s1" })).toEqual(
    {
      ok: true,
      command: { cmd: "deleteSession", sessionId: "s1" },
    },
  );
  expect(parseClientCommand({ cmd: "deleteSession" }).ok).toBe(false);
  expect(parseClientCommand({ cmd: "listLocalSessions" })).toEqual({
    ok: true,
    command: { cmd: "listLocalSessions" },
  });
  expect(
    parseClientCommand({ cmd: "importSession", path: "/a/b.jsonl" }),
  ).toEqual({
    ok: true,
    command: { cmd: "importSession", path: "/a/b.jsonl" },
  });
  expect(parseClientCommand({ cmd: "importSession", path: 5 }).ok).toBe(false);

  const permission = parseClientCommand({
    cmd: "respondPermission",
    sessionId: "s1",
    promptId: "p1",
    behavior: "allow",
  });
  expect(permission.ok && permission.command.cmd).toBe("respondPermission");
  expect(
    parseClientCommand({
      cmd: "respondPermission",
      sessionId: "s1",
      promptId: "p1",
      behavior: "maybe",
    }).ok,
  ).toBe(false);

  const question = parseClientCommand({
    cmd: "respondQuestion",
    sessionId: "s1",
    promptId: "p1",
    selectedLabels: ["A"],
  });
  expect(question.ok && question.command.cmd).toBe("respondQuestion");

  const permissionMode = parseClientCommand({
    cmd: "setPermissionMode",
    sessionId: "s1",
    mode: "acceptEdits",
  });
  expect(permissionMode.ok && permissionMode.command.cmd).toBe(
    "setPermissionMode",
  );
  expect(
    parseClientCommand({
      cmd: "setPermissionMode",
      sessionId: "s1",
      mode: "ask",
    }).ok,
  ).toBe(false);
});

test("parseClientCommand accepts prototype command groups with typed shapes", () => {
  const runtime = parseClientCommand({
    cmd: "setRuntimeConfig",
    sessionId: "s1",
    config: {
      runtime: "codex",
      model: "gpt-5",
      permissionMode: "default",
      approvalPolicy: "on-request",
      sandboxMode: "workspace-write",
      reasoningEffort: "medium",
      networkAccess: false,
    },
  });
  expect(runtime.ok && runtime.command.cmd).toBe("setRuntimeConfig");
  expect(
    runtime.ok &&
      runtime.command.cmd === "setRuntimeConfig" &&
      runtime.command.config.runtime,
  ).toBe("codex");

  const pairing = parseClientCommand({
    cmd: "createPairing",
    sessionId: "s1",
    channel: "wechat",
    externalChatId: "chat-a",
    forwardingEnabled: true,
  });
  expect(pairing.ok && pairing.command.cmd).toBe("createPairing");

  const scheduler = parseClientCommand({
    cmd: "scheduler",
    action: "createTask",
    task: {
      id: "task-1",
      title: "Daily review",
      prompt: "Summarize changes",
      status: "enabled",
      createdAt: 1,
      cwd: "/repo",
      runtime: {
        runtime: "codex",
        model: "gpt-5",
        permissionMode: "bypassPermissions",
        approvalPolicy: "never",
        sandboxMode: "danger-full-access",
        reasoningEffort: "high",
        networkAccess: true,
      },
      schedule: { kind: "once", runAt: 2 },
      targetSessionId: "s1",
    },
  });
  expect(scheduler.ok && scheduler.command.cmd).toBe("scheduler");
  expect(
    scheduler.ok &&
      scheduler.command.cmd === "scheduler" &&
      scheduler.command.action,
  ).toBe("createTask");
});

test("parseClientCommand requires scheduler create task runtime permissions and target", () => {
  const fullTask = {
    id: "task-1",
    title: "Daily review",
    prompt: "Summarize changes",
    status: "enabled",
    createdAt: 1,
    cwd: "/repo",
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
    targetSessionId: "s1",
  };
  for (const key of [
    "cwd",
    "runtime",
    "schedule",
    "targetSessionId",
  ] as const) {
    const task: Record<string, unknown> = { ...fullTask };
    delete task[key];
    expect(
      parseClientCommand({ cmd: "scheduler", action: "createTask", task }).ok,
    ).toBe(false);
  }
  expect(
    parseClientCommand({
      cmd: "scheduler",
      action: "createTask",
      task: {
        ...fullTask,
        runtime: { ...fullTask.runtime, reasoningEffort: undefined },
      },
    }).ok,
  ).toBe(false);
  expect(
    parseClientCommand({
      cmd: "scheduler",
      action: "createTask",
      task: {
        ...fullTask,
        metadata: { __targetSessionId: "hidden-session" },
      },
    }).ok,
  ).toBe(false);
  expect(
    parseClientCommand({
      cmd: "scheduler",
      action: "updateTask",
      taskId: "task-1",
      changes: { metadata: { __targetSessionId: "hidden-session" } },
    }).ok,
  ).toBe(false);
});

test("parseClientCommand accepts scheduler daily weekly and monthly recurrence", () => {
  const baseTask = {
    id: "task-1",
    title: "Scheduled review",
    prompt: "Summarize changes",
    status: "enabled",
    createdAt: 1,
    cwd: "/repo",
    runtime: {
      runtime: "codex",
      model: "gpt-5",
      permissionMode: "bypassPermissions",
      approvalPolicy: "never",
      sandboxMode: "danger-full-access",
      reasoningEffort: "high",
      networkAccess: true,
    },
    targetSessionId: "s1",
  };

  const daily = parseClientCommand({
    cmd: "scheduler",
    action: "createTask",
    task: {
      ...baseTask,
      schedule: {
        kind: "daily",
        hour: 9,
        minute: 30,
        timezone: "Asia/Shanghai",
      },
    },
  });
  expect(
    daily.ok &&
      daily.command.cmd === "scheduler" &&
      daily.command.action === "createTask" &&
      daily.command.task.schedule,
  ).toEqual({
    kind: "daily",
    hour: 9,
    minute: 30,
    timezone: "Asia/Shanghai",
  });

  const weekly = parseClientCommand({
    cmd: "scheduler",
    action: "createTask",
    task: {
      ...baseTask,
      schedule: {
        kind: "weekly",
        daysOfWeek: [1, 3, 5],
        hour: 18,
        minute: 0,
        timezone: "UTC",
      },
    },
  });
  expect(
    weekly.ok &&
      weekly.command.cmd === "scheduler" &&
      weekly.command.action === "createTask" &&
      weekly.command.task.schedule,
  ).toEqual({
    kind: "weekly",
    daysOfWeek: [1, 3, 5],
    hour: 18,
    minute: 0,
    timezone: "UTC",
  });

  const monthly = parseClientCommand({
    cmd: "scheduler",
    action: "createTask",
    task: {
      ...baseTask,
      schedule: {
        kind: "monthly",
        dayOfMonth: 31,
        hour: 7,
        minute: 5,
        timezone: "America/Los_Angeles",
      },
    },
  });
  expect(
    monthly.ok &&
      monthly.command.cmd === "scheduler" &&
      monthly.command.action === "createTask" &&
      monthly.command.task.schedule,
  ).toEqual({
    kind: "monthly",
    dayOfMonth: 31,
    hour: 7,
    minute: 5,
    timezone: "America/Los_Angeles",
  });
});

test("parseClientCommand rejects invalid scheduler recurrence payloads", () => {
  const baseCommand = {
    cmd: "scheduler",
    action: "createTask",
    task: {
      id: "task-1",
      title: "Scheduled review",
      prompt: "Summarize changes",
      status: "enabled",
      createdAt: 1,
      cwd: "/repo",
      runtime: {
        runtime: "codex",
        model: "gpt-5",
        permissionMode: "bypassPermissions",
        approvalPolicy: "never",
        sandboxMode: "danger-full-access",
        reasoningEffort: "high",
        networkAccess: true,
      },
      targetSessionId: "s1",
    },
  };
  for (const schedule of [
    { kind: "once", runAt: Number.NaN },
    { kind: "once", runAt: Number.POSITIVE_INFINITY },
    { kind: "daily", hour: 9, minute: 0, timezone: "UTC", everyMs: 1000 },
    { kind: "daily", hour: 24, minute: 0, timezone: "UTC" },
    { kind: "daily", hour: 9, minute: 60, timezone: "UTC" },
    { kind: "daily", hour: 9, minute: 0, timezone: "No/Such_Zone" },
    { kind: "weekly", daysOfWeek: [], hour: 9, minute: 0, timezone: "UTC" },
    { kind: "weekly", daysOfWeek: [7], hour: 9, minute: 0, timezone: "UTC" },
    { kind: "monthly", dayOfMonth: 0, hour: 9, minute: 0, timezone: "UTC" },
    { kind: "monthly", dayOfMonth: 32, hour: 9, minute: 0, timezone: "UTC" },
    {
      kind: "monthly",
      dayOfMonth: 15,
      hour: 9,
      minute: 0,
      timezone: "UTC",
      expression: "* * * * *",
    },
    { kind: "interval", everyMs: 1000 },
    { kind: "cron", expression: "* * * * *", timezone: "UTC" },
  ]) {
    expect(
      parseClientCommand({
        ...baseCommand,
        task: { ...baseCommand.task, schedule },
      }).ok,
    ).toBe(false);
  }
});

test("parseClientCommand rejects unknown prototype actions", () => {
  expect(
    parseClientCommand({
      cmd: "scheduler",
      action: "explode",
      taskId: "task-1",
    }).ok,
  ).toBe(false);
  expect(
    parseClientCommand({
      cmd: "mailbox",
      action: "teleport",
      itemId: "mail-1",
    }).ok,
  ).toBe(false);
});

test("parseClientCommand rejects non-conservative prototype payloads", () => {
  expect(
    parseClientCommand({
      cmd: "scheduler",
      action: "updateTask",
      taskId: "task-1",
      changes: { madeUp: 1 },
    }).ok,
  ).toBe(false);

  expect(
    parseClientCommand({
      cmd: "settings",
      action: "update",
      scope: "user",
      settings: { scheduler: { enabled: "yes" } },
    }).ok,
  ).toBe(false);
});
