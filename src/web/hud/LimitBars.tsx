import { useRoomStore } from "../store";
import { barRemaining, formatCountdown } from "./limits-format";

const DANGER = 15; // 剩余低于此 → 警示色

function Bar({
  label,
  color,
  utilization,
  resetsAt,
}: {
  label: string;
  color: string;
  utilization: number | null;
  resetsAt: number | null;
}) {
  const remain = barRemaining(utilization);
  const width = remain ?? 0;
  const danger = remain != null && remain < DANGER;
  return (
    <div className="px-bar-row">
      <span className="px-bar-label">{label}</span>
      <div className="px-bar">
        <div
          className="px-bar-fill"
          style={{
            width: `${width}%`,
            background: danger ? "var(--pink)" : color,
            opacity: remain == null ? 0.25 : 1,
          }}
        />
      </div>
      <span className="px-bar-reset">
        {remain == null ? "—" : formatCountdown(resetsAt, Date.now())}
      </span>
    </div>
  );
}

/** 左上账户限额双条:5h(红血条)+ 周(蓝魔法条)。条长 = 剩余。 */
export function LimitBars() {
  const limits = useRoomStore((s) => s.limits);
  return (
    <div className="px-limits px-panel">
      <div className="px-limits-head">
        {limits?.planName ?? "—"}
        {limits?.stale ? " · 同步中" : ""}
        {limits?.apiError ? " · ⚠" : ""}
      </div>
      <Bar
        label="5h"
        color="var(--pink)"
        utilization={limits?.fiveHour.utilization ?? null}
        resetsAt={limits?.fiveHour.resetsAt ?? null}
      />
      <Bar
        label="周"
        color="var(--cyan)"
        utilization={limits?.sevenDay.utilization ?? null}
        resetsAt={limits?.sevenDay.resetsAt ?? null}
      />
    </div>
  );
}
