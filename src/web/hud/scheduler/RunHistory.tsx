import type { SchedulerRun, SchedulerTask } from "../../../shared/scheduler";

interface RunHistoryProps {
  runs: SchedulerRun[];
  tasks: SchedulerTask[];
}

function runTime(run: SchedulerRun): number {
  return run.finishedAt ?? run.startedAt ?? run.queuedAt ?? 0;
}

export function RunHistory({ runs, tasks }: RunHistoryProps) {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const sorted = [...runs].sort((a, b) => runTime(b) - runTime(a));

  return (
    <div className="scheduler-history">
      <div className="scheduler-panel-title">Run History</div>
      {sorted.length === 0 ? (
        <div className="faint">No runs yet</div>
      ) : (
        sorted.map((run) => (
          <div className="scheduler-run" key={run.id}>
            <div>
              <span className="chip">{run.status}</span> Run for{" "}
              {taskById.get(run.taskId)?.title ?? run.taskId}
            </div>
            <div className="faint">
              {run.summary ?? run.error ?? "waiting for result"}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
