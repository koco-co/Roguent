import type { RuntimeConfig } from "./runtime";

export type SchedulerTaskStatus =
  | "enabled"
  | "disabled"
  | "paused"
  | "archived";
export type SchedulerRunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "skipped";

export type SchedulerRecurrence =
  | { kind: "once"; runAt: number }
  | {
      kind: "interval";
      everyMs: number;
      startAt?: number;
      endAt?: number;
    }
  | {
      kind: "cron";
      expression: string;
      timezone?: string;
    };

export interface SchedulerTask {
  id: string;
  title: string;
  prompt: string;
  status: SchedulerTaskStatus;
  createdAt: number;
  updatedAt?: number;
  nextRunAt?: number | null;
  cwd?: string;
  runtime?: RuntimeConfig;
  schedule?: SchedulerRecurrence;
  metadata?: Record<string, unknown>;
}

export interface SchedulerRun {
  id: string;
  taskId: string;
  status: SchedulerRunStatus;
  queuedAt?: number;
  startedAt?: number;
  finishedAt?: number;
  sessionId?: string;
  summary?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface SchedulerTaskCreatedPayload {
  task: SchedulerTask;
}

export interface SchedulerTaskUpdatedPayload {
  task: SchedulerTask;
  changes?: Partial<SchedulerTask>;
}

export interface SchedulerRunStartedPayload {
  run: SchedulerRun;
}

export interface SchedulerRunFinishedPayload {
  run: SchedulerRun;
}
