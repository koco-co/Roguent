import { useRoomStore } from "../store";
import { Icon, type IconName } from "./icons";
import { barRemaining, formatCountdown } from "./limits-format";

const DANGER = 15; // 剩余低于此 → 警示闪烁(仅 5h / WEEK,CTX 不触发)

/** 单条 bar:剩余%(hp/mp)或当前会话上下文占用%(shield)。 */
function BarRow({
  icon,
  kind,
  label,
  remain,
  resetsAt,
  now,
  isShield,
}: {
  icon: IconName;
  kind: "hp" | "mp" | "shield";
  label: string; // "5h" | "CTX" | "WEEK"
  /** hp/mp:剩余%(null=无数据);shield:上下文占用%(null=无数据→0 且弱化)。 */
  remain: number | null;
  resetsAt: number | null;
  now: number;
  isShield?: boolean;
}) {
  const hasData = remain != null;
  const width = remain ?? 0;
  const low = !isShield && hasData && remain < DANGER;
  const text = hasData ? `${label} ${Math.round(width)}%` : `${label} —`;
  return (
    <div className="lb-row">
      <Icon name={icon} size={18} />
      <div className={`barframe${low ? " bar-low" : ""}`}>
        <div
          className={`barfill ${kind}`}
          style={{ width: `${width}%`, opacity: hasData ? 1 : 0.25 }}
        />
        <div className="bar-label px">{text}</div>
      </div>
      {!isShield && (
        <div className="lb-reset px">
          {hasData ? formatCountdown(resetsAt, now) : "—"}
        </div>
      )}
    </div>
  );
}

/**
 * 左上账户限额三条(对标设计原型):
 * - 5h(❤ hp,剩余%) / CTX(💎 shield,当前会话上下文占用%) / WEEK(💠 mp,剩余%)。
 * 真数据:store.limits(5h/WEEK)+ 当前会话 context.utilization(CTX)。
 */
export function LimitBars() {
  const limits = useRoomStore((s) => s.limits);
  const ctxUtil = useRoomStore((s) =>
    s.currentSessionId
      ? (s.sessions[s.currentSessionId]?.context?.utilization ?? null)
      : null,
  );
  const now = Date.now();

  return (
    <div className="panel rivets limitbars">
      <div className="lb-body">
        <div className="lb-plan px">
          <span className="gold">
            CLAUDE · {limits?.planName ?? "—"}
            {limits?.stale ? " · 同步中" : ""}
            {limits?.apiError ? " · 同步失败" : ""}
          </span>
        </div>
        <BarRow
          icon="heart"
          kind="hp"
          label="5h"
          remain={barRemaining(limits?.fiveHour.utilization ?? null)}
          resetsAt={limits?.fiveHour.resetsAt ?? null}
          now={now}
        />
        <BarRow
          icon="gem"
          kind="shield"
          label="CTX"
          remain={ctxUtil}
          resetsAt={null}
          now={now}
          isShield
        />
        <BarRow
          icon="gemcur"
          kind="mp"
          label="WEEK"
          remain={barRemaining(limits?.sevenDay.utilization ?? null)}
          resetsAt={limits?.sevenDay.resetsAt ?? null}
          now={now}
        />
      </div>
    </div>
  );
}
