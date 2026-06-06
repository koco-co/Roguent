import { useRoomStore } from "../store";
import { Icon, type IconName } from "./icons";
import { formatCountdown } from "./limits-format";

const WARN_AT = 85; // 已用高于此 → 警示闪烁(仅 5h / WEEK,CTX 不触发)

/** 单条 bar:统一显示「已用%」(5h/WEEK 订阅用量、CTX 当前会话上下文占用),对齐 claude-hud。 */
function BarRow({
  icon,
  kind,
  label,
  value,
  resetsAt,
  now,
  isShield,
}: {
  icon: IconName;
  kind: "hp" | "mp" | "shield";
  label: string; // "5h" | "CTX" | "WEEK"
  /** 已用%(0-100;null=无数据→0 且弱化)。 */
  value: number | null;
  resetsAt: number | null;
  now: number;
  isShield?: boolean;
}) {
  const hasData = value != null;
  const width = value ?? 0;
  const warn = !isShield && hasData && value >= WARN_AT;
  const text = hasData ? `${label} ${Math.round(width)}%` : `${label} —`;
  return (
    <div className="lb-row">
      <Icon name={icon} size={18} />
      <div className={`barframe${warn ? " bar-low" : ""}`}>
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
 * 左上账户限额三条(对标设计原型),三条统一显示「已用%」(对齐 claude-hud / Claude Code):
 * - 5h(❤ hp) / CTX(💎 shield,当前会话上下文占用%) / WEEK(💠 mp)。
 * 真数据:store.limits(5h/WEEK,源自 SDK rate_limit_event)+ 当前会话 context.utilization(CTX)。
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
          value={limits?.fiveHour.utilization ?? null}
          resetsAt={limits?.fiveHour.resetsAt ?? null}
          now={now}
        />
        <BarRow
          icon="gem"
          kind="shield"
          label="CTX"
          value={ctxUtil}
          resetsAt={null}
          now={now}
          isShield
        />
        <BarRow
          icon="gemcur"
          kind="mp"
          label="WEEK"
          value={limits?.sevenDay.utilization ?? null}
          resetsAt={limits?.sevenDay.resetsAt ?? null}
          now={now}
        />
      </div>
    </div>
  );
}
