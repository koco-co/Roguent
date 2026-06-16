import { useState } from "react";
import { useT } from "../i18n";
import { useRoomStore } from "../store";
import { Icon, type IconName } from "./icons";
import { sessionTodos, todoCounts } from "./todos-view";

// runtime 筛选可选值;当前引擎只有 claude,codex 为禁用占位。
type Runtime = "all" | "claude" | "codex";

/** 单个货币格:图标 + 像素数值。 */
function CurCell({
  icon,
  value,
  color,
}: {
  icon: IconName;
  value: string;
  color: string;
}) {
  return (
    <div className="cur-cell">
      <Icon name={icon} size={22} />
      <span className="px" style={{ color }}>
        {value}
      </span>
    </div>
  );
}

/**
 * 顶右货币条(对标设计原型 hud.jsx Currency):金币(tokens 真)/ 宝石(真)/
 * 桂冠(完成数 真)+ runtime 筛选。两视图都显示。
 * - coins = 当前会话 usage.tokens(真)。
 * - gemcur = 真实账本余额(ledger.balances.gem;经济快照在连接时水合,缺省 0)。
 * - laurel 真 = 当前会话已完成 TodoWrite 计数。
 * - runtime-filter:claude 可点(真;切 all↔claude),codex 禁用占位(置灰、不可点)。
 */
export function Currency() {
  const t = useT();
  // 引擎只有 claude → 筛选目前只在 all↔claude 间切换。状态自包含(暂无外部消费方),
  // 待真正多 runtime 时再上提到 ui-store。
  const [runtime, setRuntime] = useState<Runtime>("all");
  const tokens = useRoomStore((s) =>
    s.currentSessionId
      ? (s.sessions[s.currentSessionId]?.usage.tokens ?? 0)
      : 0,
  );
  // 真实宝石余额:账本 gem 余额(经济快照连接时水合,新增活动实时折叠)。
  // selector 取原始数字、不构造新值(zustand 铁律);账本切片可能缺省 → 0。
  const gems = useRoomStore((s) => s.ledger?.balances.gem ?? 0);
  // 取当前会话对象引用(稳定:同一会话同一引用),派生在渲染体里算,
  // 不在 selector 里构造新值(zustand 铁律)。
  const session = useRoomStore((s) =>
    s.currentSessionId ? s.sessions[s.currentSessionId] : undefined,
  );

  // 已完成数 = 当前会话已完成的 TodoWrite 计数(真)。派生在渲染体里算,不在 selector 里。
  const completed = session ? todoCounts(sessionTodos(session)).completed : 0;

  const claudeOn = runtime === "claude" || runtime === "all";

  return (
    <div className="panel currency">
      <div className="cur-body">
        <CurCell icon="coins" value={tokens.toLocaleString()} color="#f2c84b" />
        <CurCell icon="gemcur" value={gems.toLocaleString()} color="#a06cd5" />
        <CurCell icon="laurel" value={String(completed)} color="#5fd35f" />
        <div className="runtime-filter">
          <button
            type="button"
            className={`rt-chip${claudeOn ? " on" : ""}`}
            onClick={() => setRuntime(runtime === "claude" ? "all" : "claude")}
          >
            <Icon name="claude" size={16} />
            Claude
          </button>
          {/* Codex 占位:暂未接入,置灰不可点 */}
          <button
            type="button"
            className="rt-chip codex dis"
            disabled
            title={t("Codex 占位,暂未接入")}
          >
            <Icon name="codex" size={16} />
            Codex
          </button>
        </div>
      </div>
    </div>
  );
}
