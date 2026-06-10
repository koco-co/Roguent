import type { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import type { SchedulerRun, SchedulerTask } from "../../shared/scheduler";
import { appendAuditRecord } from "../audit/log";
import type { IntegrationRouterEvent } from "../integrations/types";
import { withTransaction } from "../persistence/db";
import { createRepositories } from "../persistence/repositories";
import type { CreateSessionOptions } from "../session";
import { computeNextRunAt } from "./next-run";

type MaybePromise<T> = T | Promise<T>;

export interface SchedulerRunnerSessionHost {
  sessionIds(): string[];
  createSession(id: string, opts: CreateSessionOptions): MaybePromise<void>;
  sendMessage(sessionId: string, text: string): MaybePromise<boolean>;
  publishIntegrationEvent(event: IntegrationRouterEvent): void;
}

export interface SchedulerRunnerOptions {
  db: Database;
  sessions: SchedulerRunnerSessionHost;
  now?: () => number;
  createId?: () => string;
  taskLimit?: number;
  intervalMs?: number;
}

export class SchedulerRunner {
  private readonly repositories: ReturnType<typeof createRepositories>;
  private running = false;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly options: SchedulerRunnerOptions) {
    this.repositories = createRepositories(options.db);
  }

  async tick(now = this.now()): Promise<SchedulerRun[]> {
    if (this.running) return [];
    this.running = true;
    try {
      const runs: SchedulerRun[] = [];
      const queuedRuns = this.repositories.schedulerRuns.listQueued(
        this.options.taskLimit,
      );
      for (const queuedRun of queuedRuns) {
        const task = this.repositories.schedulerTasks.get(queuedRun.taskId);
        if (!task) continue;
        const run = await this.runQueuedTask(task, queuedRun, now);
        if (run) runs.push(run);
      }

      const dueTasks = this.repositories.schedulerTasks.due(
        now,
        this.options.taskLimit,
      );
      for (const task of dueTasks) {
        const run = await this.runDueTask(task, now);
        if (run) runs.push(run);
      }
      return runs;
    } finally {
      this.running = false;
    }
  }

  start(intervalMs = this.options.intervalMs ?? 60_000): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick().catch((error) => {
        console.error("[scheduler] runner tick failed", error);
      });
    }, intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }

  private async runQueuedTask(
    task: SchedulerTask,
    queuedRun: SchedulerRun,
    now: number,
  ): Promise<SchedulerRun | null> {
    const eventSessionId = task.targetSessionId ?? `scheduler-${task.id}`;
    const runnable = this.runnableTask(task);
    const claimed = withTransaction(this.options.db, () => {
      if (runnable && task.status !== "archived") {
        this.persistSessionRecord(runnable, now);
      }
      return this.repositories.schedulerRuns.claimQueued(
        queuedRun.id,
        now,
        task.status === "archived" ? undefined : runnable?.targetSessionId,
      );
    });
    if (!claimed) return null;
    if (task.status === "archived") {
      return this.skipQueuedRun(task, claimed, eventSessionId, now);
    }
    return this.dispatchTaskRun(task, claimed, eventSessionId, runnable, now, {
      advanceTask: false,
    });
  }

  private async runDueTask(
    task: SchedulerTask,
    now: number,
  ): Promise<SchedulerRun | null> {
    if (task.nextRunAt === undefined || task.nextRunAt === null) return null;
    const eventSessionId = task.targetSessionId ?? `scheduler-${task.id}`;
    const runnable = this.runnableTask(task);
    const run: SchedulerRun = {
      id: this.createId(),
      taskId: task.id,
      status: "running",
      queuedAt: now,
      startedAt: now,
      ...(runnable ? { sessionId: runnable.targetSessionId } : {}),
      metadata: { trigger: "schedule" },
    };
    const claimedRun = withTransaction(this.options.db, () => {
      if (
        !this.repositories.schedulerTasks.claimDue(
          task.id,
          task.nextRunAt!,
          now,
        )
      ) {
        return null;
      }
      if (runnable) this.persistSessionRecord(runnable, now);
      this.repositories.schedulerRuns.upsert(run);
      return run;
    });
    if (!claimedRun) return null;
    return this.dispatchTaskRun(
      task,
      claimedRun,
      eventSessionId,
      runnable,
      now,
      {
        advanceTask: true,
      },
    );
  }

  private skipQueuedRun(
    task: SchedulerTask,
    run: SchedulerRun,
    eventSessionId: string,
    now: number,
  ): SchedulerRun {
    const skipped: SchedulerRun = {
      ...run,
      status: "skipped",
      finishedAt: now,
      summary: "task archived before dispatch",
    };
    this.repositories.schedulerRuns.upsert(skipped);
    this.audit("scheduler.run.skipped", task, skipped, now);
    this.publish(
      eventSessionId,
      "scheduler.run.finished",
      { run: skipped },
      now,
    );
    return skipped;
  }

  private async dispatchTaskRun(
    task: SchedulerTask,
    startedRun: SchedulerRun,
    eventSessionId: string,
    runnable: RunnableSchedulerTask | null,
    now: number,
    options: { advanceTask: boolean },
  ): Promise<SchedulerRun> {
    let run = startedRun;
    this.audit("scheduler.run.auto_started", task, run, now);
    this.publish(eventSessionId, "scheduler.run.started", { run }, now);

    try {
      if (!runnable) throw this.runnableTaskError(task);
      await this.ensureSession(runnable.targetSessionId, runnable);
      const accepted = await this.options.sessions.sendMessage(
        runnable.targetSessionId,
        runnable.prompt,
      );
      if (!accepted) throw new Error("runtime rejected scheduler prompt");
      run = {
        ...run,
        status: "succeeded",
        finishedAt: now,
        summary: "prompt dispatched",
      };
      this.audit("scheduler.run.succeeded", task, run, now);
    } catch (error) {
      run = {
        ...run,
        status: "failed",
        finishedAt: now,
        error: errorMessage(error),
      };
      this.audit("scheduler.run.failed", task, run, now);
    }

    this.repositories.schedulerRuns.upsert(run);
    this.publish(eventSessionId, "scheduler.run.finished", { run }, now);
    if (options.advanceTask) {
      const updatedTask = this.advanceTask(task, now);
      this.publish(
        eventSessionId,
        "scheduler.task.updated",
        {
          task: updatedTask,
          changes: { nextRunAt: updatedTask.nextRunAt },
        },
        now,
      );
    }
    return run;
  }

  private runnableTask(task: SchedulerTask): RunnableSchedulerTask | null {
    return this.missingRunnableFields(task).length === 0
      ? (task as RunnableSchedulerTask)
      : null;
  }

  private runnableTaskError(task: SchedulerTask): Error {
    return new Error(
      `scheduler task ${task.id} missing ${this.missingRunnableFields(task).join(", ")}`,
    );
  }

  private missingRunnableFields(task: SchedulerTask): string[] {
    const missing: string[] = [];
    if (!task.cwd) missing.push("cwd");
    if (!task.runtime) missing.push("runtime");
    if (!task.schedule) missing.push("schedule");
    if (!task.targetSessionId) missing.push("targetSessionId");
    return missing;
  }

  private persistSessionRecord(task: RunnableSchedulerTask, now: number): void {
    this.repositories.sessions.upsert({
      id: task.targetSessionId,
      runtime: task.runtime.runtime,
      title: task.title,
      model: task.runtime.model,
      cwd: task.cwd,
      permissionMode: task.runtime.permissionMode ?? "default",
      sandboxMode: task.runtime.sandboxMode,
      reasoningEffort: task.runtime.reasoningEffort ?? null,
      networkAccess: task.runtime.networkAccess,
      approvalPolicy: task.runtime.approvalPolicy ?? null,
      metadataJson: JSON.stringify({ source: "scheduler", taskId: task.id }),
      createdAt: now,
      updatedAt: now,
    });
  }

  private async ensureSession(
    sessionId: string,
    task: RunnableSchedulerTask,
  ): Promise<void> {
    if (this.options.sessions.sessionIds().includes(sessionId)) return;
    await this.options.sessions.createSession(sessionId, {
      title: task.title,
      model: task.runtime.model,
      runtime: task.runtime.runtime,
      cwd: task.cwd,
      permissionMode: task.runtime.permissionMode,
      approvalPolicy: task.runtime.approvalPolicy,
      sandboxMode: task.runtime.sandboxMode,
      reasoningEffort: task.runtime.reasoningEffort,
      networkAccess: task.runtime.networkAccess,
    });
  }

  private advanceTask(task: SchedulerTask, now: number): SchedulerTask {
    const updated: SchedulerTask = {
      ...task,
      updatedAt: now,
      nextRunAt: computeNextRunAt({
        now,
        status: task.status,
        schedule: task.schedule,
      }),
    };
    this.repositories.schedulerTasks.upsert(updated);
    return this.repositories.schedulerTasks.get(task.id) ?? updated;
  }

  private publish<T extends IntegrationRouterEvent["type"]>(
    sessionId: string,
    type: T,
    payload: Extract<IntegrationRouterEvent, { type: T }>["payload"],
    ts: number,
  ): void {
    this.options.sessions.publishIntegrationEvent({
      sessionId,
      type,
      payload,
      ts,
    } as IntegrationRouterEvent);
  }

  private audit(
    action: string,
    task: SchedulerTask,
    run: SchedulerRun,
    createdAt: number,
  ): void {
    appendAuditRecord(this.options.db, {
      source: "scheduler",
      action,
      sessionId: run.sessionId ?? task.targetSessionId,
      deliveryId: run.id,
      payload: { taskId: task.id, runId: run.id, status: run.status },
      summary: `${action} ${task.id}`,
      createdAt,
    });
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  private createId(): string {
    return this.options.createId?.() ?? randomUUID();
  }
}

type RunnableSchedulerTask = SchedulerTask & {
  cwd: string;
  runtime: NonNullable<SchedulerTask["runtime"]>;
  schedule: NonNullable<SchedulerTask["schedule"]>;
  targetSessionId: string;
};

export function createSchedulerRunner(
  options: SchedulerRunnerOptions,
): SchedulerRunner {
  return new SchedulerRunner(options);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
