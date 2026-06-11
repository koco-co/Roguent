import { useT } from "../i18n";
import { useRoomStore } from "../store";
import { useUiStore } from "../ui-store";
import { Icon, type IconName } from "./icons";
import { formatCountdown } from "./limits-format";

const WARN_AT = 85; // 已用高于此 → 警示闪烁(仅 5h / Weekly,CTX 不触发)

/** 单条 bar:统一显示「已用%」(5h/Weekly 订阅用量、Context 当前会话上下文占用),对齐 claude-hud。 */
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
  label: string; // "5h" | "Context" | "Weekly"
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
 * 左上账户限额条,统一显示「已用%」(对齐 claude-hud / Claude Code):
 * - 5h(❤ hp) / Weekly(💠 mp) 是**账户级**(源自 OAuth /api/oauth/usage poll),两视图都显。
 * - Context(💎 shield,当前会话上下文占用%)是**会话级**,只在**内景**显示;大厅(overworld)
 *   没有「当前会话」语境,故隐藏(见用户规则:大厅不展示 Context)。
 */
export function LimitBars() {
  const t = useT();
  const limits = useRoomStore((s) => s.limits);
  const ctxUtil = useRoomStore((s) =>
    s.currentSessionId
      ? (s.sessions[s.currentSessionId]?.context?.utilization ?? null)
      : null,
  );
  // 内景才有会话语境 → 才显 CTX。返回布尔基元,不构造新值(见 store 渲染纪律)。
  const inInterior = useUiStore((s) => s.view !== "overworld");
  const now = Date.now();

  return (
    <div className="panel rivets limitbars">
      <div className="lb-body">
        <div className="lb-plan px">
          <span className="gold">
            CLAUDE · {limits?.planName ?? "—"}
            {limits?.stale ? ` · ${t("同步中")}` : ""}
            {limits?.apiError ? ` · ${t("同步失败")}` : ""}
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
        {inInterior && (
          <BarRow
            icon="gem"
            kind="shield"
            label="Context"
            value={ctxUtil}
            resetsAt={null}
            now={now}
            isShield
          />
        )}
        <BarRow
          icon="gemcur"
          kind="mp"
          label="Weekly"
          value={limits?.sevenDay.utilization ?? null}
          resetsAt={limits?.sevenDay.resetsAt ?? null}
          now={now}
        />
      </div>
    </div>
  );
}
