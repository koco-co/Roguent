import { expect, test } from "bun:test";
import type { SchedulerTask, SchedulerTaskDraft } from "../../shared/scheduler";
import type { IntegrationRouterEvent } from "../integrations/types";
import { createTestDatabase } from "../persistence/db";
import { migrate } from "../persistence/migrations";
import { createRepositories } from "../persistence/repositories";
import type { IDriver } from "../runtime/claude-driver";
import type {
  RuntimeDriverConfigInput,
  RuntimeDriverCreator,
} from "../runtime/manager";
import { type CreateSessionOptions, SessionManager } from "../session";
import { createSchedulerRunner } from "./runner";
import { createSchedulerService } from "./service";

const baseNow = Date.parse("2026-01-02T08:00:00.000Z");
const dueAt = Date.parse("2026-01-02T08:01:00.000Z");

function task(overrides: Partial<SchedulerTask> = {}): SchedulerTaskDraft {
  return {
    id: overrides.id ?? "task-1",
    title: overrides.title ?? "Ship task",
    prompt: overrides.prompt ?? "ship it",
    status: overrides.status ?? "enabled",
    createdAt: overrides.createdAt ?? baseNow,
    updatedAt: overrides.updatedAt,
    nextRunAt: overrides.nextRunAt,
    cwd: overrides.cwd ?? "/repo",
    runtime: overrides.runtime ?? {
      runtime: "codex",
      model: "gpt-5",
      approvalPolicy: "never",
      sandboxMode: "danger-full-access",
      reasoningEffort: "high",
      networkAccess: true,
    },
    schedule: overrides.schedule ?? { kind: "once", runAt: dueAt },
    targetSessionId: overrides.targetSessionId ?? "scheduled-session",
    metadata: overrides.metadata ?? { source: "test" },
  } as SchedulerTaskDraft;
}

class FakeSessions {
  readonly created: Array<{ id: string; opts: CreateSessionOptions }> = [];
  readonly sent: Array<{ sessionId: string; text: string }> = [];
  readonly published: IntegrationRouterEvent[] = [];
  existing = new Set<string>();
  sendResult: boolean | Promise<boolean> = true;

  sessionIds(): string[] {
    return [...this.existing];
  }

  createSession(id: string, opts: CreateSessionOptions): void {
    this.created.push({ id, opts });
    this.existing.add(id);
  }

  async sendMessage(sessionId: string, text: string): Promise<boolean> {
    this.sent.push({ sessionId, text });
    return this.sendResult;
  }

  publishIntegrationEvent(event: IntegrationRouterEvent): void {
    this.published.push(event);
  }
}

function driverStub(overrides: Partial<IDriver> = {}): IDriver {
  return {
    start() {},
    send() {},
    async setModel() {},
    async setPermissionMode() {},
    async interrupt() {},
    end() {},
    getContextUsage: async () => null,
    askPermission: async () => ({ behavior: "allow" as const }),
    respondPermission() {},
    ...overrides,
  };
}

function fakeRuntimeManager(captured: {
  configs: RuntimeDriverConfigInput[];
  sent: string[];
}): RuntimeDriverCreator {
  return {
    createDriver(_, config) {
      captured.configs.push(config);
      return driverStub({
        send(text) {
          captured.sent.push(text);
        },
      });
    },
  };
}

test("due task starts codex session with stored approval policy and sends prompt", async () => {
  const testDb = createTestDatabase();
  try {
    migrate(testDb.db);
    const service = createSchedulerService(testDb.db, { now: () => baseNow });
    service.createTask(task());
    const sessions = new FakeSessions();
    const runner = createSchedulerRunner({
      db: testDb.db,
      sessions,
      now: () => dueAt,
      createId: () => "run-1",
    });

    const runs = await runner.tick();

    expect(runs).toHaveLength(1);
    expect(sessions.created).toEqual([
      {
        id: "scheduled-session",
        opts: {
          title: "Ship task",
          model: "gpt-5",
          runtime: "codex",
          cwd: "/repo",
          approvalPolicy: "never",
          sandboxMode: "danger-full-access",
          reasoningEffort: "high",
          networkAccess: true,
        },
      },
    ]);
    expect(sessions.sent).toEqual([
      { sessionId: "scheduled-session", text: "ship it" },
    ]);
    expect(sessions.published.map((event) => event.type)).toEqual([
      "scheduler.run.started",
      "scheduler.run.finished",
      "scheduler.task.updated",
    ]);
    expect(runs[0]).toMatchObject({
      id: "run-1",
      taskId: "task-1",
      status: "succeeded",
      sessionId: "scheduled-session",
      summary: "prompt dispatched",
    });

    const storedRun = createRepositories(testDb.db).schedulerRuns.get("run-1");
    expect(storedRun?.status).toBe("succeeded");
    expect(storedRun?.sessionId).toBe("scheduled-session");
    expect(service.getTask("task-1")?.nextRunAt).toBeNull();
  } finally {
    testDb.cleanup();
  }
});

test("due task reuses existing target session", async () => {
  const testDb = createTestDatabase();
  try {
    migrate(testDb.db);
    const service = createSchedulerService(testDb.db, { now: () => baseNow });
    service.createTask(task());
    const sessions = new FakeSessions();
    sessions.existing.add("scheduled-session");
    const runner = createSchedulerRunner({
      db: testDb.db,
      sessions,
      now: () => dueAt,
      createId: () => "run-1",
    });

    await runner.tick();

    expect(sessions.created).toEqual([]);
    expect(sessions.sent).toEqual([
      { sessionId: "scheduled-session", text: "ship it" },
    ]);
  } finally {
    testDb.cleanup();
  }
});

test("runner lock prevents duplicate concurrent execution", async () => {
  const testDb = createTestDatabase();
  try {
    migrate(testDb.db);
    const service = createSchedulerService(testDb.db, { now: () => baseNow });
    service.createTask(task());
    const sessions = new FakeSessions();
    let release!: (value: boolean) => void;
    sessions.sendResult = new Promise<boolean>((resolve) => {
      release = resolve;
    });
    const runner = createSchedulerRunner({
      db: testDb.db,
      sessions,
      now: () => dueAt,
      createId: () => "run-1",
    });

    const firstTick = runner.tick();
    const secondTick = await runner.tick();
    release(true);
    const firstRuns = await firstTick;

    expect(secondTick).toEqual([]);
    expect(firstRuns).toHaveLength(1);
    expect(sessions.sent).toHaveLength(1);
  } finally {
    testDb.cleanup();
  }
});

test("database claim prevents duplicate execution across runner instances", async () => {
  const testDb = createTestDatabase();
  try {
    migrate(testDb.db);
    const service = createSchedulerService(testDb.db, { now: () => baseNow });
    service.createTask(task());
    const firstSessions = new FakeSessions();
    const secondSessions = new FakeSessions();
    let release!: (value: boolean) => void;
    firstSessions.sendResult = new Promise<boolean>((resolve) => {
      release = resolve;
    });
    const firstRunner = createSchedulerRunner({
      db: testDb.db,
      sessions: firstSessions,
      now: () => dueAt,
      createId: () => "run-1",
    });
    const secondRunner = createSchedulerRunner({
      db: testDb.db,
      sessions: secondSessions,
      now: () => dueAt,
      createId: () => "run-2",
    });

    const firstTick = firstRunner.tick();
    const secondRuns = await secondRunner.tick();
    release(true);
    const firstRuns = await firstTick;

    expect(secondRuns).toEqual([]);
    expect(firstRuns).toHaveLength(1);
    expect(firstSessions.sent).toHaveLength(1);
    expect(secondSessions.sent).toEqual([]);
    expect(createRepositories(testDb.db).schedulerRuns.get("run-2")).toBeNull();
  } finally {
    testDb.cleanup();
  }
});

test("queued run-now records are consumed and dispatched", async () => {
  const testDb = createTestDatabase();
  try {
    migrate(testDb.db);
    const service = createSchedulerService(testDb.db, { now: () => baseNow });
    service.createTask(
      task({
        schedule: { kind: "once", runAt: dueAt + 60_000 },
      }),
    );
    const queued = service.runTask("task-1");
    const sessions = new FakeSessions();
    const runner = createSchedulerRunner({
      db: testDb.db,
      sessions,
      now: () => baseNow,
      createId: () => "unused-run-id",
    });

    const runs = await runner.tick();

    expect(runs).toHaveLength(1);
    expect(runs[0]?.id).toBe(queued.id);
    expect(runs[0]?.status).toBe("succeeded");
    expect(sessions.sent).toEqual([
      { sessionId: "scheduled-session", text: "ship it" },
    ]);
    expect(
      createRepositories(testDb.db).schedulerRuns.get(queued.id)?.status,
    ).toBe("succeeded");
    expect(service.getTask("task-1")?.nextRunAt).toBe(dueAt + 60_000);
  } finally {
    testDb.cleanup();
  }
});

test("queued run-now record is skipped if the task is archived before dispatch", async () => {
  const testDb = createTestDatabase();
  try {
    migrate(testDb.db);
    const service = createSchedulerService(testDb.db, { now: () => baseNow });
    service.createTask(task());
    const queued = service.runTask("task-1");
    service.deleteTask("task-1");
    const sessions = new FakeSessions();
    const runner = createSchedulerRunner({
      db: testDb.db,
      sessions,
      now: () => baseNow,
      createId: () => "unused-run-id",
    });

    const runs = await runner.tick();

    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      id: queued.id,
      status: "skipped",
      summary: "task archived before dispatch",
    });
    expect(sessions.sent).toEqual([]);
    expect(sessions.published.map((event) => event.type)).toEqual([
      "scheduler.run.finished",
    ]);
    expect(
      createRepositories(testDb.db).schedulerRuns.get(queued.id)?.status,
    ).toBe("skipped");
    expect(
      createRepositories(testDb.db).schedulerRuns.get(queued.id)?.summary,
    ).toBe("task archived before dispatch");
  } finally {
    testDb.cleanup();
  }
});

test("failed prompt dispatch records failed run and broadcasts finish", async () => {
  const testDb = createTestDatabase();
  try {
    migrate(testDb.db);
    const service = createSchedulerService(testDb.db, { now: () => baseNow });
    service.createTask(task());
    const sessions = new FakeSessions();
    sessions.sendResult = false;
    const runner = createSchedulerRunner({
      db: testDb.db,
      sessions,
      now: () => dueAt,
      createId: () => "run-1",
    });

    const [run] = await runner.tick();

    expect(run?.status).toBe("failed");
    expect(run?.error).toBe("runtime rejected scheduler prompt");
    expect(sessions.published.map((event) => event.type)).toEqual([
      "scheduler.run.started",
      "scheduler.run.finished",
      "scheduler.task.updated",
    ]);
    expect(
      createRepositories(testDb.db).schedulerRuns.get("run-1")?.status,
    ).toBe("failed");
  } finally {
    testDb.cleanup();
  }
});

test("runner sends prompt through SessionManager into fake runtime driver", async () => {
  const testDb = createTestDatabase();
  try {
    migrate(testDb.db);
    const service = createSchedulerService(testDb.db, { now: () => baseNow });
    service.createTask(task());
    const captured: {
      configs: RuntimeDriverConfigInput[];
      sent: string[];
    } = { configs: [], sent: [] };
    const sessions = new SessionManager(fakeRuntimeManager(captured), "/tmp", {
      auditDb: testDb.db,
    });
    const runner = createSchedulerRunner({
      db: testDb.db,
      sessions,
      now: () => dueAt,
      createId: () => "run-1",
    });

    await runner.tick();

    expect(captured.configs[0]).toMatchObject({
      runtime: "codex",
      model: "gpt-5",
      cwd: "/repo",
      approvalPolicy: "never",
      sandboxMode: "danger-full-access",
      reasoningEffort: "high",
      networkAccess: true,
    });
    expect(captured.sent).toEqual(["ship it"]);
  } finally {
    testDb.cleanup();
  }
});
