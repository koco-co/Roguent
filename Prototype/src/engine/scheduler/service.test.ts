import { expect, test } from "bun:test";
import type { SchedulerTask, SchedulerTaskDraft } from "../../shared/scheduler";
import { createTestDatabase } from "../persistence/db";
import { migrate } from "../persistence/migrations";
import { createRepositories } from "../persistence/repositories";
import { createSchedulerService } from "./service";

const now = Date.parse("2026-01-02T08:00:00.000Z");

function task(overrides: Partial<SchedulerTask> = {}): SchedulerTaskDraft {
  return {
    id: overrides.id ?? "task-1",
    title: overrides.title ?? "Daily review",
    prompt: overrides.prompt ?? "Summarize changes",
    status: overrides.status ?? "enabled",
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt,
    nextRunAt: overrides.nextRunAt,
    cwd: overrides.cwd ?? "/repo",
    runtime: overrides.runtime ?? {
      runtime: "codex",
      model: "gpt-5",
      permissionMode: "bypassPermissions",
      approvalPolicy: "never",
      sandboxMode: "danger-full-access",
      reasoningEffort: "high",
      networkAccess: true,
    },
    schedule: overrides.schedule ?? {
      kind: "daily",
      hour: 9,
      minute: 30,
      timezone: "UTC",
    },
    targetSessionId: overrides.targetSessionId ?? "session-target",
    metadata: overrides.metadata ?? { source: "test" },
  } as SchedulerTaskDraft;
}

test("createTask persists runtime permissions target session and next run", () => {
  const testDb = createTestDatabase();
  try {
    migrate(testDb.db);
    const service = createSchedulerService(testDb.db, { now: () => now });

    const created = service.createTask(task());
    const stored = service.getTask("task-1");
    const row = testDb.db
      .query<
        { prompt_ref: string; runtime_json: string; metadata_json: string },
        []
      >(
        "SELECT prompt_ref, runtime_json, metadata_json FROM scheduler_tasks WHERE id = 'task-1'",
      )
      .get();

    expect(created.nextRunAt).toBe(Date.parse("2026-01-02T09:30:00.000Z"));
    expect(stored?.prompt).toBe("Summarize changes");
    expect(stored?.runtime?.permissionMode).toBe("bypassPermissions");
    expect(stored?.runtime?.sandboxMode).toBe("danger-full-access");
    expect(stored?.runtime?.networkAccess).toBe(true);
    expect(stored?.targetSessionId).toBe("session-target");
    expect(stored?.metadata).toEqual({ source: "test" });
    expect(row?.prompt_ref).toBe("Summarize changes");
    expect(JSON.parse(row?.runtime_json ?? "{}").permissionMode).toBe(
      "bypassPermissions",
    );
    expect(JSON.parse(row?.metadata_json ?? "{}").__targetSessionId).toBe(
      "session-target",
    );
  } finally {
    testDb.cleanup();
  }
});

test("updateTask supports disable enable and delete as audited state changes", () => {
  const testDb = createTestDatabase();
  try {
    migrate(testDb.db);
    const service = createSchedulerService(testDb.db, { now: () => now });
    service.createTask(task());

    const disabled = service.updateTask("task-1", { status: "disabled" });
    expect(disabled.status).toBe("disabled");
    expect(disabled.nextRunAt).toBeNull();

    const enabled = service.updateTask("task-1", { status: "enabled" });
    expect(enabled.status).toBe("enabled");
    expect(enabled.nextRunAt).toBe(Date.parse("2026-01-02T09:30:00.000Z"));

    const deleted = service.deleteTask("task-1");
    expect(deleted.status).toBe("archived");
    expect(service.getTask("task-1")?.status).toBe("archived");

    const auditActions = testDb.db
      .query<{ action: string }, []>(
        "SELECT action FROM audit_records ORDER BY created_at, action",
      )
      .all()
      .map((row) => row.action);
    expect(auditActions).toEqual([
      "scheduler.task.created",
      "scheduler.task.deleted",
      "scheduler.task.updated",
      "scheduler.task.updated",
    ]);
  } finally {
    testDb.cleanup();
  }
});

test("runTask creates a queued run and records audit", () => {
  const testDb = createTestDatabase();
  try {
    migrate(testDb.db);
    const service = createSchedulerService(testDb.db, { now: () => now });
    service.createTask(task());

    const run = service.runTask("task-1");
    expect(run.taskId).toBe("task-1");
    expect(run.status).toBe("queued");
    expect(run.queuedAt).toBe(now);
    expect(service.getRun(run.id)).toEqual(run);

    const audit = createRepositories(testDb.db).auditRecords.get(
      testDb.db
        .query<{ id: string }, []>(
          "SELECT id FROM audit_records WHERE action = 'scheduler.run.queued' LIMIT 1",
        )
        .get()?.id ?? "",
    );
    expect(audit?.summary).toBe("queue scheduler task task-1");
  } finally {
    testDb.cleanup();
  }
});
