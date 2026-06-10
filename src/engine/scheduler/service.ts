import type { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import type {
  SchedulerRun,
  SchedulerTask,
  SchedulerTaskDraft,
} from "../../shared/scheduler";
import { appendAuditRecord } from "../audit/log";
import { createRepositories } from "../persistence/repositories";
import { computeNextRunAt } from "./next-run";

export interface SchedulerServiceOptions {
  now?: () => number;
  createId?: () => string;
}

export class SchedulerService {
  private readonly repositories: ReturnType<typeof createRepositories>;

  constructor(
    private readonly db: Database,
    private readonly options: SchedulerServiceOptions = {},
  ) {
    this.repositories = createRepositories(db);
  }

  createTask(task: SchedulerTaskDraft): SchedulerTask {
    const stored = this.prepareTask(task, task.createdAt);
    this.repositories.schedulerTasks.upsert(stored);
    this.audit("scheduler.task.created", stored, {
      summary: `create scheduler task ${stored.id}`,
    });
    return this.requireTask(stored.id);
  }

  updateTask(taskId: string, changes: Partial<SchedulerTask>): SchedulerTask {
    const current = this.requireTask(taskId);
    const updated = this.prepareTask(
      {
        ...current,
        ...changes,
        id: current.id,
        createdAt: current.createdAt,
        updatedAt: this.now(),
      },
      current.createdAt,
    );
    this.repositories.schedulerTasks.upsert(updated);
    this.audit("scheduler.task.updated", updated, {
      summary: `update scheduler task ${updated.id}`,
      payload: { taskId, changes },
    });
    return this.requireTask(taskId);
  }

  deleteTask(taskId: string): SchedulerTask {
    const current = this.requireTask(taskId);
    const archived = this.prepareTask(
      {
        ...current,
        status: "archived",
        updatedAt: this.now(),
      },
      current.createdAt,
    );
    this.repositories.schedulerTasks.upsert(archived);
    this.audit("scheduler.task.deleted", archived, {
      summary: `delete scheduler task ${archived.id}`,
    });
    return this.requireTask(taskId);
  }

  setEnabled(taskId: string, enabled: boolean): SchedulerTask {
    return this.updateTask(taskId, {
      status: enabled ? "enabled" : "disabled",
    });
  }

  runTask(taskId: string): SchedulerRun {
    const task = this.requireTask(taskId);
    if (task.status === "archived") {
      throw new Error(`Scheduler task ${taskId} is archived`);
    }
    const run: SchedulerRun = {
      id: this.createId(),
      taskId,
      status: "queued",
      queuedAt: this.now(),
      metadata: { manual: true },
    };
    this.repositories.schedulerRuns.upsert(run);
    appendAuditRecord(this.db, {
      source: "scheduler",
      action: "scheduler.run.queued",
      sessionId: task.targetSessionId,
      deliveryId: run.id,
      payload: { taskId, runId: run.id },
      summary: `queue scheduler task ${taskId}`,
      createdAt: this.now(),
    });
    return this.requireRun(run.id);
  }

  getTask(taskId: string): SchedulerTask | null {
    return this.repositories.schedulerTasks.get(taskId);
  }

  listTasks(limit?: number): SchedulerTask[] {
    return this.repositories.schedulerTasks.list(limit);
  }

  getRun(runId: string): SchedulerRun | null {
    return this.repositories.schedulerRuns.get(runId);
  }

  private prepareTask(task: SchedulerTask, createdAt: number): SchedulerTask {
    const nextRunAt = computeNextRunAt({
      now: this.now(),
      status: task.status,
      schedule: task.schedule,
    });
    return {
      ...task,
      createdAt,
      updatedAt: task.updatedAt ?? createdAt,
      nextRunAt,
    };
  }

  private requireTask(taskId: string): SchedulerTask {
    const task = this.getTask(taskId);
    if (!task) throw new Error(`Scheduler task ${taskId} not found`);
    return task;
  }

  private requireRun(runId: string): SchedulerRun {
    const run = this.getRun(runId);
    if (!run) throw new Error(`Scheduler run ${runId} not found`);
    return run;
  }

  private audit(
    action: string,
    task: SchedulerTask,
    input: { summary: string; payload?: unknown },
  ): void {
    appendAuditRecord(this.db, {
      source: "scheduler",
      action,
      sessionId: task.targetSessionId,
      payload: input.payload ?? { taskId: task.id },
      summary: input.summary,
      createdAt: this.now(),
    });
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  private createId(): string {
    return this.options.createId?.() ?? randomUUID();
  }
}

export function createSchedulerService(
  db: Database,
  options?: SchedulerServiceOptions,
): SchedulerService {
  return new SchedulerService(db, options);
}
