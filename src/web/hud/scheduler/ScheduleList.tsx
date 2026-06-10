import type { SchedulerRun, SchedulerTask } from "../../../shared/scheduler";
import { sendCommand } from "../../ws-client";

interface ScheduleListProps {
  tasks: SchedulerTask[];
  runs: SchedulerRun[];
}

function formatTime(value: number | null | undefined): string {
  if (!value) return "none";
  return new Date(value).toISOString().replace("T", " ").slice(0, 16);
}

function latestRunForTask(
  runs: SchedulerRun[],
  taskId: string,
): SchedulerRun | undefined {
  return runs
    .filter((run) => run.taskId === taskId)
    .sort(
      (a, b) =>
        (b.finishedAt ?? b.startedAt ?? b.queuedAt ?? 0) -
        (a.finishedAt ?? a.startedAt ?? a.queuedAt ?? 0),
    )[0];
}

export function ScheduleList({ tasks, runs }: ScheduleListProps) {
  if (tasks.length === 0) {
    return <div className="faint">No scheduled tasks</div>;
  }

  return (
    <div className="scheduler-list">
      {tasks.map((task) => {
        const lastRun = latestRunForTask(runs, task.id);
        const nextStatus = task.status === "enabled" ? "disabled" : "enabled";
        return (
          <div className="scheduler-task" key={task.id}>
            <div>
              <div className="scheduler-task-title">{task.title}</div>
              <div className="scheduler-task-prompt">{task.prompt}</div>
            </div>
            <div className="scheduler-task-meta">
              <span className="chip">{task.status}</span>
              <span>Next: {formatTime(task.nextRunAt)}</span>
              <span>Last: {lastRun?.status ?? "none"}</span>
            </div>
            <div className="scheduler-task-actions">
              <button
                type="button"
                className="btn"
                onClick={() =>
                  sendCommand({
                    cmd: "scheduler",
                    action: "runTask",
                    taskId: task.id,
                  })
                }
              >
                Run Now
              </button>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  sendCommand({
                    cmd: "scheduler",
                    action: "updateTask",
                    taskId: task.id,
                    changes: { status: nextStatus },
                  })
                }
              >
                {nextStatus === "enabled" ? "Enable" : "Disable"}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  sendCommand({
                    cmd: "scheduler",
                    action: "deleteTask",
                    taskId: task.id,
                  })
                }
              >
                Delete
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
