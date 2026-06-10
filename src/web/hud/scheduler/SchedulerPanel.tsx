import { useMemo } from "react";
import { useRoomStore } from "../../store";
import { RunHistory } from "./RunHistory";
import { ScheduleForm } from "./ScheduleForm";
import { ScheduleList } from "./ScheduleList";

export function SchedulerPanel() {
  const sessions = useRoomStore((s) => s.sessions);
  const currentSessionId = useRoomStore((s) => s.currentSessionId);
  const scheduler = useRoomStore((s) => s.scheduler);

  const sessionList = useMemo(
    () => Object.values(sessions).filter((session) => !session.archived),
    [sessions],
  );
  const tasks = useMemo(
    () =>
      Object.values(scheduler.tasks).sort(
        (a, b) =>
          (a.nextRunAt ?? Number.MAX_SAFE_INTEGER) -
          (b.nextRunAt ?? Number.MAX_SAFE_INTEGER),
      ),
    [scheduler.tasks],
  );
  const runs = useMemo(() => Object.values(scheduler.runs), [scheduler.runs]);

  return (
    <div className="scheduler-panel">
      <ScheduleForm
        sessions={sessionList}
        currentSessionId={currentSessionId}
      />
      <div className="scheduler-main">
        <div>
          <div className="scheduler-panel-title">Scheduled Tasks</div>
          <ScheduleList tasks={tasks} runs={runs} />
        </div>
        <RunHistory runs={runs} tasks={tasks} />
      </div>
    </div>
  );
}
