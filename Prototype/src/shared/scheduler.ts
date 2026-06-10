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
      kind: "daily";
      hour: number;
      minute: number;
      timezone: string;
    }
  | {
      kind: "weekly";
      daysOfWeek: number[];
      hour: number;
      minute: number;
      timezone: string;
    }
  | {
      kind: "monthly";
      dayOfMonth: number;
      hour: number;
      minute: number;
      timezone: string;
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
  targetSessionId?: string;
  metadata?: Record<string, unknown>;
}

export type SchedulerTaskDraft = SchedulerTask & {
  cwd: string;
  runtime: RuntimeConfig & {
    reasoningEffort: NonNullable<RuntimeConfig["reasoningEffort"]>;
  };
  schedule: SchedulerRecurrence;
  targetSessionId: string;
};

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
